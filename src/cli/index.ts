#!/usr/bin/env node
/**
 * Agent Skills CLI
 * Universal CLI for managing Agent Skills across Cursor, Claude Code, GitHub Copilot, OpenAI Codex
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import {
    discoverSkills,
    loadSkill,
    validateMetadata,
    validateBody,
    formatValidationResult,
    generateSkillsPromptXML,
    generateFullSkillsContext,
    listSkillResources,
    listMarketplaceSkills,
    installSkill,
    uninstallSkill,
    searchSkills,
    getInstalledSkills,
    listMarketplaces,
    addMarketplace,
    checkUpdates,
    fetchSkillsMP,
    installFromGitHubUrl
} from '../core/index.js';

const program = new Command();

// Main flow when running `skills` - go straight to install
async function showMainMenu() {
    console.log(chalk.bold.cyan('\n🚀 Agent Skills CLI\n'));

    // Step 1: Select target agents
    const { agents } = await inquirer.prompt([
        {
            type: 'checkbox',
            name: 'agents',
            message: 'Select AI agents to install skills for:',
            choices: [
                { name: 'Cursor', value: 'cursor', checked: true },
                { name: 'Claude Code', value: 'claude', checked: true },
                { name: 'GitHub Copilot', value: 'copilot', checked: true },
                { name: 'OpenAI Codex', value: 'codex', checked: false },
                { name: 'Antigravity', value: 'antigravity', checked: true }
            ]
        }
    ]);

    if (agents.length === 0) {
        console.log(chalk.yellow('\nNo agents selected. Exiting.\n'));
        return;
    }

    // Step 2: Fetch skills from SkillsMP (40k+ skills, instant)
    const spinner = ora('Fetching skills from SkillsMP...').start();
    let marketplaceSkills: any[] = [];
    let total = 0;

    try {
        const result = await fetchSkillsMP({ limit: 100, sortBy: 'stars' });
        marketplaceSkills = result.skills;
        total = result.total;
        spinner.succeed(`Found ${total.toLocaleString()} skills (showing top 100 by stars)`);
    } catch (err) {
        spinner.fail('SkillsMP unavailable, falling back to GitHub...');
        marketplaceSkills = await listMarketplaceSkills();
    }

    if (marketplaceSkills.length === 0) {
        console.log(chalk.yellow('No skills found.'));
        return;
    }

    // Step 3: Select skills to install
    const choices = marketplaceSkills.map((skill: any) => ({
        name: `${skill.name} ${skill.stars ? `(⭐${skill.stars.toLocaleString()})` : ''} - ${skill.description?.slice(0, 40) || ''}...`,
        value: { name: skill.name, githubUrl: skill.githubUrl || '' },
        short: skill.name
    }));

    const { selectedSkills } = await inquirer.prompt([
        {
            type: 'checkbox',
            name: 'selectedSkills',
            message: 'Select skills to install (Space to select, Enter to confirm):',
            choices,
            pageSize: 20,
            loop: false
        }
    ]);

    if (selectedSkills.length === 0) {
        console.log(chalk.yellow('\nNo skills selected. Exiting.\n'));
        return;
    }

    // Step 4: Install skills from GitHub URLs
    console.log('');
    const homedir = (await import('os')).homedir();
    const skillsDir = `${homedir}/.antigravity/skills`;

    for (const skill of selectedSkills) {
        const installSpinner = ora(`Installing ${skill.name}...`).start();
        try {
            if (skill.githubUrl) {
                // Install directly from GitHub URL (SkillsMP skills)
                await installFromGitHubUrl(skill.githubUrl, skillsDir);
                installSpinner.succeed(`Installed: ${skill.name}`);
            } else {
                // Fallback to marketplace install
                await installSkill(skill.name);
                installSpinner.succeed(`Installed: ${skill.name}`);
            }
        } catch (err: any) {
            installSpinner.fail(`Failed: ${skill.name} - ${err.message || err}`);
        }
    }

    // Step 5: Export to selected agents
    console.log('');
    const allSkills = await discoverSkills();
    const { mkdir, writeFile, appendFile } = await import('fs/promises');
    const { join } = await import('path');
    const { existsSync } = await import('fs');
    const fs = { mkdir, writeFile, appendFile, join, existsSync };

    for (const agent of agents) {
        const exportSpinner = ora(`Exporting to ${agent}...`).start();
        await exportToAgent(agent, allSkills, '.', fs);
        exportSpinner.succeed(`Exported to ${agent}`);
    }

    console.log(chalk.bold.green('\n✨ Done! Skills installed and ready to use.\n'));
}

async function interactiveInstall() {
    // Step 1: Select target agent(s)
    const { agents } = await inquirer.prompt([
        {
            type: 'checkbox',
            name: 'agents',
            message: 'Which AI agents will you use these skills with?',
            choices: [
                { name: 'Cursor', value: 'cursor', checked: true },
                { name: 'Claude Code', value: 'claude', checked: true },
                { name: 'GitHub Copilot', value: 'copilot', checked: true },
                { name: 'OpenAI Codex', value: 'codex', checked: false }
            ]
        }
    ]);

    if (agents.length === 0) {
        console.log(chalk.yellow('No agents selected.'));
        return;
    }

    // Step 2: Fetch and select skills
    const spinner = ora('Fetching skills from marketplace...').start();
    const skills = await listMarketplaceSkills();
    spinner.stop();

    if (skills.length === 0) {
        console.log(chalk.yellow('No skills found.'));
        return;
    }

    const choices = skills.map(skill => ({
        name: `${skill.name} - ${skill.description?.slice(0, 45) || 'No description'}...`,
        value: skill.name,
        short: skill.name
    }));

    const { selectedSkills } = await inquirer.prompt([
        {
            type: 'checkbox',
            name: 'selectedSkills',
            message: 'Select skills to install (Space to select):',
            choices,
            pageSize: 12
        }
    ]);

    if (selectedSkills.length === 0) {
        console.log(chalk.yellow('No skills selected.'));
        return;
    }

    // Step 3: Install skills
    console.log('');
    for (const skillName of selectedSkills) {
        const installSpinner = ora(`Installing ${skillName}...`).start();
        try {
            await installSkill(skillName);
            installSpinner.succeed(`Installed: ${skillName}`);
        } catch (err) {
            installSpinner.fail(`Failed: ${skillName}`);
        }
    }

    // Step 4: Export to selected agents
    console.log('');
    const exportSpinner = ora('Exporting to selected agents...').start();

    const allSkills = await discoverSkills();
    const { mkdir, writeFile, appendFile } = await import('fs/promises');
    const { join } = await import('path');
    const { existsSync } = await import('fs');
    const fs = { mkdir, writeFile, appendFile, join, existsSync };

    exportSpinner.stop();

    for (const agent of agents) {
        const agentSpinner = ora(`Exporting to ${agent}...`).start();
        await exportToAgent(agent, allSkills, '.', fs);
        agentSpinner.succeed(`Exported to ${agent}`);
    }

    console.log(chalk.bold.green('\n✨ Done! Skills installed and exported.\n'));
}

async function interactiveExport() {
    const skills = await discoverSkills();

    if (skills.length === 0) {
        console.log(chalk.yellow('No skills found to export.'));
        return;
    }

    const { agents } = await inquirer.prompt([
        {
            type: 'checkbox',
            name: 'agents',
            message: 'Select target AI agents:',
            choices: [
                { name: 'Cursor          (.cursor/skills/)', value: 'cursor', checked: true },
                { name: 'Claude Code     (.claude/skills/)', value: 'claude', checked: true },
                { name: 'GitHub Copilot  (.github/skills/)', value: 'copilot', checked: true },
                { name: 'OpenAI Codex    (.codex/skills/)', value: 'codex', checked: false }
            ]
        }
    ]);

    if (agents.length === 0) {
        console.log(chalk.yellow('No agents selected.'));
        return;
    }

    const { mkdir, writeFile, appendFile } = await import('fs/promises');
    const { join } = await import('path');
    const { existsSync } = await import('fs');
    const fs = { mkdir, writeFile, appendFile, join, existsSync };

    console.log('');
    for (const agent of agents) {
        const spinner = ora(`Exporting to ${agent}...`).start();
        await exportToAgent(agent, skills, '.', fs);
        spinner.succeed();
    }

    console.log(chalk.bold.green('\n✓ Export complete!\n'));
}

program
    .name('skills')
    .description('Agent Skills CLI - Manage skills for Cursor, Claude Code, GitHub Copilot, OpenAI Codex')
    .version('1.0.0')
    .action(showMainMenu);

// List command
program
    .command('list')
    .description('List all discovered skills')
    .option('-p, --paths <paths...>', 'Custom search paths')
    .option('-v, --verbose', 'Show detailed information')
    .action(async (options) => {
        try {
            const config = options.paths ? { searchPaths: options.paths } : {};
            const skills = await discoverSkills(config);

            if (skills.length === 0) {
                console.log(chalk.yellow('No skills found.'));
                console.log(chalk.gray('Skills are searched in:'));
                console.log(chalk.gray('  - ~/.antigravity/skills/'));
                console.log(chalk.gray('  - .antigravity/skills/'));
                console.log(chalk.gray('  - ./skills/'));
                return;
            }

            console.log(chalk.bold(`\nFound ${skills.length} skill(s):\n`));

            for (const skill of skills) {
                console.log(chalk.cyan(`  ${skill.name}`));
                if (options.verbose) {
                    console.log(chalk.gray(`    ${skill.description}`));
                    console.log(chalk.gray(`    Path: ${skill.path}`));
                }
            }
            console.log('');
        } catch (error) {
            console.error(chalk.red('Error listing skills:'), error);
            process.exit(1);
        }
    });

// Validate command
program
    .command('validate <path>')
    .description('Validate a skill against the Agent Skills specification')
    .action(async (path) => {
        try {
            const skill = await loadSkill(path);

            if (!skill) {
                console.error(chalk.red(`Skill not found at: ${path}`));
                process.exit(1);
            }

            console.log(chalk.bold(`\nValidating: ${skill.metadata.name}\n`));

            // Validate metadata
            const metadataResult = validateMetadata(skill.metadata);
            console.log(chalk.underline('Metadata:'));
            console.log(formatValidationResult(metadataResult));

            // Validate body
            const bodyResult = validateBody(skill.body);
            console.log(chalk.underline('\nBody Content:'));
            console.log(formatValidationResult(bodyResult));

            // Overall result
            const isValid = metadataResult.valid && bodyResult.valid;
            console.log('\n' + '─'.repeat(40));
            if (isValid) {
                console.log(chalk.green.bold('✓ Skill is valid'));
            } else {
                console.log(chalk.red.bold('✗ Skill has validation errors'));
                process.exit(1);
            }
        } catch (error) {
            console.error(chalk.red('Error validating skill:'), error);
            process.exit(1);
        }
    });

// Show command
program
    .command('show <name>')
    .description('Show detailed information about a skill')
    .action(async (name) => {
        try {
            const skills = await discoverSkills();
            const skillRef = skills.find(s => s.name === name);

            if (!skillRef) {
                console.error(chalk.red(`Skill not found: ${name}`));
                console.log(chalk.gray('Available skills:'), skills.map(s => s.name).join(', ') || 'none');
                process.exit(1);
            }

            const skill = await loadSkill(skillRef.path);
            if (!skill) {
                console.error(chalk.red(`Could not load skill: ${name}`));
                process.exit(1);
            }

            console.log(chalk.bold(`\n${skill.metadata.name}`));
            console.log('─'.repeat(40));
            console.log(chalk.cyan('Description:'), skill.metadata.description);
            console.log(chalk.cyan('Path:'), skill.path);

            if (skill.metadata.license) {
                console.log(chalk.cyan('License:'), skill.metadata.license);
            }

            if (skill.metadata.compatibility) {
                console.log(chalk.cyan('Compatibility:'), skill.metadata.compatibility);
            }

            // List resources
            const resources = await listSkillResources(skill.path);
            if (resources.scripts.length > 0) {
                console.log(chalk.cyan('\nScripts:'));
                resources.scripts.forEach(s => console.log(chalk.gray(`  - ${s}`)));
            }
            if (resources.references.length > 0) {
                console.log(chalk.cyan('\nReferences:'));
                resources.references.forEach(r => console.log(chalk.gray(`  - ${r}`)));
            }
            if (resources.assets.length > 0) {
                console.log(chalk.cyan('\nAssets:'));
                resources.assets.forEach(a => console.log(chalk.gray(`  - ${a}`)));
            }

            // Body preview
            const bodyLines = skill.body.split('\n').slice(0, 10);
            console.log(chalk.cyan('\nInstructions (preview):'));
            console.log(chalk.gray(bodyLines.join('\n')));
            if (skill.body.split('\n').length > 10) {
                console.log(chalk.gray('...'));
            }
            console.log('');
        } catch (error) {
            console.error(chalk.red('Error showing skill:'), error);
            process.exit(1);
        }
    });

// Prompt command - generate system prompt XML
program
    .command('prompt')
    .description('Generate system prompt XML for discovered skills')
    .option('-f, --full', 'Include full skill system instructions')
    .action(async (options) => {
        try {
            const skills = await discoverSkills();

            if (skills.length === 0) {
                console.log(chalk.yellow('No skills found.'));
                return;
            }

            if (options.full) {
                const context = generateFullSkillsContext(skills);
                console.log(context);
            } else {
                const { xml, skillCount, estimatedTokens } = generateSkillsPromptXML(skills);
                console.log(xml);
                console.log(chalk.gray(`\n# ${skillCount} skills, ~${estimatedTokens} tokens`));
            }
        } catch (error) {
            console.error(chalk.red('Error generating prompt:'), error);
            process.exit(1);
        }
    });

// Init command - create a new skill
program
    .command('init <name>')
    .description('Create a new skill from template')
    .option('-d, --directory <dir>', 'Directory to create skill in', './skills')
    .action(async (name, options) => {
        try {
            const { mkdir, writeFile } = await import('fs/promises');
            const { join } = await import('path');

            const skillDir = join(options.directory, name);

            // Create directories
            await mkdir(join(skillDir, 'scripts'), { recursive: true });
            await mkdir(join(skillDir, 'references'), { recursive: true });
            await mkdir(join(skillDir, 'assets'), { recursive: true });

            // Create SKILL.md
            const skillMd = `---
name: ${name}
description: Brief description of what this skill does and when to use it.
license: MIT
metadata:
  author: your-name
  version: "1.0"
---

# ${name.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}

## When to use this skill

Use this skill when the user needs to...

## Instructions

1. First step
2. Second step
3. Third step

## Examples

### Example 1

\`\`\`
Example input or command
\`\`\`

## Best practices

- Best practice 1
- Best practice 2
`;

            await writeFile(join(skillDir, 'SKILL.md'), skillMd);

            console.log(chalk.green(`✓ Created skill: ${name}`));
            console.log(chalk.gray(`  Path: ${skillDir}`));
            console.log(chalk.gray('\nNext steps:'));
            console.log(chalk.gray('  1. Edit SKILL.md with your instructions'));
            console.log(chalk.gray('  2. Add scripts to scripts/'));
            console.log(chalk.gray('  3. Run: skills validate ' + skillDir));
        } catch (error) {
            console.error(chalk.red('Error creating skill:'), error);
            process.exit(1);
        }
    });

// ============================================
// MARKETPLACE COMMANDS
// ============================================

// Market list - list skills from SkillsMP (40k+ skills)
program
    .command('market-list')
    .alias('ml')
    .description('List skills from SkillsMP marketplace (40k+ skills)')
    .option('-l, --limit <number>', 'Number of skills to show', '50')
    .option('-p, --page <number>', 'Page number', '1')
    .option('--legacy', 'Use legacy GitHub sources instead of SkillsMP')
    .action(async (options) => {
        try {
            if (options.legacy) {
                // Legacy mode: fetch from configured GitHub sources
                console.log(chalk.bold('\nFetching skills from GitHub sources...\n'));
                const skills = await listMarketplaceSkills();

                if (skills.length === 0) {
                    console.log(chalk.yellow('No skills found.'));
                    return;
                }

                const bySource = new Map<string, typeof skills>();
                for (const skill of skills) {
                    const sourceId = skill.source.id;
                    if (!bySource.has(sourceId)) {
                        bySource.set(sourceId, []);
                    }
                    bySource.get(sourceId)!.push(skill);
                }

                for (const [sourceId, sourceSkills] of bySource) {
                    const source = sourceSkills[0].source;
                    console.log(chalk.bold.cyan(`\n📦 ${source.name}`));
                    console.log(chalk.gray(`   ${source.owner}/${source.repo}`));
                    if (source.verified) {
                        console.log(chalk.green('   ✓ Verified'));
                    }
                    console.log('');

                    for (const skill of sourceSkills) {
                        console.log(chalk.white(`   ${skill.name}`));
                        if (skill.description) {
                            const desc = skill.description.length > 60
                                ? skill.description.slice(0, 60) + '...'
                                : skill.description;
                            console.log(chalk.gray(`     ${desc}`));
                        }
                    }
                }

                console.log(chalk.gray(`\nTotal: ${skills.length} skills from ${bySource.size} sources`));
            } else {
                // SkillsMP mode: fetch from API
                console.log(chalk.bold('\n🌐 SkillsMP Marketplace\n'));

                const limit = parseInt(options.limit) || 50;
                const page = parseInt(options.page) || 1;

                const result = await fetchSkillsMP({ limit, page, sortBy: 'stars' });

                console.log(chalk.gray(`Showing ${result.skills.length} of ${result.total.toLocaleString()} skills (page ${page})\n`));

                for (const skill of result.skills) {
                    const stars = (skill as any).stars ? chalk.yellow(`⭐${(skill as any).stars.toLocaleString()}`) : '';
                    console.log(chalk.white(`  ${skill.name} ${stars}`));
                    if (skill.description) {
                        const desc = skill.description.length > 55
                            ? skill.description.slice(0, 55) + '...'
                            : skill.description;
                        console.log(chalk.gray(`    ${desc}`));
                    }
                    console.log(chalk.dim(`    by ${skill.author || 'unknown'}`));
                }

                console.log(chalk.gray(`\nTotal: ${result.total.toLocaleString()} skills`));
                if (result.hasNext) {
                    console.log(chalk.gray(`Next page: skills market-list --page ${page + 1}`));
                }
            }

            console.log(chalk.gray('\nUse: skills (interactive) to install\n'));
        } catch (error) {
            console.error(chalk.red('Error:'), error);
            process.exit(1);
        }
    });

// Market search - search skills
program
    .command('market-search <query>')
    .alias('ms')
    .description('Search skills on SkillsMP (40k+ skills)')
    .option('-l, --limit <number>', 'Number of results', '20')
    .action(async (query, options) => {
        try {
            console.log(chalk.bold(`\n🔍 Searching SkillsMP for "${query}"...\n`));

            const limit = parseInt(options.limit) || 20;
            const result = await fetchSkillsMP({ search: query, limit, sortBy: 'stars' });

            if (result.skills.length === 0) {
                console.log(chalk.yellow(`No skills found matching "${query}"`));
                return;
            }

            console.log(chalk.gray(`Found ${result.total.toLocaleString()} skills (showing top ${result.skills.length}):\n`));

            for (const skill of result.skills) {
                const stars = (skill as any).stars ? chalk.yellow(`⭐${(skill as any).stars.toLocaleString()}`) : '';
                console.log(chalk.cyan(`  ${skill.name} ${stars}`));
                console.log(chalk.gray(`    ${skill.description?.slice(0, 70)}${(skill.description?.length || 0) > 70 ? '...' : ''}`));
                console.log(chalk.dim(`    by ${skill.author || 'unknown'}`));
                console.log('');
            }

            console.log(chalk.gray('Use: skills (interactive) to install\n'));
        } catch (error) {
            console.error(chalk.red('Error searching skills:'), error);
            process.exit(1);
        }
    });

// Install - Install a skill by name from SkillsMP
program
    .command('install <name>')
    .alias('i')
    .description('Install a skill by name from SkillsMP')
    .action(async (name) => {
        try {
            const homedir = (await import('os')).homedir();
            const skillsDir = `${homedir}/.antigravity/skills`;

            console.log(chalk.bold(`\n📦 Searching for "${name}" on SkillsMP...\n`));

            const result = await fetchSkillsMP({ search: name, limit: 20, sortBy: 'stars' });

            // Find exact name match first
            const exactMatch = result.skills.find(s => s.name.toLowerCase() === name.toLowerCase());
            const skill = exactMatch || result.skills[0];

            if (!skill) {
                console.log(chalk.yellow(`No skill found matching "${name}"`));
                console.log(chalk.gray('Try: skills market-search <query> to find skills\n'));
                return;
            }

            const githubUrl = (skill as any).githubUrl;
            if (!githubUrl) {
                console.log(chalk.red('Could not find GitHub URL for this skill'));
                return;
            }

            console.log(chalk.gray(`Found: ${skill.name} by ${skill.author}`));
            console.log(chalk.gray(`Installing from: ${githubUrl}\n`));

            const installed = await installFromGitHubUrl(githubUrl, skillsDir);

            console.log(chalk.green(`✓ Successfully installed: ${installed.name}`));
            console.log(chalk.gray(`  Path: ${installed.path}`));
            console.log('');
        } catch (error: any) {
            console.error(chalk.red('Error installing skill:'), error.message || error);
            process.exit(1);
        }
    });

// Alias for backward compatibility
program
    .command('market-install <name>')
    .alias('mi')
    .description('Install a skill (alias for: skills install)')
    .action(async (name) => {
        console.log(chalk.gray('Tip: Use `skills install <id-or-name>` directly\n'));
        const { execSync } = await import('child_process');
        try {
            execSync(`"${process.argv[0]}" "${process.argv[1]}" install "${name}"`, { stdio: 'inherit' });
        } catch { }
    });

// Install from URL - install directly from GitHub or SkillsMP URL
program
    .command('install-url <url>')
    .alias('iu')
    .description('Install a skill from GitHub URL or SkillsMP page URL')
    .action(async (url) => {
        try {
            let githubUrl = url;

            // Convert SkillsMP URL to GitHub URL
            // Format: https://skillsmp.com/skills/<id>
            if (url.includes('skillsmp.com/skills/')) {
                console.log(chalk.bold(`\n📦 Fetching skill info from SkillsMP...`));

                // Extract skill ID from URL
                const skillId = url.split('/skills/').pop()?.replace(/\/$/, '');

                // Fetch skill details from API
                const response = await fetch(`https://skillsmp.com/api/skills/${skillId}`);
                if (!response.ok) {
                    throw new Error('Could not find skill on SkillsMP');
                }

                const data = await response.json() as { skill: { githubUrl: string; name: string; author: string } };
                githubUrl = data.skill.githubUrl;
                console.log(chalk.gray(`Found: ${data.skill.name} by ${data.skill.author}\n`));
            }

            // Validate GitHub URL
            if (!githubUrl.includes('github.com')) {
                console.log(chalk.red('Invalid URL. Please provide a GitHub URL or SkillsMP skill page URL.'));
                return;
            }

            console.log(chalk.gray(`Installing from: ${githubUrl}\n`));

            const homedir = (await import('os')).homedir();
            const skillsDir = `${homedir}/.antigravity/skills`;

            const installed = await installFromGitHubUrl(githubUrl, skillsDir);

            console.log(chalk.green(`✓ Successfully installed: ${installed.name}`));
            console.log(chalk.gray(`  Path: ${installed.path}`));
            console.log('');
        } catch (error: any) {
            console.error(chalk.red('Error installing skill:'), error.message || error);
            process.exit(1);
        }
    });

// Market uninstall - remove an installed skill
program
    .command('market-uninstall <name>')
    .alias('mu')
    .description('Uninstall a marketplace-installed skill')
    .action(async (name) => {
        try {
            await uninstallSkill(name);
            console.log(chalk.green(`✓ Uninstalled: ${name}`));
        } catch (error) {
            console.error(chalk.red('Error uninstalling skill:'), error);
            process.exit(1);
        }
    });

// Market installed - show installed marketplace skills
program
    .command('market-installed')
    .alias('mind')
    .description('List skills installed from marketplaces')
    .action(async () => {
        try {
            const installed = await getInstalledSkills();

            if (installed.length === 0) {
                console.log(chalk.yellow('\nNo marketplace skills installed.'));
                console.log(chalk.gray('Use: skills market-install <name> to install\n'));
                return;
            }

            console.log(chalk.bold(`\nInstalled marketplace skills:\n`));

            for (const skill of installed) {
                console.log(chalk.cyan(`  ${skill.name}`));
                console.log(chalk.gray(`    Path: ${skill.localPath}`));
                if (skill.source) {
                    console.log(chalk.gray(`    Source: ${skill.source.name}`));
                }
                if (skill.version) {
                    console.log(chalk.gray(`    Version: ${skill.version}`));
                }
                console.log(chalk.gray(`    Installed: ${skill.installedAt}`));
                console.log('');
            }
        } catch (error) {
            console.error(chalk.red('Error listing installed skills:'), error);
            process.exit(1);
        }
    });

// Market sources - list marketplace sources
program
    .command('market-sources')
    .description('List registered marketplace sources')
    .action(async () => {
        try {
            // Show SkillsMP as primary
            console.log(chalk.bold('\n🌐 Primary Marketplace:\n'));
            console.log(chalk.cyan(`  SkillsMP`) + chalk.green(' ✓'));
            console.log(chalk.gray(`    URL: https://skillsmp.com`));
            console.log(chalk.gray(`    Skills: 40,000+`));
            console.log(chalk.gray(`    The largest Agent Skills marketplace`));
            console.log('');

            // Show legacy sources
            const sources = await listMarketplaces();

            if (sources.length > 0) {
                console.log(chalk.bold('Legacy GitHub Sources:\n'));

                for (const source of sources) {
                    const verified = source.verified ? chalk.green(' ✓') : '';
                    console.log(chalk.cyan(`  ${source.name}${verified}`));
                    console.log(chalk.gray(`    ID: ${source.id}`));
                    console.log(chalk.gray(`    Repo: ${source.owner}/${source.repo}`));
                    if (source.description) {
                        console.log(chalk.gray(`    ${source.description}`));
                    }
                    console.log('');
                }
            }
        } catch (error) {
            console.error(chalk.red('Error listing sources:'), error);
            process.exit(1);
        }
    });

// Market add-source - add a new marketplace
program
    .command('market-add-source')
    .description('Add a custom marketplace source')
    .requiredOption('--id <id>', 'Unique identifier')
    .requiredOption('--name <name>', 'Display name')
    .requiredOption('--owner <owner>', 'GitHub owner')
    .requiredOption('--repo <repo>', 'GitHub repository')
    .option('--branch <branch>', 'Branch name', 'main')
    .option('--path <path>', 'Path to skills directory', 'skills')
    .action(async (options) => {
        try {
            await addMarketplace({
                id: options.id,
                name: options.name,
                owner: options.owner,
                repo: options.repo,
                branch: options.branch,
                skillsPath: options.path,
                verified: false
            });

            console.log(chalk.green(`✓ Added marketplace: ${options.name}`));
        } catch (error) {
            console.error(chalk.red('Error adding marketplace:'), error);
            process.exit(1);
        }
    });

// Market update-check - check for updates
program
    .command('market-update-check')
    .alias('muc')
    .description('Check for updates to installed skills')
    .action(async () => {
        try {
            console.log(chalk.bold('\nChecking for updates...\n'));

            const updates = await checkUpdates();

            if (updates.length === 0) {
                console.log(chalk.yellow('No installed marketplace skills to check.'));
                return;
            }

            const hasUpdates = updates.filter(u => u.hasUpdate);

            if (hasUpdates.length === 0) {
                console.log(chalk.green('All skills are up to date! ✓'));
            } else {
                console.log(chalk.yellow(`${hasUpdates.length} skill(s) have updates available:\n`));

                for (const update of hasUpdates) {
                    console.log(chalk.cyan(`  ${update.skill.name}`));
                    console.log(chalk.gray(`    Current: ${update.currentVersion || 'unknown'}`));
                    console.log(chalk.green(`    Latest:  ${update.latestVersion}`));
                    console.log('');
                }

                console.log(chalk.gray('To update, uninstall and reinstall the skill.'));
            }
        } catch (error) {
            console.error(chalk.red('Error checking updates:'), error);
            process.exit(1);
        }
    });

// ============================================
// WORKFLOW SYNC COMMAND
// ============================================

// Sync - copy skills to .agent/workflows for Antigravity auto-discovery
program
    .command('sync')
    .description('Sync skills to .agent/workflows/ for Antigravity auto-discovery')
    .option('-d, --directory <dir>', 'Target project directory', '.')
    .option('-a, --all', 'Sync all discovered skills')
    .option('-n, --name <name>', 'Sync a specific skill by name')
    .action(async (options) => {
        try {
            const { mkdir, writeFile, readFile, cp } = await import('fs/promises');
            const { join } = await import('path');
            const { existsSync } = await import('fs');

            const workflowsDir = join(options.directory, '.agent', 'workflows');
            await mkdir(workflowsDir, { recursive: true });

            const skills = await discoverSkills();

            if (skills.length === 0) {
                console.log(chalk.yellow('No skills found to sync.'));
                return;
            }

            // Filter skills if specific name provided
            const toSync = options.name
                ? skills.filter(s => s.name === options.name)
                : options.all
                    ? skills
                    : skills; // Default: sync all

            if (toSync.length === 0) {
                console.log(chalk.yellow(`Skill not found: ${options.name}`));
                return;
            }

            console.log(chalk.bold(`\nSyncing ${toSync.length} skill(s) to ${workflowsDir}...\n`));

            for (const skillRef of toSync) {
                try {
                    const skill = await loadSkill(skillRef.path);
                    if (!skill) continue;

                    // Create workflow file from skill
                    const workflowContent = `---
description: ${skill.metadata.description.slice(0, 100)}
---

${skill.body}
`;

                    const workflowPath = join(workflowsDir, `${skill.metadata.name}.md`);
                    await writeFile(workflowPath, workflowContent);

                    console.log(chalk.green(`  ✓ ${skill.metadata.name}`));
                    console.log(chalk.gray(`    → ${workflowPath}`));
                } catch (err) {
                    console.log(chalk.red(`  ✗ ${skillRef.name}: ${err}`));
                }
            }

            console.log(chalk.bold.green(`\n✓ Skills synced to .agent/workflows/`));
            console.log(chalk.gray(`\nNow you can use: "/${toSync.map(s => s.name).join('", "/')}"`));
            console.log(chalk.gray('Or just say: "Use the [skill-name] skill to..."'));
        } catch (error) {
            console.error(chalk.red('Error syncing skills:'), error);
            process.exit(1);
        }
    });

// ============================================
// MULTI-AGENT EXPORT COMMAND
// ============================================

type AgentTarget = 'copilot' | 'cursor' | 'claude' | 'codex' | 'antigravity' | 'all';

// Export - convert skills to different AI agent formats
program
    .command('export')
    .description('Export skills to different AI agent formats (Copilot, Cursor, Claude, Codex)')
    .option('-t, --target <agent>', 'Target agent: copilot, cursor, claude, codex, antigravity, all', 'all')
    .option('-d, --directory <dir>', 'Project directory', '.')
    .option('-n, --name <name>', 'Export specific skill only')
    .action(async (options) => {
        try {
            const { mkdir, writeFile, appendFile } = await import('fs/promises');
            const { join } = await import('path');
            const { existsSync } = await import('fs');

            const skills = await discoverSkills();
            const toExport = options.name
                ? skills.filter(s => s.name === options.name)
                : skills;

            if (toExport.length === 0) {
                console.log(chalk.yellow('No skills found to export.'));
                return;
            }

            const targets: AgentTarget[] = options.target === 'all'
                ? ['copilot', 'cursor', 'claude', 'codex', 'antigravity']
                : [options.target as AgentTarget];

            console.log(chalk.bold(`\nExporting ${toExport.length} skill(s) to: ${targets.join(', ')}\n`));

            for (const target of targets) {
                await exportToAgent(target, toExport, options.directory, { mkdir, writeFile, appendFile, join, existsSync });
            }

            console.log(chalk.bold.green('\n✓ Export complete!'));
            console.log(chalk.gray('\nGenerated files:'));
            if (targets.includes('copilot') || targets.includes('all')) {
                console.log(chalk.gray('  - .github/copilot-instructions.md'));
            }
            if (targets.includes('cursor') || targets.includes('all')) {
                console.log(chalk.gray('  - .cursor/rules/<skill>/RULE.md'));
            }
            if (targets.includes('claude') || targets.includes('all')) {
                console.log(chalk.gray('  - CLAUDE.md'));
            }
            if (targets.includes('codex') || targets.includes('all')) {
                console.log(chalk.gray('  - AGENTS.md'));
            }
            if (targets.includes('antigravity') || targets.includes('all')) {
                console.log(chalk.gray('  - .agent/workflows/<skill>.md'));
            }
        } catch (error) {
            console.error(chalk.red('Error exporting skills:'), error);
            process.exit(1);
        }
    });

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

    switch (target) {
        case 'copilot':
            await exportToCopilot(loadedSkills, projectDir, fs);
            break;
        case 'cursor':
            await exportToCursor(loadedSkills, projectDir, fs);
            break;
        case 'claude':
            await exportToClaude(loadedSkills, projectDir, fs);
            break;
        case 'codex':
            await exportToCodex(loadedSkills, projectDir, fs);
            break;
        case 'antigravity':
            await exportToAntigravity(loadedSkills, projectDir, fs);
            break;
    }
}

async function exportToCopilot(skills: any[], projectDir: string, fs: any) {
    // GitHub Copilot now uses Agent Skills standard: .github/skills/<name>/SKILL.md
    // Also supports .claude/skills/ for compatibility
    const copilotDir = fs.join(projectDir, '.github', 'skills');
    await fs.mkdir(copilotDir, { recursive: true });

    for (const skill of skills) {
        const skillDir = fs.join(copilotDir, skill.metadata.name);
        await fs.mkdir(skillDir, { recursive: true });

        // Create SKILL.md in Agent Skills format
        const content = `---
name: ${skill.metadata.name}
description: ${skill.metadata.description}
---

${skill.body}
`;
        await fs.writeFile(fs.join(skillDir, 'SKILL.md'), content);
    }
    console.log(chalk.green(`  ✓ GitHub Copilot: .github/skills/<skill>/SKILL.md`));
}

async function exportToCursor(skills: any[], projectDir: string, fs: any) {
    // Cursor now uses Agent Skills standard: .cursor/skills/<name>/SKILL.md
    const cursorDir = fs.join(projectDir, '.cursor', 'skills');
    await fs.mkdir(cursorDir, { recursive: true });

    for (const skill of skills) {
        const skillDir = fs.join(cursorDir, skill.metadata.name);
        await fs.mkdir(skillDir, { recursive: true });

        // Create SKILL.md in Agent Skills format
        const content = `---
name: ${skill.metadata.name}
description: ${skill.metadata.description}
---

${skill.body}
`;
        await fs.writeFile(fs.join(skillDir, 'SKILL.md'), content);
    }
    console.log(chalk.green(`  ✓ Cursor: .cursor/skills/<skill>/SKILL.md`));
}

async function exportToClaude(skills: any[], projectDir: string, fs: any) {
    // Claude Code now uses Agent Skills standard: .claude/skills/<name>/SKILL.md
    const claudeDir = fs.join(projectDir, '.claude', 'skills');
    await fs.mkdir(claudeDir, { recursive: true });

    for (const skill of skills) {
        const skillDir = fs.join(claudeDir, skill.metadata.name);
        await fs.mkdir(skillDir, { recursive: true });

        // Create SKILL.md in Agent Skills format
        const content = `---
name: ${skill.metadata.name}
description: ${skill.metadata.description}
---

${skill.body}
`;
        await fs.writeFile(fs.join(skillDir, 'SKILL.md'), content);
    }
    console.log(chalk.green(`  ✓ Claude Code: .claude/skills/<skill>/SKILL.md`));
}

async function exportToCodex(skills: any[], projectDir: string, fs: any) {
    // OpenAI Codex uses Agent Skills standard: .codex/skills/<name>/SKILL.md
    const codexDir = fs.join(projectDir, '.codex', 'skills');
    await fs.mkdir(codexDir, { recursive: true });

    for (const skill of skills) {
        const skillDir = fs.join(codexDir, skill.metadata.name);
        await fs.mkdir(skillDir, { recursive: true });

        // Create SKILL.md in Agent Skills format
        const content = `---
name: ${skill.metadata.name}
description: ${skill.metadata.description}
---

${skill.body}
`;
        await fs.writeFile(fs.join(skillDir, 'SKILL.md'), content);
    }
    console.log(chalk.green(`  ✓ OpenAI Codex: .codex/skills/<skill>/SKILL.md`));
}

async function exportToAntigravity(skills: any[], projectDir: string, fs: any) {
    const workflowsDir = fs.join(projectDir, '.agent', 'workflows');
    await fs.mkdir(workflowsDir, { recursive: true });

    for (const skill of skills) {
        const content = `---
description: ${skill.metadata.description.slice(0, 100)}
---

${skill.body}
`;
        await fs.writeFile(fs.join(workflowsDir, `${skill.metadata.name}.md`), content);
    }
    console.log(chalk.green(`  ✓ Antigravity: .agent/workflows/<skill>.md`));
}

// ============================================
// INTERACTIVE COMMANDS
// ============================================

// Interactive install wizard - select skills with arrow keys
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

            const { selectedSkills } = await inquirer.prompt([
                {
                    type: 'checkbox',
                    name: 'selectedSkills',
                    message: 'Select skills to install (Space to select, Enter to confirm):',
                    choices,
                    pageSize: 15
                }
            ]);

            if (selectedSkills.length === 0) {
                console.log(chalk.yellow('No skills selected.'));
                return;
            }

            for (const skillName of selectedSkills) {
                const installSpinner = ora(`Installing ${skillName}...`).start();
                try {
                    const result = await installSkill(skillName);
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

// Interactive export - select target agents
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

            const { agents } = await inquirer.prompt([
                {
                    type: 'checkbox',
                    name: 'agents',
                    message: 'Select target AI agents:',
                    choices: [
                        { name: 'GitHub Copilot  (.github/skills/)', value: 'copilot', checked: true },
                        { name: 'Cursor          (.cursor/skills/)', value: 'cursor', checked: true },
                        { name: 'Claude Code     (.claude/skills/)', value: 'claude', checked: true },
                        { name: 'OpenAI Codex    (.codex/skills/)', value: 'codex', checked: true },
                        { name: 'Antigravity     (.agent/workflows/)', value: 'antigravity', checked: false }
                    ]
                }
            ]);

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

// Quick setup wizard
program
    .command('setup')
    .description('Interactive setup wizard - install skills and export to your agents')
    .action(async () => {
        console.log(chalk.bold.cyan('\n🚀 Agent Skills Setup Wizard\n'));

        // Step 1: Choose what to do
        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'What would you like to do?',
                choices: [
                    { name: '📦 Install skills from marketplace', value: 'install' },
                    { name: '📤 Export installed skills to AI agents', value: 'export' },
                    { name: '🔄 Both - Install and export', value: 'both' }
                ]
            }
        ]);

        if (action === 'install' || action === 'both') {
            const spinner = ora('Fetching skills from marketplaces...').start();
            const skills = await listMarketplaceSkills();
            spinner.stop();

            if (skills.length > 0) {
                const choices = skills.slice(0, 20).map(skill => ({
                    name: `${skill.name} - ${skill.description?.slice(0, 40) || ''}...`,
                    value: skill.name
                }));

                const { selectedSkills } = await inquirer.prompt([
                    {
                        type: 'checkbox',
                        name: 'selectedSkills',
                        message: 'Select skills to install:',
                        choices,
                        pageSize: 10
                    }
                ]);

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
            const { agents } = await inquirer.prompt([
                {
                    type: 'checkbox',
                    name: 'agents',
                    message: 'Which AI agents do you use?',
                    choices: [
                        { name: 'Cursor', value: 'cursor', checked: true },
                        { name: 'Claude Code', value: 'claude', checked: true },
                        { name: 'GitHub Copilot', value: 'copilot', checked: true },
                        { name: 'OpenAI Codex', value: 'codex', checked: false }
                    ]
                }
            ]);

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

program.parse();

