/**
 * Audit Command
 * Security vulnerability scanning for AI agent skills
 * (SkillKit calls this "scan" — we call it "audit")
 */

import chalk from 'chalk';
import ora from 'ora';
import { Command } from 'commander';
import { resolve } from 'path';
import {
    runAudit,
    shouldFail,
    toSARIF,
    SEVERITY_ORDER,
    type ScanResult,
    type ScanFinding,
    type Severity,
    type AuditOptions,
} from '../../core/audit.js';
import { auditInstalled, fetchAdvisories, reportFails, type InstalledAuditReport } from '../../core/installed-audit.js';

/**
 * Register the audit command with commander
 */
export function registerAuditCommand(program: Command): void {
    program
        .command('audit [path]')
        .alias('scan')
        .description('Security audit — scan a path, or (no path) every installed skill and subagent')
        .option('-f, --format <format>', 'Output format: summary, json, table, sarif', 'summary')
        .option('--json', 'Same as --format json')
        .option('--fail-on <severity>', 'Exit code 1 if findings at this severity or above (critical, high, medium, low)')
        .option('--skip-rules <rules>', 'Comma-separated rule IDs or categories to skip')
        .option('--no-global', 'No path: skip user-level agent directories')
        .option('--offline', 'No path: do not download agentskills.in advisories')
        .action(async (path: string | undefined, options: any) => {
            try {
                if (options.json) options.format = 'json';
                if (options.failOn && !SEVERITY_ORDER.includes(options.failOn)) {
                    throw new Error(`--fail-on must be one of: ${SEVERITY_ORDER.join(', ')}`);
                }
                if (!path) {
                    await installedAuditCommand(options);
                    return;
                }
                const auditOptions: AuditOptions = {
                    format: options.format || 'summary',
                    failOn: options.failOn as Severity | undefined,
                    skipRules: options.skipRules ? options.skipRules.split(',').map((s: string) => s.trim()) : [],
                };

                await auditCommand(path, auditOptions);
            } catch (err: any) {
                console.error(chalk.red('Error:'), err.message);
                process.exit(1);
            }
        });
}

/**
 * Run the audit command
 */
async function auditCommand(targetPath: string, options: AuditOptions): Promise<void> {
    const resolvedPath = resolve(targetPath);
    const spinner = ora('Scanning for security vulnerabilities...').start();

    const result = await runAudit(resolvedPath, options);

    spinner.succeed(`Scanned ${result.filesScanned} file(s)`);
    console.log('');

    // Output based on format
    switch (options.format) {
        case 'json':
            console.log(JSON.stringify(result, null, 2));
            break;

        case 'sarif':
            console.log(JSON.stringify(toSARIF(result), null, 2));
            break;

        case 'table':
            printTable(result);
            break;

        case 'summary':
        default:
            printSummary(result);
            break;
    }

    // Exit with error if threshold exceeded
    if (options.failOn && shouldFail(result, options.failOn)) {
        console.log('');
        console.log(chalk.red(`✖ Audit failed: findings at ${options.failOn} severity or above`));
        process.exit(1);
    }
}

async function installedAuditCommand(options: any): Promise<void> {
    const json = options.format === 'json';
    const spinner = json ? null : ora('Scanning installed skills and subagents...').start();
    const advisories = options.offline ? null : await fetchAdvisories();
    const report = await auditInstalled({ cwd: process.cwd(), includeGlobal: options.global !== false, advisories });
    spinner?.succeed(`Scanned ${report.targets.length} installed item(s)${report.advisoriesChecked ? ' against agentskills.in advisories' : ' (advisories not checked)'}`);
    if (json) console.log(JSON.stringify(report, null, 2));
    else printInstalled(report);
    if (options.failOn && reportFails(report, options.failOn)) {
        if (!json) console.log(chalk.red(`✖ Audit failed: findings or advisories at ${options.failOn} severity or above`));
        process.exitCode = 1;
    }
}

