import { describe, it, expect, beforeAll, vi } from 'vitest';
import { mkdtemp, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ItemRecord } from '../src/core/items-api.js';

let home: string;
let m: typeof import('../src/core/item-installer.js');
beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), 'askl-home-'));
    process.env.HOME = home; process.env.USERPROFILE = home;
    vi.resetModules();
    m = await import('../src/core/item-installer.js');
});

const mcpItem: ItemRecord = {
    type: 'mcp', slug: 'acme--weather', name: 'io.github.acme/Weather', description: null,
    install: { type: 'mcp', transport: 'stdio', command: 'npx', args: ['-y', '@acme/weather-mcp'], env: { WEATHER_KEY: '<required>', LOG_LEVEL: 'info' } },
};

describe('env', () => {
    it('parseEnvPairs', () => {
        expect(m.parseEnvPairs(['A=1', 'B=x=y'])).toEqual({ A: '1', B: 'x=y' });
        expect(() => m.parseEnvPairs(['=1'])).toThrow(/KEY=VALUE/);
    });
    it('resolveEnv never passes placeholders through', () => {
        expect(m.resolveEnv(mcpItem.install as any, {})).toEqual({ env: { LOG_LEVEL: 'info' }, missing: ['WEATHER_KEY'] });
        expect(m.resolveEnv(mcpItem.install as any, { WEATHER_KEY: 'k', EXTRA: '1' })).toEqual({ env: { WEATHER_KEY: 'k', LOG_LEVEL: 'info', EXTRA: '1' }, missing: [] });
    });
});

describe('installMcpItem', () => {
    it('writes project files for claude + codex and the user file for windsurf, keyed by slug', async () => {
        const cwd = await mkdtemp(join(tmpdir(), 'askl-proj-'));
        const res = await m.installMcpItem(mcpItem, ['claude', 'codex', 'windsurf', 'claude-desktop'], { global: false, cwd }, { WEATHER_KEY: 'k' });
        expect(res.map(r => [r.agent, r.error ?? 'ok'])).toEqual([['claude', 'ok'], ['codex', 'ok'], ['windsurf', 'ok'], ['claude-desktop', 'ok']]);
        expect(JSON.parse(await readFile(join(cwd, '.mcp.json'), 'utf-8'))).toEqual({ mcpServers: { 'acme--weather': { type: 'stdio', command: 'npx', args: ['-y', '@acme/weather-mcp'], env: { WEATHER_KEY: 'k' } } } });
        expect(await readFile(join(cwd, '.codex/config.toml'), 'utf-8')).toContain('[mcp_servers.acme--weather.env]\nWEATHER_KEY = "k"');
        expect(res[2].file).toBe(join(home, '.codeium/windsurf/mcp_config.json'));
    });
    it('reports http-on-Claude-Desktop as a per-agent error', async () => {
        const cwd = await mkdtemp(join(tmpdir(), 'askl-proj-'));
        const http: ItemRecord = { ...mcpItem, install: { type: 'mcp', transport: 'http', url: 'https://x.dev/mcp' } };
        const res = await m.installMcpItem(http, ['claude', 'claude-desktop'], { global: false, cwd }, {});
        expect(res[0].error).toBeUndefined();
        expect(res[1].error).toMatch(/only supports local/);
    });
});

describe('installAgentItem', () => {
    it('copies into .claude/agents using the basename only', async () => {
        const cwd = await mkdtemp(join(tmpdir(), 'askl-proj-'));
        const item: ItemRecord = { type: 'agent', slug: 'a--r', name: 'reviewer', description: null, install: { type: 'agent', file: '../../evil/reviewer.md', rawUrl: 'https://raw.githubusercontent.com/a/r/main/reviewer.md' } };
        const t = await m.installAgentItem(item, '---\nname: reviewer\n---\nReview.', ['claude'], { global: false, cwd });
        expect(t).toEqual([{ agent: 'claude', file: join(cwd, '.claude/agents/reviewer.md'), key: 'agentsDir', name: 'reviewer.md' }]);
        expect(existsSync(join(cwd, '.claude/agents/reviewer.md'))).toBe(true);
    });
    it('rejects unsafe names and unsupported agents', async () => {
        const cwd = await mkdtemp(join(tmpdir(), 'askl-proj-'));
        const bad: ItemRecord = { type: 'agent', slug: 's', name: 'n', description: null, install: { type: 'agent', file: 'a b.md', rawUrl: 'https://x/a.md' } };
        await expect(m.installAgentItem(bad, 'x', ['claude'], { global: false, cwd })).rejects.toThrow(/unsafe/);
        const ok = { ...bad, install: { ...bad.install, file: 'ok.md' } } as ItemRecord;
        await expect(m.installAgentItem(ok, 'x', ['cursor'], { global: false, cwd })).rejects.toThrow(/does not support subagents/);
    });
    it('downloadText refuses http', async () => {
        await expect(m.downloadText('http://x/a.md')).rejects.toThrow(/non-https/);
    });
});

describe('plugins', () => {
    const item: ItemRecord = { type: 'plugin', slug: 'acme--plugins--fmt', name: 'fmt', description: null, install: { type: 'plugin', marketplace: 'acme/plugins', plugin: 'fmt' } };
    const fetchImpl = (async () => new Response(JSON.stringify({ name: 'acme-tools' }))) as unknown as typeof fetch;
    it('builds marketplace add + install commands with the marketplace name and scope', () => {
        expect(m.pluginCommands(item.install as any, 'acme-tools', false)).toEqual([
            ['plugin', 'marketplace', 'add', 'acme/plugins', '--scope', 'project'],
            ['plugin', 'install', 'fmt@acme-tools', '--scope', 'project'],
        ]);
    });
    it('returns the commands when claude is not installed', async () => {
        const path = process.env.PATH;
        process.env.PATH = '';
        try {
            const r = await m.installPluginItem(item, { global: true }, fetchImpl);
            expect(r.ran).toBe(false);
            expect(r.commands[1]).toEqual(['plugin', 'install', 'fmt@acme-tools', '--scope', 'user']);
        } finally { process.env.PATH = path; }
    });
});
