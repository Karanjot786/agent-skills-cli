import { describe, it, expect } from 'vitest';
import { detectItem, fetchItem, parseItem, isItemSlug } from '../src/core/items-api.js';

function fakeFetch(routes: Record<string, { status: number; body?: unknown }>) {
    const calls: string[] = [];
    const impl = (async (url: string) => {
        calls.push(url);
        const r = routes[url] ?? { status: 404, body: { error: 'not found' } };
        return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    return { impl, calls };
}
const base = 'https://www.agentskills.in/api/items';

describe('items api', () => {
    it('recognises bare slugs only', () => {
        expect(isItemSlug('github--github-mcp-server')).toBe(true);
        expect(isItemSlug('io.github.acme--weather')).toBe(true);
        for (const s of ['owner/repo', '@a/b', 'https://x.dev']) expect(isItemSlug(s)).toBe(false);
    });
    it('detects type in order mcp → agent → plugin and parses string install_json', async () => {
        const { impl, calls } = fakeFetch({
            [`${base}/agent/acme--reviewer`]: { status: 200, body: { type: 'agent', slug: 'acme--reviewer', name: 'reviewer', description: 'd', install_json: JSON.stringify({ type: 'agent', file: 'agents/reviewer.md', rawUrl: 'https://raw.githubusercontent.com/acme/x/main/agents/reviewer.md' }) } },
        });
        const item = await detectItem('acme--reviewer', undefined, impl);
        expect(item?.type).toBe('agent');
        expect(item?.install).toMatchObject({ file: 'agents/reviewer.md' });
        expect(calls).toEqual([`${base}/mcp/acme--reviewer`, `${base}/agent/acme--reviewer`]);
    });
    it('explicit type probes only that type', async () => {
        const { impl, calls } = fakeFetch({});
        expect(await detectItem('x', 'plugin', impl)).toBeNull();
        expect(calls).toEqual([`${base}/plugin/x`]);
    });
    it('throws on server errors instead of reporting "not found"', async () => {
        const { impl } = fakeFetch({ [`${base}/mcp/x`]: { status: 500 } });
        await expect(fetchItem('mcp', 'x', impl)).rejects.toThrow(/500/);
    });
    it('validates install_json per type', () => {
        expect(() => parseItem('mcp', 's', { name: 'n', install_json: { type: 'agent' } })).toThrow(/install_json/);
        expect(() => parseItem('mcp', 's', { name: 'n', install_json: { type: 'mcp', transport: 'ws' } })).toThrow(/transport/);
        expect(() => parseItem('agent', 's', { name: 'n', install_json: { type: 'agent', file: 'a.md', rawUrl: 'http://x/a.md' } })).toThrow(/https/);
        expect(() => parseItem('plugin', 's', { name: 'n', install_json: { type: 'plugin', marketplace: 'not a repo', plugin: 'p' } })).toThrow(/marketplace/);
        expect(parseItem('plugin', 's', { name: 'n', install_json: { type: 'plugin', marketplace: 'acme/plugins', plugin: 'fmt' } }).install).toEqual({ type: 'plugin', marketplace: 'acme/plugins', plugin: 'fmt' });
        // the site API (E8) names the field `install`
        expect(parseItem('mcp', 's', { name: 'n', install: { type: 'mcp', transport: 'http', url: 'https://x.dev/mcp' } }).install).toMatchObject({ transport: 'http' });
    });
});
