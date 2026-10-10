/**
 * Audit Engine - Security vulnerability scanning for skills
 * Scans skill files against 46+ rules for 6 threat categories
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join, relative, extname } from 'path';
import {
    SCANNER_RULES,
    createEmptyScanResult,
    type ScanFinding,
    type ScanResult,
    type Severity,
    type ScannerRule,
} from './scanner-rules.js';

export type { ScanResult, ScanFinding, Severity };

export interface AuditOptions {
    format?: 'summary' | 'json' | 'table' | 'sarif';
    failOn?: Severity;
    skipRules?: string[];
}

// File extensions to scan
const SCANNABLE_EXTENSIONS = new Set([
    '.md', '.txt', '.yaml', '.yml', '.json', '.toml',
    '.ts', '.js', '.py', '.sh', '.bash', '.zsh',
    '.rb', '.go', '.rs', '.java', '.kt',
    '.mdc', '.cursorrules', '.rules',
]);

// Max file size (256KB)
const MAX_FILE_SIZE = 256 * 1024;

/**
 * Recursively collect scannable files
 */
async function collectFiles(dir: string, baseDir: string): Promise<string[]> {
    const files: string[] = [];

    try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            // Skip hidden dirs, node_modules, .git
            if (entry.name.startsWith('.') || entry.name === 'node_modules') {
                continue;
            }

            if (entry.isDirectory()) {
                const subFiles = await collectFiles(fullPath, baseDir);
                files.push(...subFiles);
            } else if (entry.isFile()) {
                const ext = extname(entry.name).toLowerCase();
                // Scan known extensions or extensionless files (like SKILL.md)
                if (SCANNABLE_EXTENSIONS.has(ext) || entry.name === 'SKILL.md' || !ext) {
                    const fileStat = await stat(fullPath);
                    if (fileStat.size <= MAX_FILE_SIZE) {
                        files.push(fullPath);
                    }
                }
            }
        }
    } catch {
        // Skip inaccessible directories
    }

    return files;
}

/**
 * Scan a single file against all rules
 */
function scanFile(
    content: string,
    filePath: string,
    rules: ScannerRule[]
): ScanFinding[] {
    const findings: ScanFinding[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const rule of rules) {
            if (rule.pattern.test(line)) {
                // Run false positive check if available
                if (rule.falsePositiveCheck) {
                    const context = lines.slice(Math.max(0, i - 2), i + 3);
                    if (rule.falsePositiveCheck(line, context)) {
                        continue;
                    }
                }

                const match = line.match(rule.pattern);
                findings.push({
                    ruleId: rule.id,
                    category: rule.category,
                    severity: rule.severity,
                    title: rule.title,
                    description: rule.description,
                    file: filePath,
                    line: i + 1,
                    lineContent: line.trim(),
                    column: match?.index,
                });
            }
        }
    }

    return findings;
}

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

/**
 * Scan one in-memory document. Used by install gating for downloaded files and by the
 * website batch job (scripts/jobs/scan.mjs imports dist/core/audit.js).
 */
export function scanContent(text: string, file = 'SKILL.md', skipRules: string[] = []): ScanResult {
    const skip = new Set(skipRules);
    const rules = SCANNER_RULES.filter(r => !skip.has(r.id) && !skip.has(r.category));
    const result = createEmptyScanResult();
    result.filesScanned = 1;
    result.findings = scanFile(text, file, rules);
    for (const f of result.findings) {
        result.summary[f.severity]++;
        result.summary.total++;
    }
    return result;
}

const SHELLS = new Set(['sh', 'bash', 'zsh', 'fish', 'dash', 'ksh', 'cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe']);
const SECRET_FLAG = /^--?(api[-_]?key|token|secret|password|auth|access[-_]?token)$/i;
const SECRET_FLAG_INLINE = /^--?(api[-_]?key|token|secret|password|auth|access[-_]?token)=(.+)$/i;
const isLiteralSecret = (v: string | undefined) => !!v && v.length >= 8 && !v.startsWith('$') && !/^<.*>$/.test(v);

