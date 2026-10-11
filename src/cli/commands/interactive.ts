/**
 * Interactive wizard commands — install-wizard, export-interactive, setup
 * Also: run, context, preview, scripts, completion, info
 */
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import {
    discoverSkills,
    loadSkill,
    listMarketplaceSkills,
    installSkill,
    generateSkillsPromptXML,
    generateFullSkillsContext,
} from '../../core/index.js';
import { AGENTS } from '../agents.js';

type AgentTarget = 'copilot' | 'cursor' | 'claude' | 'codex' | 'antigravity';

/** Helper used by interactive wizard flows */
async function exportToAgent(
    target: AgentTarget,
    skillRefs: Array<{ name: string; description: string; path: string }>,
    projectDir: string,
    fs: any
) {
    const loadedSkills = [];
    for (const ref of skillRefs) {
        const skill = await loadSkill(ref.path);
        if (skill) loadedSkills.push(skill);
    }

    const exportFns: Record<AgentTarget, (s: any[], d: string, f: any) => Promise<void>> = {
        copilot: exportToCopilot,
        cursor: exportToCursor,
        claude: exportToClaude,
        codex: exportToCodex,
        antigravity: exportToAntigravity,
    };

    const fn = exportFns[target];
    if (fn) await fn(loadedSkills, projectDir, fs);
}

async function exportToCopilot(skills: any[], projectDir: string, fs: any) {
    const copilotDir = fs.join(projectDir, '.github', 'skills');
    await fs.mkdir(copilotDir, { recursive: true });
    for (const skill of skills) {
        const skillDir = fs.join(copilotDir, skill.metadata.name);
        await fs.mkdir(skillDir, { recursive: true });
        const content = `---\nname: ${skill.metadata.name}\ndescription: ${skill.metadata.description}\n---\n\n${skill.body}\n`;
        await fs.writeFile(fs.join(skillDir, 'SKILL.md'), content);
    }
    console.log(chalk.green(`  ✓ GitHub Copilot: .github/skills/<skill>/SKILL.md`));
}

async function exportToCursor(skills: any[], projectDir: string, fs: any) {
    const cursorDir = fs.join(projectDir, '.cursor', 'skills');
    await fs.mkdir(cursorDir, { recursive: true });
    for (const skill of skills) {
        const skillDir = fs.join(cursorDir, skill.metadata.name);
        await fs.mkdir(skillDir, { recursive: true });
        const content = `---\nname: ${skill.metadata.name}\ndescription: ${skill.metadata.description}\n---\n\n${skill.body}\n`;
        await fs.writeFile(fs.join(skillDir, 'SKILL.md'), content);
    }
    console.log(chalk.green(`  ✓ Cursor: .cursor/skills/<skill>/SKILL.md`));
}

async function exportToClaude(skills: any[], projectDir: string, fs: any) {
    const claudeDir = fs.join(projectDir, '.claude', 'skills');
    await fs.mkdir(claudeDir, { recursive: true });
    for (const skill of skills) {
        const skillDir = fs.join(claudeDir, skill.metadata.name);
        await fs.mkdir(skillDir, { recursive: true });
        const content = `---\nname: ${skill.metadata.name}\ndescription: ${skill.metadata.description}\n---\n\n${skill.body}\n`;
        await fs.writeFile(fs.join(skillDir, 'SKILL.md'), content);
    }
    console.log(chalk.green(`  ✓ Claude Code: .claude/skills/<skill>/SKILL.md`));
}

async function exportToCodex(skills: any[], projectDir: string, fs: any) {
    const codexDir = fs.join(projectDir, '.codex', 'skills');
    await fs.mkdir(codexDir, { recursive: true });
    for (const skill of skills) {
        const skillDir = fs.join(codexDir, skill.metadata.name);
        await fs.mkdir(skillDir, { recursive: true });
        const content = `---\nname: ${skill.metadata.name}\ndescription: ${skill.metadata.description}\n---\n\n${skill.body}\n`;
        await fs.writeFile(fs.join(skillDir, 'SKILL.md'), content);
    }
    console.log(chalk.green(`  ✓ OpenAI Codex: .codex/skills/<skill>/SKILL.md`));
}

