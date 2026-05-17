/**
 * `skills install` command — Install skills from various sources
 * 
 * Supports:
 * - Marketplace (by name, @scoped/name)
 * - GitHub/GitLab/Bitbucket URLs
 * - Private Git repos (SSH, HTTPS with tokens)
 * - npm packages (npm:@scope/package)
 * - Local directories
 * - Lock file reinstallation
 */
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import * as p from '@clack/prompts';
import { AGENTS, AgentConfig } from '../agents.js';
import {
    addSkillToLock,
    createLockEntry,
    installFromGitHubUrl,
    getSkillByScoped,
    fetchSkillsForCLI,
    parseSource,
    cloneWithAuth,
    sanitizeUrl,
} from '../../core/index.js';
import { trackCommand } from '../../core/telemetry.js';

/** Install a skill from its database record into a target directory */
async function installSkillFromDatabase(skill: any, targetDir: string): Promise<string> {
    const githubUrl = skill.github_url || skill.githubUrl;
    if (githubUrl) {
        const result = await installFromGitHubUrl(githubUrl, targetDir);
        return result.path;
    }
    throw new Error(`No GitHub URL found for skill ${skill.name}`);
}

export function registerInstallCommand(program: Command) {
    program
        .command('install [source]')
        .alias('i')
        .alias('add')
        .description('Install skill(s) from marketplace, GitHub URL, or local directory')
        .option('-g, --global', 'Install globally (user-wide)')
        .option('-s, --skill <skills...>', 'Specify skill names to install')
        .option('-a, --agent <agents...>', 'Specify agents to install to')
        .option('--all', 'Install to all agents')
        .option('-y, --yes', 'Skip confirmation prompts')
        .option('--token <token>', 'Authentication token for private Git repos')
        .option('--registry <url>', 'npm registry URL (for npm: sources)')
        .option('--dry-run', 'Show matched skills without installing')
        .action(async (source, options) => {
            try {
                const { mkdir, cp, rm, readdir, readFile } = await import('fs/promises');
                const { existsSync, statSync } = await import('fs');
                const { join, basename, dirname } = await import('path');
                const { tmpdir } = await import('os');
                const { exec } = await import('child_process');
                const { promisify } = await import('util');
                const execAsync = promisify(exec);

                const isGlobal = options.global || false;

                // Determine agents
                let agents: string[] = options.agent || [];

                // Normalize: accept both space-separated (`-a claude cursor`)
                // and comma-separated (`-a claude,cursor`) forms.
                agents = agents
                    .flatMap((a: string) => a.split(','))
                    .map((a: string) => a.trim())
                    .filter((a: string) => a.length > 0);

                // Validate agent names so an unknown agent surfaces a clear
                // error instead of crashing later on `AGENTS[agent].projectDir`.
                const unknownAgents = agents.filter((a: string) => !AGENTS[a]);
                if (unknownAgents.length > 0) {
                    const known = Object.keys(AGENTS).join(', ');
                    console.error(chalk.red(`✖ Unknown agent(s): ${unknownAgents.join(', ')}`));
                    console.error(chalk.gray(`  Valid agents: ${known}`));
                    console.error(chalk.gray(`  Pass multiple agents space- or comma-separated (e.g. -a claude cursor  or  -a claude,cursor)`));
                    process.exit(1);
                }

                // --all flag: install to all agents
                if (options.all) {
                    agents = Object.keys(AGENTS);
                }

                if (agents.length === 0) {
                    const agentChoices = Object.entries(AGENTS).map(([key, config]: [string, AgentConfig]) => ({
                        label: config.displayName,
                        value: key,
                        hint: config.projectDir,
                    }));

                    const selected = await p.multiselect({
                        message: 'Install to which agents?',
                        options: agentChoices,
                        initialValues: ['cursor', 'claude'],
                        required: true,
                    });

                    if (p.isCancel(selected)) {
                        p.cancel('Installation cancelled');
                        return;
                    }
                    agents = selected as string[];
                }

                // If no source, try to detect or prompt
                if (!source) {
                    // Check if there's a skills.lock for reinstalling
                    const { readLock } = await import('../../core/index.js');
                    const lock = await readLock();
                    const lockSkills = Object.values(lock.skills);

                    if (lockSkills.length > 0 && !options.skill) {
                        const { reinstall } = await inquirer.prompt([{
                            type: 'confirm',
                            name: 'reinstall',
                            message: `Found ${lockSkills.length} skills in lock file. Reinstall all?`,
                            default: true
                        }]);

                        if (reinstall) {
                            source = 'lock';
                        }
                    }

                    if (!source && !options.skill) {
                        console.log(chalk.yellow('\nUsage:'));
                        console.log(chalk.gray('  skills install <owner/repo>      Install from GitHub'));
                        console.log(chalk.gray('  skills install <url>             Install from URL'));
                        console.log(chalk.gray('  skills install .                 Install from current directory'));
                        console.log(chalk.gray('  skills install -s <name>         Install from marketplace by name'));
                        console.log(chalk.gray('  skills install                   Reinstall from lock file'));
                        return;
                    }
                }

                // Install from lock file
                if (source === 'lock') {
                    const { readLock } = await import('../../core/index.js');
                    const lock = await readLock();
                    const lockSkills = Object.values(lock.skills);

                    console.log(chalk.bold(`\n📦 Reinstalling ${lockSkills.length} skills from lock file...\n`));

                    let successCount = 0;
                    for (const lockSkill of lockSkills) {
                        const spinner = ora(`Installing ${lockSkill.scopedName}...`).start();
                        try {
                            for (const agent of lockSkill.agents) {
                                const config = AGENTS[agent];
                                if (!config) continue;

                                const targetDir = lockSkill.isGlobal ? config.globalDir : config.projectDir;

                                if (lockSkill.sourceType === 'github' || lockSkill.sourceType === 'gitlab') {
                                    const tempDir = join(tmpdir(), `skill-install-${Date.now()}`);
                                    await mkdir(tempDir, { recursive: true });
                                    await execAsync(`git clone --depth 1 ${lockSkill.source} .`, { cwd: tempDir });

                                    const skillDir = join(targetDir, lockSkill.name);
                                    await mkdir(skillDir, { recursive: true });
                                    await cp(tempDir, skillDir, { recursive: true });
                                    await rm(tempDir, { recursive: true, force: true }).catch(() => { });
                                }
                            }
                            spinner.succeed(`${lockSkill.scopedName}`);
                            successCount++;
                        } catch (err: any) {
                            spinner.fail(`${lockSkill.scopedName}: ${err.message}`);
                        }
                    }

                    console.log(chalk.bold.green(`\n✨ Reinstalled ${successCount}/${lockSkills.length} skills\n`));
                    return;
                }

                // Install by marketplace name(s) using -s flag (supports glob patterns)
                // Only use marketplace path when no source URL is provided
                if (options.skill && options.skill.length > 0 && !source) {
                    const skillNames: string[] = options.skill;

                    // Helper: check if a pattern is a glob
                    const isGlobPattern = (s: string) => s.includes('*') || s.includes('?');
                    // Simple glob matcher (supports * and ? without external dependency)
                    const globMatch = (pattern: string, str: string): boolean => {
                        const regex = new RegExp(
                            '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
                                .replace(/\*/g, '.*')
                                .replace(/\?/g, '.') + '$',
                            'i'
                        );
                        return regex.test(str);
                    };

                    for (const skillName of skillNames) {
                        const isGlob = isGlobPattern(skillName);

                        if (isGlob) {
                            // Glob: search marketplace and filter matches
                            const baseQuery = skillName.replace(/[*?]/g, '').trim();
                            const spinner = ora(`Searching for skills matching "${skillName}"...`).start();
                            try {
                                const result = await fetchSkillsForCLI({ search: baseQuery || 'a', limit: 100, sortBy: 'stars' });
                                const matches = result.skills.filter((s: any) =>
                                    globMatch(skillName, s.name) || globMatch(skillName, s.scopedName || '')
                                );

                                if (matches.length === 0) {
                                    spinner.fail(`No skills matching pattern: ${skillName}`);
                                    continue;
                                }

                                spinner.succeed(`Found ${matches.length} skill(s) matching "${skillName}"`);

                                // Dry run: just list matches
                                if (options.dryRun) {
                                    for (const m of matches) {
                                        console.log(chalk.cyan(`  ${(m as any).scopedName || m.name}`));
                                    }
                                    continue;
                                }

                                // Install all matches
                                for (const skill of matches) {
                                    const sSpinner = ora(`Installing ${(skill as any).scopedName || skill.name}...`).start();
                                    try {
                                        for (const agent of agents) {
                                            const config = AGENTS[agent];
                                            const targetDir = isGlobal ? config.globalDir : config.projectDir;
                                            await installSkillFromDatabase(skill as any, targetDir);
                                        }
                                        const lockEntry = createLockEntry({
                                            name: skill.name,
                                            scopedName: (skill as any).scoped_name || (skill as any).scopedName || skill.name,
                                            source: (skill as any).github_url || (skill as any).githubUrl || `database:${skill.name}`,
                                            sourceType: (skill as any).github_url || (skill as any).githubUrl ? 'github' : 'database',
                                            version: (skill as any).version,
                                            agents,
                                            canonicalPath: isGlobal ? AGENTS[agents[0]].globalDir : AGENTS[agents[0]].projectDir,
                                            isGlobal,
                                        });
                                        await addSkillToLock(lockEntry);
                                        sSpinner.succeed(`Installed ${(skill as any).scopedName || skill.name}`);
                                    } catch (err: any) {
                                        sSpinner.fail(`${(skill as any).scopedName || skill.name}: ${err.message}`);
                                    }
                                }
                            } catch (err: any) {
                                spinner.fail(`Search failed: ${err.message}`);
                            }
                        } else {
                            // Exact match (existing behavior)
                            const spinner = ora(`Searching for ${skillName}...`).start();
                            try {
                                let skill = await getSkillByScoped(skillName);

                                if (!skill) {
                                    const result = await fetchSkillsForCLI({ search: skillName, limit: 1, sortBy: 'stars' });
                                    if (result.skills.length > 0) {
                                        skill = result.skills[0] as any;
                                    }
                                }

                                if (!skill) {
                                    spinner.fail(`Skill not found: ${skillName}`);
                                    continue;
                                }

                                if (options.dryRun) {
                                    spinner.succeed(`Found: ${(skill as any).scoped_name || skill.name}`);
                                    continue;
                                }

                                spinner.text = `Installing ${(skill as any).scoped_name || skill.name}...`;

                                for (const agent of agents) {
                                    const config = AGENTS[agent];
                                    const targetDir = isGlobal ? config.globalDir : config.projectDir;
                                    await installSkillFromDatabase(skill as any, targetDir);
                                }

                                const lockEntry = createLockEntry({
                                    name: skill.name,
                                    scopedName: (skill as any).scoped_name || skill.name,
                                    source: (skill as any).github_url || `database:${skill.name}`,
                                    sourceType: (skill as any).github_url ? 'github' : 'database',
                                    version: (skill as any).version,
                                    agents,
                                    canonicalPath: isGlobal ? AGENTS[agents[0]].globalDir : AGENTS[agents[0]].projectDir,
                                    isGlobal,
                                });
                                await addSkillToLock(lockEntry);

                                spinner.succeed(`Installed ${(skill as any).scoped_name || skill.name}`);
                            } catch (err: any) {
                                spinner.fail(`${skillName}: ${err.message}`);
                            }
                        }
                    }

                    console.log('');
                    return;
                }

                // Install from local directory
                if (source === '.' || existsSync(source)) {
                    const sourcePath = source === '.' ? process.cwd() : source;
                    const stat = statSync(sourcePath);

                    if (!stat.isDirectory()) {
                        console.error(chalk.red('Source must be a directory'));
                        return;
                    }

                    const skillName = basename(sourcePath);
                    console.log(chalk.bold(`\n📦 Installing from local directory: ${skillName}\n`));

                    for (const agent of agents) {
                        const config = AGENTS[agent];
                        const targetDir = isGlobal ? config.globalDir : config.projectDir;
                        const skillDir = join(targetDir, skillName);

                        const spinner = ora(`Installing to ${config.displayName}...`).start();
                        await mkdir(skillDir, { recursive: true });
                        await cp(sourcePath, skillDir, { recursive: true });
                        spinner.succeed(`${config.displayName}: ${skillDir}`);
                    }

                    // Add to lock
                    const lockEntry = createLockEntry({
                        name: skillName,
                        scopedName: skillName,
                        source: sourcePath,
                        sourceType: 'local',
                        agents,
                        canonicalPath: sourcePath,
                        isGlobal,
                    });
                    await addSkillToLock(lockEntry);

                    console.log(chalk.bold.green(`\n✨ Installed ${skillName}\n`));
                    return;
                }

                // ── Parse source with the unified source parser ──
                let parsed = parseSource(source);

                // ── Handle @scoped/name — try marketplace first, fallback to GitHub ──
                if (source.startsWith('@')) {
                    const spinner = ora(`Looking up "${source}" in marketplace...`).start();
                    try {
                        const skill = await getSkillByScoped(source);

                        if (skill) {
                            spinner.text = `Installing ${(skill as any).scoped_name || skill.name}...`;

                            for (const agent of agents) {
                                const config = AGENTS[agent];
                                const targetDir = isGlobal ? config.globalDir : config.projectDir;
                                await installSkillFromDatabase(skill as any, targetDir);
                            }

                            const lockEntry = createLockEntry({
                                name: skill.name,
                                scopedName: (skill as any).scoped_name || skill.name,
                                source: (skill as any).github_url || `database:${skill.name}`,
                                sourceType: (skill as any).github_url ? 'github' : 'database',
                                version: (skill as any).version,
                                agents,
                                canonicalPath: isGlobal ? AGENTS[agents[0]].globalDir : AGENTS[agents[0]].projectDir,
                                isGlobal,
                            });
                            await addSkillToLock(lockEntry);

                            spinner.succeed(`Installed ${(skill as any).scoped_name || skill.name}`);
                            console.log('');
                            return;
                        } else {
                            // Not in marketplace — strip @ and try as GitHub owner/repo
                            const withoutAt = source.slice(1);
                            spinner.info(`Not found in marketplace, trying as GitHub repo: ${withoutAt}`);
                            source = withoutAt;
                            // Re-parse the source without @
                            const reparsed = parseSource(source);
                            Object.assign(parsed, reparsed);
                            // Fall through to git-based install below
                        }
                    } catch {
                        // Marketplace unavailable — strip @ and try as GitHub owner/repo
                        const withoutAt = source.slice(1);
                        spinner.info(`Marketplace unavailable, trying as GitHub repo: ${withoutAt}`);
                        source = withoutAt;
                        const reparsed = parseSource(source);
                        Object.assign(parsed, reparsed);
                        // Fall through to git-based install below
                    }
                }

                // ── npm package: npm:@scope/package ──
                if (parsed.type === 'npm') {
                    const spec = parsed.url; // e.g. "@company/skills"
                    const registry = options.registry;
                    console.log(chalk.bold(`\n📦 Installing from npm: ${spec}\n`));

                    const tempDir = join(tmpdir(), `skill-npm-${Date.now()}`);
                    await mkdir(tempDir, { recursive: true });

                    const packSpinner = ora('Downloading npm package...').start();
                    try {
                        const packCmd = registry
                            ? `npm pack ${spec} --pack-destination ${tempDir} --registry ${registry}`
                            : `npm pack ${spec} --pack-destination ${tempDir}`;
                        const { stdout: packOutput } = await execAsync(packCmd, { timeout: 60000 });

                        // npm pack outputs the tarball filename
                        const tarballName = packOutput.trim().split('\n').pop()!;
                        const tarballPath = join(tempDir, tarballName);

                        // Extract tarball
                        await execAsync(`tar xzf "${tarballPath}" -C "${tempDir}"`, { timeout: 30000 });
                        packSpinner.succeed('Downloaded');

                        // npm pack extracts to a "package" directory
                        const extractedDir = join(tempDir, 'package');

                        // Detect skills in extracted package
                        const skillDirs: string[] = [];
                        if (existsSync(join(extractedDir, 'SKILL.md'))) {
                            skillDirs.push(extractedDir);
                        }

                        // Check subdirectories
                        const entries = await readdir(extractedDir, { withFileTypes: true });
                        for (const entry of entries) {
                            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                                if (existsSync(join(extractedDir, entry.name, 'SKILL.md'))) {
                                    skillDirs.push(join(extractedDir, entry.name));
                                }
                            }
                        }

                        if (skillDirs.length === 0) {
                            // Treat entire package as a skill
                            skillDirs.push(extractedDir);
                        }

                        const pkgName = spec.replace(/^@/, '').replace('/', '-');

                        for (const skillSourceDir of skillDirs) {
                            const skillName = skillSourceDir === extractedDir
                                ? pkgName
                                : basename(skillSourceDir);

                            for (const agent of agents) {
                                const config = AGENTS[agent];
                                const targetDir = isGlobal ? config.globalDir : config.projectDir;
                                const skillDir = join(targetDir, skillName);

                                const installSpinner = ora(`Installing ${skillName} to ${config.displayName}...`).start();
                                await mkdir(skillDir, { recursive: true });
                                await cp(skillSourceDir, skillDir, { recursive: true });
                                installSpinner.succeed(`${config.displayName}: ${skillDir}`);
                            }

                            // Get version from package.json
                            let version: string | undefined;
                            try {
                                const pkgJson = JSON.parse(await readFile(join(extractedDir, 'package.json'), 'utf-8'));
                                version = pkgJson.version;
                            } catch { }

                            const lockEntry = createLockEntry({
                                name: skillName,
                                scopedName: `npm:${spec}/${skillName}`,
                                source: `npm:${spec}`,
                                sourceType: 'npm',
                                version,
                                agents,
                                canonicalPath: isGlobal ? AGENTS[agents[0]].globalDir : AGENTS[agents[0]].projectDir,
                                isGlobal,
                            });
                            await addSkillToLock(lockEntry);
                        }

                        // Cleanup
                        await rm(tempDir, { recursive: true, force: true }).catch(() => { });

                        console.log(chalk.bold.green(`\n✨ Installed ${skillDirs.length} skill(s) from npm:${spec}\n`));
                        trackCommand('install', `source=npm:${spec} count=${skillDirs.length}`);
                    } catch (err: any) {
                        packSpinner.fail(`npm error: ${err.message}`);
                        await rm(tempDir, { recursive: true, force: true }).catch(() => { });
                    }
                    return;
                }

                // ── Git-based install (GitHub, GitLab, Bitbucket, Private Git, SSH) ──
                if (
                    parsed.type === 'github' ||
                    parsed.type === 'gitlab' ||
                    parsed.type === 'bitbucket' ||
                    parsed.type === 'private-git'
                ) {
                    // For owner/repo shorthand or full GitHub URLs, also try marketplace lookup
                    if (parsed.type === 'github' && !source.includes('://') && !source.startsWith('git@')) {
                        // owner/repo shorthand — try marketplace first
                        const spinner = ora(`Looking up "${source}" in marketplace...`).start();
                        try {
                            let skill = await getSkillByScoped(source);
                            if (!skill) {
                                const result = await fetchSkillsForCLI({ search: source, limit: 1, sortBy: 'stars' });
                                if (result.skills.length > 0) {
                                    skill = result.skills[0] as any;
                                }
                            }

                            if (skill) {
                                spinner.text = `Installing ${(skill as any).scoped_name || skill.name}...`;

                                for (const agent of agents) {
                                    const config = AGENTS[agent];
                                    const targetDir = isGlobal ? config.globalDir : config.projectDir;
                                    await installSkillFromDatabase(skill as any, targetDir);
                                }

                                const lockEntry = createLockEntry({
                                    name: skill.name,
                                    scopedName: (skill as any).scoped_name || skill.name,
                                    source: (skill as any).github_url || `database:${skill.name}`,
                                    sourceType: (skill as any).github_url ? 'github' : 'database',
                                    version: (skill as any).version,
                                    agents,
                                    canonicalPath: isGlobal ? AGENTS[agents[0]].globalDir : AGENTS[agents[0]].projectDir,
                                    isGlobal,
                                });
                                await addSkillToLock(lockEntry);

                                spinner.succeed(`Installed ${(skill as any).scoped_name || skill.name}`);
                                console.log('');
                                return;
                            }
                            // Not found in marketplace — fall through to git clone
                            spinner.info('Not found in marketplace, cloning repository...');
                        } catch {
                            // Marketplace unavailable — fall through
                            spinner.info('Marketplace unavailable, cloning repository...');
                        }
                    }

                    // Git clone install with authentication
                    const displayUrl = sanitizeUrl(parsed.url);
                    console.log(chalk.bold(`\n📦 Installing from ${displayUrl}\n`));

                    const tempDir = join(tmpdir(), `skill-install-${Date.now()}`);
                    await mkdir(tempDir, { recursive: true });

                    const cloneSpinner = ora('Cloning repository...').start();
                    try {
                        await cloneWithAuth(parsed.url, tempDir, {
                            ref: parsed.ref,
                            depth: 1,
                            token: options.token,
                        });
                        cloneSpinner.succeed('Cloned');
                    } catch (err: any) {
                        cloneSpinner.fail(`Clone failed: ${err.message}`);
                        await rm(tempDir, { recursive: true, force: true }).catch(() => { });
                        return;
                    }

                    // Detect skills in repo (recursive, up to 3 levels deep)
                    async function findSkillDirs(dir: string, depth = 0, maxDepth = 3): Promise<string[]> {
                        const results: string[] = [];
                        if (existsSync(join(dir, 'SKILL.md'))) {
                            results.push(dir);
                        }
                        if (depth < maxDepth) {
                            const dirEntries = await readdir(dir, { withFileTypes: true });
                            for (const entry of dirEntries) {
                                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                                    const sub = await findSkillDirs(join(dir, entry.name), depth + 1, maxDepth);
                                    results.push(...sub);
                                }
                            }
                        }
                        return results;
                    }

                    let skillDirs = await findSkillDirs(tempDir);

                    if (skillDirs.length === 0) {
                        // Treat entire repo as a skill
                        skillDirs.push(tempDir);
                    }

                    // Glob filter from --skill flag (applies to git clone flow too)
                    if (options.skill && options.skill.length > 0) {
                        const skillFilters: string[] = options.skill;
                        const isGlobP = (s: string) => s.includes('*') || s.includes('?');
                        const globM = (pattern: string, str: string): boolean => {
                            const regex = new RegExp(
                                '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
                                    .replace(/\*/g, '.*')
                                    .replace(/\?/g, '.') + '$',
                                'i'
                            );
                            return regex.test(str);
                        };
                        skillDirs = skillDirs.filter(d => {
                            const name = basename(d);
                            return skillFilters.some(f =>
                                isGlobP(f) ? globM(f, name) : name.toLowerCase() === f.toLowerCase()
                            );
                        });

                        if (skillDirs.length === 0) {
                            console.log(chalk.yellow(`No skills matching: ${skillFilters.join(', ')}\n`));
                            await rm(tempDir, { recursive: true, force: true }).catch(() => { });
                            return;
                        }

                        // Dry run for git clone flow
                        if (options.dryRun) {
                            console.log(chalk.cyan(`\n Matched ${skillDirs.length} skill(s):`));
                            for (const d of skillDirs) {
                                console.log(chalk.gray(`  - ${basename(d)}`));
                            }
                            console.log('');
                            await rm(tempDir, { recursive: true, force: true }).catch(() => { });
                            return;
                        }

                        console.log(chalk.cyan(`ℹ Installing ${skillDirs.length} skill(s) matching filter`));
                    }

                    // Interactive skill selection when multiple skills found
                    if (skillDirs.length > 1 && !options.yes && !(options.skill && options.skill.length > 0)) {
                        const { relative } = await import('path');
                        const skillChoices = skillDirs.map(d => ({
                            label: basename(d),
                            value: d,
                            hint: relative(tempDir, d),
                        }));

                        const selected = await p.multiselect({
                            message: `Found ${skillDirs.length} skills. Select which to install:`,
                            options: [
                                { label: `✅ Install ALL (${skillDirs.length} skills)`, value: '__all__' },
                                ...skillChoices,
                            ],
                            initialValues: ['__all__'],
                            required: true,
                        });

                        if (p.isCancel(selected)) {
                            p.cancel('Installation cancelled');
                            await rm(tempDir, { recursive: true, force: true }).catch(() => { });
                            return;
                        }

                        const selectedValues = selected as string[];
                        if (!selectedValues.includes('__all__')) {
                            skillDirs = selectedValues;
                        }
                    } else if (skillDirs.length > 1 && options.yes) {
                        console.log(chalk.cyan(`ℹ Installing all ${skillDirs.length} skills (--yes flag)`));
                    }

                    const repoName = parsed.url.split('/').pop()?.replace('.git', '') || 'skill';

                    for (const skillSourceDir of skillDirs) {
                        const skillName = skillSourceDir === tempDir ? repoName : basename(skillSourceDir);

                        for (const agent of agents) {
                            const config = AGENTS[agent];
                            const targetDir = isGlobal ? config.globalDir : config.projectDir;
                            const skillDir = join(targetDir, skillName);

                            const spinner = ora(`Installing ${skillName} to ${config.displayName}...`).start();
                            await mkdir(skillDir, { recursive: true });
                            await cp(skillSourceDir, skillDir, { recursive: true });
                            spinner.succeed(`${config.displayName}: ${skillDir}`);
                        }

                        // Get version
                        let version: string | undefined;
                        try {
                            const { stdout } = await execAsync('git rev-parse HEAD', { cwd: tempDir });
                            version = stdout.trim();
                        } catch { }

                        // Determine source type for lock
                        let sourceType = parsed.type;
                        if (sourceType === 'private-git') sourceType = 'private-git';

                        // Add to lock
                        const lockEntry = createLockEntry({
                            name: skillName,
                            scopedName: `${parsed.url.split('/').slice(-2).join('/')}/${skillName}`,
                            source: sanitizeUrl(parsed.url),
                            sourceType: sourceType as any,
                            version,
                            agents,
                            canonicalPath: isGlobal ? AGENTS[agents[0]].globalDir : AGENTS[agents[0]].projectDir,
                            isGlobal,
                        });
                        await addSkillToLock(lockEntry);
                    }

                    // Cleanup
                    await rm(tempDir, { recursive: true, force: true }).catch(() => { });

                    console.log(chalk.bold.green(`\n✨ Installed ${skillDirs.length} skill(s)\n`));

                    trackCommand('install', `source=${sanitizeUrl(parsed.url)} count=${skillDirs.length}`);
                    return;
                }

                // ── Fallback: well-known URL or unrecognized source ──
                console.error(chalk.red(`Unrecognized source: ${source}`));
                console.log(chalk.gray('  Supported formats:'));
                console.log(chalk.gray('    skills install owner/repo'));
                console.log(chalk.gray('    skills install https://github.com/owner/repo'));
                console.log(chalk.gray('    skills install git@github.com:owner/repo.git'));
                console.log(chalk.gray('    skills install https://gitlab.com/owner/repo'));
                console.log(chalk.gray('    skills install https://bitbucket.org/owner/repo'));
                console.log(chalk.gray('    skills install npm:@scope/package'));
                console.log(chalk.gray('    skills install ./local/path'));
                console.log(chalk.gray('    skills install -s skill-name'));
            } catch (error: any) {
                console.error(chalk.red('Error installing skill:'), error.message || error);
                process.exit(1);
            }
        });
}
