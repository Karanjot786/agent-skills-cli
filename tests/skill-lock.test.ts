import { describe, it, expect, beforeAll, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

let home: string;
let lockMod: typeof import('../src/core/skill-lock.js');
let integ: typeof import('../src/core/integrity.js');

beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), 'askl-home-'));
    process.env.HOME = home; process.env.USERPROFILE = home;
    vi.resetModules();
    lockMod = await import('../src/core/skill-lock.js');
    integ = await import('../src/core/integrity.js');
});

describe('integrity + lock', () => {
    it('hashText normalizes CRLF and is prefixed', () => {
        expect(integ.hashText('a\r\nb')).toBe(integ.hashText('a\nb'));
        expect(integ.hashText('x')).toBe('sha256-2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881');
    });
    it('old locks keep skill keys; same-name MCP gets its own key; type defaults to skill', async () => {
        await mkdir(join(home, '.skills'), { recursive: true });
        await writeFile(join(home, '.skills', 'skills.lock'), JSON.stringify({
            version: '1',
            skills: { github: { name: 'github', scopedName: '@a/github', source: 'https://github.com/a/b', sourceType: 'github', installedAt: '2026-01-01T00:00:00.000Z', agents: ['claude'], canonicalPath: '/x/github', isGlobal: false } },
        }));
        const old = await lockMod.getSkillFromLock('github');
        expect(old?.type).toBeUndefined();
        expect(lockMod.lockKey(old!)).toBe('github');
        const entry = lockMod.createLockEntry({
            name: 'github', scopedName: 'mcp/github--github-mcp-server', source: 'https://www.agentskills.in/api/items/mcp/github--github-mcp-server',
            sourceType: 'database', agents: ['claude'], canonicalPath: '/p/.mcp.json', isGlobal: false, projectDir: '/p',
            type: 'mcp', configTarget: [{ agent: 'claude', file: '/p/.mcp.json', key: 'mcpServers', name: 'github' }], contentHash: 'sha256-abc',
        });
        await lockMod.addSkillToLock(entry);
        const lock = JSON.parse(await readFile(join(home, '.skills', 'skills.lock'), 'utf-8'));
        expect(Object.keys(lock.skills).sort()).toEqual(['github', 'mcp:github']);
        expect(lock.skills['mcp:github'].configTarget[0].file).toBe('/p/.mcp.json');
        await lockMod.removeSkillFromLock(lockMod.lockKey(entry));
        expect(Object.keys((await lockMod.readLock()).skills)).toEqual(['github']);
        const e = lockMod.createLockEntry({ name: 's', scopedName: 's', source: '.', sourceType: 'local', agents: [], canonicalPath: '/s', isGlobal: false, commit: 'abc123', contentHash: 'sha256-1' });
        expect(e).toMatchObject({ type: 'skill', commit: 'abc123', contentHash: 'sha256-1' });
    });
});
