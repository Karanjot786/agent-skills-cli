/**
 * Remove Command
 * Interactively remove installed skills
 */

import * as p from '@clack/prompts';
import chalk from 'chalk';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { homedir } from 'os';
import {
    readLock,
    removeSkillFromLock,
    listInstalledSkills,
    lockKey,
    type LockEntry
} from '../../core/skill-lock.js';
import { getMcpTarget } from '../agents.js';
import { removeMcpServer } from '../../core/mcp-config.js';
import { uninstallPlugin } from '../../core/item-installer.js';

/**
 * Agent configuration (imported from main CLI)
 */
interface AgentConfig {
    name: string;
    displayName: string;
    projectDir: string;
    globalDir: string;
}

/**
 * Remove command options
 */
export interface RemoveOptions {
    /** Remove from global installation */
    global?: boolean;
    /** Target specific agent only */
    agent?: string;
    /** Skip confirmation prompt */
    yes?: boolean;
    /** Remove all installed skills */
    all?: boolean;
}

/**
 * Remove installed skills
 * 
 * @param skillNames - Optional list of skill names to remove
 * @param options - Remove options
 * @param agentConfigs - Agent configurations
 */
export async function removeCommand(
    skillNames: string[] = [],
    options: RemoveOptions = {},
    agentConfigs: Record<string, AgentConfig>
): Promise<void> {
    const spinner = p.spinner();

    // 1. Get installed skills from lock file
    spinner.start('Scanning installed skills...');

    const installed = await listInstalledSkills({
        global: options.global,
        agent: options.agent
    });

    spinner.stop(`Found ${installed.length} installed skill(s)`);

    if (installed.length === 0) {
        p.outro(chalk.yellow('No skills found to remove.'));
        return;
    }

    // 2. Determine which skills to remove
    let selectedSkills: LockEntry[] = [];

    if (options.all) {
        // Remove all
        selectedSkills = installed;
    } else if (skillNames.length > 0) {
        // Filter by provided names
        const namesLower = skillNames.map(n => n.toLowerCase().replace(/^@/, ''));

        selectedSkills = installed.filter(s => {
            const nameMatch = namesLower.includes(s.name.toLowerCase());
            const scopedMatch = namesLower.includes(
                s.scopedName?.toLowerCase().replace(/^@/, '') || ''
            );
            const keyMatch = namesLower.includes(lockKey(s).toLowerCase());
            return nameMatch || scopedMatch || keyMatch;
        });

        if (selectedSkills.length === 0) {
            const notFound = skillNames.join(', ');
            p.outro(chalk.yellow(`No installed skills match: ${notFound}`));
            return;
        }
    } else {
        // Interactive selection
        const choices = installed.map(s => ({
            value: lockKey(s),
            label: `${s.name} ${chalk.dim(`(${s.agents.join(', ')})`)}`,
            hint: s.scopedName || s.source
        }));

        console.log('');
        const selected = await p.multiselect({
            message: `Select skills to remove ${chalk.dim('(space to toggle, enter to confirm)')}`,
            options: choices,
            required: true
        });

        if (p.isCancel(selected)) {
            p.cancel('Removal cancelled');
            process.exit(0);
        }

        selectedSkills = installed.filter(s =>
            (selected as string[]).includes(lockKey(s))
        );
    }

    if (selectedSkills.length === 0) {
        p.outro(chalk.yellow('No skills selected.'));
        return;
    }

    // 3. Show confirmation
    if (!options.yes) {
        console.log('');
        p.log.info(chalk.bold('Skills to remove:'));

        for (const skill of selectedSkills) {
            const location = skill.isGlobal ? 'global' : 'project';
            p.log.message(
                `  ${chalk.red('×')} ${skill.name} ` +
                `${chalk.dim(`→ ${skill.agents.join(', ')}`)} ` +
                `${chalk.dim(`[${location}]`)}`
            );
        }

        console.log('');

        const confirmed = await p.confirm({
            message: `Remove ${selectedSkills.length} skill(s)?`,
            initialValue: false
        });

        if (p.isCancel(confirmed) || !confirmed) {
            p.cancel('Removal cancelled');
            process.exit(0);
        }
    }

    // 4. Remove each skill
    spinner.start('Removing skills...');

    let removed = 0;
    let failed = 0;
    const cwd = process.cwd();
    const home = homedir();

    for (const skill of selectedSkills) {
        try {
            const type = skill.type ?? 'skill';
            if (type === 'mcp') {
                for (const t of skill.configTarget ?? []) {
                    const target = getMcpTarget(t.agent);
                    if (target && existsSync(t.file)) await removeMcpServer(t.file, target, t.name);
                }
            } else if (type === 'agent') {
                for (const t of skill.configTarget ?? []) if (existsSync(t.file)) await rm(t.file, { force: true });
            } else if (type === 'plugin') {
                for (const t of skill.configTarget ?? []) await uninstallPlugin(t.name, t.file);
            } else {
            // Remove from each agent directory
            for (const agentName of skill.agents) {
                const agentConfig = agentConfigs[agentName];
                if (!agentConfig) continue;

                const agentPath = skill.isGlobal
                    ? join(agentConfig.globalDir, skill.name)
                    : join(cwd, agentConfig.projectDir, skill.name);

                if (existsSync(agentPath)) {
                    await rm(agentPath, { recursive: true, force: true });
                }
            }

            // Remove the canonical copy only when it is a folder directly inside one of the skill's agent dirs.
            // Pre-1.1.10 installs stored the whole agent skills dir (or a local install's source folder) here.
            const agentDirs = skill.agents
                .map((a) => agentConfigs[a])
                .filter(Boolean)
                .map((c) => resolve(skill.isGlobal ? c.globalDir : join(cwd, c.projectDir)));
            const canonical = skill.canonicalPath ? resolve(cwd, skill.canonicalPath) : '';
            if (canonical && agentDirs.includes(dirname(canonical)) && existsSync(canonical)) {
                await rm(canonical, { recursive: true, force: true });
            }
            }

            // Remove from lock file
            await removeSkillFromLock(lockKey(skill));

            removed++;
        } catch (err: any) {
            p.log.warn(`Failed to remove ${skill.name}: ${err.message}`);
            failed++;
        }
    }

    spinner.stop('Removal complete');

    // 5. Show results
    console.log('');

    if (removed > 0) {
        p.log.success(chalk.green(`✓ Removed ${removed} skill(s)`));
    }

    if (failed > 0) {
        p.log.warn(chalk.yellow(`⚠ Failed to remove ${failed} skill(s)`));
    }
}

/**
 * Register the remove command with commander
 */
export function registerRemoveCommand(
    program: any,
    agentConfigs: Record<string, AgentConfig>
): void {
    program
        .command('remove [skills...]')
        .alias('rm')
        .alias('uninstall')
        .description('Remove installed skills')
        .option('-g, --global', 'Remove from global installation')
        .option('-a, --agent <agent>', 'Remove from specific agent only')
        .option('-y, --yes', 'Skip confirmation prompt')
        .option('--all', 'Remove all installed skills')
        .action(async (skills: string[], options: RemoveOptions) => {
            try {
                await removeCommand(skills, options, agentConfigs);
            } catch (err: any) {
                console.error(chalk.red('Error:'), err.message);
                process.exit(1);
            }
        });
}
