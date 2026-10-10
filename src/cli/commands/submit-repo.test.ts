import { describe, it, expect } from 'vitest';
import { parseRepoArg } from './submit-repo.js';

describe('submit-repo', () => {
    it('parses owner/repo from slugs and GitHub URLs', () => {
        expect(parseRepoArg('anthropics/skills')).toBe('anthropics/skills');
        expect(parseRepoArg('https://github.com/anthropics/skills.git')).toBe('anthropics/skills');
        expect(parseRepoArg('https://www.github.com/a/b/')).toBe('a/b');
        expect(parseRepoArg('not-a-repo')).toBeNull();
    });
});
