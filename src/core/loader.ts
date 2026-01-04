/**
 * Skill Loader Module
 * Handles discovery and loading of skills from the filesystem
 */

import { glob } from 'glob';
import matter from 'gray-matter';
import { readFile } from 'fs/promises';
import { dirname, join, basename } from 'path';
import { existsSync } from 'fs';
import type {
    Skill,
    SkillRef,
    SkillMetadata,
    SkillDiscoveryConfig
} from '../types/index.js';

/**
 * Default search paths for skills
 */
export const DEFAULT_SKILL_PATHS = [
    // Global user skills
    join(process.env.HOME || '~', '.antigravity', 'skills'),
    // Project-level skills
    '.antigravity/skills',
    // Local development skills
    './skills'
];

/**
 * Discover all skills in the configured search paths
 * Only loads metadata (Level 1) - doesn't load full body
 */
export async function discoverSkills(
    config: Partial<SkillDiscoveryConfig> = {}
): Promise<SkillRef[]> {
    const searchPaths = config.searchPaths || DEFAULT_SKILL_PATHS;
    const skills: SkillRef[] = [];

    for (const basePath of searchPaths) {
        try {
            // Find all SKILL.md files
            const pattern = join(basePath, '**/SKILL.md');
            const skillFiles = await glob(pattern, {
                absolute: true,
                maxDepth: config.maxDepth || 3
            });

            for (const skillMdPath of skillFiles) {
                try {
                    const metadata = await loadSkillMetadata(skillMdPath);
                    if (metadata) {
                        skills.push({
                            name: metadata.name,
                            description: metadata.description,
                            path: dirname(skillMdPath)
                        });
                    }
                } catch (err) {
                    // Skip invalid skills silently during discovery
                    console.warn(`Warning: Could not load skill at ${skillMdPath}`);
                }
            }
        } catch {
            // Search path doesn't exist, skip silently
        }
    }

    return skills;
}

/**
 * Load only skill metadata from SKILL.md (Level 1 loading)
 */
export async function loadSkillMetadata(
    skillMdPath: string
): Promise<SkillMetadata | null> {
    if (!existsSync(skillMdPath)) {
        return null;
    }

    const content = await readFile(skillMdPath, 'utf-8');
    const { data } = matter(content);

    // Validate required fields
    if (!data.name || !data.description) {
        throw new Error(`Invalid skill: missing required fields (name, description)`);
    }

    return {
        name: data.name,
        description: data.description,
        license: data.license,
        compatibility: data.compatibility,
        metadata: data.metadata,
        allowedTools: data['allowed-tools']
    };
}

/**
 * Load full skill including body content (Level 2 loading)
 */
export async function loadSkill(skillPath: string): Promise<Skill | null> {
    const skillMdPath = skillPath.endsWith('SKILL.md')
        ? skillPath
        : join(skillPath, 'SKILL.md');

    if (!existsSync(skillMdPath)) {
        return null;
    }

    const content = await readFile(skillMdPath, 'utf-8');
    const { data, content: body } = matter(content);

    // Validate required fields
    if (!data.name || !data.description) {
        throw new Error(`Invalid skill at ${skillPath}: missing required fields`);
    }

    return {
        metadata: {
            name: data.name,
            description: data.description,
            license: data.license,
            compatibility: data.compatibility,
            metadata: data.metadata,
            allowedTools: data['allowed-tools']
        },
        body: body.trim(),
        path: dirname(skillMdPath),
        skillMdPath
    };
}

/**
 * Load a referenced file from a skill (Level 3 loading)
 */
export async function loadSkillResource(
    skillPath: string,
    resourcePath: string
): Promise<string | null> {
    const fullPath = join(skillPath, resourcePath);

    if (!existsSync(fullPath)) {
        return null;
    }

    return await readFile(fullPath, 'utf-8');
}

/**
 * List all available resource files in a skill
 */
export async function listSkillResources(skillPath: string): Promise<{
    scripts: string[];
    references: string[];
    assets: string[];
}> {
    const result = {
        scripts: [] as string[],
        references: [] as string[],
        assets: [] as string[]
    };

    // Find scripts
    const scriptsPath = join(skillPath, 'scripts');
    if (existsSync(scriptsPath)) {
        const scripts = await glob('*', { cwd: scriptsPath });
        result.scripts = scripts;
    }

    // Find references
    const referencesPath = join(skillPath, 'references');
    if (existsSync(referencesPath)) {
        const refs = await glob('*.md', { cwd: referencesPath });
        result.references = refs;
    }

    // Find assets
    const assetsPath = join(skillPath, 'assets');
    if (existsSync(assetsPath)) {
        const assets = await glob('*', { cwd: assetsPath });
        result.assets = assets;
    }

    return result;
}

/**
 * Get skill by name from discovered skills
 */
export async function getSkillByName(
    name: string,
    config: Partial<SkillDiscoveryConfig> = {}
): Promise<Skill | null> {
    const skills = await discoverSkills(config);
    const skillRef = skills.find(s => s.name === name);

    if (!skillRef) {
        return null;
    }

    return loadSkill(skillRef.path);
}
