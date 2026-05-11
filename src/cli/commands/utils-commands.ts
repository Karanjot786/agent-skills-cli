/**
 * Utility commands — doctor, check, update, exec
 */
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { AGENTS } from '../agents.js';

export function registerDoctorCommand(program: Command) {
    program
        .command('doctor')
        .description('Diagnose installation and configuration issues')
        .option('-f, --fix', 'Attempt to fix issues automatically')
        .option('-d, --deep', 'Run deep conflict detection across installed skills')
        .action(async (options) => {
            try {
                const { existsSync } = await import('fs');
                const { mkdir, readdir } = await import('fs/promises');
                const { homedir } = await import('os');
                const { join } = await import('path');
                const { exec } = await import('child_process');
                const { promisify } = await import('util');
                const execAsync = promisify(exec);

                console.log(chalk.bold('\n🩺 Agent Skills Doctor\n'));

                const home = homedir();
                const checks: Array<{ name: string; status: string; message: string; fix?: () => Promise<void> }> = [];

                // Check 1: Node version
                const nodeVersion = process.version;
                const major = parseInt(nodeVersion.slice(1));
                if (major >= 18) {
                    checks.push({ name: 'Node.js version', status: 'pass', message: `${nodeVersion}` });
                } else {
                    checks.push({ name: 'Node.js version', status: 'fail', message: `${nodeVersion} (requires 18+)` });
                }

                // Check 2: Global skills directory
                const skillsDir = join(home, '.antigravity', 'skills');
                if (existsSync(skillsDir)) {
                    checks.push({ name: 'Skills directory', status: 'pass', message: skillsDir });
                } else {
                    checks.push({
                        name: 'Skills directory',
                        status: 'warn',
                        message: `${skillsDir} (not found)`,
                        fix: async () => { await mkdir(skillsDir, { recursive: true }); }
                    });
                }

                // Check 3: Agent directories
                for (const [key, config] of Object.entries(AGENTS).slice(0, 5)) {
                    if (existsSync(config.globalDir)) {
                        checks.push({ name: `${config.displayName} dir`, status: 'pass', message: config.globalDir });
                    } else {
                        checks.push({
                            name: `${config.displayName} dir`,
                            status: 'warn',
                            message: `${config.globalDir} (not created)`,
                            fix: async () => { await mkdir(config.globalDir, { recursive: true }); }
                        });
                    }
                }

                // Check 4: Git availability
                try {
                    const { stdout } = await execAsync('git --version');
                    checks.push({ name: 'Git', status: 'pass', message: stdout.trim() });
                } catch {
                    checks.push({ name: 'Git', status: 'fail', message: 'Not installed' });
                }

                // Check 5: GitHub API connectivity
                try {
                    const response = await fetch('https://api.github.com', {
                        headers: { 'User-Agent': 'agent-skills-cli' }
                    });
                    if (response.ok) {
                        checks.push({ name: 'GitHub API', status: 'pass', message: 'Connected' });
                    } else {
                        checks.push({ name: 'GitHub API', status: 'warn', message: `Status ${response.status}` });
                    }
                } catch {
                    checks.push({ name: 'GitHub API', status: 'fail', message: 'Cannot connect' });
                }

                // Check 6: Installed skills have valid SKILL.md
                const skillDirs: string[] = [];
                if (existsSync(skillsDir)) {
                    const entries = await readdir(skillsDir, { withFileTypes: true });
                    const skillCount = entries.filter(e => e.isDirectory()).length;
                    let validCount = 0;

                    for (const entry of entries) {
                        if (entry.isDirectory()) {
                            const skillPath = join(skillsDir, entry.name);
                            const skillMd = join(skillPath, 'SKILL.md');
                            if (existsSync(skillMd)) {
                                validCount++;
                                skillDirs.push(skillPath);
                            }
                        }
                    }

                    if (skillCount === 0) {
                        checks.push({ name: 'Installed skills', status: 'pass', message: 'None installed' });
                    } else if (validCount === skillCount) {
                        checks.push({ name: 'Installed skills', status: 'pass', message: `${validCount}/${skillCount} valid` });
                    } else {
                        checks.push({ name: 'Installed skills', status: 'warn', message: `${validCount}/${skillCount} valid` });
                    }
                }

                // Display results
                let hasIssues = false;
                for (const check of checks) {
                    const icon = check.status === 'pass' ? chalk.green('✓') :
                        check.status === 'warn' ? chalk.yellow('⚠') :
                            chalk.red('✗');
                    console.log(`  ${icon} ${check.name}: ${chalk.gray(check.message)}`);
                    if (check.status !== 'pass') hasIssues = true;
                }

                // ── Deep conflict detection ─────────────────────────────────
                if (options.deep) {
                    console.log(chalk.bold('\n🔍 Deep Conflict Analysis\n'));

                    if (skillDirs.length < 2) {
                        console.log(chalk.gray('  Need at least 2 installed skills to detect conflicts.\n'));
                    } else {
                        const spinner = ora('Analyzing skills for conflicts...').start();
                        try {
                            const { detectConflicts } = await import('../../core/conflict-detector.js');
                            const result = await detectConflicts(skillDirs);
                            spinner.stop();

                            // Show conflicts
                            if (result.conflicts.length > 0) {
                                console.log(chalk.red(`  Found ${result.conflicts.length} conflict(s):\n`));
                                for (const conflict of result.conflicts) {
                                    const icon = conflict.severity === 'critical'
                                        ? chalk.red('✗')
                                        : chalk.yellow('⚠');
                                    console.log(`  ${icon} ${chalk.bold(conflict.category.toUpperCase())}: ${conflict.description}`);
                                    console.log(`    ${chalk.cyan(conflict.skillA)}: ${chalk.gray(conflict.lineA)}`);
                                    console.log(`    ${chalk.cyan(conflict.skillB)}: ${chalk.gray(conflict.lineB)}`);
                                    console.log('');
                                }
                            } else {
                                console.log(chalk.green('  ✓ No conflicting instructions found.\n'));
                            }

                            // Show overlaps
                            if (result.overlaps.length > 0) {
                                console.log(chalk.yellow(`  Found ${result.overlaps.length} topic overlap(s):\n`));
                                for (const overlap of result.overlaps) {
                                    console.log(`  ${chalk.yellow('⚠')} ${chalk.bold(overlap.topic)}`);
                                    console.log(`    Skills: ${overlap.skills.map(s => chalk.cyan(s)).join(', ')}`);
                                    console.log(`    Est. wasted tokens: ${chalk.yellow(String(overlap.tokenWaste))}`);
                                    console.log('');
                                }
                            } else {
                                console.log(chalk.green('  ✓ No topic overlaps found.\n'));
                            }

                            // Summary
                            const { summary } = result;
                            if (summary.total > 0) {
                                console.log(chalk.bold('  Summary:'));
                                if (summary.critical > 0) console.log(`    ${chalk.red('✗')} ${summary.critical} critical conflict(s)`);
                                if (summary.warnings > 0) console.log(`    ${chalk.yellow('⚠')} ${summary.warnings} warning(s)`);
                                if (summary.overlapCount > 0) console.log(`    ${chalk.yellow('⚠')} ${summary.overlapCount} overlap(s) (~${summary.estimatedTokenWaste} wasted tokens)`);
                                console.log('');
                            }
                        } catch (err: any) {
                            spinner.fail('Conflict analysis failed');
                            console.error(chalk.red(`  ${err.message || err}`));
                        }
                    }
                }

                // Fix issues if requested
                if (options.fix && hasIssues) {
                    console.log(chalk.cyan('\n🔧 Attempting fixes...\n'));
                    for (const check of checks) {
                        if (check.fix && check.status !== 'pass') {
                            try {
                                await check.fix();
                                console.log(chalk.green(`  ✓ Fixed: ${check.name}`));
                            } catch (err) {
                                console.log(chalk.red(`  ✗ Could not fix: ${check.name}`));
                            }
                        }
                    }
                }

                if (!hasIssues && !options.deep) {
                    console.log(chalk.green('\n✓ All checks passed!\n'));
                } else if (!options.fix && !options.deep) {
                    console.log(chalk.gray('\nRun with --fix to attempt automatic fixes.\n'));
                }

                if (!options.deep) {
                    console.log(chalk.gray('  Tip: Run with --deep to detect skill conflicts and overlaps.\n'));
                }
                console.log('');
            } catch (error) {
                console.error(chalk.red('Error running doctor:'), error);
                process.exit(1);
            }
        });
}

