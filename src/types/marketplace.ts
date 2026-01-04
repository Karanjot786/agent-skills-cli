/**
 * Marketplace Types
 * Types for skill marketplace integration
 */

/**
 * A marketplace source (GitHub repository)
 */
export interface MarketplaceSource {
    /** Unique identifier for the marketplace */
    id: string;

    /** Display name */
    name: string;

    /** GitHub owner (user or org) */
    owner: string;

    /** GitHub repository name */
    repo: string;

    /** Branch to use (default: main) */
    branch?: string;

    /** Path to skills directory within repo */
    skillsPath?: string;

    /** Optional description */
    description?: string;

    /** Whether this is an official/verified source */
    verified?: boolean;
}

/**
 * A skill available in a marketplace
 */
export interface MarketplaceSkill {
    /** Skill name */
    name: string;

    /** Skill description */
    description: string;

    /** Path within the marketplace repo */
    path: string;

    /** Source marketplace */
    source: MarketplaceSource;

    /** License if known */
    license?: string;

    /** Author if known */
    author?: string;

    /** Version if known */
    version?: string;

    /** Tags/categories */
    tags?: string[];
}

/**
 * Installed skill metadata (tracks source)
 */
export interface InstalledSkill {
    /** Skill name */
    name: string;

    /** Local installation path */
    localPath: string;

    /** Source marketplace (if installed from marketplace) */
    source?: MarketplaceSource;

    /** Remote path in marketplace */
    remotePath?: string;

    /** Installed version */
    version?: string;

    /** Installation timestamp */
    installedAt: string;

    /** Last update check */
    lastChecked?: string;
}

/**
 * Marketplace configuration
 */
export interface MarketplaceConfig {
    /** Registered marketplace sources */
    sources: MarketplaceSource[];

    /** Installed skills tracking */
    installed: InstalledSkill[];

    /** Default installation directory */
    installDir: string;
}

/**
 * Default marketplace sources
 */
export const DEFAULT_MARKETPLACES: MarketplaceSource[] = [
    {
        id: 'anthropic-skills',
        name: 'Anthropic Official Skills',
        owner: 'anthropics',
        repo: 'skills',
        branch: 'main',
        skillsPath: 'skills',
        description: 'Official Agent Skills from Anthropic',
        verified: true
    }
];
