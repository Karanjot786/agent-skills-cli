/**
 * `skills list` command — List all discovered skills
 */
import type { Command } from "commander";
import chalk from "chalk";
import { getAllAgentDiscoveryPaths } from "../agents.js";
import { DEFAULT_SKILL_PATHS, discoverSkills } from "../../core/index.js";

type ListedSkill = {
	name: string;
	description?: string;
	path: string;
};

export function getListSearchPaths(customPaths?: string[]): string[] {
	if (customPaths && customPaths.length > 0) {
		return customPaths;
	}

	return [...new Set([...DEFAULT_SKILL_PATHS, ...getAllAgentDiscoveryPaths()])];
}

export function formatSkillSourcePath(path: string): string {
	return path;
}

export function getListJsonEntry(skill: ListedSkill) {
	return {
		name: skill.name,
		description: skill.description,
		path: skill.path,
		sourcePath: formatSkillSourcePath(skill.path),
	};
}

export function getListDisplayLines(skill: ListedSkill) {
	return {
		name: skill.name,
		description: skill.description,
		sourcePath: formatSkillSourcePath(skill.path),
	};
}

export function registerListCommand(program: Command) {
	program
		.command("list")
		.description("List all discovered skills")
		.option("-p, --paths <paths...>", "Custom search paths")
		.option("-v, --verbose", "Show detailed information")
		.option("--json", "Output as JSON")
		.option("--table", "Output as ASCII table")
		.option("-q, --quiet", "Output names only (for scripting)")
		.action(async (options) => {
			try {
				const config = { searchPaths: getListSearchPaths(options.paths) };
				const skills = await discoverSkills(config);

				if (skills.length === 0) {
					if (options.json) {
						console.log(JSON.stringify({ skills: [], count: 0 }));
					} else if (!options.quiet) {
						console.log(chalk.yellow("No skills found."));
						console.log(chalk.gray("Skills are searched in:"));
						console.log(chalk.gray("  - ~/.skills/"));
						console.log(chalk.gray("  - ./.skills/"));
						console.log(chalk.gray("  - ~/.gemini/antigravity/skills/"));
						console.log(chalk.gray("  - .agent/skills/"));
						console.log(chalk.gray("  - .antigravity/skills/"));
						console.log(chalk.gray("  - ./skills/"));
					}
					return;
				}

				// JSON output
				if (options.json) {
					console.log(
						JSON.stringify(
							{
								skills: skills.map((s) => getListJsonEntry(s)),
								count: skills.length,
							},
							null,
							2,
						),
					);
					return;
				}

				// Quiet output (names only)
				if (options.quiet) {
					skills.forEach((s) => console.log(s.name));
					return;
				}

				// Table output
				if (options.table) {
					const maxName = Math.max(...skills.map((s) => s.name.length), 4);
					const maxDesc = Math.min(
						Math.max(...skills.map((s) => (s.description || "").length), 11),
						50,
					);
					const maxSource = Math.min(
						Math.max(...skills.map((s) => s.path.length), 6),
						60,
					);

					console.log("");
					console.log(
						chalk.bold(
							"Name".padEnd(maxName + 2) +
								"Description".padEnd(maxDesc + 2) +
								"Source",
						),
					);
					console.log("─".repeat(maxName + 2 + maxDesc + 2 + maxSource));

					for (const skill of skills) {
						const desc = (skill.description || "").slice(0, maxDesc);
						const source = formatSkillSourcePath(skill.path).slice(
							0,
							maxSource,
						);
						console.log(
							chalk.cyan(skill.name.padEnd(maxName + 2)) +
								chalk.gray(desc.padEnd(maxDesc + 2)) +
								chalk.dim(source),
						);
					}
					console.log("");
					return;
				}

				// Default output
				console.log(chalk.bold(`\nFound ${skills.length} skill(s):\n`));

				for (const skill of skills) {
					const display = getListDisplayLines(skill);
					console.log(chalk.cyan(`  ${display.name}`));
					console.log(chalk.gray(`    Source: ${display.sourcePath}`));
					if (options.verbose && display.description) {
						console.log(chalk.gray(`    ${display.description}`));
					}
				}
				console.log("");
			} catch (error) {
				console.error(chalk.red("Error listing skills:"), error);
				process.exit(1);
			}
		});
}
