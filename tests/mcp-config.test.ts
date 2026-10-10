import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, readFile, stat, symlink, lstat } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { toClientEntry, upsertToml, writeMcpServer, removeMcpServer, McpConfigError, type McpTarget, type McpInstallSpec } from '../src/core/mcp-config.js';

const claude: McpTarget = { projectFile: '.mcp.json', globalFile: '/unused', format: 'json', key: 'mcpServers', typeField: true };
const codex: McpTarget = { projectFile: '.codex/config.toml', globalFile: '/unused', format: 'toml', key: 'mcp_servers', headersField: 'http_headers' };
const stdio: McpInstallSpec = { type: 'mcp', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_TOKEN: '<required>' } };
const tmp = () => mkdtemp(join(tmpdir(), 'askl-mcp-'));

describe('toClientEntry', () => {
    it('adds type for Claude Code, omits it for Cursor', () => {
        expect(toClientEntry(stdio, claude, { GITHUB_TOKEN: 't' })).toEqual({ type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_TOKEN: 't' } });
        expect(toClientEntry(stdio, { ...claude, typeField: false }, {})).toEqual({ command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] });
    });
    it('maps remote url field per client', () => {
        const http: McpInstallSpec = { type: 'mcp', transport: 'http', url: 'https://x.dev/mcp', headers: { 'X-A': '1' } };
        expect(toClientEntry(http, { ...claude, typeField: false, urlField: 'serverUrl' }, {})).toEqual({ serverUrl: 'https://x.dev/mcp', headers: { 'X-A': '1' } });
        expect(toClientEntry(http, { ...claude, typeField: false, urlField: 'httpUrl' }, {})).toEqual({ httpUrl: 'https://x.dev/mcp', headers: { 'X-A': '1' } });
        expect(toClientEntry(http, codex, {})).toEqual({ url: 'https://x.dev/mcp', http_headers: { 'X-A': '1' } });
        expect(() => toClientEntry(http, { ...claude, stdioOnly: true }, {})).toThrow(/only supports local/);
    });
});

describe('JSON config', () => {
    it('creates a new file with 0600 permissions', async () => {
        const f = join(await tmp(), 'sub', '.mcp.json');
        const r = await writeMcpServer(f, claude, 'github', { type: 'stdio', command: 'npx' });
        expect(r).toEqual({ replaced: false, backup: undefined });
        expect(JSON.parse(await readFile(f, 'utf-8'))).toEqual({ mcpServers: { github: { type: 'stdio', command: 'npx' } } });
        if (process.platform !== 'win32') expect((await stat(f)).mode & 0o777).toBe(0o600);
    });
    it('preserves other servers and unrelated top-level keys, writes a .bak', async () => {
        const f = join(await tmp(), '.claude.json');
        const original = JSON.stringify({ numStartups: 3, projects: { '/x': { mcpServers: {} } }, mcpServers: { keep: { type: 'stdio', command: 'uvx', args: ['keep'] } } }, null, 2);
        await writeFile(f, original);
        const r = await writeMcpServer(f, claude, 'github', { type: 'stdio', command: 'npx' });
        expect(r.backup).toBe(`${f}.bak`);
        expect(await readFile(`${f}.bak`, 'utf-8')).toBe(original);
        const doc = JSON.parse(await readFile(f, 'utf-8'));
        expect(doc.numStartups).toBe(3);
        expect(doc.projects).toEqual({ '/x': { mcpServers: {} } });
        expect(doc.mcpServers.keep).toEqual({ type: 'stdio', command: 'uvx', args: ['keep'] });
        expect(doc.mcpServers.github).toEqual({ type: 'stdio', command: 'npx' });
        expect((await writeMcpServer(f, claude, 'github', { type: 'stdio', command: 'node' })).replaced).toBe(true);
    });
    it('refuses malformed JSON (comments) and leaves the file untouched, no backup', async () => {
        const f = join(await tmp(), 'mcp.json');
        const original = '{\n  // my servers\n  "servers": {}\n}\n';
        await writeFile(f, original);
        await expect(writeMcpServer(f, { ...claude, key: 'servers' }, 'x', { command: 'a' })).rejects.toBeInstanceOf(McpConfigError);
        expect(await readFile(f, 'utf-8')).toBe(original);
        expect(existsSync(`${f}.bak`)).toBe(false);
    });
    it('removeMcpServer deletes only that entry', async () => {
        const f = join(await tmp(), 'm.json');
        await writeFile(f, JSON.stringify({ mcpServers: { a: { command: 'a' }, b: { command: 'b' } } }));
        expect(await removeMcpServer(f, claude, 'a')).toBe(true);
        expect(JSON.parse(await readFile(f, 'utf-8'))).toEqual({ mcpServers: { b: { command: 'b' } } });
        expect(await removeMcpServer(f, claude, 'a')).toBe(false);
    });
});

