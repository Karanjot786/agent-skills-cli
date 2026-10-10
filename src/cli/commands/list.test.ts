import { describe, expect, it } from "vitest";
import { homedir } from "os";
import { join } from "path";
import {
	getListDisplayLines,
	getListJsonEntry,
	getListSearchPaths,
} from "./list.js";

describe("list command search paths", () => {
	it("includes canonical and agent global skill directories by default", () => {
		const paths = getListSearchPaths();

		expect(paths).toContain(join(homedir(), ".skills"));
		expect(paths).toContain(join(homedir(), ".claude", "skills"));
		expect(paths).toContain(
			join(homedir(), ".gemini", "antigravity", "skills"),
		);
	});

	it("includes legacy agent discovery roots by default", () => {
		const paths = getListSearchPaths();

		expect(paths).toContain(join(homedir(), ".agents"));
	});

	it("includes the source path in JSON entries", () => {
		const entry = getListJsonEntry({
			name: "demo-skill",
			description: "Demo skill",
			path: "/tmp/demo-skill",
		});

		expect(entry.sourcePath).toBe("/tmp/demo-skill");
		expect(entry.path).toBe("/tmp/demo-skill");
	});

	it("includes the source path in default display lines", () => {
		const lines = getListDisplayLines({
			name: "demo-skill",
			description: "Demo skill",
			path: "/tmp/demo-skill",
		});

		expect(lines.sourcePath).toBe("/tmp/demo-skill");
		expect(lines.description).toBe("Demo skill");
	});
});
