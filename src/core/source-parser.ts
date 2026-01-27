/**
 * Source Parser for Agent Skills CLI
 * Based on vercel-labs/skills implementation
 * 
 * Supports:
 * - Local paths: ./path, ../path, /absolute/path
 * - GitHub URLs: https://github.com/owner/repo
 * - GitHub shorthand: owner/repo
 * - GitLab URLs: https://gitlab.com/owner/repo
 * - Direct SKILL.md URLs
 * - Generic git URLs
 */

import { isAbsolute, resolve } from 'path';

export interface ParsedSource {
    type: 'local' | 'github' | 'gitlab' | 'git' | 'direct-url' | 'well-known';
    url: string;
    localPath?: string;
    ref?: string;
    subpath?: string;
}

/**
 * Check if a string represents a local file system path
 */
function isLocalPath(input: string): boolean {
    return (
        isAbsolute(input) ||
        input.startsWith('./') ||
        input.startsWith('../') ||
        input === '.' ||
        input === '..' ||
        // Windows absolute paths like C:\ or D:\
        /^[a-zA-Z]:[/\\]/.test(input)
    );
}

/**
 * Check if a URL is a direct link to a SKILL.md file
 */
function isDirectSkillUrl(input: string): boolean {
    if (!input.startsWith('http://') && !input.startsWith('https://')) {
        return false;
    }

    // Must end with skill.md (case insensitive)
    if (!input.toLowerCase().endsWith('/skill.md')) {
        return false;
    }

    // Exclude GitHub and GitLab repository URLs - they have their own handling
    if (input.includes('github.com/') && !input.includes('raw.githubusercontent.com')) {
        if (!input.includes('/blob/') && !input.includes('/raw/')) {
            return false;
        }
    }
    if (input.includes('gitlab.com/') && !input.includes('/-/raw/')) {
        return false;
    }

    return true;
}

/**
 * Parse a source string into a structured format
 */
export function parseSource(input: string): ParsedSource {
    // Local path: absolute, relative, or current directory
    if (isLocalPath(input)) {
        const resolvedPath = resolve(input);
        return {
            type: 'local',
            url: resolvedPath,
            localPath: resolvedPath,
        };
    }

    // Direct skill.md URL (non-GitHub/GitLab)
    if (isDirectSkillUrl(input)) {
        return {
            type: 'direct-url',
            url: input,
        };
    }

    // GitHub URL with path: https://github.com/owner/repo/tree/branch/path/to/skill
    const githubTreeWithPathMatch = input.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/);
    if (githubTreeWithPathMatch) {
        const [, owner, repo, ref, subpath] = githubTreeWithPathMatch;
        return {
            type: 'github',
            url: `https://github.com/${owner}/${repo}.git`,
            ref,
            subpath,
        };
    }

    // GitHub URL with branch only: https://github.com/owner/repo/tree/branch
    const githubTreeMatch = input.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)$/);
    if (githubTreeMatch) {
        const [, owner, repo, ref] = githubTreeMatch;
        return {
            type: 'github',
            url: `https://github.com/${owner}/${repo}.git`,
            ref,
        };
    }

    // GitHub URL: https://github.com/owner/repo
    const githubRepoMatch = input.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (githubRepoMatch) {
        const [, owner, repo] = githubRepoMatch;
        const cleanRepo = repo!.replace(/\.git$/, '');
        return {
            type: 'github',
            url: `https://github.com/${owner}/${cleanRepo}.git`,
        };
    }

    // GitLab URL with path: https://gitlab.com/owner/repo/-/tree/branch/path
    const gitlabTreeWithPathMatch = input.match(
        /gitlab\.com\/([^/]+)\/([^/]+)\/-\/tree\/([^/]+)\/(.+)/
    );
    if (gitlabTreeWithPathMatch) {
        const [, owner, repo, ref, subpath] = gitlabTreeWithPathMatch;
        return {
            type: 'gitlab',
            url: `https://gitlab.com/${owner}/${repo}.git`,
            ref,
            subpath,
        };
    }

    // GitLab URL with branch only: https://gitlab.com/owner/repo/-/tree/branch
    const gitlabTreeMatch = input.match(/gitlab\.com\/([^/]+)\/([^/]+)\/-\/tree\/([^/]+)$/);
    if (gitlabTreeMatch) {
        const [, owner, repo, ref] = gitlabTreeMatch;
        return {
            type: 'gitlab',
            url: `https://gitlab.com/${owner}/${repo}.git`,
            ref,
        };
    }

    // GitLab URL: https://gitlab.com/owner/repo
    const gitlabRepoMatch = input.match(/gitlab\.com\/([^/]+)\/([^/]+)/);
    if (gitlabRepoMatch) {
        const [, owner, repo] = gitlabRepoMatch;
        const cleanRepo = repo!.replace(/\.git$/, '');
        return {
            type: 'gitlab',
            url: `https://gitlab.com/${owner}/${cleanRepo}.git`,
        };
    }

    // GitHub shorthand: owner/repo or owner/repo/path/to/skill
    const shorthandMatch = input.match(/^([^/]+)\/([^/]+)(?:\/(.+))?$/);
    if (shorthandMatch && !input.includes(':') && !input.startsWith('.') && !input.startsWith('/')) {
        const [, owner, repo, subpath] = shorthandMatch;
        return {
            type: 'github',
            url: `https://github.com/${owner}/${repo}.git`,
            subpath,
        };
    }

    // Well-known skills: arbitrary HTTP(S) URLs that aren't GitHub/GitLab
    if (isWellKnownUrl(input)) {
        return {
            type: 'well-known',
            url: input,
        };
    }

    // Fallback: treat as direct git URL
    return {
        type: 'git',
        url: input,
    };
}

/**
 * Check if a URL could be a well-known skills endpoint
 */
function isWellKnownUrl(input: string): boolean {
    if (!input.startsWith('http://') && !input.startsWith('https://')) {
        return false;
    }

    try {
        const parsed = new URL(input);

        // Exclude known git hosts that have their own handling
        const excludedHosts = [
            'github.com',
            'gitlab.com',
            'huggingface.co',
            'raw.githubusercontent.com',
        ];
        if (excludedHosts.includes(parsed.hostname)) {
            return false;
        }

        // Don't match URLs that look like direct skill.md links
        if (input.toLowerCase().endsWith('/skill.md')) {
            return false;
        }

        // Don't match URLs that look like git repos
        if (input.endsWith('.git')) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
}

/**
 * Extract owner/repo from a parsed source for telemetry
 */
export function getOwnerRepo(parsed: ParsedSource): string | null {
    if (parsed.type === 'local') {
        return null;
    }

    // Extract from git URL: https://github.com/owner/repo.git or similar
    const match = parsed.url.match(/(?:github|gitlab)\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (match) {
        return `${match[1]}/${match[2]}`;
    }

    return null;
}

/**
 * Get display name for a source type
 */
export function getSourceTypeDisplay(type: ParsedSource['type']): string {
    switch (type) {
        case 'local': return 'Local';
        case 'github': return 'GitHub';
        case 'gitlab': return 'GitLab';
        case 'direct-url': return 'Direct URL';
        case 'well-known': return 'Well-Known';
        case 'git': return 'Git';
        default: return 'Unknown';
    }
}