export function registerCheckCommand(program: Command) {
    program
        .command('check')
        .description('Check installed skills and available updates')
        .option('-a, --agent <agent>', 'Check specific agent only')
        .option('-g, --global', 'Check globally installed skills only')
        .option('--json', 'Output as JSON')
        .action(async (options) => {
            try {
                const { listInstalledSkills, readLock } = await import('../../core/index.js');

                const spinner = ora('Checking installed skills...').start();

                // Read from lock file
                const lock = await readLock();
                let skills = Object.values(lock.skills);

                // Filter by global/project
                if (options.global) {
                    skills = skills.filter(s => s.isGlobal);
                }

                // Filter by agent
                if (options.agent) {
                    skills = skills.filter(s => s.agents.includes(options.agent));
                }

                spinner.stop();

                if (options.json) {
                    console.log(JSON.stringify({ skills, count: skills.length }, null, 2));
                    return;
                }

                if (skills.length === 0) {
                    console.log(chalk.yellow('\n📦 No skills installed.'));
                    console.log(chalk.gray('Use `skills search` or `skills install` to add skills.\n'));
                    return;
                }

                console.log(chalk.bold(`\n📦 Found ${skills.length} installed skill(s):\n`));

                for (const skill of skills) {
                    const sourceLabel = skill.sourceType === 'database' ? '🌐 Database' :
                        skill.sourceType === 'github' ? '🐙 GitHub' :
                            skill.sourceType === 'gitlab' ? '🦊 GitLab' : '📁 Local';

                    console.log(`  ${chalk.cyan(skill.scopedName)} ${chalk.gray(`[${sourceLabel}]`)}`);
                    console.log(chalk.gray(`    Agents: ${skill.agents.join(', ')}`));
                    console.log(chalk.gray(`    Installed: ${new Date(skill.installedAt).toLocaleDateString()}`));
                    if (skill.version) {
                        console.log(chalk.gray(`    Version: ${skill.version.slice(0, 7)}`));
                    }
                    console.log('');
                }

                console.log(chalk.gray('Tip: Run `skills update` to update all skills.'));
                console.log(chalk.gray('     Run `skills remove` to uninstall skills.\n'));

            } catch (error) {
                console.error(chalk.red('Error checking installed skills:'), error);
                process.exit(1);
            }
        });
}

