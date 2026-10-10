/**
 * Client for agentskills.in catalog items (MCP servers, subagents, plugins).
 * Consumes GET /api/items/[type]/[slug] (website Section E).
 */
import type { McpInstallSpec } from './mcp-config.js';

export type ItemKind = 'mcp' | 'agent' | 'plugin';
export interface AgentInstallSpec { type: 'agent'; file: string; rawUrl: string; }
export interface PluginInstallSpec { type: 'plugin'; marketplace: string; plugin: string; }
export type InstallSpec = McpInstallSpec | AgentInstallSpec | PluginInstallSpec;

export interface ItemRecord {
    type: ItemKind;
    slug: string;
    name: string;
    description: string | null;
    install: InstallSpec;
    scan?: { status: string; findings?: number };
}

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const KINDS: ItemKind[] = ['mcp', 'agent', 'plugin'];

export function apiBase(): string {
    return (process.env.AGENTSKILLS_API_URL || 'https://www.agentskills.in').replace(/\/+$/, '');
}

export function itemApiUrl(type: ItemKind, slug: string): string {
    return `${apiBase()}/api/items/${type}/${encodeURIComponent(slug)}`;
}

/** Bare catalog slug (owner--repo[--path]); URLs, paths, owner/repo and @scoped stay on the skill flow. */
export function isItemSlug(ref: string): boolean {
    return SLUG.test(ref);
}

export function parseItem(type: ItemKind, slug: string, body: any): ItemRecord {
    let raw = body?.install ?? body?.install_json; // site API (E8) sends `install`; older shape `install_json`
    if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { throw new Error(`${type}/${slug}: install_json is not valid JSON`); }
    }
    if (!raw || raw.type !== type) throw new Error(`${type}/${slug}: missing or mismatched install_json`);
    if (type === 'mcp') {
        if (raw.transport !== 'stdio' && raw.transport !== 'http') throw new Error(`${type}/${slug}: unsupported transport "${raw.transport}"`);
        if (raw.args !== undefined && !(Array.isArray(raw.args) && raw.args.every((a: unknown) => typeof a === 'string'))) throw new Error(`${type}/${slug}: args must be strings`);
    }
    if (type === 'agent' && !(typeof raw.rawUrl === 'string' && raw.rawUrl.startsWith('https://') && typeof raw.file === 'string')) {
        throw new Error(`${type}/${slug}: subagent needs an https rawUrl and a file`);
    }
    if (type === 'plugin' && !(REPO.test(raw.marketplace ?? '') && NAME.test(raw.plugin ?? ''))) {
        throw new Error(`${type}/${slug}: plugin needs marketplace "owner/repo" and a plugin name`);
    }
    return { type, slug, name: String(body.name ?? slug), description: body.description ?? null, install: raw, scan: body.scan };
}

export async function fetchItem(type: ItemKind, slug: string, fetchImpl: typeof fetch = fetch): Promise<ItemRecord | null> {
    const res = await fetchImpl(itemApiUrl(type, slug), {
        headers: { Accept: 'application/json', 'User-Agent': 'agent-skills-cli' },
        signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`agentskills.in returned ${res.status} for ${type}/${slug}`);
    return parseItem(type, slug, await res.json());
}

export async function detectItem(slug: string, type?: ItemKind, fetchImpl: typeof fetch = fetch): Promise<ItemRecord | null> {
    for (const t of type ? [type] : KINDS) {
        const item = await fetchItem(t, slug, fetchImpl);
        if (item) return item;
    }
    return null;
}
