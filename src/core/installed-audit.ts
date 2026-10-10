/**
 * Audit what is installed: our lock, Vercel's skills-lock.json, and plain agent dirs.
 * Matches each primary file's hashText() against agentskills.in /advisories.json.
 */
import { readdir, readFile, realpath } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { join, basename } from 'path';
import { AGENTS } from '../cli/agents.js';
import { runAudit, SEVERITY_ORDER } from './audit.js';
import { hashText } from './integrity.js';
import { readLock } from './skill-lock.js';
import { apiBase } from './items-api.js';
import type { ScanFinding, Severity } from './scanner-rules.js';

export interface AuditTarget { name: string; kind: 'skill' | 'agent'; path: string; origin: 'skills.lock' | 'skills-lock.json' | 'agent-dir'; }
export interface Advisory { id: string; summary: string; severity: Severity; affected: { item_type: string; item_ref: string; name?: string; content_hashes: string[] }[]; }
export type AdvisoryRef = Pick<Advisory, 'id' | 'severity' | 'summary'>;
export interface TargetReport extends AuditTarget { contentHash?: string; findings: ScanFinding[]; advisories: AdvisoryRef[]; }
export interface InstalledAuditReport {
    targets: TargetReport[];
    advisoriesChecked: boolean;
    summary: Record<Severity, number> & { total: number; advisories: number };
}

const isDir = (p: string) => { try { return statSync(p).isDirectory(); } catch { return false; } };

async function skillDirsIn(dir: string): Promise<string[]> {
    if (!isDir(dir)) return [];
    const entries = await readdir(dir);
    return entries.filter(n => !n.startsWith('.') && existsSync(join(dir, n, 'SKILL.md'))).map(n => join(dir, n));
}

async function mdFilesIn(dir: string): Promise<string[]> {
    if (!isDir(dir)) return [];
    return (await readdir(dir)).filter(n => n.endsWith('.md')).map(n => join(dir, n));
}

export async function collectTargets(opts: { cwd: string; includeGlobal: boolean }): Promise<AuditTarget[]> {
    const out: AuditTarget[] = [];

    // 1. our lock (~/.skills/skills.lock)
    for (const e of Object.values((await readLock()).skills)) {
        const type = e.type ?? 'skill';
        if (type === 'agent') {
            for (const t of e.configTarget ?? []) if (existsSync(t.file)) out.push({ name: e.name, kind: 'agent', path: t.file, origin: 'skills.lock' });
            continue;
        }
        if (type !== 'skill') continue;
        if (e.isGlobal ? !opts.includeGlobal : (e.projectDir ?? opts.cwd) !== opts.cwd) continue;
        for (const a of e.agents) {
            const cfg = AGENTS[a];
            if (!cfg) continue;
            const p = join(e.isGlobal ? cfg.globalDir : join(opts.cwd, cfg.projectDir), e.name);
            if (existsSync(join(p, 'SKILL.md'))) out.push({ name: e.name, kind: 'skill', path: p, origin: 'skills.lock' });
        }
    }

    // 2. Vercel skills-lock.json (project); a merge-conflicted file is skipped, dirs below still get scanned
    const vercelLock = join(opts.cwd, 'skills-lock.json');
    if (existsSync(vercelLock)) {
        let names: string[] = [];
        try { names = Object.keys(JSON.parse(await readFile(vercelLock, 'utf-8')).skills ?? {}); } catch { /* skip */ }
        const roots = [join(opts.cwd, '.agents/skills'), ...Object.values(AGENTS).map(c => join(opts.cwd, c.projectDir))];
        for (const n of names) {
            const p = roots.map(r => join(r, n)).find(d => existsSync(join(d, 'SKILL.md')));
            if (p) out.push({ name: n, kind: 'skill', path: p, origin: 'skills-lock.json' });
        }
    }

    // 3. plain agent directories
    const roots = new Set<string>([join(opts.cwd, '.agents/skills')]);
    for (const c of Object.values(AGENTS)) {
        roots.add(join(opts.cwd, c.projectDir));
        if (opts.includeGlobal) roots.add(c.globalDir);
    }
    for (const r of roots) for (const d of await skillDirsIn(r)) out.push({ name: basename(d), kind: 'skill', path: d, origin: 'agent-dir' });
    for (const c of Object.values(AGENTS)) {
        if (!c.agentsDir) continue;
        const dirs = [join(opts.cwd, c.agentsDir.project), ...(opts.includeGlobal ? [c.agentsDir.global] : [])];
        for (const d of dirs) for (const f of await mdFilesIn(d)) out.push({ name: basename(f), kind: 'agent', path: f, origin: 'agent-dir' });
    }

    const seen = new Set<string>();
    const unique: AuditTarget[] = [];
    for (const t of out) {
        const real = await realpath(t.path).catch(() => t.path);
        if (seen.has(real)) continue;
        seen.add(real);
        unique.push(t);
    }
    return unique;
}

export async function fetchAdvisories(fetchImpl: typeof fetch = fetch): Promise<Advisory[] | null> {
    try {
        const res = await fetchImpl(`${apiBase()}/advisories.json`, { headers: { 'User-Agent': 'agent-skills-cli' }, signal: AbortSignal.timeout(8_000) });
        if (!res.ok) return null;
        const body: any = await res.json();
        return Array.isArray(body?.advisories) ? body.advisories : null;
    } catch {
        return null;
    }
}

export async function auditInstalled(opts: { cwd: string; includeGlobal: boolean; advisories: Advisory[] | null }): Promise<InstalledAuditReport> {
    const summary = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0, advisories: 0 };
    const targets: TargetReport[] = [];
    for (const t of await collectTargets(opts)) {
        const result = await runAudit(t.path);
        const contentHash = await readFile(t.kind === 'skill' ? join(t.path, 'SKILL.md') : t.path, 'utf-8').then(hashText).catch(() => undefined);
        const advisories = contentHash && opts.advisories
            ? opts.advisories.filter(a => a.affected?.some(x => x.content_hashes?.includes(contentHash))).map(({ id, severity, summary }) => ({ id, severity, summary }))
            : [];
        for (const f of result.findings) { summary[f.severity]++; summary.total++; }
        summary.advisories += advisories.length;
        targets.push({ ...t, contentHash, findings: result.findings, advisories });
    }
    return { targets, advisoriesChecked: opts.advisories !== null, summary };
}

export function reportFails(report: InstalledAuditReport, failOn: Severity): boolean {
    const limit = SEVERITY_ORDER.indexOf(failOn);
    return report.targets.some(t => [...t.findings, ...t.advisories].some(x => SEVERITY_ORDER.indexOf(x.severity) <= limit));
}
