/**
 * `skills install <slug> [--type mcp|agent|plugin]` — agentskills.in catalog items,
 * plus the install-time security gate shared with the skill flow (warn on high, block on critical; --skip-audit overrides).
 */
import chalk from 'chalk';
import ora from 'ora';
import * as p from '@clack/prompts';
import { existsSync } from 'fs';
import { agentsSupporting } from '../agents.js';
import { detectItem, isItemSlug, itemApiUrl, type ItemKind, type ItemRecord, type AgentInstallSpec } from '../../core/items-api.js';
import { installMcpItem, installAgentItem, installPluginItem, downloadText, resolveEnv, parseEnvPairs } from '../../core/item-installer.js';
import { runAudit, scanContent, scanInstallSpec } from '../../core/audit.js';
import type { ScanFinding } from '../../core/scanner-rules.js';
import { addSkillToLock, createLockEntry } from '../../core/skill-lock.js';
import { getSkillByScoped } from '../../core/skillsdb.js';
import { hashText } from '../../core/integrity.js';
import { trackCommand } from '../../core/telemetry.js';
import type { McpInstallSpec } from '../../core/mcp-config.js';

export function gateFindings(label: string, findings: ScanFinding[], skipAudit: boolean, log: (line: string) => void = console.log): boolean {
    const critical = findings.filter(f => f.severity === 'critical');
    const high = findings.filter(f => f.severity === 'high');
    for (const f of [...critical, ...high]) {
        const sev = f.severity === 'critical' ? chalk.red('CRITICAL') : chalk.yellow('HIGH    ');
        log(`  ${sev} [${f.ruleId}] ${f.title} (${f.file}:${f.line})`);
    }
    if (critical.length && !skipAudit) {
        log(chalk.red(`✖ ${label}: blocked — ${critical.length} critical finding(s). Review them, then re-run with --skip-audit to install anyway.`));
        return false;
    }
    if (critical.length) log(chalk.yellow(`⚠ ${label}: installing despite ${critical.length} critical finding(s) (--skip-audit)`));
    else if (high.length) log(chalk.yellow(`⚠ ${label}: ${high.length} high finding(s) — review before use`));
    return true;
}

export async function gateDir(label: string, dir: string, skipAudit: boolean): Promise<boolean> {
    return gateFindings(label, (await runAudit(dir)).findings, skipAudit);
}

/**
 * true = handled here (success or failure). false = continue with the skill flow; when a marketplace skill has exactly
 * this name, options.skill is set to [source] first (spec §7.5: skill first).
 */
export async function maybeInstallItem(source: string, options: any): Promise<boolean> {
    const explicit = options.type && options.type !== 'skill' ? options.type as ItemKind : undefined;
    if (options.type === 'skill') return false;
    if (!explicit && (!isItemSlug(source) || existsSync(source))) return false;
    if (!explicit && await getSkillByScoped(source, { exact: true }).catch(() => null)) {
        options.skill = [source];
        return false;
    }
    const spinner = ora(`Looking up "${source}" on agentskills.in...`).start();
    let item: ItemRecord | null;
    try {
        item = await detectItem(source, explicit);
    } catch (err: any) {
        spinner.fail(err.message);
        process.exitCode = 1;
        return true;
    }
    if (!item) {
        if (!explicit) { spinner.stop(); return false; }
        spinner.fail(`No ${explicit} "${source}" found on agentskills.in`);
        process.exitCode = 1;
        return true;
    }
    spinner.succeed(`Found ${item.type} ${chalk.bold(item.name)}`);
    await installItem(item, options);
    trackCommand('install');
    return true;
}

// ponytail: no interactive client picker; default is Claude Code, pass -a for others.
function pickAgents(kind: ItemKind, options: any): string[] | null {
    const supported = agentsSupporting(kind);
    let agents: string[] = (options.agent ?? []).flatMap((a: string) => a.split(',')).map((a: string) => a.trim()).filter(Boolean);
    if (options.all) agents = supported;
    const bad = agents.filter(a => !supported.includes(a));
    if (bad.length) {
        console.error(chalk.red(`✖ ${bad.join(', ')} cannot install ${kind} items`));
        console.error(chalk.gray(`  Supported: ${supported.join(', ')}`));
        return null;
    }
    return agents.length ? agents : ['claude'];
}

