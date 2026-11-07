import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const state = vi.hoisted(() => ({
    target: '',
    messages: [] as string[],
    lookup: vi.fn(),
    search: vi.fn(),
    download: vi.fn(),
    lock: vi.fn(),
    clone: vi.fn(),
}));

vi.mock('../src/core/index.js', () => ({
    getSkillByScoped: state.lookup,
    fetchSkillsForCLI: state.search,
    installFromGitHubUrl: state.download,
    addSkillToLock: state.lock,
    createLockEntry: (entry: unknown) => entry,
    parseSource: () => ({ type: 'github', url: 'https://github.com/fixture/catalog-name.git' }),
    cloneWithAuth: state.clone,
    sanitizeUrl: (url: string) => url,
}));
vi.mock('../src/cli/agents.js', () => ({
    AGENTS: { pi: {
        displayName: 'Pi',
        get projectDir() { return state.target; },
        get globalDir() { return state.target; },
    } },
}));
vi.mock('../src/cli/commands/install-item.js', () => ({
    maybeInstallItem: async () => false,
    gateDir: async () => true,
}));
vi.mock('ora', () => ({ default: () => ({
    text: '',
    start() { return this; },
    info(message: string) { state.messages.push(message); },
    succeed() {},
    fail() {},
}) }));

import { registerInstallCommand } from '../src/cli/commands/install.js';

const skill = { name: 'fixture-skill', scoped_name: '@fixture/fixture-skill', github_url: 'https://github.com/fixture/source' };
let project: string;
let exit: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
    vi.resetAllMocks();
    state.messages = [];
    project = await mkdtemp(join(tmpdir(), 'askl-install-error-'));
    state.target = join(project, 'skills');
    state.lookup.mockResolvedValue(skill);
    state.search.mockResolvedValue({ skills: [], total: 0 });
    state.lock.mockResolvedValue(undefined);
    state.clone.mockRejectedValue(new Error('fixture stops before cloning'));
    state.download.mockImplementation(async (_url: string, staging: string) => {
        const path = join(staging, 'fixture-skill');
        await mkdir(path);
        await writeFile(join(path, 'SKILL.md'), '---\nname: fixture-skill\n---\nLocal fixture.');
        return { path };
    });
    exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
    vi.restoreAllMocks();
    await rm(project, { recursive: true, force: true });
});

async function run(source: string) {
    const program = new Command().exitOverride();
    registerInstallCommand(program);
    await program.parseAsync(['node', 'skills', 'install', source, '--agent', 'pi', '--yes']);
}

for (const source of ['@fixture/fixture-skill', 'fixture/fixture-skill']) {
    describe(source, () => {
        it('surfaces a lock failure without retrying a resolved skill as a repository', async () => {
            state.lock.mockRejectedValue(new Error('lock write denied'));
            await run(source);
            expect(exit).toHaveBeenCalledWith(1);
            expect(error.mock.calls.flat().join(' ')).toContain('lock write denied');
            expect(error.mock.calls.flat().join(' ')).toContain('Skill files were copied, but updating the lock file failed.');
            expect(await readFile(join(state.target, 'fixture-skill', 'SKILL.md'), 'utf8')).toContain('Local fixture.');
            expect(state.clone).not.toHaveBeenCalled();
            expect(state.lookup).toHaveBeenCalledTimes(1);
            expect(state.messages).toEqual([]);
        });

        it('surfaces a download/install failure without marketplace fallback', async () => {
            state.download.mockRejectedValue(new Error('download failed'));
            await run(source);
            expect(exit).toHaveBeenCalledWith(1);
            expect(error.mock.calls.flat().join(' ')).toContain('download failed');
            expect(error.mock.calls.flat().join(' ')).not.toContain('Skill files were copied');
            expect(state.clone).not.toHaveBeenCalled();
            expect(state.lock).not.toHaveBeenCalled();
            expect(state.messages).toEqual([]);
        });

        it('keeps a successful resolved installation on its marketplace path', async () => {
            await run(source);
            expect(state.lock).toHaveBeenCalledTimes(1);
            expect(state.clone).not.toHaveBeenCalled();
            expect(exit).not.toHaveBeenCalled();
            expect(error).not.toHaveBeenCalled();
        });

        it('still permits repository fallback when lookup is unavailable', async () => {
            state.lookup.mockRejectedValue(new Error('lookup unavailable'));
            await run(source);
            expect(state.clone).toHaveBeenCalledTimes(1);
            expect(state.messages.join(' ')).toContain('Marketplace unavailable');
        });

        it('still permits repository fallback for a catalog miss', async () => {
            state.lookup.mockResolvedValue(null);
            await run(source);
            expect(state.clone).toHaveBeenCalledTimes(1);
            expect(state.messages.join(' ')).toContain('Not found in marketplace');
        });
    });
}
