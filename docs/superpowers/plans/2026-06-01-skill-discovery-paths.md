# Skill Discovery Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `skills list` discover skills installed in canonical `.skills` storage as well as existing agent-specific skill directories.

**Architecture:** Centralize discovery roots in `src/core/loader.ts`, include both canonical and agent-specific locations, and deduplicate discovered skills by name so a single installed skill is only listed once even if it exists in multiple synced locations. Keep `--paths` as an override for callers that want explicit discovery.

**Tech Stack:** TypeScript, Vitest, Node.js filesystem APIs, existing glob/gray-matter loader.

---

## Implementation Tasks

### Task 1: Add regression tests for default discovery roots and deduplication

**Files:**
- Create: `src/core/loader.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { DEFAULT_SKILL_PATHS, discoverSkills } from './loader.js';

const skillMd = `---
name: demo-skill
description: Demo skill
---

# Demo skill
`;

describe('skill discovery paths', () => {
  it('includes canonical .skills directories in the default search paths', () => {
    const home = process.env.HOME || '';
    const cwd = process.cwd();

    expect(DEFAULT_SKILL_PATHS).toContain(join(home, '.skills'));
    expect(DEFAULT_SKILL_PATHS).toContain(join(cwd, '.skills'));
  });

  it('deduplicates the same skill found in multiple search roots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skills-loader-'));
    const canonical = join(root, 'home', '.skills', 'demo-skill');
    const agentDir = join(root, 'repo', '.agent', 'skills', 'demo-skill');

    await mkdir(canonical, { recursive: true });
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(canonical, 'SKILL.md'), skillMd);
    await writeFile(join(agentDir, 'SKILL.md'), skillMd);

    const skills = await discoverSkills({
      searchPaths: [join(root, 'home', '.skills'), join(root, 'repo', '.agent', 'skills')],
      maxDepth: 3,
    });

    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe('demo-skill');
    expect(skills[0]?.path).toBe(canonical);

    await rm(root, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run the test file and confirm it fails**

Run: `npm test -- src/core/loader.test.ts`
Expected: FAIL because `DEFAULT_SKILL_PATHS` does not yet include `~/.skills` / `./.skills` and discovery still returns duplicates.

- [ ] **Step 3: Keep the tests as the contract for the fix**

No production code yet; proceed only after the red run is observed.

### Task 2: Implement unified discovery roots in the loader

**Files:**
- Modify: `src/core/loader.ts`
- Modify: `src/core/index.ts` if any exports need to change

- [ ] **Step 1: Add a shared default-root builder and dedupe discovered skills by name**

```ts
import { homedir } from 'os';
import { glob } from 'glob';
import matter from 'gray-matter';
import { readFile } from 'fs/promises';
import { dirname, join, basename } from 'path';
import { existsSync } from 'fs';
import type {
    Skill,
    SkillRef,
    SkillMetadata,
    SkillDiscoveryConfig
} from '../types/index.js';

export function getDefaultSkillPaths(cwd: string = process.cwd(), home: string = homedir()): string[] {
    return [
        join(home, '.skills'),
        join(cwd, '.skills'),
        join(home, '.antigravity', 'skills'),
        '.antigravity/skills',
        './skills',
    ];
}

export const DEFAULT_SKILL_PATHS = getDefaultSkillPaths();

export async function discoverSkills(
    config: Partial<SkillDiscoveryConfig> = {}
): Promise<SkillRef[]> {
    const searchPaths = config.searchPaths || DEFAULT_SKILL_PATHS;
    const skills: SkillRef[] = [];
    const seen = new Set<string>();

    for (const basePath of searchPaths) {
        try {
            const pattern = join(basePath, '**/SKILL.md');
            const skillFiles = await glob(pattern, {
                absolute: true,
                maxDepth: config.maxDepth || 3
            });

            for (const skillMdPath of skillFiles) {
                try {
                    const metadata = await loadSkillMetadata(skillMdPath);
                    if (!metadata || seen.has(metadata.name)) continue;
                    seen.add(metadata.name);
                    skills.push({
                        name: metadata.name,
                        description: metadata.description,
                        path: dirname(skillMdPath)
                    });
                } catch {
                    console.warn(`Warning: Could not load skill at ${skillMdPath}`);
                }
            }
        } catch {
            // Search path doesn't exist, skip silently
        }
    }

    return skills;
}
```

- [ ] **Step 2: Export the new helper if callers or tests need it**

```ts
export {
    discoverSkills,
    loadSkill,
    loadSkillMetadata,
    loadSkillResource,
    listSkillResources,
    getSkillByName,
    DEFAULT_SKILL_PATHS,
    getDefaultSkillPaths
} from './loader.js';
```

- [ ] **Step 3: Run the loader test file again and confirm it passes**

Run: `npm test -- src/core/loader.test.ts`
Expected: PASS with one discovered skill and canonical paths present in the default roots.

### Task 3: Run project verification

**Files:**
- No code changes

- [ ] **Step 1: Run TypeScript build**

Run: `npm run build`
Expected: exit 0

- [ ] **Step 2: Run a focused regression check for `skills list` behavior**

Run: `npm test -- src/core/loader.test.ts`
Expected: PASS

- [ ] **Step 3: Commit the fix**

```bash
git add src/core/loader.test.ts src/core/loader.ts src/core/index.ts
git commit -m "fix: discover canonical installed skills"
```