describe('TOML config (Codex)', () => {
    const before = [
        'model = "o3"', '',
        '[mcp_servers.other]', 'command = "uvx"', '',
        '[mcp_servers.github]', 'command = "old"', '',
        '[mcp_servers.github.env]', 'TOKEN = "x"', '',
        '[profiles.fast]', 'model = "o4-mini"', '',
    ].join('\n');
    const entry = { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_TOKEN: 'ghp_test' } };

    it('replaces our table and its sub-tables, keeps everything else', () => {
        const { text, replaced } = upsertToml(before, 'mcp_servers', 'github', entry);
        expect(replaced).toBe(true);
        expect(text).toBe([
            'model = "o3"', '',
            '[mcp_servers.other]', 'command = "uvx"', '',
            '[profiles.fast]', 'model = "o4-mini"', '',
            '[mcp_servers.github]', 'command = "npx"', 'args = ["-y", "@modelcontextprotocol/server-github"]', '',
            '[mcp_servers.github.env]', 'GITHUB_TOKEN = "ghp_test"', '',
        ].join('\n'));
    });
    it('quotes non-bare server names and escapes strings', () => {
        const { text } = upsertToml('', 'mcp_servers', 'io.github/x', { command: 'a "b"' });
        expect(text).toBe('[mcp_servers."io.github/x"]\ncommand = "a \\"b\\""\n');
    });
    it('refuses a root [mcp_servers] table it cannot edit safely', () => {
        expect(() => upsertToml('[mcp_servers]\ngithub.command = "x"\n', 'mcp_servers', 'github', entry)).toThrow(McpConfigError);
    });
    it('writes and removes through the file API with backup', async () => {
        const f = join(await tmp(), 'config.toml');
        await writeFile(f, before);
        await writeMcpServer(f, codex, 'github', entry);
        expect(await readFile(`${f}.bak`, 'utf-8')).toBe(before);
        expect(await removeMcpServer(f, codex, 'github')).toBe(true);
        const after = await readFile(f, 'utf-8');
        expect(after).not.toMatch(/mcp_servers\.github/);
        expect(after).toMatch(/\[mcp_servers\.other\]/);
    });
});

describe('symlinked config', () => {
    it('writes through the link and keeps it a link', async () => {
        const d = await mkdtemp(join(tmpdir(), 'askl-link-'));
        const real = join(d, 'dotfiles-mcp.json');
        await writeFile(real, '{"mcpServers":{"keep":{"command":"x"}}}');
        const link = join(d, '.mcp.json');
        await symlink(real, link);
        await writeMcpServer(link, claude, 'github', { type: 'stdio', command: 'npx' });
        expect((await lstat(link)).isSymbolicLink()).toBe(true);
        const doc = JSON.parse(await readFile(real, 'utf8'));
        expect(Object.keys(doc.mcpServers)).toEqual(['keep', 'github']);
        expect(existsSync(real + '.bak')).toBe(true);
    });
});
