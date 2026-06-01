import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { DEFAULT_SKILL_PATHS, discoverSkills } from "./loader.js";

const skillMd = `---
name: demo-skill
description: Demo skill
---

# Demo skill
`;

describe("skill discovery paths", () => {
	it("includes canonical .skills directories in the default search paths", () => {
		const home = process.env.HOME || "";
		const cwd = process.cwd();

		expect(DEFAULT_SKILL_PATHS).toContain(join(home, ".skills"));
		expect(DEFAULT_SKILL_PATHS).toContain(join(cwd, ".skills"));
	});

	it("deduplicates the same skill found in multiple search roots", async () => {
		const root = await mkdtemp(join(tmpdir(), "skills-loader-"));
		const canonical = join(root, "canonical", "demo-skill");
		const agentDir = join(root, "agent", "demo-skill");

		await mkdir(canonical, { recursive: true });
		await mkdir(agentDir, { recursive: true });
		await writeFile(join(canonical, "SKILL.md"), skillMd);
		await writeFile(join(agentDir, "SKILL.md"), skillMd);

		const skills = await discoverSkills({
			searchPaths: [join(root, "canonical"), join(root, "agent")],
			maxDepth: 3,
		});

		expect(skills).toHaveLength(1);
		expect(skills[0]?.name).toBe("demo-skill");
		expect(skills[0]?.path).toBe(canonical);

		await rm(root, { recursive: true, force: true });
	});
});