async function exportToAntigravity(skills: any[], projectDir: string, fs: any) {
    const skillsDir = fs.join(projectDir, '.agent', 'skills');
    await fs.mkdir(skillsDir, { recursive: true });
    for (const skill of skills) {
        const skillDir = fs.join(skillsDir, skill.metadata.name);
        await fs.mkdir(skillDir, { recursive: true });
        const content = `---\nname: ${skill.metadata.name}\ndescription: ${skill.metadata.description}\n---\n\n${skill.body}\n`;
        await fs.writeFile(fs.join(skillDir, 'SKILL.md'), content);
    }
    console.log(chalk.green(`  ✓ Antigravity: .agent/skills/<skill>/SKILL.md`));
}

export function registerInteractiveCommands(program: Command) {
    // Install wizard
    program
        .command('install-wizard')
        .alias('iw')
        .description('Interactive skill installation wizard (legacy)')
        .action(async () => {
            try {
                const spinner = ora('Fetching skills from marketplaces...').start();
                const skills = await listMarketplaceSkills();
                spinner.stop();

                if (skills.length === 0) {
                    console.log(chalk.yellow('No skills found in marketplaces.'));
                    return;
                }

                const choices = skills.map(skill => ({
                    name: `${skill.name} - ${skill.description?.slice(0, 50) || 'No description'}...`,
                    value: skill.name,
                    short: skill.name
                }));

                const { selectedSkills } = await inquirer.prompt([{
                    type: 'checkbox',
                    name: 'selectedSkills',
                    message: 'Select skills to install (Space to select, Enter to confirm):',
                    choices,
                    pageSize: 15
                }]);

                if (selectedSkills.length === 0) {
                    console.log(chalk.yellow('No skills selected.'));
                    return;
                }

                for (const skillName of selectedSkills) {
                    const installSpinner = ora(`Installing ${skillName}...`).start();
                    try {
                        await installSkill(skillName);
                        installSpinner.succeed(`Installed: ${skillName}`);
                    } catch (err) {
                        installSpinner.fail(`Failed to install ${skillName}: ${err}`);
                    }
                }

                console.log(chalk.bold.green('\n✓ Installation complete!'));
                console.log(chalk.gray('Run "skills export" to export to your AI agent.'));
            } catch (error) {
                console.error(chalk.red('Error:'), error);
                process.exit(1);
            }
        });

    // Export interactive
    program
        .command('export-interactive')
        .alias('ei')
        .description('Interactive export with agent selection menu')
        .action(async () => {
            try {
                const skills = await discoverSkills();

                if (skills.length === 0) {
                    console.log(chalk.yellow('No skills found to export.'));
                    return;
                }

                const { agents } = await inquirer.prompt([{
                    type: 'checkbox',
                    name: 'agents',
                    message: 'Select target AI agents:',
                    choices: [
                        { name: 'GitHub Copilot  (.github/skills/<skill>/SKILL.md)', value: 'copilot', checked: true },
                        { name: 'Cursor          (.cursor/skills/<skill>/SKILL.md)', value: 'cursor', checked: true },
                        { name: 'Claude Code     (.claude/skills/<skill>/SKILL.md)', value: 'claude', checked: true },
                        { name: 'OpenAI Codex    (.codex/skills/<skill>/SKILL.md)', value: 'codex', checked: true },
                        { name: 'Antigravity     (.agent/skills/<skill>/SKILL.md)', value: 'antigravity', checked: true }
                    ]
                }]);

                if (agents.length === 0) {
                    console.log(chalk.yellow('No agents selected.'));
                    return;
                }

                const { mkdir, writeFile, appendFile } = await import('fs/promises');
                const { join } = await import('path');
                const { existsSync } = await import('fs');

                console.log(chalk.bold(`\nExporting ${skills.length} skill(s) to: ${agents.join(', ')}\n`));

                for (const target of agents) {
                    const spinner = ora(`Exporting to ${target}...`).start();
                    await exportToAgent(target, skills, '.', { mkdir, writeFile, appendFile, join, existsSync });
                    spinner.succeed();
                }

                console.log(chalk.bold.green('\n✓ Export complete!'));
            } catch (error) {
                console.error(chalk.red('Error:'), error);
                process.exit(1);
            }
        });

    // Setup wizard
    program
        .command('setup')
        .description('Interactive setup wizard - install skills and export to your agents')
        .action(async () => {
            console.log(chalk.bold.cyan('\n🚀 Agent Skills Setup Wizard\n'));

            const { action } = await inquirer.prompt([{
                type: 'list',
                name: 'action',
                message: 'What would you like to do?',
                choices: [
                    { name: '📦 Install skills from marketplace', value: 'install' },
                    { name: '📤 Export installed skills to AI agents', value: 'export' },
                    { name: '🔄 Both - Install and export', value: 'both' }
                ]
            }]);

            if (action === 'install' || action === 'both') {
                const spinner = ora('Fetching skills from marketplaces...').start();
                const skills = await listMarketplaceSkills();
                spinner.stop();

                if (skills.length > 0) {
                    const choices = skills.slice(0, 20).map(skill => ({
                        name: `${skill.name} - ${skill.description?.slice(0, 40) || ''}...`,
                        value: skill.name
                    }));

                    const { selectedSkills } = await inquirer.prompt([{
                        type: 'checkbox',
                        name: 'selectedSkills',
                        message: 'Select skills to install:',
                        choices,
                        pageSize: 10
                    }]);

                    for (const skillName of selectedSkills) {
                        const installSpinner = ora(`Installing ${skillName}...`).start();
                        try {
                            await installSkill(skillName);
                            installSpinner.succeed(`Installed: ${skillName}`);
                        } catch (err) {
                            installSpinner.fail(`Failed: ${skillName}`);
                        }
                    }
                }
            }

            if (action === 'export' || action === 'both') {
                const { agents } = await inquirer.prompt([{
                    type: 'checkbox',
                    name: 'agents',
                    message: 'Which AI agents do you use?',
                    choices: [
                        { name: 'Cursor', value: 'cursor', checked: true },
                        { name: 'Claude Code', value: 'claude', checked: true },
                        { name: 'GitHub Copilot', value: 'copilot', checked: true },
                        { name: 'OpenAI Codex', value: 'codex', checked: false }
                    ]
                }]);

                const skills = await discoverSkills();
                const { mkdir, writeFile, appendFile } = await import('fs/promises');
                const { join } = await import('path');
                const { existsSync } = await import('fs');

                for (const target of agents) {
                    const spinner = ora(`Exporting to ${target}...`).start();
                    await exportToAgent(target, skills, '.', { mkdir, writeFile, appendFile, join, existsSync });
                    spinner.succeed();
                }
            }

            console.log(chalk.bold.green('\n✨ Setup complete!'));
            console.log(chalk.gray('Your skills are now ready to use in your AI agents.\n'));
        });

    // Run command
    program
        .command('run <skill-name> <script>')
        .description('Execute a script from an installed skill')
        .option('-a, --args <args...>', 'Arguments to pass to the script')
        .option('--timeout <ms>', 'Timeout in milliseconds', '30000')
        .action(async (skillName, script, options) => {
            try {
                const { executeScript, listScripts } = await import('../../core/executor.js');
                const { homedir } = await import('os');
                const { join } = await import('path');
                const { existsSync } = await import('fs');

                const skillsDir = join(homedir(), '.antigravity', 'skills');
                const skillPath = join(skillsDir, skillName);

                if (!existsSync(skillPath)) {
                    console.error(chalk.red(`Skill not found: ${skillName}`));
                    console.log(chalk.gray(`Expected at: ${skillPath}`));
                    console.log(chalk.gray('\nInstall with: skills install <skill-name>'));
                    process.exit(1);
                }

                const scripts = await listScripts(skillPath);
                if (scripts.length === 0) {
                    console.log(chalk.yellow(`No scripts found in ${skillName}`));
                    console.log(chalk.gray('Skills can have scripts in the scripts/ directory.'));
                    return;
                }

                if (!scripts.includes(script)) {
                    console.log(chalk.red(`Script not found: ${script}`));
                    console.log(chalk.cyan('\nAvailable scripts:'));
                    scripts.forEach(s => console.log(chalk.gray(`  - ${s}`)));
                    return;
                }

                const spinner = ora(`Running ${script}...`).start();

                const result = await executeScript(
                    skillPath,
                    script,
                    options.args || [],
                    { timeout: parseInt(options.timeout) }
                );

                if (result.success) {
                    spinner.succeed(`Completed in ${result.executionTime}ms`);
                    if (result.stdout) {
                        console.log(chalk.gray('\nOutput:'));
                        console.log(result.stdout);
                    }
                } else {
                    spinner.fail(`Failed (exit code: ${result.exitCode})`);
                    if (result.stderr) {
                        console.error(chalk.red(result.stderr));
                    }
                    process.exit(1);
                }
            } catch (error) {
                console.error(chalk.red('Error running script:'), error);
                process.exit(1);
            }
        });

    // Context command
    program
        .command('context')
        .description('Generate system prompt context for AI agents')
        .option('-f, --format <format>', 'Output format: xml, json, markdown', 'xml')
        .option('-s, --skills <skills...>', 'Specific skills to include (default: all installed)')
        .option('-o, --output <file>', 'Write to file instead of stdout')
        .action(async (options) => {
            try {
                const allSkills = await discoverSkills();

                let skills = allSkills;
                if (options.skills && options.skills.length > 0) {
                    skills = allSkills.filter(s =>
                        options.skills.some((name: string) =>
                            s.name.toLowerCase().includes(name.toLowerCase())
                        )
                    );
                }

                if (skills.length === 0) {
                    console.error(chalk.yellow('No skills found.'));
                    console.log(chalk.gray('Install skills with: skills install <name>'));
                    return;
                }

                let output = '';

                if (options.format === 'xml') {
                    const result = generateSkillsPromptXML(skills);
                    output = result.xml;
                    if (!options.output) {
                        console.log(chalk.gray(`\n# ${result.skillCount} skills, ~${result.estimatedTokens} tokens\n`));
                    }
                } else if (options.format === 'json') {
                    output = JSON.stringify({
                        skills: skills.map(s => ({
                            name: s.name,
                            description: s.description,
                            path: s.path
                        })),
                        count: skills.length
                    }, null, 2);
                } else if (options.format === 'markdown') {
                    output = generateFullSkillsContext(skills);
                }

                if (options.output) {
                    const { writeFile } = await import('fs/promises');
                    await writeFile(options.output, output);
                    console.log(chalk.green(`✓ Written to ${options.output}`));
                } else {
                    console.log(output);
                }
            } catch (error) {
                console.error(chalk.red('Error generating context:'), error);
                process.exit(1);
            }
        });

    // Preview command
    program
        .command('preview <skill-name>')
        .description('Open skill detail page in browser')
        .option('--url-only', 'Just print the URL without opening')
        .action(async (skillName, options) => {
            try {
                const clean = skillName.replace(/^@/, '');
                const url = `https://www.agentskills.in/marketplace/@${clean}`;

                if (options.urlOnly) {
                    console.log(url);
                } else {
                    const { execFileAsync } = await import('../../core/safe-exec.js');
                    // No shell: `start` would go through cmd.exe, which interprets & in URLs.
                    const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] :
                        process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]];

                    await execFileAsync(cmd as string, args as string[]);
                    console.log(chalk.green(`✓ Opened: ${url}`));
                }
            } catch (error) {
                console.error(chalk.red('Error opening preview:'), error);
                process.exit(1);
            }
        });

    // Scripts command
    program
        .command('scripts <skill-name>')
        .description('List available scripts in an installed skill')
        .action(async (skillName) => {
            try {
                const { listScripts, isScriptSafe } = await import('../../core/executor.js');
                const { homedir } = await import('os');
                const { join } = await import('path');
                const { existsSync } = await import('fs');
                const { readFile } = await import('fs/promises');

                const skillsDir = join(homedir(), '.antigravity', 'skills');
                const skillPath = join(skillsDir, skillName);

                if (!existsSync(skillPath)) {
                    console.error(chalk.red(`Skill not found: ${skillName}`));
                    return;
                }

                const scripts = await listScripts(skillPath);

                if (scripts.length === 0) {
                    console.log(chalk.yellow('No scripts found in this skill.'));
                    return;
                }

                console.log(chalk.bold(`\n📜 Scripts in ${skillName}:\n`));

                for (const script of scripts) {
                    const scriptPath = join(skillPath, 'scripts', script);
                    try {
                        const content = await readFile(scriptPath, 'utf-8');
                        const safety = isScriptSafe(content);
                        const safetyIcon = safety.safe ? chalk.green('✓') : chalk.yellow('⚠');

                        console.log(`  ${safetyIcon} ${chalk.cyan(script)}`);
                        if (!safety.safe) {
                            safety.warnings.forEach(w =>
                                console.log(chalk.gray(`      Warning: ${w}`))
                            );
                        }
                    } catch {
                        console.log(`  ${chalk.gray('?')} ${script}`);
                    }
                }

                console.log(chalk.gray(`\nRun with: skills run ${skillName} <script>\n`));
            } catch (error) {
                console.error(chalk.red('Error listing scripts:'), error);
                process.exit(1);
            }
        });

    // Completion command
    program
        .command('completion <shell>')
        .description('Generate shell completion script (bash, zsh, fish)')
        .action((shell) => {
            const commands = [
                'list', 'validate', 'show', 'prompt', 'init', 'assets',
                'install', 'uninstall', 'search', 'run', 'context',
                'preview', 'scripts', 'market-list', 'market-search',
                'market-install', 'market-uninstall', 'market-installed',
                'market-sources', 'setup', 'completion'
            ];

            if (shell === 'bash') {
                console.log(`# Bash completion for skills CLI
# Add to ~/.bashrc: eval "$(skills completion bash)"

_skills_completions() {
    local cur="\${COMP_WORDS[COMP_CWORD]}"
    local commands="${commands.join(' ')}"
    
    if [ \${COMP_CWORD} -eq 1 ]; then
        COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
    fi
}

complete -F _skills_completions skills`);
            } else if (shell === 'zsh') {
                console.log(`# Zsh completion for skills CLI
# Add to ~/.zshrc: eval "$(skills completion zsh)"

_skills() {
    local commands=(
        ${commands.map(c => `'${c}:${c} command'`).join('\n        ')}
    )
    
    _arguments '1: :->command' && return
    
    case $state in
        command)
            _describe 'command' commands
            ;;
    esac
}

compdef _skills skills`);
            } else if (shell === 'fish') {
                console.log(`# Fish completion for skills CLI
# Save to ~/.config/fish/completions/skills.fish

${commands.map(c => `complete -c skills -f -n "__fish_use_subcommand" -a "${c}" -d "${c} command"`).join('\n')}`);
            } else {
                console.error(chalk.red(`Unknown shell: ${shell}`));
                console.log(chalk.gray('Supported: bash, zsh, fish'));
                process.exit(1);
            }
        });

    // Info command
    program
        .command('info')
        .description('Show skills installation status and paths')
        .action(async () => {
            try {
                const { homedir } = await import('os');
                const { join } = await import('path');
                const { existsSync } = await import('fs');
                const { readdir } = await import('fs/promises');

                console.log(chalk.bold('\n📦 Skills CLI Info\n'));

                const paths = [
                    { name: 'Global skills', path: join(homedir(), '.antigravity', 'skills') },
                    { name: 'Project skills', path: join(process.cwd(), '.antigravity', 'skills') },
                    { name: 'Legacy skills', path: join(process.cwd(), 'skills') },
                    { name: 'Config', path: join(homedir(), '.antigravity', 'marketplace.json') }
                ];

                console.log(chalk.cyan('📁 Paths:'));
                for (const { name, path } of paths) {
                    const exists = existsSync(path);
                    const icon = exists ? chalk.green('✓') : chalk.gray('○');
                    console.log(`  ${icon} ${name}: ${chalk.gray(path)}`);
                }

                const skillsDir = join(homedir(), '.antigravity', 'skills');
                let skillCount = 0;
                if (existsSync(skillsDir)) {
                    const entries = await readdir(skillsDir, { withFileTypes: true });
                    skillCount = entries.filter(e => e.isDirectory()).length;
                }

                console.log(chalk.cyan('\n📊 Stats:'));
                console.log(`  Installed skills: ${chalk.bold(skillCount.toString())}`);
                console.log(`  Platform: ${chalk.gray(process.platform)}`);
                console.log(`  Node: ${chalk.gray(process.version)}`);

                console.log(chalk.cyan('\n🤖 Agent Directories:'));
                const agentDirs = [
                    { name: 'Cursor', path: '.cursor/skills' },
                    { name: 'Claude', path: '.claude/skills' },
                    { name: 'Copilot', path: '.github/skills' },
                    { name: 'Codex', path: '.codex/skills' },
                    { name: 'Antigravity', path: '.agent/skills' }
                ];

                for (const { name, path } of agentDirs) {
                    const fullPath = join(process.cwd(), path);
                    const exists = existsSync(fullPath);
                    const icon = exists ? chalk.green('✓') : chalk.gray('○');
                    console.log(`  ${icon} ${name}: ${chalk.gray(path)}`);
                }

                console.log('');
            } catch (error) {
                console.error(chalk.red('Error:'), error);
                process.exit(1);
            }
        });
}
