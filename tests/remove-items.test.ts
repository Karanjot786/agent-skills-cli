import { describe, it, expect, beforeAll, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let home: string, proj: string;
let lock: typeof import('../src/core/skill-lock.js');
let remove: typeof import('../src/cli/commands/remove.js');
let agents: typeof import('../src/cli/agents.js');

beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), 'askl-home-'));
    proj = await mkdtemp(join(tmpdir(), 'askl-proj-'));
    process.env.HOME = home; process.env.USERPROFILE = home;
    process.chdir(proj);
    vi.resetModules();
    lock = await import('../src/core/skill-lock.js');
    remove = await import('../src/cli/commands/remove.js');
    agents = await import('../src/cli/agents.js');
});

describe('remove', () => {
    it('does not delete sibling skills when canonicalPath is the whole agent dir (pre-1.1.10 bug)', async () => {
        const dir = join(proj, '.claude/skills');
        for (const s of ['a', 'b']) { await mkdir(join(dir, s), { recursive: true }); await writeFile(join(dir, s, 'SKILL.md'), s); }
        await lock.addSkillToLock(lock.createLockEntry({ name: 'a', scopedName: 'a', source: 'x', sourceType: 'github', agents: ['claude'], canonicalPath: '.claude/skills', isGlobal: false }));
        await remove.removeCommand(['a'], { yes: true }, agents.AGENTS);
        expect(existsSync(join(dir, 'a'))).toBe(false);
        expect(existsSync(join(dir, 'b', 'SKILL.md'))).toBe(true);
    });
    it('never deletes the source folder of a local install', async () => {
        const src = join(proj, 'my-src', 'c');
        await mkdir(src, { recursive: true }); await writeFile(join(src, 'SKILL.md'), 'c');
        await mkdir(join(proj, '.claude/skills/c'), { recursive: true });
        await lock.addSkillToLock(lock.createLockEntry({ name: 'c', scopedName: 'c', source: src, sourceType: 'local', agents: ['claude'], canonicalPath: src, isGlobal: false }));
        await remove.removeCommand(['c'], { yes: true }, agents.AGENTS);
        expect(existsSync(join(proj, '.claude/skills/c'))).toBe(false);
        expect(existsSync(join(src, 'SKILL.md'))).toBe(true);
    });
});
