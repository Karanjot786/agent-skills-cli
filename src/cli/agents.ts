/**
 * Shared agent configuration used across CLI commands.
 */
import { homedir } from "os";

const home = homedir();

export interface AgentConfig {
	name: string;
	displayName: string;
	projectDir: string;
	globalDir: string;
	discoveryDirs?: string[];
}

export const AGENTS: Record<string, AgentConfig> = {
	cursor: {
		name: "cursor",
		displayName: "Cursor",
		projectDir: ".cursor/skills",
		globalDir: `${home}/.cursor/skills`,
	},
	claude: {
		name: "claude",
		displayName: "Claude Code",
		projectDir: ".claude/skills",
		globalDir: `${home}/.claude/skills`,
	},
	copilot: {
		name: "copilot",
		displayName: "GitHub Copilot",
		projectDir: ".github/skills",
		globalDir: `${home}/.github/skills`,
	},
	codex: {
		name: "codex",
		displayName: "Codex",
		projectDir: ".codex/skills",
		globalDir: `${home}/.codex/skills`,
	},
	antigravity: {
		name: "antigravity",
		displayName: "Antigravity",
		projectDir: ".agent/skills",
		globalDir: `${home}/.gemini/antigravity/skills`,
	},
	// New agents from add-skill
	opencode: {
		name: "opencode",
		displayName: "OpenCode",
		projectDir: ".opencode/skill",
		globalDir: `${home}/.config/opencode/skill`,
	},
	amp: {
		name: "amp",
		displayName: "Amp",
		projectDir: ".agents/skills",
		globalDir: `${home}/.config/agents/skills`,
		discoveryDirs: [`${home}/.agents`],
	},
	kilo: {
		name: "kilo",
		displayName: "Kilo Code",
		projectDir: ".kilocode/skills",
		globalDir: `${home}/.kilocode/skills`,
	},
	roo: {
		name: "roo",
		displayName: "Roo Code",
		projectDir: ".roo/skills",
		globalDir: `${home}/.roo/skills`,
	},
	goose: {
		name: "goose",
		displayName: "Goose",
		projectDir: ".goose/skills",
		globalDir: `${home}/.config/goose/skills`,
	},
	// New agents from vercel-labs/skills (19 additional)
	cline: {
		name: "cline",
		displayName: "Cline",
		projectDir: ".cline/skills",
		globalDir: `${home}/.cline/skills`,
	},
	codebuddy: {
		name: "codebuddy",
		displayName: "CodeBuddy",
		projectDir: ".codebuddy/skills",
		globalDir: `${home}/.codebuddy/skills`,
	},
	"command-code": {
		name: "command-code",
		displayName: "Command Code",
		projectDir: ".commandcode/skills",
		globalDir: `${home}/.commandcode/skills`,
	},
	continue: {
		name: "continue",
		displayName: "Continue",
		projectDir: ".continue/skills",
		globalDir: `${home}/.continue/skills`,
	},
	crush: {
		name: "crush",
		displayName: "Crush",
		projectDir: ".crush/skills",
		globalDir: `${home}/.config/crush/skills`,
	},
	clawdbot: {
		name: "clawdbot",
		displayName: "Clawdbot",
		projectDir: "skills",
		globalDir: `${home}/.clawdbot/skills`,
	},
	droid: {
		name: "droid",
		displayName: "Droid",
		projectDir: ".factory/skills",
		globalDir: `${home}/.factory/skills`,
	},
	"gemini-cli": {
		name: "gemini-cli",
		displayName: "Gemini CLI",
		projectDir: ".gemini/skills",
		globalDir: `${home}/.gemini/skills`,
	},
	"kiro-cli": {
		name: "kiro-cli",
		displayName: "Kiro CLI",
		projectDir: ".kiro/skills",
		globalDir: `${home}/.kiro/skills`,
	},
	mcpjam: {
		name: "mcpjam",
		displayName: "MCPJam",
		projectDir: ".mcpjam/skills",
		globalDir: `${home}/.mcpjam/skills`,
	},
	mux: {
		name: "mux",
		displayName: "Mux",
		projectDir: ".mux/skills",
		globalDir: `${home}/.mux/skills`,
	},
	openhands: {
		name: "openhands",
		displayName: "OpenHands",
		projectDir: ".openhands/skills",
		globalDir: `${home}/.openhands/skills`,
	},
	pi: {
		name: "pi",
		displayName: "Pi",
		projectDir: ".pi/skills",
		globalDir: `${home}/.pi/agent/skills`,
	},
	qoder: {
		name: "qoder",
		displayName: "Qoder",
		projectDir: ".qoder/skills",
		globalDir: `${home}/.qoder/skills`,
	},
	"qwen-code": {
		name: "qwen-code",
		displayName: "Qwen Code",
		projectDir: ".qwen/skills",
		globalDir: `${home}/.qwen/skills`,
	},
	trae: {
		name: "trae",
		displayName: "Trae",
		projectDir: ".trae/skills",
		globalDir: `${home}/.trae/skills`,
	},
	windsurf: {
		name: "windsurf",
		displayName: "Windsurf",
		projectDir: ".windsurf/skills",
		globalDir: `${home}/.codeium/windsurf/skills`,
	},
	zencoder: {
		name: "zencoder",
		displayName: "Zencoder",
		projectDir: ".zencoder/skills",
		globalDir: `${home}/.zencoder/skills`,
	},
	neovate: {
		name: "neovate",
		displayName: "Neovate",
		projectDir: ".neovate/skills",
		globalDir: `${home}/.neovate/skills`,
	},
	// Additional agents from Vercel Skills (13 more = 42 total)
	ara: {
		name: "ara",
		displayName: "Ara",
		projectDir: ".ara/skills",
		globalDir: `${home}/.ara/skills`,
	},
	aide: {
		name: "aide",
		displayName: "Aide",
		projectDir: ".aide/skills",
		globalDir: `${home}/.aide/skills`,
	},
	alex: {
		name: "alex",
		displayName: "Alex",
		projectDir: ".alex/skills",
		globalDir: `${home}/.alex/skills`,
	},
	bb: {
		name: "bb",
		displayName: "BB",
		projectDir: ".bb/skills",
		globalDir: `${home}/.bb/skills`,
	},
	codestory: {
		name: "codestory",
		displayName: "CodeStory",
		projectDir: ".codestory/skills",
		globalDir: `${home}/.codestory/skills`,
	},
	"helix-ai": {
		name: "helix-ai",
		displayName: "Helix AI",
		projectDir: ".helix/skills",
		globalDir: `${home}/.helix/skills`,
	},
	meekia: {
		name: "meekia",
		displayName: "Meekia",
		projectDir: ".meekia/skills",
		globalDir: `${home}/.meekia/skills`,
	},
	"pear-ai": {
		name: "pear-ai",
		displayName: "Pear AI",
		projectDir: ".pearai/skills",
		globalDir: `${home}/.pearai/skills`,
	},
	adal: {
		name: "adal",
		displayName: "Adal",
		projectDir: ".adal/skills",
		globalDir: `${home}/.adal/skills`,
	},
	pochi: {
		name: "pochi",
		displayName: "Pochi",
		projectDir: ".pochi/skills",
		globalDir: `${home}/.pochi/skills`,
	},
	"sourcegraph-cody": {
		name: "sourcegraph-cody",
		displayName: "Sourcegraph Cody",
		projectDir: ".sourcegraph/skills",
		globalDir: `${home}/.sourcegraph/skills`,
	},
	"void-ai": {
		name: "void-ai",
		displayName: "Void AI",
		projectDir: ".void/skills",
		globalDir: `${home}/.void/skills`,
	},
	zed: {
		name: "zed",
		displayName: "Zed",
		projectDir: ".zed/skills",
		globalDir: `${home}/.zed/skills`,
	},
	// v1.1.7 — New agents from competitor feature requests
	lingma: {
		name: "lingma",
		displayName: "Lingma",
		projectDir: ".lingma/skills",
		globalDir: `${home}/.lingma/skills`,
	},
	"deep-agents": {
		name: "deep-agents",
		displayName: "Deep Agents",
		projectDir: ".deepagents/skills",
		globalDir: `${home}/.deepagents/agent/skills`,
	},
	ruler: {
		name: "ruler",
		displayName: "Ruler",
		projectDir: ".ruler/skills",
		globalDir: `${home}/.ruler/skills`,
	},
};

