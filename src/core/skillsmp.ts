/**
 * SkillsMP API Client
 * Integrates with skillsmp.com for scalable skill discovery (40k+ skills)
 */

import type { MarketplaceSkill, MarketplaceSource } from '../types/marketplace.js';

const SKILLSMP_API = 'https://skillsmp.com/api/skills';

/**
 * SkillsMP skill response
 */
interface SkillsMPSkill {
    id: string;
    name: string;
    author: string;
    authorAvatar: string;
    description: string;
    githubUrl: string;
    stars: number;
    forks: number;
    updatedAt: number;
    hasMarketplace: boolean;
    path: string;
    branch: string;
}

interface SkillsMPResponse {
    skills: SkillsMPSkill[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
    filters: {
        search: string;
        sortBy: string;
        marketplaceOnly: boolean;
    };
}

// Cache for SkillsMP results
const cache: Map<string, { data: MarketplaceSkill[]; timestamp: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Create SkillsMP as a marketplace source
 */
export const SKILLSMP_SOURCE: MarketplaceSource = {
    id: 'skillsmp',
    name: 'SkillsMP Marketplace',
    owner: 'skillsmp',
    repo: 'skillsmp.com',
    description: 'Browse 40,000+ agent skills from the community',
    verified: true
};

/**
 * Fetch skills from SkillsMP API
 */
export async function fetchSkillsMP(options: {
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: 'recent' | 'stars';
} = {}): Promise<{ skills: MarketplaceSkill[]; total: number; hasNext: boolean }> {
    const { search = '', page = 1, limit = 50, sortBy = 'stars' } = options;

    const cacheKey = `skillsmp:${search}:${page}:${limit}:${sortBy}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return { skills: cached.data, total: 0, hasNext: false };
    }

    const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sortBy
    });

    if (search) {
        params.set('search', search);
    }

    const response = await fetch(`${SKILLSMP_API}?${params}`, {
        headers: {
            'User-Agent': 'agent-skills-cli'
        }
    });

    if (!response.ok) {
        throw new Error(`SkillsMP API error: ${response.status}`);
    }

    const data = await response.json() as SkillsMPResponse;

    // Convert to MarketplaceSkill format
    const skills: MarketplaceSkill[] = data.skills.map(s => ({
        name: s.name,
        description: s.description,
        path: extractGitHubPath(s.githubUrl),
        source: {
            ...SKILLSMP_SOURCE,
            owner: s.author,
            repo: extractRepoName(s.githubUrl)
        },
        author: s.author,
        version: undefined,
        license: undefined,
        // Extra metadata
        skillId: s.id,  // SkillsMP unique ID
        stars: s.stars,
        githubUrl: s.githubUrl
    } as MarketplaceSkill & { skillId: string; stars: number; githubUrl: string }));

    cache.set(cacheKey, { data: skills, timestamp: Date.now() });

    return {
        skills,
        total: data.pagination.total,
        hasNext: data.pagination.hasNext
    };
}

/**
 * Search skills on SkillsMP
 */
export async function searchSkillsMP(query: string, limit = 20): Promise<MarketplaceSkill[]> {
    const result = await fetchSkillsMP({ search: query, limit, sortBy: 'stars' });
    return result.skills;
}

/**
 * Get top skills by stars
 */
export async function getTopSkills(limit = 50): Promise<MarketplaceSkill[]> {
    const result = await fetchSkillsMP({ limit, sortBy: 'stars' });
    return result.skills;
}

/**
 * Extract GitHub path from URL
 */
function extractGitHubPath(url: string): string {
    // https://github.com/owner/repo/tree/branch/path -> path
    const match = url.match(/github\.com\/[^/]+\/[^/]+\/tree\/[^/]+\/(.+)/);
    return match ? match[1] : '';
}

/**
 * Extract repo name from GitHub URL
 */
function extractRepoName(url: string): string {
    const match = url.match(/github\.com\/[^/]+\/([^/]+)/);
    return match ? match[1] : '';
}

/**
 * Extract owner from GitHub URL
 */
function extractOwner(url: string): string {
    const match = url.match(/github\.com\/([^/]+)/);
    return match ? match[1] : '';
}

/**
 * Extract branch from GitHub URL
 */
function extractBranch(url: string): string {
    const match = url.match(/github\.com\/[^/]+\/[^/]+\/tree\/([^/]+)/);
    return match ? match[1] : 'main';
}

/**
 * Install a skill directly from a GitHub URL
 */
export async function installFromGitHubUrl(
    githubUrl: string,
    installDir: string
): Promise<{ name: string; path: string }> {
    const owner = extractOwner(githubUrl);
    const repo = extractRepoName(githubUrl);
    const branch = extractBranch(githubUrl);
    const skillPath = extractGitHubPath(githubUrl);

    if (!owner || !repo || !skillPath) {
        throw new Error(`Invalid GitHub URL: ${githubUrl}`);
    }

    // Get skill name from path (last segment)
    const skillName = skillPath.split('/').pop() || 'skill';
    const destPath = `${installDir}/${skillName}`;

    // Fetch SKILL.md content
    const skillMdUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${skillPath}/SKILL.md`;
    const response = await fetch(skillMdUrl);

    if (!response.ok) {
        throw new Error(`Could not fetch SKILL.md from ${skillMdUrl}`);
    }

    const skillContent = await response.text();

    // Create directory and save SKILL.md
    const { mkdir, writeFile } = await import('fs/promises');
    await mkdir(destPath, { recursive: true });
    await writeFile(`${destPath}/SKILL.md`, skillContent);

    return { name: skillName, path: destPath };
}
