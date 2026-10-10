/**
 * Telemetry module for Agent Skills CLI
 * Based on vercel-labs/skills implementation
 * 
 * Opt-out: Set DISABLE_TELEMETRY=1 or DO_NOT_TRACK=1
 * Automatically disabled in CI environments
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const TELEMETRY_URL = 'https://www.agentskills.in/api/telemetry';

// Telemetry event types
interface InstallTelemetryData {
    event: 'install';
    skill: string;
    agent: string;
    global?: '1';
}

interface SearchTelemetryData {
    event: 'search';
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

/** Print a one-time disclosure (stderr). Marker lives in ~/.skills. */
function showNoticeOnce(): void {
    try {
        const dir = join(homedir(), '.skills');
        const flag = join(dir, '.telemetry-notice');
        if (existsSync(flag)) return;
        mkdirSync(dir, { recursive: true });
        writeFileSync(flag, '1');
        console.error('agent-skills-cli sends anonymous usage counts (event name, skill name, agent, CLI version). No search text, paths, or IP is stored. Opt out: DISABLE_TELEMETRY=1 or DO_NOT_TRACK=1.');
    } catch { /* never break the CLI */ }
}

/**
 * Track a telemetry event
 * Fire-and-forget - never blocks or throws. CI never sends.
 */
export function track(data: TelemetryData): void {
    if (!isEnabled() || isCI()) return;
    showNoticeOnce();

    try {
        const params = new URLSearchParams();

        // Add version
        if (cliVersion) {
            params.set('v', cliVersion);
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

export function trackInstall(skill: string, agent: string, isGlobal: boolean): void {
    track({ event: 'install', skill, agent, global: isGlobal ? '1' : undefined });
}

export function trackSearch(resultCount: number): void {
    track({ event: 'search', resultCount: String(resultCount) });
}

export function trackCommand(command: string): void {
    track({ event: 'command', command });
}
