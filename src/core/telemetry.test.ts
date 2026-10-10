import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { trackSearch, trackCommand, setVersion } from './telemetry.js';

describe('telemetry', () => {
    afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('posts to the www endpoint and never sends search text or command args', () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'error').mockImplementation(() => { });
        vi.stubEnv('HOME', mkdtempSync(join(tmpdir(), 'tel-')));
        for (const k of ['CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'CIRCLECI', 'TRAVIS', 'BUILDKITE', 'JENKINS_URL', 'TEAMCITY_VERSION', 'DISABLE_TELEMETRY', 'DO_NOT_TRACK']) vi.stubEnv(k, '');
        setVersion('1.2.0');
        trackSearch(7);
        trackCommand('install');
        const urls = fetchMock.mock.calls.map(([u]) => new URL(u));
        expect(urls.map((u) => u.origin + u.pathname)).toEqual(Array(2).fill('https://www.agentskills.in/api/telemetry'));
        for (const u of urls) { expect(u.searchParams.has('query')).toBe(false); expect(u.searchParams.has('args')).toBe(false); }
        expect(urls[0].searchParams.get('resultCount')).toBe('7');
    });
});
