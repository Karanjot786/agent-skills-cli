import { describe, it, expect, vi, afterEach } from 'vitest';
import { getSkillByScoped } from '../src/core/skillsdb.js';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const row = (name: string) => ({ id: '1', name, author: 'someone', scopedName: `@someone/${name}`, description: '', stars: 1 });

afterEach(() => vi.unstubAllGlobals());

describe('getSkillByScoped exact mode', () => {
    it('exact: does not fall back to the first fuzzy result', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) =>
            json({ skills: String(url).includes('search=') ? [row('github-helper')] : [], total: 1 })));
        expect(await getSkillByScoped('github--github-mcp-server', { exact: true })).toBeNull();
    });
    it('exact: still returns an exact-name hit', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => json({ skills: [row('pdf')], total: 1 })));
        expect((await getSkillByScoped('pdf', { exact: true }))?.name).toBe('pdf');
    });
});
