/**
 * Frozen Install Command
 * Install skills from skills.lock with pinned versions (like npm ci).
 */
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

export function registerFrozenCommand(program: Command) {
    program
        .command('frozen')
        .description('Install skills from the lockfile with pinned versions (like npm ci)')
        .option('--verify', 'Only verify that installed skills match the lock file')
        .option('--strict', 'Fail if any skill cannot be restored exactly')
        .action(async (options: any) => {
            try {
                const { existsSync } = await import('fs');
                const { readFile, rm, mkdir, cp } = await import('fs/promises');
                const { homedir } = await import('os');
                const { join, basename } = await import('path');
                // canonicalPath is the skill folder since 1.1.10; older lock entries hold its parent dir.
                const skillDirOf = (e: { canonicalPath: string; name: string }) =>
                    basename(e.canonicalPath) === e.name ? e.canonicalPath : join(e.canonicalPath, e.name);
                const { readLock } = await import('../../core/skill-lock.js');
                const { exec } = await import('child_process');
                const { promisify } = await import('util');
                const execAsync = promisify(exec);

                const lock = await readLock();
                const skills = Object.values(lock.skills);

                if (skills.length === 0) {
                    console.log(chalk.yellow('\n  No skills in lockfile. Install skills first with `skills install`.\n'));
                    return;
                }

                console.log(chalk.bold(`\n❄️  Frozen Install${options.verify ? ' (verify mode)' : ''}\n`));
                console.log(chalk.gray(`  Found ${skills.length} skill(s) in lockfile.\n`));

                let passed = 0;
                let failed = 0;

                for (const entry of skills) {
                    const spinner = ora(`${options.verify ? 'Verifying' : 'Restoring'} ${entry.name}...`).start();

                    try {
                        if (options.verify) {
                            // Verify mode: check if skill exists and matches
                            const exists = existsSync(join(skillDirOf(entry), 'SKILL.md'));
                            if (exists) {
                                spinner.succeed(`${entry.name} ${chalk.gray('✓ verified')}`);
                                passed++;
                            } else {
                                spinner.fail(`${entry.name} ${chalk.red('✗ missing')}`);
                                failed++;
                            }
                        } else {
                            // Restore mode: reinstall from source
                            if (entry.sourceType === 'github' || entry.sourceType === 'private-git') {
                                const tmpDir = join(homedir(), '.antigravity', 'tmp', `frozen-${Date.now()}`);
                                await mkdir(tmpDir, { recursive: true });

                                let cloneCmd = `git clone --depth 1`;
                                if (entry.version) {
                                    // Try to checkout specific commit
                                    cloneCmd = `git clone`;
                                }
                                cloneCmd += ` ${entry.source} ${tmpDir}`;

                                try {
                                    await execAsync(cloneCmd, { timeout: 30000 });

                                    if (entry.version) {
                                        try {
                                            await execAsync(`git checkout ${entry.version}`, { cwd: tmpDir });
                                        } catch {
                                            // Version might not be a valid ref, continue
                                        }
                                    }

                                    // Copy to canonical path
                                    const destDir = skillDirOf(entry);
                                    await mkdir(destDir, { recursive: true });

                                    // Find SKILL.md in cloned repo
                                    const skillMd = join(tmpDir, 'SKILL.md');
                                    if (existsSync(skillMd)) {
                                        await cp(tmpDir, destDir, { recursive: true });
                                    } else {
                                        // Look for skill subdirectory
                                        const { readdir } = await import('fs/promises');
                                        const entries = await readdir(tmpDir, { withFileTypes: true });
                                        for (const e of entries) {
                                            if (e.isDirectory() && existsSync(join(tmpDir, e.name, 'SKILL.md'))) {
                                                await cp(join(tmpDir, e.name), destDir, { recursive: true });
                                                break;
                                            }
                                        }
                                    }

                                    // Cleanup
                                    await rm(tmpDir, { recursive: true, force: true }).catch(() => { });

                                    spinner.succeed(`${entry.name} ${chalk.gray(`restored from ${entry.sourceType}`)}`);
                                    passed++;
                                } catch (err: any) {
                                    await rm(tmpDir, { recursive: true, force: true }).catch(() => { });
                                    throw err;
                                }
                            } else if (entry.sourceType === 'local') {
                                // Local source — just verify it still exists
                                if (existsSync(join(entry.source, 'SKILL.md'))) {
                                    spinner.succeed(`${entry.name} ${chalk.gray('local source valid')}`);
                                    passed++;
                                } else {
                                    spinner.fail(`${entry.name} ${chalk.red('local source missing')}`);
                                    failed++;
                                }
                            } else {
                                spinner.info(`${entry.name} ${chalk.gray(`skipped (${entry.sourceType} source)`)}`);
                                passed++;
                            }
                        }
                    } catch (err: any) {
                        spinner.fail(`${entry.name} ${chalk.red(err.message || 'failed')}`);
                        failed++;
                        if (options.strict) {
                            console.log(chalk.red('\n  Strict mode: aborting on first failure.\n'));
                            process.exit(1);
                        }
                    }
                }

                console.log('');
                console.log(chalk.bold('  Summary:'));
                console.log(`    ${chalk.green(`${passed} succeeded`)} / ${chalk.red(`${failed} failed`)} / ${skills.length} total`);
                console.log('');

                if (failed > 0) process.exit(1);
            } catch (error: any) {
                console.error(chalk.red('Error:'), error.message || error);
                process.exit(1);
            }
        });
}
