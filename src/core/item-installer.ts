/**
 * Installers for non-skill catalog items: MCP servers (config merge), subagents (file copy),
 * plugins (delegated to the `claude` CLI).
 */
import { mkdir, writeFile, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { AGENTS, getMcpTarget } from '../cli/agents.js';
import { toClientEntry, writeMcpServer, type McpInstallSpec, type McpTarget } from './mcp-config.js';
import type { ItemRecord, AgentInstallSpec, PluginInstallSpec } from './items-api.js';
import type { ConfigTarget } from './skill-lock.js';

export interface ItemInstallOptions { global: boolean; cwd: string; }
export interface McpWriteResult extends ConfigTarget { replaced?: boolean; backup?: string; error?: string; }

export function parseEnvPairs(pairs: string[]): Record<string, string> {
    const env: Record<string, string> = {};
    for (const pair of pairs) {
        const i = pair.indexOf('=');
        if (i < 1) throw new Error(`--env expects KEY=VALUE, got "${pair}"`);
        env[pair.slice(0, i)] = pair.slice(i + 1);
    }
    return env;
}

/** '' or '<anything>' means "user must supply"; such values are never written. */
const PLACEHOLDER = /^(<[^>]*>)?$/;

export function resolveEnv(spec: McpInstallSpec, provided: Record<string, string>): { env: Record<string, string>; missing: string[] } {
    const env: Record<string, string> = {};
    const missing: string[] = [];
    for (const [k, v] of Object.entries(spec.env ?? {})) {
        if (provided[k] !== undefined) env[k] = provided[k];
        else if (PLACEHOLDER.test(v)) missing.push(k);
        else env[k] = v;
    }
    for (const [k, v] of Object.entries(provided)) if (!(k in env)) env[k] = v;
    return { env, missing };
}

/** Project file when the client has one and --global is off; otherwise the user-level file (Windsurf, Claude Desktop). */
export function mcpConfigFile(agent: string, opts: ItemInstallOptions): { file: string; target: McpTarget } {
    const target = getMcpTarget(agent);
    if (!target) throw new Error(`${agent} has no MCP config support`);
    return { file: !opts.global && target.projectFile ? join(opts.cwd, target.projectFile) : target.globalFile, target };
}

export async function installMcpItem(item: ItemRecord, agents: string[], opts: ItemInstallOptions, env: Record<string, string>): Promise<McpWriteResult[]> {
    const spec = item.install as McpInstallSpec;
    const name = item.slug; // ponytail: the catalog slug is unique and already config-key safe
    const results: McpWriteResult[] = [];
    for (const agent of agents) {
        try {
            const { file, target } = mcpConfigFile(agent, opts);
            const { replaced, backup } = await writeMcpServer(file, target, name, toClientEntry(spec, target, env));
            results.push({ agent, file, key: target.key, name, replaced, backup });
        } catch (err: any) {
            results.push({ agent, file: '', key: '', name, error: err.message });
        }
    }
    return results;
}

const MAX_DOWNLOAD = 512 * 1024;

export async function downloadText(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
    if (!url.startsWith('https://')) throw new Error(`refusing non-https URL ${url}`);
    const res = await fetchImpl(url, { headers: { 'User-Agent': 'agent-skills-cli' }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`download failed (${res.status}) ${url}`);
    const text = await res.text();
    if (text.length > MAX_DOWNLOAD) throw new Error(`file larger than 512 KB: ${url}`);
    return text;
}

const AGENT_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/;

export async function installAgentItem(item: ItemRecord, content: string, agents: string[], opts: ItemInstallOptions): Promise<ConfigTarget[]> {
    const fileName = basename((item.install as AgentInstallSpec).file);
    if (!AGENT_FILE.test(fileName)) throw new Error(`unsafe subagent file name "${fileName}"`);
    const out: ConfigTarget[] = [];
    for (const agent of agents) {
        const dirs = AGENTS[agent]?.agentsDir;
        if (!dirs) throw new Error(`${agent} does not support subagents`);
        const dir = opts.global ? dirs.global : join(opts.cwd, dirs.project);
        await mkdir(dir, { recursive: true });
        const file = join(dir, fileName);
        if (existsSync(file)) {
            await copyFile(file, `${file}.bak`);
            console.log(`  replacing ${file} (backup ${file}.bak)`);
        }
        await writeFile(file, content, 'utf-8');
        out.push({ agent, file, key: 'agentsDir', name: fileName });
    }
    return out;
}

const run = promisify(execFile);

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export async function marketplaceName(repo: string, fetchImpl: typeof fetch = fetch): Promise<string> {
    const text = await downloadText(`https://raw.githubusercontent.com/${repo}/HEAD/.claude-plugin/marketplace.json`, fetchImpl);
    let name: unknown;
    try { name = JSON.parse(text)?.name; } catch { /* handled below */ }
    if (typeof name !== 'string' || !NAME.test(name)) throw new Error(`${repo}: .claude-plugin/marketplace.json has no valid "name"`);
    return name;
}

export function pluginCommands(spec: PluginInstallSpec, market: string, global: boolean): string[][] {
    const scope = global ? 'user' : 'project';
    return [
        ['plugin', 'marketplace', 'add', spec.marketplace, '--scope', scope],
        ['plugin', 'install', `${spec.plugin}@${market}`, '--scope', scope],
    ];
}

export async function installPluginItem(
    item: ItemRecord,
    opts: { global: boolean },
    fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; scope: string; commands: string[][]; ran: boolean }> {
    const spec = item.install as PluginInstallSpec;
    const market = await marketplaceName(spec.marketplace, fetchImpl);
    const commands = pluginCommands(spec, market, opts.global);
    const result = { id: `${spec.plugin}@${market}`, scope: opts.global ? 'user' : 'project', commands, ran: true };
    for (const args of commands) {
        try {
            await run('claude', args, { timeout: 180_000 });
        } catch (err: any) {
            if (err.code === 'ENOENT') return { ...result, ran: false };
            throw new Error(`claude ${args.join(' ')} failed: ${String(err.stderr || err.message).trim()}`);
        }
    }
    return result;
}

export async function uninstallPlugin(id: string, scope: string): Promise<void> {
    await run('claude', ['plugin', 'uninstall', id, '--scope', scope], { timeout: 180_000 });
}
