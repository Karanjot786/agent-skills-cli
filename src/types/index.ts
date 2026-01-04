/**
 * Agent Skills Type Definitions
 * Based on the open Agent Skills specification (agentskills.io)
 */

/**
 * Skill metadata extracted from YAML frontmatter
 */
export interface SkillMetadata {
    /** Unique skill identifier (lowercase, hyphens only, 1-64 chars) */
    name: string;

    /** Description of what the skill does and when to use it (1-1024 chars) */
    description: string;

    /** Optional license information */
    license?: string;

    /** Optional compatibility requirements */
    compatibility?: string;

    /** Optional custom key-value metadata */
    metadata?: Record<string, string>;

    /** Optional space-delimited list of allowed tools */
    allowedTools?: string;
}

/**
 * Full skill representation including content and path
 */
export interface Skill {
    /** Skill metadata from frontmatter */
    metadata: SkillMetadata;

    /** Full markdown body content (instructions) */
    body: string;

    /** Absolute path to the skill directory */
    path: string;

    /** Path to SKILL.md file */
    skillMdPath: string;
}

/**
 * Lightweight skill reference for discovery/indexing
 */
export interface SkillRef {
    name: string;
    description: string;
    path: string;
}

/**
 * Validation result for a skill
 */
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

export interface ValidationError {
    field: string;
    message: string;
    value?: unknown;
}

export interface ValidationWarning {
    field: string;
    message: string;
    value?: unknown;
}

/**
 * Configuration for skill discovery
 */
export interface SkillDiscoveryConfig {
    /** Directories to search for skills */
    searchPaths: string[];

    /** Whether to search recursively (default: true) */
    recursive?: boolean;

    /** Maximum depth for recursive search (default: 3) */
    maxDepth?: number;
}

/**
 * XML prompt format for system prompt injection
 */
export interface SkillPromptXML {
    /** The XML string to inject into system prompt */
    xml: string;

    /** Number of skills included */
    skillCount: number;

    /** Estimated token count */
    estimatedTokens: number;
}

/**
 * Script execution options
 */
export interface ScriptExecutionOptions {
    /** Working directory for script execution */
    cwd?: string;

    /** Environment variables */
    env?: Record<string, string>;

    /** Timeout in milliseconds */
    timeout?: number;

    /** Whether to capture output */
    captureOutput?: boolean;
}

/**
 * Script execution result
 */
export interface ScriptResult {
    success: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
    executionTime: number;
}

// Re-export marketplace types
export type {
    MarketplaceSource,
    MarketplaceSkill,
    InstalledSkill,
    MarketplaceConfig
} from './marketplace.js';

export { DEFAULT_MARKETPLACES } from './marketplace.js';
