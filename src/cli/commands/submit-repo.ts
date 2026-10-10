/**
 * Submit-Repo Command
 * Submit a GitHub repo link for marketplace indexing.
 * Server fetches everything from GitHub; the CLI sends only owner/repo.
 */

import chalk from 'chalk';
import ora from 'ora';
import { Command } from 'commander';

/**
 * Register the submit-repo command
 */
export function registerSubmitRepoCommand(program: Command): void {
    program
        .command('submit-repo <repo>')
        .description('Submit a GitHub repo to be indexed in the marketplace')
        .action(async (repo: string) => {
            try {
                await submitRepoCommand(repo);
            } catch (err: any) {
                console.error(chalk.red('Error:'), err.message);
                process.exit(1);
            }
        });
}

const SUBMIT_REPO_API = 'https://www.agentskills.in/api/repos/submit';

export function parseRepoArg(repo: string): string | null {
    const parts = repo
        .replace(/https?:\/\/(www\.)?github\.com\//, '')
        .replace(/\.git$/, '')
        .replace(/\/$/, '')
        .split('/');
    return parts.length === 2 && parts[0] && parts[1] ? `${parts[0]}/${parts[1]}` : null;
}

async function submitRepoCommand(repo: string): Promise<void> {
    const fullName = parseRepoArg(repo);
    if (!fullName) {
        console.error(chalk.red('Invalid repo. Use: owner/repo or a GitHub URL'));
        console.log(chalk.dim('  Example: skills submit-repo facebook/react'));
        process.exit(1);
    }

    console.log('');
    console.log(chalk.bold('Submit Skills Repository'));
    const spinner = ora(`Submitting ${chalk.cyan(fullName)}...`).start();

    try {
        const res = await fetch(SUBMIT_REPO_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ full_name: fullName }),
        });
        const status = res.status;
        const data = await res.json().catch(() => ({})) as any;
        if (status === 202 || status === 201) {
            spinner.succeed(`Accepted: ${data.skills_found ?? data.indexed ?? 0} skill(s) found`);
            console.log(chalk.dim('  Indexing runs in the background. Check status:'));
            console.log(chalk.dim(`  curl "https://www.agentskills.in/api/repos/submit?repo=${fullName}"`));
        } else if (status === 409) {
            spinner.warn('Already submitted');
            console.log(chalk.dim(`  Status: ${data.status || 'pending'}`));
        } else {
            spinner.fail(data.error || `Failed (${status})`);
            if (status === 503 || status === 429) console.log(chalk.dim('  Try again in a minute.'));
            process.exitCode = 1;
        }
    } catch (err: any) {
        spinner.fail('Could not reach API');
        console.log(chalk.dim(`  ${err.message}`));
        console.log(chalk.dim('  Submit via GitHub issue instead: https://github.com/Karanjot786/agent-skills-cli/issues/new'));
        process.exitCode = 1;
    }
    console.log('');
}
