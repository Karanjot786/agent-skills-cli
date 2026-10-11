/**
 * Suggest Command
 * Project-aware skill recommendations based on tech stack analysis
 * (SkillKit calls this "recommend" — we call it "suggest")
 */

import chalk from 'chalk';
import ora from 'ora';
import { Command } from 'commander';
import {
    analyzeProject,
    buildSearchKeywords,
    scoreSkill,
    type ProjectAnalysis,
    type SuggestOptions,
    type SuggestedSkill
} from '../../core/suggest.js';
import { fetchSkillsForCLI, searchSkillsDB } from '../../core/skillsdb.js';

/**
 * Register the suggest command with commander
 */
export function registerSuggestCommand(program: Command): void {
    program
        .command('suggest')
        .alias('sg')
        .description('Get skill suggestions based on your project\'s tech stack')
        .option('-l, --limit <n>', 'Maximum number of suggestions', '10')
        .option('-m, --min-score <n>', 'Minimum match score (0-100)', '20')
        .option('-c, --category <cat>', 'Filter by category')
        .option('-t, --task <query>', 'Search skills by task description')
        .option('-v, --verbose', 'Show detailed match reasons')
        .option('-j, --json', 'Output in JSON format')
        .option('-p, --path <dir>', 'Project path (default: current directory)')
        .action(async (options: any) => {
            try {
                await suggestCommand({
                    limit: parseInt(options.limit) || 10,
                    minScore: parseInt(options.minScore) || 20,
                    category: options.category,
                    task: options.task,
                    verbose: options.verbose || false,
                    json: options.json || false,
                    path: options.path || process.cwd(),
                });
            } catch (err: any) {
                console.error(chalk.red('Error:'), err.message);
                process.exit(1);
            }
        });
}

/**
 * Run the suggest command
 */
async function suggestCommand(options: SuggestOptions): Promise<void> {
    const projectPath = options.path || process.cwd();

    // Step 1: Analyze project
    const spinner = ora('Analyzing your project...').start();
    const analysis = await analyzeProject(projectPath);

    if (analysis.languages.length === 0 && analysis.frameworks.length === 0) {
        spinner.warn('Could not detect project tech stack. Try running from a project directory.');
        return;
    }

    spinner.text = 'Building search queries...';
    const keywords = buildSearchKeywords(analysis, options.task);

    // Show analysis
    spinner.succeed('Project analyzed');
    console.log('');

    if (!options.json) {
        console.log(chalk.bold('📊 Detected Tech Stack:'));
        if (analysis.languages.length > 0) {
            console.log(`  ${chalk.dim('Languages:')}  ${analysis.languages.join(', ')}`);
        }
        if (analysis.frameworks.length > 0) {
            console.log(`  ${chalk.dim('Frameworks:')} ${analysis.frameworks.join(', ')}`);
        }
        if (analysis.libraries.length > 0) {
            console.log(`  ${chalk.dim('Libraries:')}  ${analysis.libraries.join(', ')}`);
        }
        if (analysis.testTools.length > 0) {
            console.log(`  ${chalk.dim('Testing:')}    ${analysis.testTools.join(', ')}`);
        }
        if (analysis.buildTools.length > 0) {
            console.log(`  ${chalk.dim('Build:')}      ${analysis.buildTools.join(', ')}`);
        }
        console.log('');
    }

    // Step 2: Fetch skills from DB
    const spinner2 = ora('Searching the marketplace for matches...').start();

    // Build multiple search queries from keywords
    const searchQueries = keywords.slice(0, 5); // Top 5 keywords
    const allSkills: any[] = [];
    const seenIds = new Set<string>();

    for (const query of searchQueries) {
        try {
            const result = await fetchSkillsForCLI({
                search: query,
                limit: 50,
            });
            if (result?.skills) {
                for (const skill of result.skills) {
                    if (!seenIds.has(skill.scopedName)) {
                        seenIds.add(skill.scopedName);
                        allSkills.push(skill);
                    }
                }
            }
        } catch {
            // Continue with other queries if one fails
        }
    }

    if (allSkills.length === 0) {
        spinner2.warn('No skills found matching your project. Try using --task to search by task.');
        return;
    }

    // Step 3: Score and rank skills
    const suggestions: SuggestedSkill[] = allSkills
        .map(skill => {
            const { score, reasons } = scoreSkill(
                { name: skill.name, description: skill.description || '', stars: skill.stars || 0 },
                analysis,
                keywords
            );
            return {
                name: skill.name,
                author: skill.author,
                scopedName: skill.scoped_name || `@${skill.author}/${skill.name}`,
                description: skill.description || '',
                score,
                matchReasons: reasons,
                githubUrl: skill.github_url || '',
                stars: skill.stars || 0,
            };
        })
        .filter(s => s.score >= (options.minScore || 20))
        .sort((a, b) => b.score - a.score)
        .slice(0, options.limit || 10);

    spinner2.succeed(`Found ${suggestions.length} matching skills`);
    console.log('');

    // Step 4: Display results
    if (options.json) {
        console.log(JSON.stringify(suggestions, null, 2));
        return;
    }

    if (suggestions.length === 0) {
        console.log(chalk.yellow('No skills matched with sufficient confidence. Try lowering --min-score.'));
        return;
    }

    const stackLabel = [...analysis.frameworks, ...analysis.languages].slice(0, 3).join(' + ');
    console.log(chalk.bold(`🎯 Skill Suggestions for your project (${stackLabel})`));
    console.log('');

    for (const suggestion of suggestions) {
        const scoreColor = suggestion.score >= 80
            ? chalk.green
            : suggestion.score >= 50
                ? chalk.yellow
                : chalk.dim;

        const starsStr = suggestion.stars > 0 ? chalk.dim(` ★${suggestion.stars}`) : '';
        const scoreStr = scoreColor(`${suggestion.score}%`.padStart(4));

        console.log(
            `  ${scoreStr}  ${chalk.cyan(suggestion.scopedName.padEnd(40))} ${chalk.dim(truncate(suggestion.description, 50))}${starsStr}`
        );

        if (options.verbose && suggestion.matchReasons.length > 0) {
            for (const reason of suggestion.matchReasons) {
                console.log(`        ${chalk.dim('↳')} ${chalk.dim(reason)}`);
            }
        }
    }

    console.log('');
    console.log(chalk.dim(`  Install: ${chalk.white('skills install <name>')}`));
    console.log('');
}

function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 1) + '…';
}