function printInstalled(report: InstalledAuditReport): void {
    if (!report.targets.length) {
        console.log(chalk.yellow('No installed skills or subagents found.'));
        return;
    }
    console.log('');
    for (const t of report.targets) {
        const flagged = t.findings.filter(f => severityRank(f.severity) <= 2);
        const status = t.advisories.length
            ? chalk.red(`ADVISORY ${t.advisories.map(a => a.id).join(', ')}`)
            : flagged.length ? chalk.yellow(`${flagged.length} finding(s)`) : chalk.green('no findings');
        console.log(`  ${t.name.padEnd(32)} ${chalk.dim(t.origin.padEnd(17))} ${status}`);
        for (const f of flagged.slice(0, 5)) { // ponytail: scanner order, no sort
            console.log(chalk.dim(`      ${f.severity.toUpperCase()} [${f.ruleId}] ${f.title} (${f.file}:${f.line})`));
        }
    }
    const s = report.summary;
    console.log('');
    console.log(chalk.bold(`Summary: ${s.critical} critical, ${s.high} high, ${s.medium} medium, ${s.low} low · ${s.advisories} advisory match(es) · ${report.targets.length} item(s)`));
}

/**
 * Print summary format
 */
function printSummary(result: ScanResult): void {
    if (result.findings.length === 0) {
        console.log(chalk.green('🛡️  No security issues found!'));
        console.log('');
        return;
    }

    console.log(chalk.bold('🛡️  Security Audit Results'));
    console.log('');

    // Group by file
    const byFile = new Map<string, ScanFinding[]>();
    for (const finding of result.findings) {
        const existing = byFile.get(finding.file) || [];
        existing.push(finding);
        byFile.set(finding.file, existing);
    }

    for (const [file, findings] of byFile) {
        console.log(chalk.bold.underline(file));
        console.log('');

        for (const f of findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity))) {
            const icon = severityIcon(f.severity);
            const color = severityColor(f.severity);
            const ruleId = chalk.dim(`[${f.ruleId}]`);

            console.log(`  ${icon} ${color(f.severity.toUpperCase().padEnd(8))} ${ruleId} ${f.title} ${chalk.dim(`(line ${f.line})`)}`);
            console.log(`    ${chalk.dim(truncate(f.lineContent, 80))}`);
            console.log('');
        }
    }

    // Print summary bar
    const parts: string[] = [];
    if (result.summary.critical > 0) parts.push(chalk.red(`${result.summary.critical} critical`));
    if (result.summary.high > 0) parts.push(chalk.red(`${result.summary.high} high`));
    if (result.summary.medium > 0) parts.push(chalk.yellow(`${result.summary.medium} medium`));
    if (result.summary.low > 0) parts.push(chalk.dim(`${result.summary.low} low`));
    if (result.summary.info > 0) parts.push(chalk.dim(`${result.summary.info} info`));

    console.log(chalk.bold(`Summary: ${parts.join(', ')}  |  ${result.summary.total} finding(s) across ${result.filesScanned} file(s)`));
    console.log('');
}

/**
 * Print table format
 */
function printTable(result: ScanResult): void {
    if (result.findings.length === 0) {
        console.log(chalk.green('No findings.'));
        return;
    }

    // Header
    console.log(
        chalk.bold('Severity'.padEnd(10)) +
        chalk.bold('Rule'.padEnd(8)) +
        chalk.bold('Category'.padEnd(22)) +
        chalk.bold('File'.padEnd(30)) +
        chalk.bold('Line'.padEnd(6)) +
        chalk.bold('Title')
    );
    console.log('─'.repeat(120));

    for (const f of result.findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity))) {
        const color = severityColor(f.severity);
        console.log(
            color(f.severity.toUpperCase().padEnd(10)) +
            chalk.dim(f.ruleId.padEnd(8)) +
            f.category.padEnd(22) +
            truncate(f.file, 28).padEnd(30) +
            String(f.line).padEnd(6) +
            f.title
        );
    }
}

function severityRank(severity: Severity): number {
    const ranks: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return ranks[severity];
}

function severityIcon(severity: Severity): string {
    const icons: Record<Severity, string> = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🔵',
        info: 'ℹ️ ',
    };
    return icons[severity];
}

function severityColor(severity: Severity): (s: string) => string {
    const colors: Record<Severity, (s: string) => string> = {
        critical: chalk.red.bold,
        high: chalk.red,
        medium: chalk.yellow,
        low: chalk.blue,
        info: chalk.dim,
    };
    return colors[severity];
}

function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 1) + '…';
}