/** Risk checks for an MCP install spec (registry install_json or a client config entry). */
export function scanInstallSpec(spec: { command?: string; args?: string[]; url?: string }): ScanFinding[] {
    const findings: ScanFinding[] = [];
    const args = spec.args ?? [];
    const cmdLine = [spec.command ?? '', ...args].join(' ').slice(0, 200);
    const base = (spec.command ?? '').split(/[\\/]/).pop()!.toLowerCase();
    if (SHELLS.has(base)) {
        findings.push({ ruleId: 'MCP001', category: 'command-injection', severity: 'high', title: 'MCP server runs a shell', description: `command "${spec.command}" starts a shell; review what it runs`, file: 'install_json', line: 1, lineContent: cmdLine });
    }
    for (let i = 0; i < args.length; i++) {
        const inline = args[i].match(SECRET_FLAG_INLINE);
        if ((inline && isLiteralSecret(inline[2])) || (SECRET_FLAG.test(args[i]) && isLiteralSecret(args[i + 1]))) {
            findings.push({ ruleId: 'MCP002', category: 'hardcoded-secrets', severity: 'high', title: 'Secret passed as a command-line argument', description: 'Credentials in args end up in config files and process lists; use env instead', file: 'install_json', line: 1, lineContent: args[i].replace(/=.*/, '=…') });
        }
    }
    const rules = SCANNER_RULES.filter(r => r.category === 'hardcoded-secrets' || r.id === 'CI001' || r.id === 'CI002');
    findings.push(...scanFile([...args, spec.url ?? ''].join('\n'), 'install_json', rules));
    return findings;
}

/**
 * Run a full security audit on a directory or file
 */
export async function runAudit(
    targetPath: string,
    options: AuditOptions = {}
): Promise<ScanResult> {
    const result = createEmptyScanResult();
    const skipRuleIds = new Set(options.skipRules || []);

    // Filter rules
    const activeRules = SCANNER_RULES.filter(r => {
        if (skipRuleIds.has(r.id)) return false;
        // Also allow skipping entire categories
        if (skipRuleIds.has(r.category)) return false;
        return true;
    });

    // Collect files
    const fileStat = await stat(targetPath);
    let files: string[];

    if (fileStat.isDirectory()) {
        files = await collectFiles(targetPath, targetPath);
    } else {
        files = [targetPath];
    }

    result.filesScanned = files.length;

    // Scan each file
    for (const file of files) {
        try {
            const content = await readFile(file, 'utf-8');
            const relPath = relative(targetPath, file) || file;
            const findings = scanFile(content, relPath, activeRules);
            result.findings.push(...findings);
        } catch {
            // Skip unreadable files
        }
    }

    // Build summary
    for (const finding of result.findings) {
        result.summary[finding.severity]++;
        result.summary.total++;
    }

    return result;
}

/**
 * Check if audit should fail based on severity threshold
 */
export function shouldFail(result: ScanResult, failOn: Severity): boolean {
    const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
    const threshold = severityOrder.indexOf(failOn);

    for (const finding of result.findings) {
        if (severityOrder.indexOf(finding.severity) <= threshold) {
            return true;
        }
    }

    return false;
}

/**
 * Convert scan result to SARIF format (for GitHub Code Scanning)
 */
export function toSARIF(result: ScanResult): object {
    return {
        version: '2.1.0',
        $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
        runs: [{
            tool: {
                driver: {
                    name: 'agent-skills-audit',
                    version: '1.0.0',
                    informationUri: 'https://agentskills.in',
                    rules: SCANNER_RULES.map(r => ({
                        id: r.id,
                        name: r.title,
                        shortDescription: { text: r.title },
                        fullDescription: { text: r.description },
                        defaultConfiguration: {
                            level: r.severity === 'critical' || r.severity === 'high'
                                ? 'error'
                                : r.severity === 'medium'
                                    ? 'warning'
                                    : 'note',
                        },
                        properties: {
                            category: r.category,
                            severity: r.severity,
                        },
                    })),
                },
            },
            results: result.findings.map(f => ({
                ruleId: f.ruleId,
                level: f.severity === 'critical' || f.severity === 'high'
                    ? 'error'
                    : f.severity === 'medium'
                        ? 'warning'
                        : 'note',
                message: { text: `${f.title}: ${f.description}` },
                locations: [{
                    physicalLocation: {
                        artifactLocation: { uri: f.file },
                        region: {
                            startLine: f.line,
                            startColumn: f.column || 1,
                        },
                    },
                }],
            })),
        }],
    };
}