async function collectEnv(item: ItemRecord, spec: McpInstallSpec, options: any): Promise<Record<string, string> | null> {
    const { env, missing } = resolveEnv(spec, parseEnvPairs(options.env ?? []));
    if (!missing.length) return env;
    if (options.yes || !process.stdin.isTTY) {
        console.error(chalk.red(`✖ ${item.name} needs: ${missing.join(', ')}`));
        console.error(chalk.gray(`  Pass them with ${missing.map(k => `--env ${k}=...`).join(' ')}`));
        return null;
    }
    for (const key of missing) {
        const value = await p.password({ message: `${key} for ${item.name} (stored in the MCP config file)`, validate: v => (v ? undefined : 'Required') });
        if (p.isCancel(value)) { p.cancel('Installation cancelled'); return null; }
        env[key] = value as string;
    }
    return env;
}

async function installItem(item: ItemRecord, options: any): Promise<void> {
    const global = !!options.global;
    const cwd = process.cwd();
    const skipAudit = !!options.skipAudit;
    const agents = pickAgents(item.type, options);
    if (!agents) { process.exitCode = 1; return; }
    const base = { scopedName: `${item.type}/${item.slug}`, source: itemApiUrl(item.type, item.slug), sourceType: 'database' as const, isGlobal: global, projectDir: global ? undefined : cwd };

    if (item.type === 'mcp') {
        const spec = item.install as McpInstallSpec;
        if (!gateFindings(item.name, scanInstallSpec(spec), skipAudit)) { process.exitCode = 1; return; }
        const env = await collectEnv(item, spec, options);
        if (!env) { process.exitCode = 1; return; }
        const results = await installMcpItem(item, agents, { global, cwd }, env);
        for (const r of results) {
            if (r.error) { console.log(chalk.yellow(`  ⚠ ${r.agent}: ${r.error}`)); continue; }
            console.log(chalk.green(`  ✓ ${r.agent}: ${r.replaced ? 'updated' : 'added'} "${r.name}" in ${r.file}`) + (r.backup ? chalk.gray(` (backup ${r.backup})`) : ''));
        }
        const ok = results.filter(r => !r.error);
        if (!ok.length) { process.exitCode = 1; return; }
        // env values live only in the client config files, never in the lock
        await addSkillToLock(createLockEntry({
            ...base, name: item.slug, agents: ok.map(r => r.agent), canonicalPath: ok[0].file, type: 'mcp',
            configTarget: ok.map(({ agent, file, key, name }) => ({ agent, file, key, name })), contentHash: hashText(JSON.stringify(spec)),
        }));
        return;
    }

    if (item.type === 'agent') {
        const spec = item.install as AgentInstallSpec;
        const content = await downloadText(spec.rawUrl);
        if (!gateFindings(item.name, scanContent(content, spec.file).findings, skipAudit)) { process.exitCode = 1; return; }
        const targets = await installAgentItem(item, content, agents, { global, cwd });
        for (const t of targets) console.log(chalk.green(`  ✓ ${t.agent}: wrote ${t.file}`));
        await addSkillToLock(createLockEntry({
            ...base, name: targets[0].name.replace(/\.md$/, ''), agents, canonicalPath: targets[0].file, type: 'agent',
            configTarget: targets, contentHash: hashText(content),
        }));
        return;
    }

    if (item.scan?.status === 'findings') console.log(chalk.yellow(`  ⚠ agentskills.in scan reported ${item.scan.findings ?? 'some'} finding(s) for this plugin — review its page first`));
    const r = await installPluginItem(item, { global });
    if (!r.ran) {
        console.log(chalk.yellow('  Claude Code CLI (`claude`) not found. Run:'));
        for (const c of r.commands) console.log(chalk.cyan(`    claude ${c.join(' ')}`));
        return;
    }
    console.log(chalk.green(`  ✓ claude: installed plugin ${r.id} (scope: ${r.scope})`));
    await addSkillToLock(createLockEntry({
        ...base, name: r.id, agents: ['claude'], canonicalPath: r.scope, type: 'plugin',
        configTarget: [{ agent: 'claude', file: r.scope, key: 'plugin', name: r.id }], contentHash: hashText(JSON.stringify(item.install)),
    }));
}