export function registerUpdateCommand(program: Command) {
    program
        .command('update [skill-names...]')
        .description('Update installed skills from their sources')
        .option('-a, --all', 'Update all installed skills')
        .option('-g, --global', 'Only update globally installed skills')
        .option('-y, --yes', 'Skip confirmation prompts')
        .option('--prune', 'Remove skills whose source path no longer exists')
        .action(async (skillNames, options) => {
            try {
                const { readLock, removeSkillFromLock, addSkillToLock, createLockEntry } = await import('../../core/index.js');
                const { mkdir, cp, rm } = await import('fs/promises');
                const { existsSync } = await import('fs');
                const { join } = await import('path');
                const { tmpdir } = await import('os');
                const { exec } = await import('child_process');
                const { promisify } = await import('util');
                const execAsync = promisify(exec);

                const lock = await readLock();
                let skillsToUpdate = Object.values(lock.skills);

                // Filter by global
                if (options.global) {
                    skillsToUpdate = skillsToUpdate.filter(s => s.isGlobal);
                }

                // Filter by specific names
                if (skillNames && skillNames.length > 0) {
                    skillsToUpdate = skillsToUpdate.filter(s =>
                        skillNames.some((n: string) =>
                            s.name.toLowerCase() === n.toLowerCase() ||
                            s.scopedName.toLowerCase() === n.toLowerCase()
                        )
                    );
                }

                // If not --all and no specific skills, prompt for selection
                if (!options.all && skillNames.length === 0 && skillsToUpdate.length > 0) {
                    const { selected } = await inquirer.prompt([{
                        type: 'checkbox',
                        name: 'selected',
                        message: 'Select skills to update:',
                        choices: skillsToUpdate.map(s => ({
                            name: `${s.scopedName} (${s.sourceType})`,
                            value: s,
                            checked: true
                        }))
                    }]);
                    skillsToUpdate = selected;
                }

                if (skillsToUpdate.length === 0) {
                    console.log(chalk.yellow('\n📦 No skills to update.'));
                    console.log(chalk.gray('Use `skills install` to add skills first.\n'));
                    return;
                }

                // Filter to only updateable skills (github/gitlab/private-git)
                const updateable = skillsToUpdate.filter(s =>
                    s.sourceType === 'github' || s.sourceType === 'gitlab' || s.sourceType === 'database' || s.sourceType === 'private-git'
                );

                if (updateable.length === 0) {
                    console.log(chalk.yellow('\n📦 No remote skills to update.'));
                    console.log(chalk.gray('Local skills cannot be updated automatically.\n'));
                    return;
                }

                console.log(chalk.bold(`\n📦 Updating ${updateable.length} skill(s)...\n`));

                let successCount = 0;
                let failCount = 0;

                for (const skill of updateable) {
                    const spinner = ora(`Updating ${skill.scopedName}...`).start();

                    try {
                        // Clone to temp directory
                        const tempDir = join(tmpdir(), `skill-update-${Date.now()}`);
                        await mkdir(tempDir, { recursive: true });

                        // For private-git, skip URL validation — use source directly
                        if (skill.sourceType !== 'private-git') {
                            const urlMatch = skill.source.match(/(github|gitlab)\.com\/([^/]+)\/([^/]+)/);
                            if (!urlMatch) {
                                spinner.fail(`${skill.scopedName}: Invalid source URL`);
                                failCount++;
                                continue;
                            }
                        }

                        // Clone the repo
                        await execAsync(`git clone --depth 1 ${skill.source} .`, { cwd: tempDir });

                        // Update each agent directory
                        for (const agent of skill.agents) {
                            const agentConfig = AGENTS[agent];
                            if (!agentConfig) continue;

                            const targetDir = skill.isGlobal ? agentConfig.globalDir : agentConfig.projectDir;
                            const skillDir = skill.isGlobal
                                ? join(targetDir, skill.name)
                                : join(skill.projectDir || process.cwd(), targetDir, skill.name);

                            // Remove old version
                            if (existsSync(skillDir)) {
                                await rm(skillDir, { recursive: true, force: true });
                            }

                            // Copy new version
                            await mkdir(skillDir, { recursive: true });
                            await cp(tempDir, skillDir, { recursive: true });
                        }

                        // Get latest commit SHA for version tracking
                        let version: string | undefined;
                        try {
                            const { stdout } = await execAsync('git rev-parse HEAD', { cwd: tempDir });
                            version = stdout.trim();
                        } catch { }

                        // Update lock file
                        await removeSkillFromLock(skill.scopedName);
                        const updatedEntry = createLockEntry({
                            name: skill.name,
                            scopedName: skill.scopedName,
                            source: skill.source,
                            sourceType: skill.sourceType,
                            version,
                            agents: skill.agents,
                            canonicalPath: skill.canonicalPath,
                            isGlobal: skill.isGlobal,
                            projectDir: skill.projectDir
                        });
                        await addSkillToLock(updatedEntry);

                        // Cleanup
                        await rm(tempDir, { recursive: true, force: true }).catch(() => { });

                        spinner.succeed(`${skill.scopedName}: Updated successfully`);
                        successCount++;
                    } catch (err: any) {
                        spinner.fail(`${skill.scopedName}: ${err.message || err}`);
                        failCount++;
                    }
                }

                console.log('');
                if (successCount > 0) {
                    console.log(chalk.bold.green(`✨ Updated ${successCount} skill(s)`));
                }
                if (failCount > 0) {
                    console.log(chalk.yellow(`⚠ ${failCount} skill(s) failed to update`));
                }

                // ── Prune stale skills ──
                if (options.prune) {
                    // Check all skills (or global-only if -g flag) for:
                    // 1. Skills in lock whose directories no longer exist on disk
                    // 2. Skills whose source URL is now invalid (can't be parsed)
                    const allLockSkills = Object.values(lock.skills);
                    const pruneTargets = options.global
                        ? allLockSkills.filter(s => s.isGlobal)
                        : allLockSkills;

                    const staleSkills: typeof pruneTargets = [];
                    const pruneSpinner = ora('Scanning for stale skills...').start();

                    for (const skill of pruneTargets) {
                        // Check if the skill directory exists on disk for any of its agents
                        let existsOnDisk = false;
                        for (const agent of skill.agents) {
                            const agentConfig = AGENTS[agent];
                            if (!agentConfig) continue;
                            const dir = skill.isGlobal
                                ? join(agentConfig.globalDir, skill.name)
                                : join(skill.projectDir || process.cwd(), agentConfig.projectDir, skill.name);
                            if (existsSync(dir)) {
                                existsOnDisk = true;
                                break;
                            }
                        }

                        if (!existsOnDisk) {
                            staleSkills.push(skill);
                        }
                    }

                    pruneSpinner.stop();

                    if (staleSkills.length > 0) {
                        console.log(chalk.yellow(`\n🧹 Found ${staleSkills.length} stale skill(s) (in lock but missing from disk):`));
                        for (const skill of staleSkills) {
                            console.log(chalk.gray(`  - ${skill.scopedName} (${skill.sourceType})`));
                        }

                        // Remove stale entries from lock
                        for (const skill of staleSkills) {
                            try {
                                await removeSkillFromLock(skill.name);
                                console.log(chalk.green(`  ✔ Removed ${skill.name} from lock file`));
                            } catch (err: any) {
                                console.log(chalk.red(`  ✖ Failed to prune ${skill.name}: ${err.message}`));
                            }
                        }
                        console.log(chalk.green(`\n🧹 Pruned ${staleSkills.length} stale skill(s) from lock file`));
                    } else {
                        console.log(chalk.gray('\n🧹 No stale skills found. All lock entries exist on disk.'));
                    }
                }

                console.log('');

            } catch (error) {
                console.error(chalk.red('Error updating skills:'), error);
                process.exit(1);
            }
        });
}

