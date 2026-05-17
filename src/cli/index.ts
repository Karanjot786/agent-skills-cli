#!/usr/bin/env node
/**
 * Agent Skills CLI
 * Universal CLI for managing Agent Skills across Cursor, Claude Code, GitHub Copilot, OpenAI Codex
 *
 * This file is the thin orchestrator — all command logic lives in ./commands/*.ts
 * and shared config lives in ./agents.ts.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import * as p from '@clack/prompts';
import {
    discoverSkills,
    listMarketplaceSkills,
    installSkill,
    fetchSkillsForCLI,
} from '../core/index.js';
import { setVersion } from '../core/telemetry.js';
import { AGENTS } from './agents.js';

// ─── Modular command imports ────────────────────────────────────────────────
import { registerListCommand } from './commands/list.js';
import { registerValidateCommand } from './commands/validate.js';
import { registerShowCommand } from './commands/show.js';
import { registerMarketplaceCommands } from './commands/marketplace.js';
import { registerSearchInstallCommand } from './commands/search.js';
import { registerInstallCommand } from './commands/install.js';
import { registerExportCommand } from './commands/export.js';
import { registerDoctorCommand, registerCheckCommand, registerUpdateCommand, registerExecCommand } from './commands/utils-commands.js';
import { registerInteractiveCommands } from './commands/interactive.js';

// ─── Already-extracted command imports ──────────────────────────────────────
import { registerRemoveCommand } from './commands/remove.js';
import { registerSuggestCommand } from './commands/suggest.js';
import { registerAuditCommand } from './commands/audit.js';
import { registerCraftCommand } from './commands/craft.js';
import { registerSubmitCommand } from './commands/submit.js';
import { registerBootstrapCommand } from './commands/bootstrap.js';
import { registerConvertCommand } from './commands/convert.js';
import { registerCollabCommand } from './commands/collab.js';
import { registerLockspecCommand } from './commands/lockspec.js';
import { registerForgeCommand } from './commands/forge.js';
import { registerMineCommand } from './commands/mine.js';
import { registerRecallCommand } from './commands/recall.js';
import { registerGridCommand } from './commands/grid.js';
import { registerCaptureCommand } from './commands/capture.js';
import { registerTriggerCommand } from './commands/trigger.js';
import { registerRuleCommand } from './commands/rule.js';
import { registerBlueprintCommand } from './commands/blueprint.js';
import { registerCiCommand } from './commands/ci.js';
import { registerTrackCommand } from './commands/track.js';
import { registerInsightCommand } from './commands/insight.js';
import { registerScoreCommand } from './commands/score.js';
import { registerSubmitRepoCommand } from './commands/submit-repo.js';
import { registerMethodCommand } from './commands/method.js';

// ─── v1.1.4 Unique Feature Commands ────────────────────────────────────────
import { registerContextCommand } from './commands/context.js';
import { registerDiffCommand } from './commands/diff.js';
import { registerComposeCommand } from './commands/compose.js';
import { registerTestCommand } from './commands/test.js';
import { registerFrozenCommand } from './commands/frozen.js';
import { registerSandboxCommand } from './commands/sandbox.js';
import { registerWatchCommand } from './commands/watch.js';
import { registerSplitCommand } from './commands/split.js';
import { registerBenchCommand } from './commands/bench.js';

// ─── Program setup ─────────────────────────────────────────────────────────

const program = new Command();

// Initialize telemetry with CLI version
setVersion('1.0.8');

// ─── Main interactive flow (`skills` with no subcommand) ────────────────────

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

    const selectedAgents = agents as string[];

    // Step 2: Fetch skills from our database
    const spinner = ora('Fetching skills from marketplace...').start();
    let marketplaceSkills: any[] = [];
    let total = 0;

    try {
        const result = await fetchSkillsForCLI({ limit: 100, sortBy: 'stars' });
        marketplaceSkills = result.skills;
        total = result.total;
        spinner.succeed(`Found ${total.toLocaleString()} skills (showing top 100 by stars)`);
    } catch (err) {
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

    // Step 4: Install skills directly to platform directories
    console.log('');

    const { getSkillByScoped } = await import('../core/skillsdb.js');
    const { mkdir, cp, rm } = await import('fs/promises');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    async function installSkillToPlatforms(skill: any): Promise<{ success: boolean; name: string; scopedName?: string; error?: string }> {
        try {
            const dbSkill = await getSkillByScoped(skill.scopedName || skill.name);
            if (!dbSkill) {
                return { success: false, name: skill.name, error: 'Skill not found' };
            }

            const githubUrl = (dbSkill as any).github_url || (dbSkill as any).githubUrl;
            const scopedName = (dbSkill as any).scoped_name || (dbSkill as any).scopedName || skill.scopedName;

            if (!githubUrl) {
                return { success: false, name: skill.name, error: 'No GitHub URL found' };
            }

            const urlMatch = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
            if (!urlMatch) {
                return { success: false, name: skill.name, error: 'Invalid GitHub URL' };
            }

            const [, owner, repo] = urlMatch;
            const branch = (dbSkill as any).branch || 'main';
            const skillPath = ((dbSkill as any).path || '').replace(/\/SKILL\.md$/i, '');

            const tempDir = join(tmpdir(), `skill-${Date.now()}-${Math.random().toString(36).slice(2)}`);
            await mkdir(tempDir, { recursive: true });

            try {
                await execAsync(`git clone --depth 1 --branch ${branch} https://github.com/${owner}/${repo}.git .`, { cwd: tempDir });

                for (const platform of selectedAgents) {
                    const agentConfig = AGENTS[platform];
                    if (!agentConfig) continue;

                    const targetDir = agentConfig.projectDir;
                    const skillDir = join(process.cwd(), targetDir, dbSkill.name);
                    await mkdir(skillDir, { recursive: true });

                    const sourceDir = skillPath ? join(tempDir, skillPath) : tempDir;
                    await cp(sourceDir, skillDir, { recursive: true });
                }

                return { success: true, name: dbSkill.name, scopedName };
            } finally {
                await rm(tempDir, { recursive: true, force: true }).catch(() => { });
            }
        } catch (err: any) {
            return { success: false, name: skill.name, error: err.message || String(err) };
        }
    }

    console.log(chalk.bold(`📦 Installing ${selectedSkills.length} skill(s) in parallel...\n`));
    const downloadSpinner = ora(`Downloading ${selectedSkills.length} skills...`).start();

    const results = await Promise.all(selectedSkills.map((skill: any) => installSkillToPlatforms(skill)));

    downloadSpinner.succeed(`Downloaded ${results.filter(r => r.success).length}/${selectedSkills.length} skills`);

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

// ─── Root command ───────────────────────────────────────────────────────────

program
    .name('skills')
    .description('Agent Skills CLI - Manage skills for Cursor, Claude Code, GitHub Copilot, OpenAI Codex')
    .version('1.1.9')
    .action(showMainMenu);

// ─── Register all command modules ───────────────────────────────────────────

// Group 1: Core commands
registerListCommand(program);
registerValidateCommand(program);
registerShowCommand(program);         // show, prompt, init

// Group 2: Marketplace & assets
registerMarketplaceCommands(program); // assets, market-list/search/install/uninstall/installed/sources/add-source/update-check, install-url

// Group 3: Search & install
registerSearchInstallCommand(program); // search
registerInstallCommand(program);       // install

// Group 4: Export
registerExportCommand(program);

// Group 5: Utilities
registerDoctorCommand(program);
registerCheckCommand(program);
registerUpdateCommand(program);
registerExecCommand(program);

// Group 6: Interactive wizards & misc
registerInteractiveCommands(program); // install-wizard, export-interactive, setup, run, context, preview, scripts, completion, info

// Group 7: Previously-extracted modular commands
registerRemoveCommand(program, AGENTS);
registerSuggestCommand(program);
registerAuditCommand(program);
registerCraftCommand(program);
registerSubmitCommand(program);
registerBootstrapCommand(program);
registerConvertCommand(program);
registerCollabCommand(program);
registerLockspecCommand(program);
registerForgeCommand(program);
registerMineCommand(program);
registerRecallCommand(program);
registerGridCommand(program);
registerCaptureCommand(program);
registerTriggerCommand(program);
registerRuleCommand(program);
registerBlueprintCommand(program);
registerCiCommand(program);
registerTrackCommand(program);
registerInsightCommand(program);
registerMethodCommand(program);
registerScoreCommand(program);
registerSubmitRepoCommand(program);

// v1.1.4 — Unique features
registerContextCommand(program);
registerDiffCommand(program);
registerComposeCommand(program);
registerTestCommand(program);
registerFrozenCommand(program);
registerSandboxCommand(program);
registerWatchCommand(program);
registerSplitCommand(program);
registerBenchCommand(program);

program.parse();
