/**
 * Merge one MCP server into a client config file (JSON or Codex TOML).
 * Never touches other entries; backs up to <file>.bak; refuses files it cannot parse safely.
 * TOML: no dependency — we rewrite only our own [<key>.<name>] table (and its sub-tables).
 */
import { readFile, writeFile, copyFile, mkdir, rename, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';

export interface McpTarget {
    projectFile?: string;
    globalFile: string;
    format: 'json' | 'toml';
    key: string;
    typeField?: boolean;
    urlField?: string;
    headersField?: string;
    stdioOnly?: boolean;
}

export interface McpInstallSpec {
    type: 'mcp';
    transport: 'stdio' | 'http';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
}

export class McpConfigError extends Error {}

export function toClientEntry(spec: McpInstallSpec, target: McpTarget, env: Record<string, string> = {}): Record<string, unknown> {
    const entry: Record<string, unknown> = {};
    if (spec.transport === 'http') {
        if (!spec.url) throw new McpConfigError('install_json has transport http but no url');
        if (target.stdioOnly) throw new McpConfigError('this client only supports local (stdio) servers in its config file');
        if (target.typeField) entry.type = 'http';
        entry[target.urlField ?? 'url'] = spec.url;
        if (spec.headers && Object.keys(spec.headers).length) entry[target.headersField ?? 'headers'] = spec.headers;
        return entry;
    }
    if (!spec.command) throw new McpConfigError('install_json has transport stdio but no command');
    if (target.typeField) entry.type = 'stdio';
    entry.command = spec.command;
    if (spec.args?.length) entry.args = spec.args;
    if (Object.keys(env).length) entry.env = env;
    return entry;
}

// ── JSON ──────────────────────────────────────────────────────────────

function parseJsonDoc(text: string, key: string): Record<string, any> {
    if (!text.trim()) return {};
    let doc: unknown;
    try {
        doc = JSON.parse(text);
    } catch (err: any) {
        throw new McpConfigError(`not valid JSON (${err.message}); comments and trailing commas are not supported — file left unchanged`);
    }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new McpConfigError('top level is not a JSON object — file left unchanged');
    const servers = (doc as any)[key];
    if (servers !== undefined && (typeof servers !== 'object' || servers === null || Array.isArray(servers))) {
        throw new McpConfigError(`"${key}" is not an object — file left unchanged`);
    }
    return doc as Record<string, any>;
}

export function upsertJson(text: string, key: string, name: string, entry: Record<string, unknown>): { text: string; replaced: boolean } {
    const doc = parseJsonDoc(text, key);
    const servers = doc[key] ?? {};
    const replaced = Object.prototype.hasOwnProperty.call(servers, name);
    doc[key] = { ...servers, [name]: entry };
    return { text: JSON.stringify(doc, null, 2) + '\n', replaced };
}

function removeJson(text: string, key: string, name: string): { text: string; removed: boolean } {
    const doc = parseJsonDoc(text, key);
    if (!doc[key] || !Object.prototype.hasOwnProperty.call(doc[key], name)) return { text, removed: false };
    delete doc[key][name];
    return { text: JSON.stringify(doc, null, 2) + '\n', removed: true };
}

// ── TOML (minimal: one table + its sub-tables) ────────────────────────

const BARE = /^[A-Za-z0-9_-]+$/;
const tomlKey = (k: string) => (BARE.test(k) ? k : JSON.stringify(k));

function tomlValue(v: unknown): string {
    if (typeof v === 'string') return JSON.stringify(v); // JSON escapes are valid TOML basic-string escapes
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return '[' + v.map(tomlValue).join(', ') + ']';
    throw new McpConfigError(`cannot encode ${typeof v} as a TOML value`);
}

function tomlBlock(key: string, name: string, entry: Record<string, unknown>): string {
    const head = `${key}.${tomlKey(name)}`;
    const lines = [`[${head}]`];
    const tables: string[] = [];
    for (const [k, v] of Object.entries(entry)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            tables.push('', `[${head}.${tomlKey(k)}]`, ...Object.entries(v as Record<string, unknown>).map(([ek, ev]) => `${tomlKey(ek)} = ${tomlValue(ev)}`));
        } else {
            lines.push(`${tomlKey(k)} = ${tomlValue(v)}`);
        }
    }
    return [...lines, ...tables].join('\n') + '\n';
}

function stripTomlTable(text: string, key: string, name: string): { kept: string; removed: boolean } {
    const ours = [`${key}.${name}`, `${key}."${name}"`];
    const out: string[] = [];
    let skipping = false;
    let removed = false;
    // ponytail: [[array]] tables and inline `mcp_servers = {...}` are not handled; Codex configs use [mcp_servers.<name>] tables.
    for (const line of text.split(/\r?\n/)) {
        const h = line.match(/^\s*\[\s*([^[\]]+?)\s*\]\s*(#.*)?$/);
        if (h) {
            const inner = h[1].replace(/\s*\.\s*/g, '.');
            if (inner === key) throw new McpConfigError(`[${key}] with dotted keys is not supported — edit this file by hand`);
            skipping = ours.some(o => inner === o || inner.startsWith(o + '.'));
            if (skipping) removed = true;
        }
        if (!skipping) out.push(line);
    }
    return { kept: out.join('\n'), removed };
}

export function upsertToml(text: string, key: string, name: string, entry: Record<string, unknown>): { text: string; replaced: boolean } {
    const { kept, removed } = stripTomlTable(text, key, name);
    const base = kept.replace(/\s*$/, '');
    return { text: (base ? base + '\n\n' : '') + tomlBlock(key, name, entry), replaced: removed };
}

// ── File I/O ──────────────────────────────────────────────────────────

async function commitFile(file: string, text: string): Promise<string | undefined> {
    await mkdir(dirname(file), { recursive: true });
    let backup: string | undefined;
    let mode = 0o600; // new files may hold secrets
    if (existsSync(file)) {
        mode = (await stat(file)).mode & 0o777;
        backup = `${file}.bak`;
        await copyFile(file, backup);
    }
    const tmp = `${file}.tmp-${process.pid}`;
    await writeFile(tmp, text, { encoding: 'utf-8', mode });
    await rename(tmp, file);
    return backup;
}

export async function writeMcpServer(file: string, target: McpTarget, name: string, entry: Record<string, unknown>): Promise<{ replaced: boolean; backup?: string }> {
    const before = existsSync(file) ? await readFile(file, 'utf-8') : '';
    const { text, replaced } = target.format === 'toml'
        ? upsertToml(before, target.key, name, entry)
        : upsertJson(before, target.key, name, entry);
    const backup = await commitFile(file, text);
    return { replaced, backup };
}

export async function removeMcpServer(file: string, target: McpTarget, name: string): Promise<boolean> {
    if (!existsSync(file)) return false;
    const before = await readFile(file, 'utf-8');
    let text: string;
    let removed: boolean;
    if (target.format === 'toml') {
        const r = stripTomlTable(before, target.key, name);
        text = r.kept.replace(/\s*$/, '') + '\n';
        removed = r.removed;
    } else {
        ({ text, removed } = removeJson(before, target.key, name));
    }
    if (removed) await commitFile(file, text);
    return removed;
}