export function registerExecCommand(program: Command) {
    program
        .command('exec <skill-name> [script-name]')
        .description('Execute a script from a skill')
        .option('-a, --args <args...>', 'Arguments to pass to the script')
        .action(async (skillName, scriptName, options) => {
            try {
                const { executeScript, listScripts } = await import('../../core/executor.js');
                const { homedir } = await import('os');
                const { join } = await import('path');
                const { existsSync } = await import('fs');

                // Find the skill path
                const skillsDir = join(homedir(), '.antigravity', 'skills');
                const skillPath = join(skillsDir, skillName);

                if (!existsSync(skillPath)) {
                    console.error(chalk.red(`Skill not found: ${skillName}`));
                    process.exit(1);
                }

                // If no script name, list available scripts
                if (!scriptName) {
                    const scripts = await listScripts(skillPath);

                    if (scripts.length === 0) {
                        console.log(chalk.yellow('No scripts found in this skill.'));
                        return;
                    }

                    console.log(chalk.bold(`\nAvailable scripts for ${skillName}:\n`));
                    scripts.forEach((s: string) => {
                        console.log(chalk.cyan(`  ${s}`));
                    });
                    console.log('');
                    return;
                }

                // Execute the script
                const spinner = ora(`Executing ${scriptName}...`).start();
                try {
                    const result = await executeScript(skillPath, scriptName, options.args || []);
                    spinner.stop();

                    if (result.stdout) {
                        console.log(result.stdout);
                    }
                    if (result.stderr) {
                        console.error(chalk.yellow(result.stderr));
                    }

                    if (result.exitCode !== 0) {
                        process.exit(result.exitCode);
                    }
                } catch (err: any) {
                    spinner.fail(`Script failed: ${err.message}`);
                    process.exit(1);
                }
            } catch (error) {
                console.error(chalk.red('Error executing script:'), error);
                process.exit(1);
            }
        });
}
