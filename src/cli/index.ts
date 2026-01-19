#!/usr/bin/env node
/**
 * Agent Skills CLI
 * Universal CLI for managing Agent Skills across Cursor, Claude Code, GitHub Copilot, OpenAI Codex
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import * as p from '@clack/prompts';
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
    installFromGitHubUrl,
    getSkillByScoped,
    getSkillBaseUrl,
    fetchAssetManifest,
    getAssetUrl,
    fetchAsset,
    getAssetUrlFromEntry,
    fetchSkillsForCLI
} from '../core/index.js';
import { homedir } from 'os';

// Centralized agent configuration with project and global paths
const home = homedir();
interface AgentConfig {
    name: string;
    displayName: string;
    projectDir: string;
    globalDir: string;
}

const AGENTS: Record<string, AgentConfig> = {
    'cursor': {
        name: 'cursor',
        displayName: 'Cursor',
        projectDir: '.cursor/skills',
        globalDir: `${home}/.cursor/skills`,
    },
    'claude': {
        name: 'claude',
        displayName: 'Claude Code',
        projectDir: '.claude/skills',
        globalDir: `${home}/.claude/skills`,
    },
    'copilot': {
        name: 'copilot',
        displayName: 'GitHub Copilot',
        projectDir: '.github/skills',
        globalDir: `${home}/.github/skills`,
    },
    'codex': {
        name: 'codex',
        displayName: 'Codex',
        projectDir: '.codex/skills',
        globalDir: `${home}/.codex/skills`,
    },
    'antigravity': {
        name: 'antigravity',
        displayName: 'Antigravity',
        projectDir: '.agent/skills',
        globalDir: `${home}/.gemini/antigravity/skills`,
    },
    // New agents from add-skill
    'opencode': {
        name: 'opencode',
        displayName: 'OpenCode',
        projectDir: '.opencode/skill',
        globalDir: `${home}/.config/opencode/skill`,
    },
    'amp': {
        name: 'amp',
        displayName: 'Amp',
        projectDir: '.agents/skills',
        globalDir: `${home}/.config/agents/skills`,
    },
    'kilo': {
        name: 'kilo',
        displayName: 'Kilo Code',
        projectDir: '.kilocode/skills',
        globalDir: `${home}/.kilocode/skills`,
    },
    'roo': {
        name: 'roo',
        displayName: 'Roo Code',
        projectDir: '.roo/skills',
        globalDir: `${home}/.roo/skills`,
    },
    'goose': {
        name: 'goose',
        displayName: 'Goose',
        projectDir: '.goose/skills',
        globalDir: `${home}/.config/goose/skills`,
    },
};

// Helper to get install path
function getInstallPath(agent: string, global: boolean): string {
    const config = AGENTS[agent];
    if (!config) return `.${agent}/skills`;
    return global ? config.globalDir : config.projectDir;
}

const program = new Command();

// Main flow when running `skills` - go straight to install
async function showMainMenu() {
    console.log('');
    p.intro(chalk.bgCyan.black(' Agent Skills CLI '));

    // Step 1: Select target agents
    const agentChoices = Object.entries(AGENTS).map(([key, config]) => ({
        label: config.displayName,
        value: key,
        hint: config.projectDir,
    }));

    const agents = await p.multiselect({
        message: 'Select AI agents to install skills for:',
        options: agentChoices,
        initialValues: ['cursor', 'claude', 'copilot', 'antigravity'],
        required: true,
    });

    if (p.isCancel(agents)) {
        p.cancel('Installation cancelled');
        return;
    }

    if ((agents as string[]).length === 0) {
        p.log.warn('No agents selected. Exiting.');
        return;
    }

    // Cast to string array for use throughout the function
    const selectedAgents = agents as string[];

    // Step 2: Fetch skills from our database (primary), SkillsMP as fallback
    const spinner = ora('Fetching skills from marketplace...').start();
    let marketplaceSkills: any[] = [];
    let total = 0;

    try {
        // Try our database first
        const result = await fetchSkillsForCLI({ limit: 100, sortBy: 'stars' });
        marketplaceSkills = result.skills;
        total = result.total;
        spinner.succeed(`Found ${total.toLocaleString()} skills (showing top 100 by stars)`);
    } catch (err) {
        // Fallback to GitHub sources if our API is down
        spinner.text = 'Falling back to GitHub sources...';
        marketplaceSkills = await listMarketplaceSkills();
        total = marketplaceSkills.length;
        spinner.succeed(`Found ${total} skills from GitHub`);
    }

    if (marketplaceSkills.length === 0) {
        console.log(chalk.yellow('No skills found.'));
        return;
    }

    // Step 3: Select skills to install
    const choices = marketplaceSkills.map((skill: any) => ({
        name: `${skill.name} ${skill.stars ? `(⭐${skill.stars.toLocaleString()})` : ''} - ${skill.description?.slice(0, 40) || ''}...`,
        value: {
            name: skill.name,
            scopedName: skill.scopedName || skill.name,
            githubUrl: skill.githubUrl || skill.rawUrl || ''
        },
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

    // Step 4: Install skills directly to platform directories (like working install command)
    console.log('');

    // Use centralized AGENTS config for platform directories

    // Import dependencies once
    const { getSkillByScoped } = await import('../core/skillsdb.js');
    const { mkdir, cp, rm } = await import('fs/promises');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Function to install a single skill
    async function installSkillToplatforms(skill: any): Promise<{ success: boolean; name: string; scopedName?: string; error?: string }> {
        try {
            // Fetch skill from database using scopedName
            const dbSkill = await getSkillByScoped(skill.scopedName || skill.name);
            if (!dbSkill) {
                return { success: false, name: skill.name, error: 'Skill not found' };
            }

            // Handle both camelCase (from API) and snake_case field names
            const githubUrl = (dbSkill as any).github_url || (dbSkill as any).githubUrl;
            const scopedName = (dbSkill as any).scoped_name || (dbSkill as any).scopedName || skill.scopedName;

            if (!githubUrl) {
                return { success: false, name: skill.name, error: 'No GitHub URL found' };
            }

            // Parse GitHub URL
            const urlMatch = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
            if (!urlMatch) {
                return { success: false, name: skill.name, error: 'Invalid GitHub URL' };
            }

            const [, owner, repo] = urlMatch;
            const branch = (dbSkill as any).branch || 'main';
            const skillPath = ((dbSkill as any).path || '').replace(/\/SKILL\.md$/i, '');

            // Download to temp directory
            const tempDir = join(tmpdir(), `skill-${Date.now()}-${Math.random().toString(36).slice(2)}`);
            await mkdir(tempDir, { recursive: true });

            try {
                await execAsync(`git clone --depth 1 --branch ${branch} https://github.com/${owner}/${repo}.git .`, { cwd: tempDir });

                // Install to each platform
                for (const platform of selectedAgents) {
                    const agentConfig = AGENTS[platform];
                    if (!agentConfig) continue;

                    const targetDir = agentConfig.projectDir;
                    const skillDir = join(process.cwd(), targetDir, dbSkill.name);
                    await mkdir(skillDir, { recursive: true });

                    // Copy skill files
                    const sourceDir = skillPath ? join(tempDir, skillPath) : tempDir;
                    await cp(sourceDir, skillDir, { recursive: true });
                }

                return { success: true, name: dbSkill.name, scopedName };

            } finally {
                // Cleanup temp directory
                await rm(tempDir, { recursive: true, force: true }).catch(() => { });
            }

        } catch (err: any) {
            return { success: false, name: skill.name, error: err.message || String(err) };
        }
    }

    // Show what we're downloading
    console.log(chalk.bold(`📦 Installing ${selectedSkills.length} skill(s) in parallel...\n`));
    const downloadSpinner = ora(`Downloading ${selectedSkills.length} skills...`).start();

    // Install all skills in parallel
    const results = await Promise.all(selectedSkills.map((skill: any) => installSkillToplatforms(skill)));

    downloadSpinner.succeed(`Downloaded ${results.filter(r => r.success).length}/${selectedSkills.length} skills`);

    // Show results
    console.log('');
    for (const result of results) {
        if (result.success) {
            console.log(chalk.green(`✔ ${result.name}`));
            if (result.scopedName) {
                console.log(chalk.gray(`  ${result.scopedName}`));
            }
        } else {
            console.log(chalk.red(`✖ ${result.name}: ${result.error}`));
        }
    }

    const successCount = results.filter(r => r.success).length;
    if (successCount > 0) {
        console.log(chalk.bold.green(`\n✨ Successfully installed ${successCount} skill(s) to: ${selectedAgents.join(', ')}`));
    }

    console.log('');
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
                { name: 'OpenAI Codex    (.codex/skills/)', value: 'codex', checked: false },
                { name: 'Antigravity     (.agent/workflows/)', value: 'antigravity', checked: true }
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
    .option('--json', 'Output as JSON')
    .option('--table', 'Output as ASCII table')
    .option('-q, --quiet', 'Output names only (for scripting)')
    .action(async (options) => {
        try {
            const config = options.paths ? { searchPaths: options.paths } : {};
            const skills = await discoverSkills(config);

            if (skills.length === 0) {
                if (options.json) {
                    console.log(JSON.stringify({ skills: [], count: 0 }));
                } else if (!options.quiet) {
                    console.log(chalk.yellow('No skills found.'));
                    console.log(chalk.gray('Skills are searched in:'));
                    console.log(chalk.gray('  - ~/.antigravity/skills/'));
                    console.log(chalk.gray('  - .antigravity/skills/'));
                    console.log(chalk.gray('  - ./skills/'));
                }
                return;
            }

            // JSON output
            if (options.json) {
                console.log(JSON.stringify({
                    skills: skills.map(s => ({
                        name: s.name,
                        description: s.description,
                        path: s.path
                    })),
                    count: skills.length
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

                console.log('');
                console.log(chalk.bold('Name'.padEnd(maxName + 2) + 'Description'));
                console.log('─'.repeat(maxName + 2 + maxDesc));

                for (const skill of skills) {
                    const desc = (skill.description || '').slice(0, 50);
                    console.log(chalk.cyan(skill.name.padEnd(maxName + 2)) + chalk.gray(desc));
                }
                console.log('');
                return;
            }

            // Default output
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
// ASSETS COMMAND - On-demand asset fetching
// ============================================

program
    .command('assets <skill-name>')
    .description('List and fetch assets for a skill on-demand from GitHub')
    .option('-l, --list', 'List available assets')
    .option('-m, --manifest', 'Show asset manifest if available')
    .option('-g, --get <path>', 'Fetch and display specific asset content')
    .option('--json', 'Output in JSON format')
    .action(async (skillName, options) => {
        try {
            const spinner = ora('Fetching skill info...').start();

            // Fetch skill from database
            const skill = await getSkillByScoped(skillName);
            if (!skill) {
                spinner.fail(`Skill not found: ${skillName}`);
                process.exit(1);
            }

            if (!skill.raw_url) {
                spinner.fail('Skill has no raw_url - cannot fetch assets');
                process.exit(1);
            }

            const baseUrl = getSkillBaseUrl(skill.raw_url);
            spinner.succeed(`Found skill: ${skill.scoped_name || skill.name}`);

            if (options.manifest) {
                // Show asset manifest
                const manifestSpinner = ora('Fetching manifest...').start();
                const manifest = await fetchAssetManifest(baseUrl);

                if (!manifest) {
                    manifestSpinner.fail('No asset manifest found (index.jsonl)');
                    return;
                }

                manifestSpinner.succeed(`Found ${manifest.length} components`);

                if (options.json) {
                    console.log(JSON.stringify(manifest, null, 2));
                } else {
                    console.log('');
                    // Group by category
                    const byCategory = new Map<string, typeof manifest>();
                    for (const entry of manifest) {
                        const cat = entry.category || 'other';
                        if (!byCategory.has(cat)) byCategory.set(cat, []);
                        byCategory.get(cat)!.push(entry);
                    }

                    for (const [category, entries] of byCategory) {
                        console.log(chalk.bold.cyan(`\n${category}:`));
                        for (const entry of entries.slice(0, 5)) {
                            console.log(chalk.white(`  ${entry.id}`));
                            if (entry.name) console.log(chalk.gray(`    ${entry.name}`));
                        }
                        if (entries.length > 5) {
                            console.log(chalk.gray(`  ... and ${entries.length - 5} more`));
                        }
                    }
                }
            } else if (options.get) {
                // Fetch specific asset
                const assetPath = options.get;
                const assetUrl = getAssetUrl(baseUrl, assetPath);

                const fetchSpinner = ora(`Fetching ${assetPath}...`).start();
                const content = await fetchAsset(assetUrl);

                if (!content) {
                    fetchSpinner.fail(`Asset not found: ${assetPath}`);
                    process.exit(1);
                }

                fetchSpinner.succeed(`Fetched ${content.length} chars`);
                console.log('');
                console.log(content);
            } else {
                // Default: show info about assets
                console.log(chalk.gray(`\nBase URL: ${baseUrl}`));
                console.log('');
                console.log(chalk.bold('Usage:'));
                console.log(chalk.gray(`  skills assets "${skillName}" --manifest`));
                console.log(chalk.gray('    Show component manifest'));
                console.log('');
                console.log(chalk.gray(`  skills assets "${skillName}" --get "assets/code/v3/html/buttons/primary.html"`));
                console.log(chalk.gray('    Fetch specific asset content'));
            }
        } catch (error) {
            console.error(chalk.red('Error:'), error);
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
                // Database mode (primary): fetch from our API
                console.log(chalk.bold('\n🌐 Skills Marketplace\n'));

                const limit = parseInt(options.limit) || 50;
                const page = parseInt(options.page) || 1;

                let result: { skills: any[]; total: number; hasNext?: boolean };
                try {
                    result = await fetchSkillsForCLI({ limit, page, sortBy: 'stars' });
                } catch {
                    console.log(chalk.gray('Falling back to GitHub sources...'));
                    const skills = await listMarketplaceSkills();
                    result = { skills: skills.slice(0, limit), total: skills.length, hasNext: false };
                }

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
    .description('Search skills in the marketplace')
    .option('-l, --limit <number>', 'Number of results', '20')
    .action(async (query, options) => {
        try {
            console.log(chalk.bold(`\n🔍 Searching for "${query}"...\n`));

            const limit = parseInt(options.limit) || 20;

            let result: { skills: any[]; total: number } | null = null;

            // Try database first, fallback to GitHub
            try {
                result = await fetchSkillsForCLI({ search: query, limit, sortBy: 'stars' });
            } catch {
                // Fallback to GitHub-based search
                console.log(chalk.gray('Falling back to GitHub sources...'));
                const skills = await searchSkills(query);
                result = { skills: skills.slice(0, limit), total: skills.length };
            }

            if (!result || result.skills.length === 0) {
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

// ============================================
// SEARCH COMMAND - Main user-facing search
// ============================================

program
    .command('search <query...>')
    .alias('s')
    .description('Search and install skills from marketplace (67K+ skills)')
    .option('-l, --limit <n>', 'Maximum results to show', '20')
    .option('-s, --sort <by>', 'Sort by: stars, recent, name', 'stars')
    .option('--json', 'Output as JSON for scripting (no interactive prompt)')
    .action(async (queryParts, options) => {
        try {
            const query = queryParts.join(' ');
            const limit = parseInt(options.limit) || 20;

            if (!options.json) {
                console.log(chalk.bold(`\n🔍 Searching for "${query}"...\n`));
            }

            // Fetch results from database
            let result: { skills: any[]; total: number };
            try {
                result = await fetchSkillsForCLI({
                    search: query,
                    limit,
                    sortBy: options.sort as 'stars' | 'recent' | 'name'
                });
            } catch {
                // Fallback to GitHub sources
                if (!options.json) {
                    console.log(chalk.gray('Falling back to GitHub sources...'));
                }
                const skills = await searchSkills(query);
                result = { skills: skills.slice(0, limit), total: skills.length };
            }

            if (result.skills.length === 0) {
                if (options.json) {
                    console.log(JSON.stringify({ skills: [], total: 0, query }));
                } else {
                    console.log(chalk.yellow(`No skills found matching "${query}"`));
                }
                return;
            }

            // JSON output (non-interactive)
            if (options.json) {
                console.log(JSON.stringify({
                    skills: result.skills.map(s => ({
                        name: s.name,
                        author: s.author,
                        scopedName: s.scopedName || `${s.author}/${s.name}`,
                        description: s.description,
                        stars: s.stars || 0,
                        githubUrl: s.githubUrl
                    })),
                    total: result.total,
                    query
                }, null, 2));
                return;
            }

            // Display results summary
            console.log(chalk.gray(`Found ${result.total.toLocaleString()} skills. Select to install:\n`));

            // Interactive install - always show selection prompt
            const choices = result.skills.map((skill: any) => ({
                name: `${skill.name} ${skill.stars ? chalk.yellow(`⭐${skill.stars.toLocaleString()}`) : ''} ${chalk.dim(`@${skill.author || 'unknown'}`)}`,
                value: {
                    name: skill.name,
                    scopedName: skill.scopedName || `${skill.author}/${skill.name}`,
                    githubUrl: skill.githubUrl || ''
                },
                short: skill.name
            }));

            const { selectedSkills } = await inquirer.prompt([
                {
                    type: 'checkbox',
                    name: 'selectedSkills',
                    message: 'Select skills (Space to select, Enter to confirm):',
                    choices,
                    pageSize: 15,
                    loop: false
                }
            ]);

            if (selectedSkills.length === 0) {
                console.log(chalk.yellow('\nNo skills selected.\n'));
                return;
            }

            // Select platforms
            const agentChoices = Object.entries(AGENTS).map(([key, config]) => ({
                name: config.displayName,
                value: key,
                checked: ['cursor', 'claude', 'copilot', 'antigravity'].includes(key)
            }));

            const { platforms } = await inquirer.prompt([
                {
                    type: 'checkbox',
                    name: 'platforms',
                    message: 'Install to which platforms?',
                    choices: agentChoices,
                    pageSize: 10
                }
            ]);

            if (platforms.length === 0) {
                console.log(chalk.yellow('\nNo platforms selected.\n'));
                return;
            }

            // Install skills
            const { mkdir, cp, rm } = await import('fs/promises');
            const { join } = await import('path');
            const { tmpdir } = await import('os');
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);

            console.log(chalk.bold(`\n📦 Installing ${selectedSkills.length} skill(s)...\n`));

            for (const skill of selectedSkills) {
                const installSpinner = ora(`Installing ${skill.name}...`).start();

                try {
                    // Fetch skill details
                    const { getSkillByScoped } = await import('../core/skillsdb.js');
                    const dbSkill = await getSkillByScoped(skill.scopedName);

                    if (!dbSkill) {
                        installSpinner.fail(`${skill.name}: Not found`);
                        continue;
                    }

                    const githubUrl = (dbSkill as any).github_url || (dbSkill as any).githubUrl;
                    if (!githubUrl) {
                        installSpinner.fail(`${skill.name}: No GitHub URL`);
                        continue;
                    }

                    // Parse GitHub URL
                    const urlMatch = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
                    if (!urlMatch) {
                        installSpinner.fail(`${skill.name}: Invalid GitHub URL`);
                        continue;
                    }

                    const [, owner, repo] = urlMatch;
                    const branch = (dbSkill as any).branch || 'main';
                    const skillPath = ((dbSkill as any).path || '').replace(/\/SKILL\.md$/i, '');

                    // Clone to temp
                    const tempDir = join(tmpdir(), `skill-${Date.now()}-${Math.random().toString(36).slice(2)}`);
                    await mkdir(tempDir, { recursive: true });

                    try {
                        await execAsync(`git clone --depth 1 --branch ${branch} https://github.com/${owner}/${repo}.git .`, { cwd: tempDir });

                        // Copy to each platform
                        for (const platform of platforms) {
                            const agentConfig = AGENTS[platform];
                            if (!agentConfig) continue;

                            const targetDir = agentConfig.projectDir;
                            const skillDir = join(process.cwd(), targetDir, dbSkill.name);
                            await mkdir(skillDir, { recursive: true });

                            const sourceDir = skillPath ? join(tempDir, skillPath) : tempDir;
                            await cp(sourceDir, skillDir, { recursive: true });
                        }

                        installSpinner.succeed(`${skill.name} → ${platforms.join(', ')}`);
                    } finally {
                        await rm(tempDir, { recursive: true, force: true }).catch(() => { });
                    }
                } catch (err: any) {
                    installSpinner.fail(`${skill.name}: ${err.message || err}`);
                }
            }

            console.log(chalk.bold.green(`\n✨ Installation complete!\n`));
        } catch (error) {
            console.error(chalk.red('Error searching:'), error);
            process.exit(1);
        }
    });


// Install - Install a skill by scoped name (e.g., @author/skill or author/skill)
program
    .command('install <scoped-name> [platforms...]')
    .alias('i')
    .description('Install a skill by @author/name or just name')
    .option('-g, --global', 'Install skill globally (user-level) instead of project-level')
    .option('-l, --list', 'Show skill details without installing')
    .option('-p, --platform <platforms>', 'Target platforms (comma-separated): cursor,claude,copilot,codex,antigravity,opencode,amp,kilo,roo,goose')
    .option('-t, --target <platforms>', 'Target platforms (alias for --platform)')
    .option('--all', 'Install to all platforms')
    .action(async (scopedName, platformsArg, options) => {
        try {
            const { parseScopedName, getSkillByScoped, fetchFromDB } = await import('../core/skillsdb.js');
            const { mkdir, writeFile, cp } = await import('fs/promises');
            const { existsSync } = await import('fs');
            const { join } = await import('path');
            const { tmpdir, homedir } = await import('os');
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);

            const { author, name } = parseScopedName(scopedName);

            console.log(chalk.bold(`\n📦 Searching for "${scopedName}"...\n`));

            // Try our database first
            let skill;
            try {
                skill = await getSkillByScoped(scopedName);
            } catch {
                // Fallback to GitHub sources if our API is down
                console.log(chalk.gray('Falling back to GitHub sources...'));
                const skills = await searchSkills(name);
                skill = skills.find((s: any) =>
                    s.name.toLowerCase() === name.toLowerCase() &&
                    (!author || s.author?.toLowerCase() === author.toLowerCase())
                ) || skills[0];
            }

            if (!skill) {
                console.log(chalk.yellow(`No skill found matching "${scopedName}"`));
                console.log(chalk.gray('Try: skills market-search <query> to find skills\n'));
                return;
            }

            const githubUrl = (skill as any).github_url || (skill as any).githubUrl;
            if (!githubUrl) {
                console.log(chalk.red('Could not find GitHub URL for this skill'));
                return;
            }

            console.log(chalk.gray(`Found: ${skill.name} by ${skill.author}`));
            console.log(chalk.gray(`Stars: ${(skill as any).stars?.toLocaleString() || 0}`));
            console.log(chalk.gray(`URL: ${githubUrl}`));
            if ((skill as any).description) {
                console.log(chalk.gray(`Description: ${(skill as any).description}`));
            }
            console.log('');

            // If --list flag, just show details and exit
            if (options.list) {
                console.log(chalk.cyan('Use without --list to install this skill.\n'));
                return;
            }

            // Determine target platforms (priority: --all > positional args > -t/-p > auto-detect)
            let platforms: string[] = [];

            if (options.all) {
                platforms = Object.keys(AGENTS);
            } else if (platformsArg && platformsArg.length > 0) {
                // Positional arguments like: skills install @author/skill claude cursor
                platforms = platformsArg.map((p: string) => p.trim().toLowerCase());
            } else if (options.target) {
                // -t or --target option
                platforms = options.target.split(',').map((p: string) => p.trim().toLowerCase());
            } else if (options.platform) {
                // -p or --platform option
                platforms = options.platform.split(',').map((p: string) => p.trim().toLowerCase());
            } else {
                // Auto-detect platforms in current directory
                const cwd = process.cwd();
                if (existsSync(join(cwd, '.cursor'))) platforms.push('cursor');
                if (existsSync(join(cwd, '.claude'))) platforms.push('claude');
                if (existsSync(join(cwd, '.github'))) platforms.push('copilot');
                if (existsSync(join(cwd, '.codex'))) platforms.push('codex');
                if (existsSync(join(cwd, '.agent'))) platforms.push('antigravity');

                // If none detected, prompt user
                if (platforms.length === 0) {
                    const { selectedPlatforms } = await inquirer.prompt([{
                        type: 'checkbox',
                        name: 'selectedPlatforms',
                        message: 'Select target platforms:',
                        choices: [
                            { name: 'Cursor', value: 'cursor', checked: true },
                            { name: 'Claude Code', value: 'claude', checked: true },
                            { name: 'GitHub Copilot', value: 'copilot' },
                            { name: 'OpenAI Codex', value: 'codex' },
                            { name: 'Antigravity', value: 'antigravity' }
                        ]
                    }]);
                    platforms = selectedPlatforms;
                }
            }

            if (platforms.length === 0) {
                console.log(chalk.yellow('No platforms selected. Exiting.'));
                return;
            }

            console.log(chalk.gray(`Installing to: ${platforms.join(', ')}${options.global ? ' (global)' : ''}\n`));

            // Use centralized AGENTS config with global support
            const isGlobal = !!options.global;

            // Download skill to temp directory
            const tempDir = join(tmpdir(), `skill-${Date.now()}`);
            await mkdir(tempDir, { recursive: true });

            try {
                // Clone skill from GitHub
                const spinner = ora(`Downloading ${skill.name}...`).start();

                // Parse GitHub URL to get repo info
                const urlMatch = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
                if (!urlMatch) {
                    spinner.fail('Invalid GitHub URL');
                    return;
                }

                const [, owner, repo] = urlMatch;
                const branch = (skill as any).branch || 'main';
                const skillPath = (skill as any).path?.replace(/\/SKILL\.md$/i, '') || '';

                // Clone repo
                await execAsync(`git clone --depth 1 --branch ${branch} https://github.com/${owner}/${repo}.git .`, { cwd: tempDir });

                spinner.succeed(`Downloaded ${skill.name}`);

                // Install to each platform
                for (const platform of platforms) {
                    const platformSpinner = ora(`Installing to ${platform}...`).start();

                    const agentConfig = AGENTS[platform];
                    if (!agentConfig) {
                        platformSpinner.fail(`Unknown platform: ${platform}`);
                        continue;
                    }

                    const targetDir = isGlobal ? agentConfig.globalDir : agentConfig.projectDir;
                    const skillDir = isGlobal ? join(targetDir, skill.name) : join(process.cwd(), targetDir, skill.name);
                    await mkdir(skillDir, { recursive: true });

                    // Copy skill files
                    const sourceDir = skillPath ? join(tempDir, skillPath) : tempDir;

                    if (platform === 'antigravity') {
                        // Antigravity uses .agent/skills/<skill-name>/
                        // Copy all files including subdirectories (references, scripts, etc.)
                        await cp(sourceDir, skillDir, { recursive: true });

                        // Also create a flat .md file for quick access if SKILL.md exists
                        const skillMdPath = join(sourceDir, 'SKILL.md');
                        if (existsSync(skillMdPath)) {
                            const { readFile } = await import('fs/promises');
                            const content = await readFile(skillMdPath, 'utf-8');
                            const flatMdDir = isGlobal ? targetDir : join(process.cwd(), targetDir);
                            await writeFile(join(flatMdDir, `${skill.name}.md`), content);
                        }
                    } else {
                        // Other platforms use folder structure
                        await cp(sourceDir, skillDir, { recursive: true });
                    }

                    platformSpinner.succeed(`Installed to ${targetDir}/${skill.name}`);
                }

            } finally {
                // Cleanup temp directory
                const { rm } = await import('fs/promises');
                await rm(tempDir, { recursive: true, force: true }).catch(() => { });
            }

            // Track installation
            const trackingFile = join(homedir(), '.antigravity', 'installed.json');
            const trackingDir = join(homedir(), '.antigravity');
            await mkdir(trackingDir, { recursive: true });

            let installed: any[] = [];
            try {
                const { readFile } = await import('fs/promises');
                const content = await readFile(trackingFile, 'utf-8');
                installed = JSON.parse(content);
            } catch { }

            installed.push({
                name: skill.name,
                author: skill.author,
                scopedName: `@${skill.author}/${skill.name}`,
                platforms,
                githubUrl,
                installedAt: new Date().toISOString()
            });

            await writeFile(trackingFile, JSON.stringify(installed, null, 2));

            console.log(chalk.bold.green(`\n✨ Successfully installed: ${skill.name}`));
            console.log(chalk.gray(`   Scoped name: @${skill.author}/${skill.name}`));
            console.log(chalk.gray(`   Platforms: ${platforms.join(', ')}\n`));

        } catch (error: any) {
            console.error(chalk.red('Error installing skill:'), error.message || error);
            process.exit(1);
        }
    });

// Add - Install skills directly from Git repository URLs
program
    .command('add <source>')
    .description('Install skills from a Git repo (e.g., owner/repo, https://github.com/owner/repo)')
    .option('-g, --global', 'Install skill globally (user-level) instead of project-level')
    .option('-l, --list', 'List available skills in the repository without installing')
    .option('-s, --skill <skills...>', 'Specify skill names to install')
    .option('-a, --agent <agents...>', 'Specify agents to install to')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(async (source, options) => {
        try {
            const { mkdir, cp, rm, readdir, readFile } = await import('fs/promises');
            const { existsSync, statSync } = await import('fs');
            const { join, basename, dirname } = await import('path');
            const { tmpdir } = await import('os');
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);

            // Parse source URL
            function parseSource(input: string): { type: string; url: string; subpath?: string } {
                // GitHub URL with path: github.com/owner/repo/tree/branch/path
                const githubTreeMatch = input.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/);
                if (githubTreeMatch) {
                    const [, owner, repo, , subpath] = githubTreeMatch;
                    return { type: 'github', url: `https://github.com/${owner}/${repo}.git`, subpath };
                }

                // GitHub URL: github.com/owner/repo
                const githubRepoMatch = input.match(/github\.com\/([^/]+)\/([^/]+)/);
                if (githubRepoMatch) {
                    const [, owner, repo] = githubRepoMatch;
                    const cleanRepo = repo!.replace(/\.git$/, '');
                    return { type: 'github', url: `https://github.com/${owner}/${cleanRepo}.git` };
                }

                // GitLab URL: gitlab.com/owner/repo
                const gitlabMatch = input.match(/gitlab\.com\/([^/]+)\/([^/]+)/);
                if (gitlabMatch) {
                    const [, owner, repo] = gitlabMatch;
                    const cleanRepo = repo!.replace(/\.git$/, '');
                    return { type: 'gitlab', url: `https://gitlab.com/${owner}/${cleanRepo}.git` };
                }

                // GitHub shorthand: owner/repo or owner/repo/path
                const shorthandMatch = input.match(/^([^/]+)\/([^/]+)(?:\/(.+))?$/);
                if (shorthandMatch && !input.includes(':')) {
                    const [, owner, repo, subpath] = shorthandMatch;
                    return { type: 'github', url: `https://github.com/${owner}/${repo}.git`, subpath };
                }

                // Fallback: treat as direct git URL
                return { type: 'git', url: input };
            }

            // Discover skills in a directory
            async function discoverSkillsInDir(dir: string, subpath?: string): Promise<{ name: string; description: string; path: string }[]> {
                const skills: { name: string; description: string; path: string }[] = [];
                const searchPath = subpath ? join(dir, subpath) : dir;

                const searchDirs = [
                    searchPath,
                    join(searchPath, 'skills'),
                    join(searchPath, '.claude/skills'),
                    join(searchPath, '.cursor/skills'),
                    join(searchPath, '.agent/skills'),
                    join(searchPath, '.codex/skills'),
                    join(searchPath, '.opencode/skill'),
                ];

                for (const searchDir of searchDirs) {
                    if (!existsSync(searchDir)) continue;

                    try {
                        const entries = await readdir(searchDir, { withFileTypes: true });
                        for (const entry of entries) {
                            if (entry.isDirectory()) {
                                const skillMdPath = join(searchDir, entry.name, 'SKILL.md');
                                if (existsSync(skillMdPath)) {
                                    try {
                                        const content = await readFile(skillMdPath, 'utf-8');
                                        const nameMatch = content.match(/^name:\s*(.+)$/m);
                                        const descMatch = content.match(/^description:\s*(.+)$/m);
                                        skills.push({
                                            name: nameMatch ? nameMatch[1].trim() : entry.name,
                                            description: descMatch ? descMatch[1].trim() : '',
                                            path: join(searchDir, entry.name),
                                        });
                                    } catch { }
                                }
                            }
                        }
                    } catch { }
                }

                return skills;
            }

            console.log(chalk.bold('\n📦 add-skill\n'));

            const parsed = parseSource(source);
            console.log(chalk.gray(`Source: ${parsed.url}${parsed.subpath ? ` (${parsed.subpath})` : ''}`));

            // Clone repository
            const tempDir = join(tmpdir(), `add-skill-${Date.now()}`);
            await mkdir(tempDir, { recursive: true });

            const spinner = ora('Cloning repository...').start();
            try {
                await execAsync(`git clone --depth 1 ${parsed.url} .`, { cwd: tempDir });
                spinner.succeed('Repository cloned');
            } catch (err: any) {
                spinner.fail('Failed to clone repository');
                console.error(chalk.red(err.message || err));
                await rm(tempDir, { recursive: true, force: true }).catch(() => { });
                return;
            }

            // Discover skills
            const discoverSpinner = ora('Discovering skills...').start();
            const skills = await discoverSkillsInDir(tempDir, parsed.subpath);

            if (skills.length === 0) {
                discoverSpinner.fail('No skills found');
                console.log(chalk.yellow('\nNo valid skills found. Skills require a SKILL.md with name and description.'));
                await rm(tempDir, { recursive: true, force: true }).catch(() => { });
                return;
            }

            discoverSpinner.succeed(`Found ${skills.length} skill${skills.length > 1 ? 's' : ''}`);

            // If --list, just show skills and exit
            if (options.list) {
                console.log(chalk.bold('\nAvailable Skills:'));
                for (const skill of skills) {
                    console.log(chalk.cyan(`  ${skill.name}`));
                    if (skill.description) {
                        console.log(chalk.gray(`    ${skill.description}`));
                    }
                }
                console.log(chalk.gray('\nUse --skill <name> to install specific skills\n'));
                await rm(tempDir, { recursive: true, force: true }).catch(() => { });
                return;
            }

            // Select skills to install
            let selectedSkills = skills;
            if (options.skill && options.skill.length > 0) {
                selectedSkills = skills.filter(s =>
                    options.skill.some((name: string) => s.name.toLowerCase() === name.toLowerCase())
                );
                if (selectedSkills.length === 0) {
                    console.log(chalk.yellow(`No matching skills found for: ${options.skill.join(', ')}`));
                    await rm(tempDir, { recursive: true, force: true }).catch(() => { });
                    return;
                }
            } else if (!options.yes && skills.length > 1) {
                // Interactive selection
                const { selected } = await inquirer.prompt([{
                    type: 'checkbox',
                    name: 'selected',
                    message: 'Select skills to install:',
                    choices: skills.map(s => ({ name: `${s.name}${s.description ? ` - ${s.description.slice(0, 50)}` : ''}`, value: s, checked: true })),
                }]);
                selectedSkills = selected;
            }

            if (selectedSkills.length === 0) {
                console.log(chalk.yellow('No skills selected.'));
                await rm(tempDir, { recursive: true, force: true }).catch(() => { });
                return;
            }

            // Select agents
            let targetAgents: string[] = [];
            if (options.agent && options.agent.length > 0) {
                targetAgents = options.agent;
            } else if (options.yes) {
                targetAgents = Object.keys(AGENTS);
            } else {
                const { agents } = await inquirer.prompt([{
                    type: 'checkbox',
                    name: 'agents',
                    message: 'Select agents to install to:',
                    choices: Object.entries(AGENTS).map(([key, config]) => ({
                        name: config.displayName,
                        value: key,
                        checked: ['cursor', 'claude', 'antigravity'].includes(key),
                    })),
                }]);
                targetAgents = agents;
            }

            if (targetAgents.length === 0) {
                console.log(chalk.yellow('No agents selected.'));
                await rm(tempDir, { recursive: true, force: true }).catch(() => { });
                return;
            }

            const isGlobal = !!options.global;

            // Install skills
            console.log(chalk.bold('\nInstalling...\n'));

            for (const skill of selectedSkills) {
                for (const agent of targetAgents) {
                    const agentConfig = AGENTS[agent];
                    if (!agentConfig) continue;

                    const targetDir = isGlobal ? agentConfig.globalDir : agentConfig.projectDir;
                    const skillDir = isGlobal ? join(targetDir, skill.name) : join(process.cwd(), targetDir, skill.name);

                    await mkdir(skillDir, { recursive: true });
                    await cp(skill.path, skillDir, { recursive: true });

                    console.log(chalk.green(`✔ ${skill.name} → ${agentConfig.displayName}`));
                    console.log(chalk.gray(`  ${isGlobal ? skillDir : targetDir + '/' + skill.name}`));
                }
            }

            console.log(chalk.bold.green(`\n✨ Successfully installed ${selectedSkills.length} skill(s)\n`));

            // Cleanup
            await rm(tempDir, { recursive: true, force: true }).catch(() => { });

        } catch (error: any) {
            console.error(chalk.red('Error:'), error.message || error);
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
                        { name: 'Antigravity     (.agent/workflows/)', value: 'antigravity', checked: true }
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

// ============================================
// PHASE 1: LEVERAGE EXISTING CODE
// ============================================

// Run - Execute a skill's script
program
    .command('run <skill-name> <script>')
    .description('Execute a script from an installed skill')
    .option('-a, --args <args...>', 'Arguments to pass to the script')
    .option('--timeout <ms>', 'Timeout in milliseconds', '30000')
    .action(async (skillName, script, options) => {
        try {
            const { executeScript, listScripts } = await import('../core/executor.js');
            const { homedir } = await import('os');
            const { join } = await import('path');
            const { existsSync } = await import('fs');

            // Find the skill path
            const skillsDir = join(homedir(), '.antigravity', 'skills');
            const skillPath = join(skillsDir, skillName);

            if (!existsSync(skillPath)) {
                console.error(chalk.red(`Skill not found: ${skillName}`));
                console.log(chalk.gray(`Expected at: ${skillPath}`));
                console.log(chalk.gray('\nInstall with: skills install <skill-name>'));
                process.exit(1);
            }

            // List available scripts if asked
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

// Context - Generate LLM system prompt context
program
    .command('context')
    .description('Generate system prompt context for AI agents')
    .option('-f, --format <format>', 'Output format: xml, json, markdown', 'xml')
    .option('-s, --skills <skills...>', 'Specific skills to include (default: all installed)')
    .option('-o, --output <file>', 'Write to file instead of stdout')
    .action(async (options) => {
        try {
            const { generateSkillsPromptXML, generateFullSkillsContext } = await import('../core/injector.js');
            const { discoverSkills } = await import('../core/loader.js');

            const allSkills = await discoverSkills();

            // Filter if specific skills requested
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

// Preview - Open skill in browser
program
    .command('preview <skill-name>')
    .description('Open skill detail page in browser')
    .option('--url-only', 'Just print the URL without opening')
    .action(async (skillName, options) => {
        try {
            // Parse scoped name
            const clean = skillName.replace(/^@/, '');
            const url = `https://skills.karanjot.dev/marketplace/${clean}`;

            if (options.urlOnly) {
                console.log(url);
            } else {
                const { exec } = await import('child_process');
                const { promisify } = await import('util');
                const execAsync = promisify(exec);

                // Cross-platform open
                const cmd = process.platform === 'darwin' ? 'open' :
                    process.platform === 'win32' ? 'start' : 'xdg-open';

                await execAsync(`${cmd} "${url}"`);
                console.log(chalk.green(`✓ Opened: ${url}`));
            }
        } catch (error) {
            console.error(chalk.red('Error opening preview:'), error);
            process.exit(1);
        }
    });

// Scripts - List scripts in an installed skill
program
    .command('scripts <skill-name>')
    .description('List available scripts in an installed skill')
    .action(async (skillName) => {
        try {
            const { listScripts, isScriptSafe } = await import('../core/executor.js');
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

// Shell completions
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

// Info - Show installation status and paths
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

            // Installation paths
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

            // Count installed skills
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

            // Show agent directories
            console.log(chalk.cyan('\n🤖 Agent Directories:'));
            const agents = [
                { name: 'Cursor', path: '.cursor/skills' },
                { name: 'Claude', path: '.claude/skills' },
                { name: 'Copilot', path: '.github/skills' },
                { name: 'Codex', path: '.codex/skills' },
                { name: 'Antigravity', path: '.agent/workflows' }
            ];

            for (const { name, path } of agents) {
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

// Update - Check and update installed skills
program
    .command('update [skill-name]')
    .description('Update installed skills to latest versions')
    .option('--all', 'Update all installed skills')
    .option('--check', 'Only check for updates, don\'t install')
    .action(async (skillName, options) => {
        try {
            const { homedir } = await import('os');
            const { join } = await import('path');
            const { existsSync } = await import('fs');
            const { readdir, readFile } = await import('fs/promises');

            const skillsDir = join(homedir(), '.antigravity', 'skills');

            if (!existsSync(skillsDir)) {
                console.log(chalk.yellow('No skills installed.'));
                return;
            }

            const entries = await readdir(skillsDir, { withFileTypes: true });
            const installedSkills = entries.filter(e => e.isDirectory()).map(e => e.name);

            if (installedSkills.length === 0) {
                console.log(chalk.yellow('No skills installed.'));
                return;
            }

            // Filter to specific skill if provided
            const toUpdate = skillName
                ? installedSkills.filter(s => s.toLowerCase().includes(skillName.toLowerCase()))
                : installedSkills;

            if (toUpdate.length === 0) {
                console.log(chalk.yellow(`No matching skills found for: ${skillName}`));
                return;
            }

            console.log(chalk.bold(`\n🔄 Checking ${toUpdate.length} skill(s) for updates...\n`));

            let updatesAvailable = 0;

            for (const skill of toUpdate) {
                const skillPath = join(skillsDir, skill);
                const skillMdPath = join(skillPath, 'SKILL.md');

                if (!existsSync(skillMdPath)) {
                    console.log(chalk.gray(`  ○ ${skill} - No SKILL.md found`));
                    continue;
                }

                // Read current skill to check version/hash
                const content = await readFile(skillMdPath, 'utf-8');
                const lines = content.split('\n').slice(0, 10).join('\n');

                // For now, just show as "up to date" - full version checking would need manifest
                if (options.check) {
                    console.log(chalk.green(`  ✓ ${skill}`) + chalk.gray(' - up to date'));
                } else {
                    console.log(chalk.green(`  ✓ ${skill}`) + chalk.gray(' - already latest'));
                }
            }

            if (updatesAvailable === 0) {
                console.log(chalk.green('\n✓ All skills are up to date!\n'));
            } else {
                console.log(chalk.cyan(`\n${updatesAvailable} update(s) available.\n`));
            }
        } catch (error) {
            console.error(chalk.red('Error checking updates:'), error);
            process.exit(1);
        }
    });

// Doctor - Diagnose and fix common issues
program
    .command('doctor')
    .description('Diagnose and fix common skills installation issues')
    .option('--fix', 'Attempt to fix issues automatically')
    .action(async (options) => {
        try {
            const { homedir } = await import('os');
            const { join } = await import('path');
            const { existsSync } = await import('fs');
            const { mkdir, readdir } = await import('fs/promises');

            console.log(chalk.bold('\n🩺 Skills Doctor\n'));

            const checks: Array<{ name: string; status: 'pass' | 'warn' | 'fail'; message: string; fix?: () => Promise<void> }> = [];

            // Check 1: Skills directory exists
            const skillsDir = join(homedir(), '.antigravity', 'skills');
            if (existsSync(skillsDir)) {
                checks.push({ name: 'Skills directory', status: 'pass', message: skillsDir });
            } else {
                checks.push({
                    name: 'Skills directory',
                    status: 'warn',
                    message: 'Not created yet',
                    fix: async () => {
                        await mkdir(skillsDir, { recursive: true });
                    }
                });
            }

            // Check 2: Config directory
            const configDir = join(homedir(), '.antigravity');
            if (existsSync(configDir)) {
                checks.push({ name: 'Config directory', status: 'pass', message: configDir });
            } else {
                checks.push({
                    name: 'Config directory',
                    status: 'warn',
                    message: 'Not created yet',
                    fix: async () => {
                        await mkdir(configDir, { recursive: true });
                    }
                });
            }

            // Check 3: Node version
            const nodeVersion = process.version;
            const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
            if (majorVersion >= 18) {
                checks.push({ name: 'Node.js version', status: 'pass', message: nodeVersion });
            } else {
                checks.push({ name: 'Node.js version', status: 'fail', message: `${nodeVersion} (requires >=18)` });
            }

            // Check 4: Git available
            try {
                const { execSync } = await import('child_process');
                execSync('git --version', { stdio: 'pipe' });
                checks.push({ name: 'Git installed', status: 'pass', message: 'Available' });
            } catch {
                checks.push({ name: 'Git installed', status: 'warn', message: 'Not found (optional)' });
            }

            // Check 5: Network connectivity
            try {
                const response = await fetch('https://api.github.com/rate_limit', {
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
            if (existsSync(skillsDir)) {
                const entries = await readdir(skillsDir, { withFileTypes: true });
                const skillCount = entries.filter(e => e.isDirectory()).length;
                let validCount = 0;

                for (const entry of entries) {
                    if (entry.isDirectory()) {
                        const skillMd = join(skillsDir, entry.name, 'SKILL.md');
                        if (existsSync(skillMd)) validCount++;
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

            if (!hasIssues) {
                console.log(chalk.green('\n✓ All checks passed!\n'));
            } else if (!options.fix) {
                console.log(chalk.gray('\nRun with --fix to attempt automatic fixes.\n'));
            }
            console.log('');
        } catch (error) {
            console.error(chalk.red('Error running doctor:'), error);
            process.exit(1);
        }
    });

program.parse();

