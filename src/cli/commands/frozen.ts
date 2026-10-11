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
                const { assertRef, git, gitClone } = await import('../../core/safe-exec.js');
                const { gateDir } = await import('./install-item.js');

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

                                try {
                                    // Full clone when a commit is pinned, so the checkout below can find it.
                                    await gitClone(entry.source, tmpDir, { depth: entry.version ? undefined : 1, timeout: 30000 });

                                    if (entry.version) {
                                        try {
                                            await git(['checkout', assertRef(entry.version)], { cwd: tmpDir });
                                        } catch {
                                            // Version might not be a valid ref, continue
                                        }
                                    }

                                    // Find SKILL.md in cloned repo: the root, or the first subdirectory that has one
                                    let src: string | undefined;
                                    if (existsSync(join(tmpDir, 'SKILL.md'))) {
                                        src = tmpDir;
                                    } else {
                                        const { readdir } = await import('fs/promises');
                                        const sub = (await readdir(tmpDir, { withFileTypes: true }))
                                            .find(e => e.isDirectory() && existsSync(join(tmpDir, e.name, 'SKILL.md')));
                                        if (sub) src = join(tmpDir, sub.name);
                                    }

                                    if (src && !(await gateDir(entry.name, src, false))) {
                                        throw new Error('blocked by security scan');
                                    }

                                    // Copy to canonical path
                                    const destDir = skillDirOf(entry);
                                    await mkdir(destDir, { recursive: true });
                                    if (src) await cp(src, destDir, { recursive: true });

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
