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

// Skills Database API (our Supabase backend - primary source)
export {
    fetchFromDB,
    getSkillByScoped,
    searchSkillsDB,
    getSkillsByAuthor,
    parseScopedName,
    fetchSkillsForCLI,
    searchSkillsForCLI,
    installFromGitHubUrl
} from './skillsdb.js';

export type {
    DBSkill,
    Asset,
    SkillsDBResult,
    FetchOptions,
    MarketplaceCompatibleSkill,
    MarketplaceFetchResult
} from './skillsdb.js';

// On-demand asset fetching
export {
    getSkillBaseUrl,
    getAssetUrl,
    parseRawUrl,
    fetchAssetManifest,
    listAssetsFromGitHub,
    fetchAsset,
    fetchAssetBinary,
    getSkillAssets,
    getAssetUrlFromEntry
} from './assets.js';

export type {
    AssetEntry,
    AssetFile
} from './assets.js';

// Telemetry (anonymous usage tracking with opt-out)
export {
    track,
    trackInstall,
    trackSearch,
    trackCommand,
    setVersion
} from './telemetry.js';

// Source parser (GitHub, GitLab, local paths, direct URLs)
export {
    parseSource,
    getOwnerRepo,
    getSourceTypeDisplay
} from './source-parser.js';

export type { ParsedSource } from './source-parser.js';
