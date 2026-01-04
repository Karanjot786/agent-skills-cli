/**
 * Antigravity Skills - Core Module
 * A complete implementation of the Agent Skills open standard
 */

// Re-export types
export type {
    Skill,
    SkillRef,
    SkillMetadata,
    SkillDiscoveryConfig,
    SkillPromptXML,
    ValidationResult,
    ValidationError,
    ValidationWarning,
    ScriptExecutionOptions,
    ScriptResult
} from '../types/index.js';

// Loader functions
export {
    discoverSkills,
    loadSkill,
    loadSkillMetadata,
    loadSkillResource,
    listSkillResources,
    getSkillByName,
    DEFAULT_SKILL_PATHS
} from './loader.js';

// Validator functions
export {
    validateMetadata,
    validateBody,
    formatValidationResult
} from './validator.js';

// Injector functions
export {
    generateSkillsPromptXML,
    generateSkillActivationPrompt,
    generateSkillSystemInstructions,
    generateFullSkillsContext
} from './injector.js';

// Executor functions
export {
    executeScript,
    isScriptSafe,
    listScripts
} from './executor.js';

// Marketplace functions
export {
    loadConfig,
    saveConfig,
    addMarketplace,
    removeMarketplace,
    listMarketplaceSkills,
    installSkill,
    uninstallSkill,
    checkUpdates,
    searchSkills,
    getInstalledSkills,
    listMarketplaces
} from './marketplace.js';

// SkillsMP API (40k+ skills)
export {
    fetchSkillsMP,
    searchSkillsMP,
    getTopSkills,
    SKILLSMP_SOURCE,
    installFromGitHubUrl
} from './skillsmp.js';
