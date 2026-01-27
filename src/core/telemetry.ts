/**
 * Telemetry module for Agent Skills CLI
 * Based on vercel-labs/skills implementation
 * 
 * Opt-out: Set DISABLE_TELEMETRY=1 or DO_NOT_TRACK=1
 * Automatically disabled in CI environments
 */

const TELEMETRY_URL = 'https://agentskills.in/api/telemetry';

// Telemetry event types
interface InstallTelemetryData {
    event: 'install';
    skill: string;
    agent: string;
    global?: '1';
    source?: string;
}

interface SearchTelemetryData {
    event: 'search';
    query: string;
    resultCount: string;
}

interface CheckTelemetryData {
    event: 'check';
    skillCount: string;
    updatesAvailable: string;
}

interface UpdateTelemetryData {
    event: 'update';
    skillCount: string;
    successCount: string;
    failCount: string;
}

interface CommandTelemetryData {
    event: 'command';
    command: string;
    args?: string;
}

type TelemetryData =
    | InstallTelemetryData
    | SearchTelemetryData
    | CheckTelemetryData
    | UpdateTelemetryData
    | CommandTelemetryData;

let cliVersion: string | null = null;

/**
 * Check if running in a CI environment
 */
function isCI(): boolean {
    return !!(
        process.env.CI ||
        process.env.GITHUB_ACTIONS ||
        process.env.GITLAB_CI ||
        process.env.CIRCLECI ||
        process.env.TRAVIS ||
        process.env.BUILDKITE ||
        process.env.JENKINS_URL ||
        process.env.TEAMCITY_VERSION
    );
}

/**
 * Check if telemetry is enabled
 * Respects DISABLE_TELEMETRY and DO_NOT_TRACK env vars
 */
function isEnabled(): boolean {
    return !process.env.DISABLE_TELEMETRY && !process.env.DO_NOT_TRACK;
}

/**
 * Set the CLI version for telemetry tracking
 */
export function setVersion(version: string): void {
    cliVersion = version;
}

/**
 * Track a telemetry event
 * Fire-and-forget - never blocks or throws
 */
export function track(data: TelemetryData): void {
    if (!isEnabled()) return;

    try {
        const params = new URLSearchParams();

        // Add version
        if (cliVersion) {
            params.set('v', cliVersion);
        }

        // Add CI flag if running in CI
        if (isCI()) {
            params.set('ci', '1');
        }

        // Add event data
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined && value !== null) {
                params.set(key, String(value));
            }
        }

        // Fire and forget - don't await, silently ignore errors
        fetch(`${TELEMETRY_URL}?${params.toString()}`).catch(() => { });
    } catch {
        // Silently fail - telemetry should never break the CLI
    }
}

/**
 * Track skill installation
 */
export function trackInstall(skill: string, agent: string, isGlobal: boolean, source?: string): void {
    track({
        event: 'install',
        skill,
        agent,
        global: isGlobal ? '1' : undefined,
        source,
    });
}

/**
 * Track search query
 */
export function trackSearch(query: string, resultCount: number): void {
    track({
        event: 'search',
        query,
        resultCount: String(resultCount),
    });
}

/**
 * Track command usage
 */
export function trackCommand(command: string, args?: string): void {
    track({
        event: 'command',
        command,
        args,
    });
}
