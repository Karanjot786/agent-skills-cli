import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { assertRef, gitClone } from '../src/core/safe-exec.js';

describe('assertRef', () => {
    it('accepts branch, tag and commit names', () => {
        for (const ref of ['main', 'v1.2.0', 'feature/x', 'a1b2c3d4e5f6']) expect(assertRef(ref)).toBe(ref);
    });

    it('rejects option-like and shell-like refs', () => {
        for (const ref of ['-x', '--upload-pack=x', 'a;b', '$(id)', 'a b', '`id`']) expect(() => assertRef(ref)).toThrow();
    });
});

describe('gitClone', () => {
    it('never runs shell or git-option payloads hidden in a repo URL', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'safe-exec-'));
        const marker = join(dir, 'pwned');
        try {
            for (const url of [
                `https://example.invalid/r.git; touch ${marker}`,
                `https://example.invalid/r.git$(touch ${marker})`,
                `--upload-pack=touch ${marker}`,
            ]) {
                await gitClone(url, join(dir, 'out'), { depth: 1, timeout: 15000 }).catch(() => { });
            }
            expect(existsSync(marker)).toBe(false);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    }, 60000);
});
