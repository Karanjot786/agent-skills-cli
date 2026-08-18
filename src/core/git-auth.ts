/**
 * Git Authentication Module
 * Resolves credentials for private Git repositories across platforms
 * 
 * Supports:
 * - Environment variables (GIT_TOKEN, GITLAB_TOKEN, BITBUCKET_TOKEN, GH_TOKEN)
 * - SSH key detection
 * - Git credential helper
 * - Interactive token prompt (fallback)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const execAsync = promisify(exec);

// ─── Types ───────────────────────────────────────────────────────────

export type GitHost = 'github' | 'gitlab' | 'bitbucket' | 'custom';

export interface GitAuthResult {
    /** The authentication method that was resolved */
    method: 'token' | 'ssh' | 'credential-helper' | 'netrc' | 'none';
    /** Token value if method is 'token' */
    token?: string;
    /** Whether SSH keys are available */
    sshAvailable?: boolean;
    /** Detected host type */
    host: GitHost;
}

export interface CloneOptions {
    /** Branch or tag to checkout */
    ref?: string;
    /** Clone depth (default: 1 for shallow) */
    depth?: number;
    /** Subpath within the repo to sparse-checkout */
    subpath?: string;
    /** Explicit auth token to use (overrides auto-detection) */
    token?: string;
}

// ─── Host Detection ──────────────────────────────────────────────────

/**
 * Detect the Git hosting provider from a URL
 */
export function detectGitHost(url: string): GitHost {
    const lower = url.toLowerCase();
    if (lower.includes('github.com') || lower.includes('github')) return 'github';
    if (lower.includes('gitlab.com') || lower.includes('gitlab')) return 'gitlab';
    if (lower.includes('bitbucket.org') || lower.includes('bitbucket')) return 'bitbucket';
    return 'custom';
}

// ─── Token Resolution ────────────────────────────────────────────────

/**
 * Map of environment variables to check for each host type
 */
const HOST_ENV_VARS: Record<GitHost, string[]> = {
    github: ['GH_TOKEN', 'GITHUB_TOKEN', 'GIT_TOKEN'],
    gitlab: ['GITLAB_TOKEN', 'GL_TOKEN', 'GIT_TOKEN'],
    bitbucket: ['BITBUCKET_TOKEN', 'BB_TOKEN', 'GIT_TOKEN'],
    custom: ['GIT_TOKEN', 'GITLAB_TOKEN', 'GH_TOKEN'],
};

/**
 * Try to resolve a token from environment variables
 */
function resolveTokenFromEnv(host: GitHost): string | undefined {
    const vars = HOST_ENV_VARS[host];
    for (const envVar of vars) {
        const value = process.env[envVar];
        if (value && value.trim()) {
            return value.trim();
        }
    }
    return undefined;
}

/**
 * Check if SSH keys are available via ssh-agent
 */
async function checkSshAvailable(): Promise<boolean> {
    try {
        const { stdout } = await execAsync('ssh-add -l', { timeout: 5000 });
        // ssh-add -l returns identities if any are loaded
        return !stdout.includes('no identities');
    } catch {
        // Also check if SSH key files exist
        const sshDir = join(homedir(), '.ssh');
        return (
            existsSync(join(sshDir, 'id_rsa')) ||
            existsSync(join(sshDir, 'id_ed25519')) ||
            existsSync(join(sshDir, 'id_ecdsa'))
        );
    }
}

/**
 * Try to resolve a token from Git credential helper
 */
async function resolveFromCredentialHelper(hostname: string): Promise<string | undefined> {
    try {
        // Check if a credential helper is configured
        const { stdout: helper } = await execAsync('git config credential.helper', { timeout: 3000 });
        if (!helper.trim()) return undefined;

        // Try to get credentials using a script that writes to stdin and reads stdout
        const { stdout } = await execAsync(
            `printf 'protocol=https\nhost=${hostname}\n\n' | git credential fill`,
            {
                timeout: 3000,
                env: {
                    ...process.env,
                    GIT_TERMINAL_PROMPT: '0',
                },
            }
        );

        const passwordMatch = stdout.match(/password=(.+)/);
        if (passwordMatch) {
            return passwordMatch[1].trim();
        }
    } catch {
        // Credential helper not available or failed
    }
    return undefined;
}

/**
 * Try to resolve credentials from .netrc file
 */
async function resolveFromNetrc(hostname: string): Promise<string | undefined> {
    const netrcPath = join(homedir(), process.platform === 'win32' ? '_netrc' : '.netrc');
    if (!existsSync(netrcPath)) return undefined;

    try {
        const content = await readFile(netrcPath, 'utf-8');
        // Simple .netrc parser — find machine entry for this host
        const machineRegex = new RegExp(
            `machine\\s+${hostname.replace('.', '\\.')}[\\s\\S]*?password\\s+(\\S+)`,
            'i'
        );
        const match = content.match(machineRegex);
        if (match) return match[1];
    } catch {
        // .netrc not readable
    }
    return undefined;
}

// ─── Main Auth Resolution ────────────────────────────────────────────

/**
 * Extract hostname from a Git URL
 */
function extractHostname(url: string): string {
    // SSH format: git@hostname:path
    const sshMatch = url.match(/^git@([^:]+):/);
    if (sshMatch) return sshMatch[1];

    // HTTPS format
    try {
        const parsed = new URL(url);
        return parsed.hostname;
    } catch {
        // Try extracting from path-like URLs
        const match = url.match(/^https?:\/\/([^/:]+)/);
        if (match) return match[1];
    }

    return url;
}

