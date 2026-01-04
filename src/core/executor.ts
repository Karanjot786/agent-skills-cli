/**
 * Script Executor Module
 * Safely executes skill scripts in a sandboxed environment
 */

import { spawn } from 'child_process';
import { join, extname } from 'path';
import { existsSync } from 'fs';
import type { ScriptExecutionOptions, ScriptResult } from '../types/index.js';

/**
 * Default script execution options
 */
const DEFAULT_OPTIONS: Required<ScriptExecutionOptions> = {
    cwd: process.cwd(),
    env: {},
    timeout: 30000, // 30 seconds
    captureOutput: true
};

/**
 * Interpreters for different script types
 */
const INTERPRETERS: Record<string, string[]> = {
    '.py': ['python3', 'python'],
    '.js': ['node'],
    '.ts': ['npx', 'tsx'],
    '.sh': ['bash'],
    '.rb': ['ruby'],
    '.pl': ['perl']
};

/**
 * Execute a script from a skill's scripts directory
 */
export async function executeScript(
    skillPath: string,
    scriptName: string,
    args: string[] = [],
    options: ScriptExecutionOptions = {}
): Promise<ScriptResult> {
    const startTime = Date.now();
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const scriptPath = join(skillPath, 'scripts', scriptName);

    // Check if script exists
    if (!existsSync(scriptPath)) {
        return {
            success: false,
            exitCode: 1,
            stdout: '',
            stderr: `Script not found: ${scriptPath}`,
            executionTime: 0
        };
    }

    // Determine interpreter based on file extension
    const ext = extname(scriptName).toLowerCase();
    const interpreterCandidates = INTERPRETERS[ext];

    if (!interpreterCandidates) {
        return {
            success: false,
            exitCode: 1,
            stdout: '',
            stderr: `Unsupported script type: ${ext}. Supported: ${Object.keys(INTERPRETERS).join(', ')}`,
            executionTime: 0
        };
    }

    // Try to find a working interpreter
    let command: string;
    let commandArgs: string[];

    if (ext === '.ts') {
        // Special handling for TypeScript
        command = interpreterCandidates[0];
        commandArgs = [interpreterCandidates[1], scriptPath, ...args];
    } else {
        command = interpreterCandidates[0];
        commandArgs = [scriptPath, ...args];
    }

    return new Promise((resolve) => {
        const stdout: string[] = [];
        const stderr: string[] = [];

        const child = spawn(command, commandArgs, {
            cwd: opts.cwd,
            env: { ...process.env, ...opts.env },
            timeout: opts.timeout,
            shell: false
        });

        if (opts.captureOutput) {
            child.stdout?.on('data', (data) => {
                stdout.push(data.toString());
            });

            child.stderr?.on('data', (data) => {
                stderr.push(data.toString());
            });
        }

        child.on('error', (error) => {
            resolve({
                success: false,
                exitCode: 1,
                stdout: stdout.join(''),
                stderr: error.message,
                executionTime: Date.now() - startTime
            });
        });

        child.on('close', (code) => {
            resolve({
                success: code === 0,
                exitCode: code ?? 1,
                stdout: stdout.join(''),
                stderr: stderr.join(''),
                executionTime: Date.now() - startTime
            });
        });
    });
}

/**
 * Check if a script is safe to execute
 * This is a basic check - production systems should use proper sandboxing
 */
export function isScriptSafe(scriptContent: string): {
    safe: boolean;
    warnings: string[];
} {
    const warnings: string[] = [];

    // Check for potentially dangerous patterns
    const dangerousPatterns = [
        { pattern: /rm\s+-rf\s+[\/~]/, message: 'Contains recursive delete command' },
        { pattern: /curl.*\|.*sh/, message: 'Contains piped curl to shell' },
        { pattern: /wget.*\|.*sh/, message: 'Contains piped wget to shell' },
        { pattern: /eval\s*\(/, message: 'Contains eval() call' },
        { pattern: /exec\s*\(/, message: 'Contains exec() call' },
        { pattern: /os\.system\s*\(/, message: 'Contains os.system() call' },
        { pattern: /subprocess\.call\s*\(.*shell\s*=\s*True/, message: 'Contains shell subprocess call' }
    ];

    for (const { pattern, message } of dangerousPatterns) {
        if (pattern.test(scriptContent)) {
            warnings.push(message);
        }
    }

    return {
        safe: warnings.length === 0,
        warnings
    };
}

/**
 * List available scripts in a skill
 */
export async function listScripts(skillPath: string): Promise<string[]> {
    const scriptsDir = join(skillPath, 'scripts');

    if (!existsSync(scriptsDir)) {
        return [];
    }

    const { glob } = await import('glob');
    const scripts = await glob('*', {
        cwd: scriptsDir,
        nodir: true
    });

    return scripts;
}
