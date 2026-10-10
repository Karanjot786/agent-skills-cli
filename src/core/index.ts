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

// Source parser (GitHub, GitLab, Bitbucket, SSH, npm, local paths, direct URLs)
export {
    parseSource,
    getOwnerRepo,
    getSourceTypeDisplay
} from './source-parser.js';

export type { ParsedSource } from './source-parser.js';

// Git authentication (private repos, SSH, tokens)
export {
    detectGitHost,
    resolveGitAuth,
    buildAuthenticatedUrl,
    sshToHttps,
    normalizeGitUrl,
    cloneWithAuth,
    sanitizeUrl,
} from './git-auth.js';

export type { GitHost, GitAuthResult, CloneOptions } from './git-auth.js';

// Installer (symlink-based installation)
export {
    getCanonicalSkillsDir,
    getCanonicalPath,
    getAgentSkillPath,
    isSymlink,
    installSkillWithSymlinks,
    removeSkillInstallation,
    getSkillInstallMethod
} from './installer.js';

export type {
    AgentConfig,
    InstallOptions,
    InstalledSkillInfo
} from './installer.js';

// Skill Lock (installation tracking)
export {
    getLockFilePath,
    readLock,
    writeLock,
    addSkillToLock,
    removeSkillFromLock,
    getSkillFromLock,
    listInstalledSkills,
    isSkillInstalled,
    getInstalledSkillCount,
    updateSkillVersion,
    updateSkillAgents,
    createLockEntry,
    lockKey
} from './skill-lock.js';

export type {
    SourceType,
    LockEntry,
    SkillsLock,
    ListOptions,
    ItemType,
    ConfigTarget
} from './skill-lock.js';

export { hashText } from './integrity.js';

// Suggest engine (project-aware recommendations)
export {
    analyzeProject,
    buildSearchKeywords,
    scoreSkill,
} from './suggest.js';

export type {
    ProjectAnalysis,
    SuggestedSkill,
    SuggestOptions,
} from './suggest.js';

// Audit engine (security scanning)
export {
    runAudit,
    shouldFail,
    toSARIF,
    scanContent,
    scanInstallSpec,
    SEVERITY_ORDER,
} from './audit.js';

export type {
    AuditOptions,
} from './audit.js';

// Scanner rules (security rule definitions)
export {
    SCANNER_RULES,
    getRulesByCategory,
    getRuleById,
    getCategories,
    createEmptyScanResult,
} from './scanner-rules.js';

export type {
    ScannerRule,
    ScanFinding,
    ScanResult,
    Severity,
} from './scanner-rules.js';

// .skillsrc configuration file support
export {
    loadSkillsRC,
    getSourcesByType,
    getRegistryForScope,
    getAuthEnvVar,
} from './skillsrc.js';

export type {
    SkillsRC,
    SkillsRCSource,
    SkillsRCDefaults,
} from './skillsrc.js';

// Quality scoring (4-dimension skill assessment)
export {
    assessQuality,
    formatScoreBar,
    getScoreColor,
} from './quality.js';

export type {
    QualityScore,
    ScoreDetail,
} from './quality.js';

// Conflict Detector (v1.1.4)
export {
    detectConflicts,
} from './conflict-detector.js';

export type {
    Conflict,
    Overlap,
    ConflictResult,
} from './conflict-detector.js';

// Context Budget Manager (v1.1.4)
export {
    buildContextPlan,
    formatContextXML,
    formatContextJSON,
} from './context-budget.js';

export type {
    SkillWithRelevance,
    ContextPlan,
    ContextOptions,
} from './context-budget.js';

// Skill Differ (v1.1.4)
export {
    diffSkills,
} from './differ.js';

export type {
    SectionDiff,
    DiffResult,
} from './differ.js';

// Skill Composer (v1.1.4)
export {
    composeSkills,
} from './composer.js';

export type {
    ComposeStrategy,
    ComposeOptions,
    ComposedSkill,
} from './composer.js';

// Skill Tester (v1.1.4)
export {
    testSkill,
    testSkills,
} from './skill-tester.js';

export type {
    SkillTest,
    TestResult,
    AssertionResult,
} from './skill-tester.js';

// Skill Splitter (v1.1.4)
export {
    splitSkill,
} from './splitter.js';

export type {
    SplitSkill,
    SplitResult,
} from './splitter.js';

