/**
 * `skills search` command — Search and install skills from the marketplace
 */
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { fetchSkillsForCLI, searchSkills } from '../../core/index.js';
import { AGENTS, AgentConfig } from '../agents.js';
import { fzfSearch } from '../fzf-search.js';
// Same staged download + security scan as `skills install`.
import { installSkillFromDatabase } from './install.js';

export function registerSearchInstallCommand(program: Command) {
    program
        .command('search [query...]')
        .alias('s')
        .description('Search and install skills from the marketplace')
        .option('-l, --limit <n>', 'Maximum results to show', '20')
        .option('-s, --sort <by>', 'Sort by: stars, recent, name', 'stars')
        .option('-i, --interactive', 'Launch interactive FZF-style search')
        .option('-a, --agent <agents...>', 'Specify agents to install to (e.g. -a claude cursor)')
        .option('-g, --global', 'Install globally (user-wide)')
        .option('-y, --yes', 'Skip confirmation prompts')
        .option('--json', 'Output as JSON for scripting (no interactive prompt)')
        .action(async (queryParts, options) => {
            try {
                // Interactive FZF mode
                if (options.interactive || (queryParts.length === 0 && !options.json)) {
                    await fzfSearch();
                    return;
                }

                const query = queryParts.join(' ');
                const limit = parseInt(options.limit) || 20;
                const sortBy = options.sort || 'stars';

                const spinner = ora('Searching marketplace...').start();

                let skills: any[] = [];
                let total = 0;
                try {
                    const result = await fetchSkillsForCLI({ search: query || undefined, limit, sortBy });
                    skills = result.skills;
                    total = result.total;
                } catch {
                    // Fallback to GitHub search
                    const results = await searchSkills(query);
                    skills = results.slice(0, limit);
                    total = results.length;
                }

                spinner.stop();

                if (skills.length === 0) {
                    console.log(chalk.yellow(`\nNo skills found${query ? ` for "${query}"` : ''}.`));
                    return;
                }

                // JSON output (no interactive prompt)
                if (options.json) {
                    console.log(JSON.stringify({ skills, total, query }, null, 2));
                    return;
                }

                console.log(chalk.bold(`\n🔍 ${total.toLocaleString()} skills found${query ? ` for "${query}"` : ''}\n`));

                // Select skills — install all with -y, or show interactive checkbox
                let selectedSkills: any[] = [];

                if (options.yes) {
                    // Auto-select ALL results
                    selectedSkills = skills;
                    console.log(chalk.cyan(`  Auto-installing ${skills.length} skills...\n`));
                } else {
                    // Interactive checkbox (multi-select with spacebar, confirm with Enter)
                    const choices = skills.map((skill: any) => {
                        const stars = skill.stars ? chalk.yellow(`⭐${skill.stars.toLocaleString()}`) : '';
                        const desc = skill.description ? skill.description.slice(0, 50) : '';
                        return {
                            name: `${chalk.cyan(skill.scopedName || skill.scoped_name || skill.name)} ${stars}  ${chalk.gray(desc)}`,
                            value: skill,
                            short: skill.scopedName || skill.scoped_name || skill.name,
                            checked: false
                        };
                    });

                    const { picked } = await inquirer.prompt([{
                        type: 'checkbox',
                        name: 'picked',
                        message: 'Select skills to install (space to select, enter to confirm):',
                        choices,
                        pageSize: 15
                    }]);
                    selectedSkills = picked;
                }

                if (selectedSkills.length === 0) {
                    console.log(chalk.gray('No skills selected.'));
                    return;
                }

                // Determine agents — from -a flag or prompt
                let agents: string[] = [];
                if (options.agent) {
                    const agentFlags = Array.isArray(options.agent) ? options.agent : [options.agent];
                    for (const flag of agentFlags) {
                        const matchedKey = Object.keys(AGENTS).find(k =>
                            k.toLowerCase() === flag.toLowerCase() ||
                            AGENTS[k].displayName.toLowerCase() === flag.toLowerCase()
                        );
                        if (matchedKey) {
                            agents.push(matchedKey);
                        } else {
                            console.log(chalk.yellow(`Unknown agent: ${flag}`));
                        }
                    }
                }

                if (agents.length === 0) {
                    const agentChoices = Object.entries(AGENTS).map(([key, config]: [string, AgentConfig]) => ({
                        name: config.displayName,
                        value: key,
                        checked: key === 'cursor' || key === 'claude'
                    }));

                    const { selectedAgents } = await inquirer.prompt([{
                        type: 'checkbox',
                        name: 'selectedAgents',
                        message: 'Install to which agents?',
                        choices: agentChoices
                    }]);
                    agents = selectedAgents;
                }

                if (agents.length === 0) {
                    console.log(chalk.yellow('No agents selected.'));
                    return;
                }

                // Determine scope — from -g flag or prompt
                let isGlobal = false;
                if (options.global !== undefined) {
                    isGlobal = options.global;
                } else if (!options.yes) {
                    const { scope } = await inquirer.prompt([{
                        type: 'list',
                        name: 'scope',
                        message: 'Install scope:',
                        choices: [
                            { name: 'Global (~/.agent/skills)', value: 'global' },
                            { name: 'Project (.agent/skills)', value: 'project' }
                        ]
                    }]);
                    isGlobal = scope === 'global';
                }

                // Install all selected skills
                const { addSkillToLock, createLockEntry } = await import('../../core/index.js');
                let installed = 0;
                let failed = 0;

                for (const skill of selectedSkills) {
                    const skillName = skill.scopedName || skill.scoped_name || skill.name;
                    const installSpinner = ora(`Installing ${skillName}... (${installed + failed + 1}/${selectedSkills.length})`).start();

                    try {
                        let installDir: string = '';
                        const githubUrl = skill.github_url || skill.githubUrl;
                        const rawUrl = skill.raw_url || skill.rawUrl;

                        const url = githubUrl || rawUrl;
                        if (!url) throw new Error(`No GitHub URL found for skill ${skillName}`);
                        for (const agent of agents) {
                            const config = AGENTS[agent];
                            const targetDir = isGlobal ? config.globalDir : config.projectDir;
                            installDir = await installSkillFromDatabase({ ...skill, github_url: url }, targetDir);
                        }

                        // Add to lock file
                        const lockEntry = createLockEntry({
                            name: skill.name,
                            scopedName: skillName,
                            source: githubUrl || rawUrl || `database:${skill.name}`,
                            sourceType: githubUrl ? 'github' : 'database',
                            version: skill.version,
                            agents,
                            canonicalPath: installDir,
                            isGlobal,
                        });
                        await addSkillToLock(lockEntry);

                        installSpinner.succeed(`Installed ${skillName}`);
                        for (const agent of agents) {
                            const config = AGENTS[agent];
                            const dir = isGlobal ? config.globalDir : config.projectDir;
                            console.log(chalk.gray(`  → ${config.displayName}: ${dir}/${skill.name}`));
                        }
                        installed++;
                    } catch (err: any) {
                        installSpinner.fail(`Failed to install ${skillName}: ${err.message || err}`);
                        failed++;
                    }
                }

                // Summary
                if (selectedSkills.length > 1) {
                    console.log(chalk.bold(`\n📦 Done: ${installed} installed, ${failed} failed\n`));
                } else {
                    console.log('');
                }
            } catch (error) {
                console.error(chalk.red('Error:'), error);
                process.exit(1);
            }
        });
}
