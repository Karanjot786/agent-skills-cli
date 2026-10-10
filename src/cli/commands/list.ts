/**
 * `skills list` command — List all discovered skills
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getAllAgentDiscoveryPaths } from '../agents.js';
import { DEFAULT_SKILL_PATHS, discoverSkills } from '../../core/index.js';

type ListedSkill = {
    name: string;
    description?: string;
    path: string;
};

/** Search roots: canonical and legacy defaults plus every agent's discovery roots. Custom paths replace them. */
export function getListSearchPaths(customPaths?: string[]): string[] {
    if (customPaths && customPaths.length > 0) return customPaths;
    return [...new Set([...DEFAULT_SKILL_PATHS, ...getAllAgentDiscoveryPaths()])];
}

/** Path shown as a skill's source. Kept as a hook for future formatting. */
export function formatSkillSourcePath(path: string): string {
    return path;
}

export function getListJsonEntry(skill: ListedSkill) {
    return {
        name: skill.name,
        description: skill.description,
        path: skill.path,
        sourcePath: formatSkillSourcePath(skill.path),
    };
}

export function getListDisplayLines(skill: ListedSkill) {
    return {
        name: skill.name,
        description: skill.description,
        sourcePath: formatSkillSourcePath(skill.path),
    };
}

export function registerListCommand(program: Command) {
    program
        .command('list')
        .description('List all discovered skills')
        .option('-p, --paths <paths...>', 'Custom search paths')
        .option('-v, --verbose', 'Show detailed information')
        .option('--json', 'Output as JSON')
        .option('--table', 'Output as ASCII table')
        .option('-q, --quiet', 'Output names only (for scripting)')
        .action(async (options) => {
            try {
                const config = { searchPaths: getListSearchPaths(options.paths) };
                const skills = await discoverSkills(config);
                // ponytail: ≈4 chars per token, SKILL.md only; shown in --json and --table.
                const tokens = new Map<string, number>(await Promise.all(skills.map(async s =>
                    [s.path, Math.ceil((await readFile(join(s.path, 'SKILL.md'), 'utf-8').catch(() => '')).length / 4)] as [string, number])));

                if (skills.length === 0) {
                    if (options.json) {
                        console.log(JSON.stringify({ skills: [], count: 0 }));
                    } else if (!options.quiet) {
                        console.log(chalk.yellow('No skills found.'));
                        console.log(chalk.gray('Skills are searched in:'));
                        for (const p of config.searchPaths) {
                            console.log(chalk.gray(`  - ${p}`));
                        }
                    }
                    return;
                }

                // JSON output
                if (options.json) {
                    console.log(JSON.stringify({
                        skills: skills.map(s => ({
                            ...getListJsonEntry(s),
                            tokens: tokens.get(s.path) ?? 0
                        })),
                        count: skills.length,
                        totalTokens: [...tokens.values()].reduce((a, b) => a + b, 0)
                    }, null, 2));
                    return;
                }

                // Quiet output (names only)
                if (options.quiet) {
                    skills.forEach(s => console.log(s.name));
                    return;
                }

                // Table output
                if (options.table) {
                    const maxName = Math.max(...skills.map(s => s.name.length), 4);
                    const maxDesc = Math.min(Math.max(...skills.map(s => (s.description || '').length), 11), 50);
                    const maxSource = Math.min(Math.max(...skills.map(s => formatSkillSourcePath(s.path).length), 6), 60);

                    console.log('');
                    console.log(chalk.bold('Name'.padEnd(maxName + 2) + 'Tokens'.padEnd(8) + 'Description'.padEnd(maxDesc + 2) + 'Source'));
                    console.log('─'.repeat(maxName + 2 + 8 + maxDesc + 2 + maxSource));

                    for (const skill of skills) {
                        const display = getListDisplayLines(skill);
                        const desc = (display.description || '').slice(0, maxDesc);
                        const source = display.sourcePath.slice(0, maxSource);
                        console.log(chalk.cyan(skill.name.padEnd(maxName + 2)) + chalk.yellow(String(tokens.get(skill.path) ?? 0).padEnd(8)) + chalk.gray(desc.padEnd(maxDesc + 2)) + chalk.dim(source));
                    }
                    console.log('');
                    return;
                }

                // Default output
                console.log(chalk.bold(`\nFound ${skills.length} skill(s):\n`));

                for (const skill of skills) {
                    const display = getListDisplayLines(skill);
                    console.log(chalk.cyan(`  ${display.name}`));
                    console.log(chalk.gray(`    Source: ${display.sourcePath}`));
                    if (options.verbose && display.description) {
                        console.log(chalk.gray(`    ${display.description}`));
                    }
                }
                console.log('');
            } catch (error) {
                console.error(chalk.red('Error listing skills:'), error);
                process.exit(1);
            }
        });
}