/** Helper to get install path */
export function getInstallPath(agent: string, global: boolean): string {
	const config = AGENTS[agent];
	if (!config) return `.${agent}/skills`;
	return global ? config.globalDir : config.projectDir;
}

/**
 * Get all discovery roots for an agent, including legacy aliases.
 */
export function getAgentDiscoveryPaths(agent: string): string[] {
	const config = AGENTS[agent];
	if (!config) {
		return [`.${agent}/skills`, `${home}/.${agent}/skills`];
	}

	return [
		...new Set([
			config.globalDir,
			config.projectDir,
			...(config.discoveryDirs || []),
		]),
	];
}

/**
 * Get all discovery roots for every known agent.
 */
export function getAllAgentDiscoveryPaths(): string[] {
	return [
		...new Set(
			Object.keys(AGENTS).flatMap((agent) => getAgentDiscoveryPaths(agent)),
		),
	];
}

// ── Adapter Factory ────────────────────────────────────────────────────

import type { AgentAdapter } from "../adapters/adapter.js";
import { CursorAdapter } from "../adapters/cursor.js";
import { ClaudeAdapter } from "../adapters/claude.js";
import { CopilotAdapter } from "../adapters/copilot.js";
import { UniversalAdapter } from "../adapters/universal.js";

/** Cache for adapters (lazy singleton per agent) */
const adapterCache = new Map<string, AgentAdapter>();

/**
 * Get an adapter for a given agent name.
 * Returns specific adapters for cursor/claude/copilot,
 * and a UniversalAdapter for everything else.
 */
export function getAdapter(agentName: string): AgentAdapter {
	const cached = adapterCache.get(agentName);
	if (cached) return cached;

	let adapter: AgentAdapter;

	switch (agentName) {
		case "cursor":
			adapter = new CursorAdapter();
			break;
		case "claude":
			adapter = new ClaudeAdapter();
			break;
		case "copilot":
			adapter = new CopilotAdapter();
			break;
		default: {
			const config = AGENTS[agentName];
			if (config) {
				adapter = new UniversalAdapter(
					config.name,
					config.displayName,
					config.projectDir,
					config.globalDir,
				);
			} else {
				// Fallback for unknown agents
				adapter = new UniversalAdapter(
					agentName,
					agentName,
					`.${agentName}/skills`,
					`${home}/.${agentName}/skills`,
				);
			}
			break;
		}
	}

	adapterCache.set(agentName, adapter);
	return adapter;
}

/**
 * Get all adapters for all known agents.
 */
export function getAllAdapters(): AgentAdapter[] {
	return Object.keys(AGENTS).map((name) => getAdapter(name));
}
