/**
 * Marketplace Module
 * Fetches and installs skills from GitHub-based marketplaces
 */

import { mkdir, writeFile, readFile, rm, cp } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import type {
    MarketplaceSource,
    MarketplaceSkill,
    InstalledSkill,
    MarketplaceConfig
} from '../types/marketplace.js';
import { DEFAULT_MARKETPLACES } from '../types/marketplace.js';
import { loadSkillMetadata } from './loader.js';
import { validateMetadata } from './validator.js';

const execAsync = promisify(exec);

/**
 * Default config file location
 */
const CONFIG_DIR = join(process.env.HOME || '~', '.antigravity');
const CONFIG_FILE = join(CONFIG_DIR, 'marketplace.json');
const DEFAULT_INSTALL_DIR = join(CONFIG_DIR, 'skills');

/**
 * Load marketplace configuration
 */
export async function loadConfig(): Promise<MarketplaceConfig> {
    if (!existsSync(CONFIG_FILE)) {
        return {
            sources: [...DEFAULT_MARKETPLACES],
            installed: [],
            installDir: DEFAULT_INSTALL_DIR
        };
    }

    try {
        const content = await readFile(CONFIG_FILE, 'utf-8');
        const config = JSON.parse(content) as MarketplaceConfig;

        // Ensure default marketplaces are included
        for (const defaultSource of DEFAULT_MARKETPLACES) {
            if (!config.sources.find(s => s.id === defaultSource.id)) {
                config.sources.push(defaultSource);
            }
        }

        // Remove deprecated/broken sources
        const deprecatedIds = ['agentskills-examples'];
        config.sources = config.sources.filter(s => !deprecatedIds.includes(s.id));

        return config;
    } catch {
        return {
            sources: [...DEFAULT_MARKETPLACES],
            installed: [],
            installDir: DEFAULT_INSTALL_DIR
        };
    }
}

/**
 * Save marketplace configuration
 */
