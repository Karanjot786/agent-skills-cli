/**
 * Sandbox Preview Command
 * Preview a skill's effects before installation: score, conflicts, token impact.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

export function registerSandboxCommand(program: Command) {
    program
        .command('sandbox <source>')
        .description('Preview a skill before installing — score, conflicts, and token impact')
        .option('-f, --format <format>', 'Output format: text, json', 'text')
        .action(async (source: string, options: any) => {
            try {
                const { existsSync } = await import('fs');
                const { readdir, readFile, mkdtemp, rm } = await import('fs/promises');
                const { homedir } = await import('os');
                const { join, basename } = await import('path');
                const { tmpdir } = await import('os');

                console.log(chalk.bold(`\n🧪 Sandbox Preview: ${chalk.cyan(source)}\n`));

                let skillPath = '';
                let tempDir = '';
                let isTemp = false;

                // Resolve the source
                if (existsSync(source) && existsSync(join(source, 'SKILL.md'))) {
                    skillPath = source;
                } else {
                    // Try to clone from GitHub
                    const spinner = ora('Fetching skill from remote...').start();
                    try {
                        const { gitClone } = await import('../../core/safe-exec.js');

                        tempDir = await mkdtemp(join(tmpdir(), 'skills-sandbox-'));
                        isTemp = true;

                        let gitUrl = source;
                        if (!source.includes('://') && !source.startsWith('git@')) {
                            gitUrl = `https://github.com/${source.replace(/^@/, '')}`;
                        }

                        await gitClone(gitUrl, tempDir, { depth: 1, timeout: 30000 });

                        // Find SKILL.md
                        if (existsSync(join(tempDir, 'SKILL.md'))) {
                            skillPath = tempDir;
                        } else {
                            const entries = await readdir(tempDir, { withFileTypes: true });
                            for (const entry of entries) {
                                if (entry.isDirectory() && existsSync(join(tempDir, entry.name, 'SKILL.md'))) {
                                    skillPath = join(tempDir, entry.name);
                                    break;
                                }
                            }
                        }
                        spinner.succeed('Fetched skill');
                    } catch (err: any) {
                        spinner.fail('Could not fetch skill');
                        console.error(chalk.red(`  ${err.message || err}`));
                        if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => { });
                        return;
                    }
                }

                if (!skillPath || !existsSync(join(skillPath, 'SKILL.md'))) {
                    console.error(chalk.red('  No SKILL.md found.\n'));
                    if (isTemp) await rm(tempDir, { recursive: true, force: true }).catch(() => { });
                    return;
                }

                // Read the skill
                const raw = await readFile(join(skillPath, 'SKILL.md'), 'utf-8');
                let frontmatter: Record<string, any> = {};
                try {
                    const matter = (await import('gray-matter')).default;
                    const parsed = matter(raw);
                    frontmatter = parsed.data;
                } catch { }

                const name = frontmatter.name || basename(skillPath);
                const tokens = Math.ceil(raw.length / 4);
                const lines = raw.split('\n').length;
                const description = frontmatter.description || chalk.gray('(no description)');

                // 1. Basic info
                console.log(chalk.bold('  📋 Skill Info'));
                console.log(`    Name:        ${chalk.cyan(name)}`);
                console.log(`    Description: ${chalk.gray(description)}`);
                console.log(`    Tokens:      ${chalk.yellow(String(tokens))}`);
                console.log(`    Lines:       ${chalk.gray(String(lines))}`);
                console.log('');

                // 2. Quality scoring
                const qualitySpinner = ora('  Running quality checks...').start();
                try {
                    const { testSkill } = await import('../../core/skill-tester.js');
                    const testResult = await testSkill(skillPath);
                    qualitySpinner.stop();

                    console.log(chalk.bold('  🧪 Quality Score'));
                    const passRate = testResult.passRate;
                    const grade = passRate >= 90 ? chalk.green('A') :
                        passRate >= 80 ? chalk.green('B') :
                            passRate >= 70 ? chalk.yellow('C') :
                                passRate >= 60 ? chalk.yellow('D') :
                                    chalk.red('F');
                    console.log(`    Grade: ${grade} (${passRate}%)`);

                    // Show failed checks
                    const failures = testResult.assertions.filter(a => !a.passed);
                    if (failures.length > 0) {
                        console.log(`    Issues:`);
                        for (const f of failures) {
                            console.log(`      ${chalk.red('✗')} ${f.name}: ${chalk.gray(f.message || '')}`);
                        }
                    }
                    console.log('');
                } catch {
                    qualitySpinner.stop();
                    console.log(chalk.gray('  Quality check unavailable.\n'));
                }

                // 3. Conflict check against installed skills
                const conflictSpinner = ora('  Checking for conflicts...').start();
                try {
                    const home = homedir();
                    const skillsDir = join(home, '.antigravity', 'skills');
                    const existingPaths: string[] = [];

                    if (existsSync(skillsDir)) {
                        const entries = await readdir(skillsDir, { withFileTypes: true });
                        for (const entry of entries) {
                            if (entry.isDirectory() && existsSync(join(skillsDir, entry.name, 'SKILL.md'))) {
                                existingPaths.push(join(skillsDir, entry.name));
                            }
                        }
                    }

                    if (existingPaths.length > 0) {
                        const { detectConflicts } = await import('../../core/conflict-detector.js');
                        const result = await detectConflicts([...existingPaths, skillPath]);
                        conflictSpinner.stop();

                        console.log(chalk.bold('  ⚔️  Conflict Analysis'));
                        if (result.conflicts.length === 0 && result.overlaps.length === 0) {
                            console.log(chalk.green('    ✓ No conflicts with installed skills.'));
                        } else {
                            if (result.conflicts.length > 0) {
                                console.log(chalk.red(`    ${result.conflicts.length} conflict(s) found:`));
                                for (const c of result.conflicts.slice(0, 3)) {
                                    console.log(`      ${chalk.red('✗')} ${c.description}`);
                                }
                            }
                            if (result.overlaps.length > 0) {
                                console.log(chalk.yellow(`    ${result.overlaps.length} overlap(s) found (~${result.summary.estimatedTokenWaste} wasted tokens)`));
                            }
                        }
                    } else {
                        conflictSpinner.stop();
                        console.log(chalk.bold('  ⚔️  Conflict Analysis'));
                        console.log(chalk.green('    ✓ No installed skills to conflict with.'));
                    }
                    console.log('');
                } catch {
                    conflictSpinner.stop();
                    console.log(chalk.gray('  Conflict check unavailable.\n'));
                }

                // 4. Verdict
                console.log(chalk.bold('  📊 Verdict'));
                console.log(`    This skill would consume ${chalk.yellow(`~${tokens} tokens`)} of your context budget.`);
                console.log(chalk.gray('    Use `skills install` to proceed with installation.\n'));

                // Cleanup
                if (isTemp) {
                    await rm(tempDir, { recursive: true, force: true }).catch(() => { });
                }
            } catch (error: any) {
                console.error(chalk.red('Error:'), error.message || error);
                process.exit(1);
            }
        });
}
