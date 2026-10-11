/**
 * Marketplace commands — market-list, market-search, market-install, market-uninstall,
 * market-installed, market-sources, market-add-source, market-update-check, assets
 */
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
    listMarketplaceSkills,
    searchSkills,
    installSkill,
    uninstallSkill,
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
    fetchSkillsForCLI,
} from '../../core/index.js';

export function registerMarketplaceCommands(program: Command) {
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

    // Market list - list skills from the agentskills.in marketplace
    program
        .command('market-list')
        .alias('ml')
        .description('List skills from the agentskills.in marketplace')
        .option('-l, --limit <number>', 'Number of skills to show', '50')
        .option('-p, --page <number>', 'Page number', '1')
        .option('--legacy', 'Use legacy GitHub sources instead of the marketplace')
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

    // Alias for backward compatibility
    program
        .command('market-install <name>')
        .alias('mi')
        .description('Install a skill (alias for: skills install)')
        .action(async (name) => {
            console.log(chalk.gray('Tip: Use `skills install <id-or-name>` directly\n'));
            const { spawnSync } = await import('child_process');
            spawnSync(process.argv[0], [process.argv[1], 'install', name], { stdio: 'inherit' });
        });

    // Install from URL
    program
        .command('install-url <url>')
        .alias('iu')
        .description('Install a skill from GitHub URL or SkillsMP page URL')
        .action(async (url) => {
            try {
                let githubUrl = url;

                // Convert SkillsMP URL to GitHub URL
                if (url.includes('skillsmp.com/skills/')) {
                    console.log(chalk.bold(`\n📦 Fetching skill info from SkillsMP...`));

                    const skillId = url.split('/skills/').pop()?.replace(/\/$/, '');
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

                // Staged download + security scan, same as `skills install`.
                const { installSkillFromDatabase } = await import('./install.js');
                const installedPath = await installSkillFromDatabase({ github_url: githubUrl, name: githubUrl }, skillsDir);

                console.log(chalk.green(`✓ Successfully installed: ${installedPath.split(/[\\/]/).pop()}`));
                console.log(chalk.gray(`  Path: ${installedPath}`));
                console.log('');
            } catch (error: any) {
                console.error(chalk.red('Error installing skill:'), error.message || error);
                process.exit(1);
            }
        });

    // Market uninstall
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

    // Market installed
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

    // Market sources
    program
        .command('market-sources')
        .description('List registered marketplace sources')
        .action(async () => {
            try {
                // Show agentskills.in as primary
                console.log(chalk.bold('\n🌐 Primary Marketplace:\n'));
                console.log(chalk.cyan(`  agentskills.in`) + chalk.green(' ✓'));
                console.log(chalk.gray(`    URL: https://www.agentskills.in`));
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

    // Market add-source
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

    // Market update-check
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
}