/**
 * Resolve Git authentication for a given URL
 * 
 * Resolution priority:
 * 1. Environment variables (host-specific)
 * 2. SSH key availability (for SSH URLs)
 * 3. Git credential helper
 * 4. .netrc file
 * 5. None (public repo or will fail)
 */
export async function resolveGitAuth(url: string, explicitToken?: string): Promise<GitAuthResult> {
    const host = detectGitHost(url);
    const hostname = extractHostname(url);

    // Explicit token takes priority
    if (explicitToken) {
        return { method: 'token', token: explicitToken, host };
    }

    // 1. Environment variables
    const envToken = resolveTokenFromEnv(host);
    if (envToken) {
        return { method: 'token', token: envToken, host };
    }

    // 2. SSH availability (for SSH URLs)
    const isSshUrl = url.startsWith('git@') || url.includes('ssh://');
    if (isSshUrl) {
        const sshAvailable = await checkSshAvailable();
        if (sshAvailable) {
            return { method: 'ssh', sshAvailable: true, host };
        }
    }

    // 3. Git credential helper
    const credToken = await resolveFromCredentialHelper(hostname);
    if (credToken) {
        return { method: 'credential-helper', token: credToken, host };
    }

    // 4. .netrc
    const netrcToken = await resolveFromNetrc(hostname);
    if (netrcToken) {
        return { method: 'netrc', token: netrcToken, host };
    }

    // 5. No auth found — will attempt without authentication
    return { method: 'none', host };
}

// ─── URL Manipulation ────────────────────────────────────────────────

/**
 * Build an authenticated HTTPS URL by injecting a token
 * 
 * Input:  https://gitlab.com/team/repo.git + token "abc123"
 * Output: https://oauth2:abc123@gitlab.com/team/repo.git
 */
export function buildAuthenticatedUrl(url: string, token: string): string {
    try {
        const parsed = new URL(url);
        parsed.username = 'oauth2';
        parsed.password = token;
        return parsed.toString();
    } catch {
        // Fallback: inject after protocol
        return url.replace(/^(https?:\/\/)/, `$1oauth2:${token}@`);
    }
}

/**
 * Convert an SSH URL to HTTPS URL for token-based auth
 * git@github.com:owner/repo.git → https://github.com/owner/repo.git
 */
export function sshToHttps(url: string): string {
    const match = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
    if (match) {
        return `https://${match[1]}/${match[2]}.git`;
    }
    return url;
}

/**
 * Normalize a Git URL for cloning
 * Ensures a proper protocol for anything that isn't already an SSH URL
 */
export function normalizeGitUrl(url: string): string {
    // Already an SSH URL — leave as-is
    if (url.startsWith('git@') || url.startsWith('ssh://')) {
        return url;
    }

    // Everything past this point is treated as an HTTP(S) repo URL.
    // We don't force a `.git` suffix: git's smart-HTTP protocol has no such
    // requirement, it's purely a hosting-provider convention (GitHub, GitLab,
    // Bitbucket use it; Azure DevOps `_git/repo` and AWS CodeCommit don't, and
    // appending it there breaks the URL). Passing the URL through unchanged
    // works everywhere; forcing a suffix only works on some hosts.
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
    }

    return url;
}

// ─── Clone with Auth ─────────────────────────────────────────────────

/**
 * Clone a Git repository with automatic authentication
 * 
 * Handles SSH, HTTPS+token, and public repos transparently.
 */
export async function cloneWithAuth(
    url: string,
    destDir: string,
    options?: CloneOptions
): Promise<void> {
    const { ref, depth = 1, token } = options || {};

    // Resolve authentication
    const auth = await resolveGitAuth(url, token);

    // Build the clone URL
    let cloneUrl: string;

    if (auth.method === 'ssh' || (auth.method === 'none' && url.startsWith('git@'))) {
        // Use SSH URL directly
        cloneUrl = url;
    } else if (auth.token) {
        // Convert SSH to HTTPS if needed, then inject token
        const httpsUrl = url.startsWith('git@') ? sshToHttps(url) : normalizeGitUrl(url);
        cloneUrl = buildAuthenticatedUrl(httpsUrl, auth.token);
    } else {
        // No auth — try public access
        cloneUrl = normalizeGitUrl(url);
    }

    // Build clone command
    const args = ['git', 'clone'];
    if (depth) args.push('--depth', String(depth));
    if (ref) args.push('--branch', ref);
    args.push(cloneUrl, '.');

    try {
        await execAsync(args.join(' '), {
            cwd: destDir,
            timeout: 60000,  // 60s timeout
            env: {
                ...process.env,
                // Suppress interactive prompts in CI
                GIT_TERMINAL_PROMPT: '0',
            },
        });
    } catch (err: any) {
        // Clean error message (strip token from output)
        const message = (err.stderr || err.message || 'Unknown error')
            .replace(/oauth2:[^@]+@/g, 'oauth2:***@')
            .trim();

        if (message.includes('Authentication failed') || message.includes('403') || message.includes('401')) {
            const host = detectGitHost(url);
            const envVars = HOST_ENV_VARS[host].join(' or ');
            throw new Error(
                `Authentication failed for ${url}\n` +
                `Set ${envVars} environment variable, or use --token flag.\n` +
                `For SSH, ensure your key is added: ssh-add ~/.ssh/id_ed25519`
            );
        }

        throw new Error(`Git clone failed: ${message}`);
    }
}

/**
 * Get the display-safe version of a URL (strips tokens)
 */
export function sanitizeUrl(url: string): string {
    return url
        .replace(/oauth2:[^@]+@/g, 'oauth2:***@')
        .replace(/(https?:\/\/)[^:]+:[^@]+@/g, '$1***:***@');
}
