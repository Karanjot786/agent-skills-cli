# Agent Skills CLI 🚀

> **One CLI. 67,000+ skills. All AI agents.**

[![npm version](https://img.shields.io/npm/v/agent-skills-cli)](https://www.npmjs.com/package/agent-skills-cli)
[![license](https://img.shields.io/npm/l/agent-skills-cli)](LICENSE)

Install skills from the world's largest marketplace and sync them to **Cursor**, **Claude Code**, **GitHub Copilot**, **OpenAI Codex**, **Antigravity**, **OpenCode**, **Amp**, **Kilo Code**, **Roo Code**, and **Goose** — all with a single command.

🌐 **Website:** [agentskills.in](https://agentskills.in)

```bash
npm install -g agent-skills-cli
skills install @anthropic/xlsx
```

---

## ✨ Features

- **67,000+ Skills** — Access the largest collection of AI agent skills
- **Interactive Search** — Search and install in one command: `skills search python`
- **10 AI Agents** — Cursor, Claude, Copilot, Codex, Antigravity, OpenCode, Amp, Kilo, Roo, Goose
- **Global Install** — Install globally with `-g` or to project with default
- **Git URL Support** — Install from any Git repo with `skills add owner/repo`
- **Platform Targeting** — Install to specific platforms with `-t claude,cursor`
- **Auto-Detection** — Automatically detects installed AI agents
- **Modern UI** — Beautiful prompts with @clack/prompts

---

## 📦 Installation

```bash
npm install -g agent-skills-cli
```

**Requirements:** Node.js 18+

---

## 🚀 Quick Start

```bash
# Install a skill (auto-detects platforms)
skills install xlsx

# Install to specific platforms
skills install @anthropic/pdf -t claude,cursor

# Install globally (home directory)
skills install pdf -g -t claude

# Install to all 10 platforms
skills install docx --all

# Install from Git repo
skills add vercel-labs/agent-skills

# List skills in a repo
skills add owner/repo --list

# Search and install skills interactively
skills search python

# Search with JSON output (non-interactive)
skills search react --json
```

---

## 🛠️ Commands

### Core Commands

| Command | Description |
|---------|-------------|
| `skills install <name>` | Install a skill from marketplace |
| `skills add <source>` | Install from Git repo (owner/repo or URL) |
| `skills list` | List installed skills |
| `skills search <query>` | Search and install (with `-i`) |
| `skills show <name>` | Show skill details |
| `skills doctor` | Diagnose issues |

### Install Options

```bash
skills install <name>              # Auto-detect platforms
skills install <name> -g           # Install globally (~/.claude/skills/)
skills install <name> -t claude    # Install to Claude only
skills install <name> -t cursor,copilot  # Install to multiple
skills install <name> --all        # Install to all 10 platforms
skills install <name> --list       # Show details without installing
```

### Git URL Install (`skills add`)

```bash
skills add owner/repo              # GitHub shorthand
skills add https://github.com/user/repo  # Full URL
skills add https://gitlab.com/org/repo   # GitLab
skills add owner/repo --list       # List skills in repo
skills add owner/repo -s skill-name      # Install specific skill
skills add owner/repo -y -g        # Non-interactive, global
```

### Other Commands

```bash
skills init <name>        # Create new skill from template
skills validate <path>    # Validate a SKILL.md file
skills export             # Export skills to agents
skills sync               # Sync to Antigravity workflows
skills info               # Show installation status
```

---

## 🤖 Supported Platforms (10 Agents)

| Platform | Project Dir | Global Dir | Flag |
|----------|-------------|------------|------|
| **Cursor** | `.cursor/skills/` | `~/.cursor/skills/` | `-t cursor` |
| **Claude Code** | `.claude/skills/` | `~/.claude/skills/` | `-t claude` |
| **GitHub Copilot** | `.github/skills/` | `~/.github/skills/` | `-t copilot` |
| **OpenAI Codex** | `.codex/skills/` | `~/.codex/skills/` | `-t codex` |
| **Antigravity** | `.agent/skills/` | `~/.gemini/antigravity/skills/` | `-t antigravity` |
| **OpenCode** | `.opencode/skill/` | `~/.config/opencode/skill/` | `-t opencode` |
| **Amp** | `.agents/skills/` | `~/.config/agents/skills/` | `-t amp` |
| **Kilo Code** | `.kilocode/skills/` | `~/.kilocode/skills/` | `-t kilo` |
| **Roo Code** | `.roo/skills/` | `~/.roo/skills/` | `-t roo` |
| **Goose** | `.goose/skills/` | `~/.config/goose/skills/` | `-t goose` |

---

## 📚 Creating Skills

Create a `SKILL.md` file:

```markdown
---
name: my-skill
description: What this skill does
---

# Instructions

Your skill instructions here...
```

Then install locally:

```bash
skills validate ./my-skill
skills export
```

---

## 🔗 Links

- **Website:** [agentskills.in](https://agentskills.in)
- **Marketplace:** [agentskills.in/marketplace](https://agentskills.in/marketplace)
- **Documentation:** [agentskills.in/docs](https://agentskills.in/docs)
- **CLI GitHub:** [github.com/Karanjot786/agent-skills-cli](https://github.com/Karanjot786/agent-skills-cli)
- **Website GitHub:** [github.com/Karanjot786/agent-skills-UI](https://github.com/Karanjot786/agent-skills-UI)
- **npm:** [npmjs.com/package/agent-skills-cli](https://www.npmjs.com/package/agent-skills-cli)

---

## 👤 Author

**Karanjot Singh**

- 🐦 [@Karanjotdulay](https://x.com/Karanjotdulay)
- 💼 [LinkedIn](https://www.linkedin.com/in/karanjot786/)
- 🐙 [@Karanjot786](https://github.com/Karanjot786)

---

## 📄 License

MIT © [Karanjot Singh](https://github.com/Karanjot786)
