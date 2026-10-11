# Agent Skills CLI

Install, update and manage AI agent skills across 45 coding agents from one command line.

[![npm version](https://img.shields.io/npm/v/agent-skills-cli)](https://www.npmjs.com/package/agent-skills-cli)
[![npm downloads](https://img.shields.io/npm/dm/agent-skills-cli)](https://www.npmjs.com/package/agent-skills-cli)
[![license](https://img.shields.io/npm/l/agent-skills-cli)](LICENSE)
[![node](https://img.shields.io/node/v/agent-skills-cli)](https://www.npmjs.com/package/agent-skills-cli)
[![GitHub stars](https://img.shields.io/github/stars/Karanjot786/agent-skills-cli?style=social)](https://github.com/Karanjot786/agent-skills-cli)

`skills` finds skills in the [agentskills.in](https://agentskills.in) marketplace, in GitHub and private Git repositories, and in npm packages. It installs them into the skill directory of each agent you choose, such as Claude Code, Cursor, GitHub Copilot or Windsurf.

The marketplace indexes over 222,000 skills from more than 21,000 authors.

## Highlights

- **Every source.** Marketplace, GitHub, private Git (SSH or token), and npm registries.
- **45 agents.** One install can write to every agent you select, or to all of them with `--all`.
- **Scanned before install.** Every command that installs skills checks them for security issues before copying them.
- **Built for teams.** Project config with `.skillsrc`, lockfile installs with `skills frozen`, and quality scoring.

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Commands](#commands)
- [Installing skills](#installing-skills)
- [MCP servers, subagents and plugins](#mcp-servers-subagents-and-plugins)
- [Security](#security)
- [Context budget and token cost](#context-budget-and-token-cost)
- [Supported agents](#supported-agents)
- [Configuration](#configuration)
- [Environment variables and telemetry](#environment-variables-and-telemetry)
- [Creating a skill](#creating-a-skill)
- [Contributing](#contributing)
- [License](#license)

## Installation

```bash
npm install -g agent-skills-cli
```

Requires Node.js 18 or later. Run `skills --version` to confirm the install.

## Quick start

```bash
# Search the marketplace and pick skills interactively
skills search python

# Install a skill to the agents detected on this machine
skills install @facebook/verify

# Install to specific agents
skills install @facebook/verify -a claude,cursor

# See what is installed, then keep it up to date
skills list
skills update --all
```

## Commands

| Command | What it does |
|---------|--------------|
| `skills search <query>` | Find skills in the marketplace. Add `-i` for an interactive picker. |
| `skills install <source>` | Install from the marketplace, a GitHub repo, a Git URL, an npm package or a local folder. `skills add` is an alias. |
| `skills list` | List discovered skills. Use `--table` for token costs or `--json` for scripts. |
| `skills check` | Show installed skills with their source and version. |
| `skills update [skills...]` | Update skills from their source. Use `--all`, and `--prune` to remove stale ones. |
| `skills remove [skills...]` | Remove skills. Use `-a <agent>` to remove from one agent only. |
| `skills doctor` | Diagnose the setup. Add `--deep` to detect conflicting skills. |
| `skills audit [path]` | Security-scan installed skills, or a folder you specify. |
| `skills score <path>` | Score a skill's quality from 0 to 100. |
| `skills budget -b <tokens>` | Load only the skills that fit a context budget. |
| `skills submit-repo <owner/repo>` | Submit a GitHub repository for marketplace indexing. |

Run `skills --help` or `skills <command> --help` for the full list of commands and options.

### Install options

```bash
skills install <source> -a claude,cursor   # Specific agents (comma-separated or space-separated)
skills install <source> --all              # Every supported agent
skills install <source> -g                 # Global install (your home directory)
skills install <source> -s <name>          # Install one skill from a multi-skill repo
skills install <source> -y                 # Non-interactive; installs every skill found
skills install <source> --dry-run          # Show what would be installed
skills install <source> --skip-audit       # Install even when the scan finds critical issues
```

## Installing skills

### Marketplace

```bash
skills install @anthropics/xlsx
skills search react -a cursor claude      # Search, then install the results to agents
skills search python -a claude -y         # Install every result without prompting
```

### GitHub and Git

```bash
skills add owner/repo                     # GitHub shorthand
skills add owner/repo@skill-name          # One skill from a repo
skills add owner/repo --list              # List the skills a repo contains
skills add https://gitlab.com/org/repo    # Any Git host
skills add owner/repo#dev                 # A specific branch
```

### Private repositories

```bash
skills install git@github.com:team/private-repo.git        # SSH, uses your keys
skills install https://git.company.com/team/repo --token $GIT_TOKEN
GITLAB_TOKEN=xxx skills install https://gitlab.com/team/repo
```

Credentials are resolved in this order: the `--token` flag, then environment variables (`GH_TOKEN`, `GITLAB_TOKEN`, `BITBUCKET_TOKEN`, `GIT_TOKEN`), then SSH keys, then the Git credential helper, then `.netrc`.

### npm packages

```bash
skills install npm:@company/skills
skills install npm:@company/skills@1.1.2
skills install npm:@company/skills --registry https://npm.company.com
```

### Submitting a repository

```bash
skills submit-repo owner/repo             # Index every SKILL.md in the repo on the marketplace
```

## MCP servers, subagents and plugins

Marketplace items can also be MCP servers, subagents or plugins. The CLI detects the type from the slug, or you can set it.

```bash
skills install github--github-mcp-server            # Type is detected automatically
skills install acme--weather --type mcp -a cursor   # Force a type: skill, mcp, agent or plugin
skills install acme--weather -e API_KEY=xxx         # Set an environment variable for the server
skills install acme--reviewer --type agent          # Install a subagent to .claude/agents/
skills remove acme--weather                         # Removes the MCP entry from each client config
```

MCP config files are merged, never overwritten. Other servers and keys are kept, a `.bak` copy is written first, and a config file with comments (JSONC) is refused rather than rewritten. Quit the client, such as Claude Code, before a global (`-g`) install.

## Security

Every command that installs skills from a source (`install`, `add`, `search`, `update`, `frozen`, `install-url` and the interactive installers) scans each skill and subagent before copying it. Critical findings block the install, and high findings print a warning. The scan is an automated signal, not a verdict, so read a skill before you run it.

```bash
skills audit                          # Audit installed skills against agentskills.in advisories
skills audit ./my-skill               # Audit one folder
skills audit --fail-on high           # Exit with code 1 at high severity or above (for CI)
skills audit --json --offline         # JSON output without downloading advisories
```

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Context budget and token cost

Each skill costs context tokens. Two commands help manage that:

```bash
skills list --table                   # Estimated token cost per skill
skills budget -b 8000                 # Pick the most relevant skills for a project, within 8,000 tokens
skills budget -b 4000 --format xml    # Agent-ready output
```

## Supported agents

`skills install` supports 45 agents. Pass any key from the table to `-a`.

<details>
<summary>All 45 agents</summary>

| Agent | Key | Project directory |
|-------|-----|-------------------|
| Cursor | `cursor` | `.cursor/skills/` |
| Claude Code | `claude` | `.claude/skills/` |
| GitHub Copilot | `copilot` | `.github/skills/` |
| Codex | `codex` | `.codex/skills/` |
| Antigravity | `antigravity` | `.agent/skills/` |
| OpenCode | `opencode` | `.opencode/skill/` |
| Amp | `amp` | `.agents/skills/` |
| Kilo Code | `kilo` | `.kilocode/skills/` |
| Roo Code | `roo` | `.roo/skills/` |
| Goose | `goose` | `.goose/skills/` |
| Cline | `cline` | `.cline/skills/` |
| CodeBuddy | `codebuddy` | `.codebuddy/skills/` |
| Command Code | `command-code` | `.commandcode/skills/` |
| Continue | `continue` | `.continue/skills/` |
| Crush | `crush` | `.crush/skills/` |
| Clawdbot | `clawdbot` | `skills/` |
| Droid | `droid` | `.factory/skills/` |
| Gemini CLI | `gemini-cli` | `.gemini/skills/` |
| Kiro CLI | `kiro-cli` | `.kiro/skills/` |
| MCPJam | `mcpjam` | `.mcpjam/skills/` |
| Mux | `mux` | `.mux/skills/` |
| OpenHands | `openhands` | `.openhands/skills/` |
| Pi | `pi` | `.pi/skills/` |
| Qoder | `qoder` | `.qoder/skills/` |
| Qwen Code | `qwen-code` | `.qwen/skills/` |
| Trae | `trae` | `.trae/skills/` |
| Windsurf | `windsurf` | `.windsurf/skills/` |
| Zencoder | `zencoder` | `.zencoder/skills/` |
| Neovate | `neovate` | `.neovate/skills/` |
| Ara | `ara` | `.ara/skills/` |
| Aide | `aide` | `.aide/skills/` |
| Alex | `alex` | `.alex/skills/` |
| BB | `bb` | `.bb/skills/` |
| CodeStory | `codestory` | `.codestory/skills/` |
| Helix AI | `helix-ai` | `.helix/skills/` |
| Meekia | `meekia` | `.meekia/skills/` |
| Pear AI | `pear-ai` | `.pearai/skills/` |
| Adal | `adal` | `.adal/skills/` |
| Pochi | `pochi` | `.pochi/skills/` |
| Sourcegraph Cody | `sourcegraph-cody` | `.sourcegraph/skills/` |
| Void AI | `void-ai` | `.void/skills/` |
| Zed | `zed` | `.zed/skills/` |
| Lingma | `lingma` | `.lingma/skills/` |
| Deep Agents | `deep-agents` | `.deepagents/skills/` |
| Ruler | `ruler` | `.ruler/skills/` |

</details>

Global installs (`-g`) go to each agent's user-level directory, such as `~/.claude/skills/`.

`skills list` searches the canonical store (`~/.skills/` and `./.skills/`) and every agent's directories, so a skill installed by `skills install` stays discoverable.

## Configuration

Put a `.skillsrc` or `.skillsrc.json` file in your project or home directory to set private sources and defaults:

```json
{
  "sources": [
    {
      "name": "company-gitlab",
      "type": "git",
      "url": "https://gitlab.company.com",
      "auth_env": "COMPANY_GIT_TOKEN"
    },
    {
      "name": "company-npm",
      "type": "npm",
      "registry": "https://npm.company.com",
      "scope": "@company"
    }
  ],
  "defaults": {
    "agent": "cursor",
    "global": false
  }
}
```

The project `.skillsrc` is used first. If there is none, the file in your home directory is used.

## Environment variables and telemetry

| Variable | Purpose |
|----------|---------|
| `GH_TOKEN` or `GITHUB_TOKEN` | Authenticate to private GitHub repositories |
| `GITLAB_TOKEN` or `GL_TOKEN` | Authenticate to private GitLab repositories |
| `BITBUCKET_TOKEN` or `BB_TOKEN` | Authenticate to private Bitbucket repositories |
| `GIT_TOKEN` | Authenticate to any other Git host |
| `DISABLE_TELEMETRY` or `DO_NOT_TRACK` | Turn off anonymous telemetry |

The CLI sends one anonymous count per command run to `https://www.agentskills.in/api/telemetry`. The count includes the command name (for example `install` or `list`) and the CLI version. It never includes command arguments, skill names, search text, file paths or private repository URLs. The server stores only daily counters, with no IP addresses. The first run prints this notice once.

Telemetry is off in CI environments. Set `DISABLE_TELEMETRY=1` or `DO_NOT_TRACK=1` to turn it off everywhere.

## Creating a skill

A skill is a folder with a `SKILL.md` file:

```markdown
---
name: my-skill
description: What this skill does
---

# Instructions

Your skill instructions here.
```

Check it and export it to your agents:

```bash
skills validate ./my-skill
skills score ./my-skill
skills export
```

## Links

- Website: [agentskills.in](https://agentskills.in)
- Marketplace: [agentskills.in/marketplace](https://agentskills.in/marketplace)
- Documentation: [agentskills.in/docs](https://agentskills.in/docs)
- npm: [npmjs.com/package/agent-skills-cli](https://www.npmjs.com/package/agent-skills-cli)
- Release notes: [CHANGELOG.md](CHANGELOG.md)

## Contributing

Bug reports, feature requests and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first.

To work on the CLI from source:

```bash
git clone https://github.com/Karanjot786/agent-skills-cli.git
cd agent-skills-cli
npm install
npm run build
npm test
```

## License

MIT. See [LICENSE](LICENSE).

Maintained by [Karanjot Singh](https://github.com/Karanjot786).