export async function saveConfig(config: MarketplaceConfig): Promise<void> {
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Add a marketplace source
 */
export async function addMarketplace(source: MarketplaceSource): Promise<void> {
    const config = await loadConfig();

    // Check if already exists
    if (config.sources.find(s => s.id === source.id)) {
        throw new Error(`Marketplace ${source.id} already exists`);
    }

    config.sources.push(source);
    await saveConfig(config);
}

/**
 * Remove a marketplace source
 */
export async function removeMarketplace(id: string): Promise<void> {
    const config = await loadConfig();
    const index = config.sources.findIndex(s => s.id === id);

    if (index === -1) {
        throw new Error(`Marketplace ${id} not found`);
    }

    // Don't allow removing verified sources
    if (config.sources[index].verified) {
        throw new Error(`Cannot remove verified marketplace: ${id}`);
    }

    config.sources.splice(index, 1);
    await saveConfig(config);
}

/**
 * List available skills from a marketplace
 */
export async function listMarketplaceSkills(
    sourceId?: string
): Promise<MarketplaceSkill[]> {
    const config = await loadConfig();
    const sources = sourceId
        ? config.sources.filter(s => s.id === sourceId)
        : config.sources;

    const skills: MarketplaceSkill[] = [];

    for (const source of sources) {
        try {
            const sourceSkills = await fetchSkillsFromSource(source);
            skills.push(...sourceSkills);
        } catch (error) {
            console.warn(`Warning: Could not fetch from ${source.id}:`, error);
        }
    }

    return skills;
}

// In-memory cache for marketplace skills (5 minute TTL)
const skillsCache: Map<string, { skills: MarketplaceSkill[]; timestamp: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch skills from a GitHub marketplace source (with caching and parallel fetching)
 */
async function fetchSkillsFromSource(
    source: MarketplaceSource
): Promise<MarketplaceSkill[]> {
    const cacheKey = `${source.owner}/${source.repo}`;
    const cached = skillsCache.get(cacheKey);

    // Return cached result if still valid
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.skills;
    }

    const branch = source.branch || 'main';
    const skillsPath = source.skillsPath || 'skills';

    // Try index-based fetching first (scalable for 40k+ skills)
    const indexUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${branch}/${skillsPath}/skills-index.json`;

    try {
        const indexResponse = await fetch(indexUrl);

        if (indexResponse.ok) {
            // Index found - use it (single request for all skills!)
            const index = await indexResponse.json() as {
                skills: Array<{
                    name: string;
                    description: string;
                    path: string;
                    license?: string;
                    author?: string;
                    version?: string;
                }>;
            };

            const skills = index.skills.map(s => ({
                name: s.name,
                description: s.description || '',
                path: s.path,
                source,
                license: s.license,
                author: s.author,
                version: s.version
            } as MarketplaceSkill));

            skillsCache.set(cacheKey, { skills, timestamp: Date.now() });
            return skills;
        }
    } catch {
        // No index file, fall back to individual fetching
    }

    // Fallback: fetch each SKILL.md (for repos without index)
    const skills: MarketplaceSkill[] = [];
    const apiUrl = `https://api.github.com/repos/${source.owner}/${source.repo}/contents/${skillsPath}?ref=${branch}`;

    try {
        const response = await fetch(apiUrl, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'agent-skills-cli'
            }
        });

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const contents = await response.json() as Array<{
            name: string;
            path: string;
            type: string;
        }>;

        // Filter for directories (potential skills)
        const skillDirs = contents.filter(item => item.type === 'dir');

        // Fetch all SKILL.md files in parallel (with concurrency limit)
        const BATCH_SIZE = 10;
        for (let i = 0; i < skillDirs.length; i += BATCH_SIZE) {
            const batch = skillDirs.slice(i, i + BATCH_SIZE);
            const fetchPromises = batch.map(async (dir) => {
                try {
                    const skillMdUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${branch}/${dir.path}/SKILL.md`;
                    const skillResponse = await fetch(skillMdUrl);

                    if (skillResponse.ok) {
                        const skillMd = await skillResponse.text();
                        const metadata = parseSkillMdFrontmatter(skillMd);

                        if (metadata) {
                            return {
                                name: metadata.name || dir.name,
                                description: metadata.description || '',
                                path: dir.path,
                                source,
                                license: metadata.license,
                                author: metadata.metadata?.author,
                                version: metadata.metadata?.version
                            } as MarketplaceSkill;
                        }
                    }
                } catch {
                    // Skip skills that can't be parsed
                }
                return null;
            });

            const results = await Promise.all(fetchPromises);
            skills.push(...results.filter((s): s is MarketplaceSkill => s !== null));
        }

        // Cache the results
        skillsCache.set(cacheKey, { skills, timestamp: Date.now() });

    } catch (error) {
        throw new Error(`Failed to fetch from ${source.owner}/${source.repo}: ${error}`);
    }

    return skills;
}

/**
 * Parse frontmatter from SKILL.md content
 */
function parseSkillMdFrontmatter(content: string): Record<string, any> | null {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return null;

    try {
        // Simple YAML parsing (for basic key: value pairs)
        const yaml = frontmatterMatch[1];
        const result: Record<string, any> = {};

        let currentKey = '';
        let inMetadata = false;
        const metadataObj: Record<string, string> = {};

        for (const line of yaml.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (line.startsWith('  ') && inMetadata) {
                // Nested metadata
                const [key, ...valueParts] = trimmed.split(':');
                if (key && valueParts.length > 0) {
                    metadataObj[key.trim()] = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
                }
            } else if (trimmed.startsWith('metadata:')) {
                inMetadata = true;
                currentKey = 'metadata';
            } else {
                inMetadata = false;
                const colonIndex = trimmed.indexOf(':');
                if (colonIndex > 0) {
                    const key = trimmed.slice(0, colonIndex).trim();
                    const value = trimmed.slice(colonIndex + 1).trim().replace(/^["']|["']$/g, '');
                    result[key] = value;
                    currentKey = key;
                }
            }
        }

        if (Object.keys(metadataObj).length > 0) {
            result.metadata = metadataObj;
        }

        return result;
    } catch {
        return null;
    }
}

/**
 * Install a skill from a marketplace
 */
export async function installSkill(
    skillName: string,
    sourceId?: string
): Promise<InstalledSkill> {
    const config = await loadConfig();

    // Find the skill in available marketplaces
    const allSkills = await listMarketplaceSkills(sourceId);
    const skill = allSkills.find(s => s.name === skillName);

    if (!skill) {
        throw new Error(`Skill not found: ${skillName}`);
    }

    // Check if already installed
    const existing = config.installed.find(i => i.name === skillName);
    if (existing) {
        throw new Error(`Skill ${skillName} is already installed at ${existing.localPath}`);
    }

    // Create installation directory
    await mkdir(config.installDir, { recursive: true });
    const installPath = join(config.installDir, skillName);

    // Download skill from GitHub
    await downloadSkill(skill, installPath);

    // Validate the installed skill
    const metadata = await loadSkillMetadata(join(installPath, 'SKILL.md'));
    if (metadata) {
        const validation = validateMetadata(metadata);
        if (!validation.valid) {
            // Remove invalid skill
            await rm(installPath, { recursive: true, force: true });
            throw new Error(`Installed skill is invalid: ${validation.errors.map(e => e.message).join(', ')}`);
        }
    }

    // Track installation
    const installed: InstalledSkill = {
        name: skillName,
        localPath: installPath,
        source: skill.source,
        remotePath: skill.path,
        version: skill.version,
        installedAt: new Date().toISOString()
    };

    config.installed.push(installed);
    await saveConfig(config);

    return installed;
}

/**
 * Download a skill from GitHub
 */
async function downloadSkill(
    skill: MarketplaceSkill,
    destPath: string
): Promise<void> {
    const source = skill.source;
    const branch = source.branch || 'main';

    // Create temp directory
    const tempDir = join(tmpdir(), `skill-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    try {
        // Clone just the skill directory using sparse checkout
        const repoUrl = `https://github.com/${source.owner}/${source.repo}.git`;

        // Initialize sparse checkout
        await execAsync(`git init`, { cwd: tempDir });
        await execAsync(`git remote add origin ${repoUrl}`, { cwd: tempDir });
        await execAsync(`git config core.sparseCheckout true`, { cwd: tempDir });

        // Set sparse checkout path
        const sparseFile = join(tempDir, '.git', 'info', 'sparse-checkout');
        await writeFile(sparseFile, skill.path + '\n');

        // Fetch and checkout
        await execAsync(`git fetch --depth=1 origin ${branch}`, { cwd: tempDir });
        await execAsync(`git checkout ${branch}`, { cwd: tempDir });

        // Copy skill to destination
        const skillSourcePath = join(tempDir, skill.path);
        await mkdir(destPath, { recursive: true });

        // Copy all files
        await cp(skillSourcePath, destPath, { recursive: true });

    } finally {
        // Cleanup temp directory
        await rm(tempDir, { recursive: true, force: true }).catch(() => { });
    }
}

/**
 * Uninstall a skill
 */
export async function uninstallSkill(skillName: string): Promise<void> {
    const config = await loadConfig();

    const index = config.installed.findIndex(i => i.name === skillName);
    if (index === -1) {
        throw new Error(`Skill ${skillName} is not installed via marketplace`);
    }

    const installed = config.installed[index];

    // Remove skill directory
    if (existsSync(installed.localPath)) {
        await rm(installed.localPath, { recursive: true, force: true });
    }

    // Remove from tracking
    config.installed.splice(index, 1);
    await saveConfig(config);
}

/**
 * Check for skill updates
 */
export async function checkUpdates(): Promise<Array<{
    skill: InstalledSkill;
    currentVersion?: string;
    latestVersion?: string;
    hasUpdate: boolean;
}>> {
    const config = await loadConfig();
    const updates: Array<{
        skill: InstalledSkill;
        currentVersion?: string;
        latestVersion?: string;
        hasUpdate: boolean;
    }> = [];

    for (const installed of config.installed) {
        if (!installed.source) continue;

        try {
            const skills = await fetchSkillsFromSource(installed.source);
            const remote = skills.find(s => s.name === installed.name);

            if (remote) {
                const hasUpdate = remote.version !== installed.version && !!remote.version;
                updates.push({
                    skill: installed,
                    currentVersion: installed.version,
                    latestVersion: remote.version,
                    hasUpdate
                });
            }
        } catch {
            // Skip update check for unreachable sources
        }
    }

    return updates;
}

/**
 * Search for skills across all marketplaces
 */
export async function searchSkills(query: string): Promise<MarketplaceSkill[]> {
    const allSkills = await listMarketplaceSkills();
    const lowerQuery = query.toLowerCase();

    return allSkills.filter(skill =>
        skill.name.toLowerCase().includes(lowerQuery) ||
        skill.description.toLowerCase().includes(lowerQuery) ||
        skill.tags?.some(t => t.toLowerCase().includes(lowerQuery))
    );
}

/**
 * Get list of installed skills
 */
export async function getInstalledSkills(): Promise<InstalledSkill[]> {
    const config = await loadConfig();
    return config.installed;
}

/**
 * List registered marketplace sources
 */
export async function listMarketplaces(): Promise<MarketplaceSource[]> {
    const config = await loadConfig();
    return config.sources;
}
