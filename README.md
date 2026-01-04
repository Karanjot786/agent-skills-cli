# Agent Skills CLI 🚀

> **One CLI. 40,000+ skills. All AI agents.**

[![npm version](https://img.shields.io/npm/v/agent-skills-cli)](https://www.npmjs.com/package/agent-skills-cli)
[![license](https://img.shields.io/npm/l/agent-skills-cli)](LICENSE)

Install skills from the world's largest Agent Skills marketplace and sync them to **Cursor**, **Claude Code**, **GitHub Copilot**, **OpenAI Codex**, and **Antigravity** — all with a single command.

```bash
npm install -g agent-skills-cli
skills
```

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **40,779+ Skills** | Access the largest collection of AI agent skills via [SkillsMP](https://skillsmp.com) |
| **5 AI Agents** | Works with Cursor, Claude Code, GitHub Copilot, OpenAI Codex, Antigravity |
| **No API Key** | SkillsMP is completely free and public — no authentication required |
| **Interactive CLI** | Arrow-key navigation, checkbox selection, progress spinners |
| **Instant Loading** | Skills fetched via API in <1 second (no individual file fetching) |
| **Auto-Export** | Install once, skills are automatically formatted for each agent |
| **Star Sorting** | Browse skills by GitHub stars (PyTorch 95k⭐, OpenAI 54k⭐, etc.) |

---

## 📦 Installation

```bash
npm install -g agent-skills-cli
```

**Requirements:** Node.js 18+

---

## 🚀 Quick Start

Run the interactive wizard:

```bash
skills
```

**What happens:**
1. Select which AI agents you use (Cursor, Claude, Copilot, etc.)
2. Browse 40,000+ skills sorted by GitHub stars
3. Select skills with Space, confirm with Enter
4. Skills are installed and exported to your agents automatically

---

## 🛠️ Commands

### Interactive Mode

```bash
skills              # Main interactive wizard
skills install      # Direct to skill selection
skills export       # Export all installed skills to agents
```

### Skill Management

```bash
skills list                      # List installed skills
skills show <name>               # Show skill details
skills validate <path>           # Validate a SKILL.md file
skills init <name>               # Create a new skill from template
```

### Marketplace (Legacy GitHub)

```bash
skills market-list               # List skills from configured sources
skills market-search <query>     # Search skills
skills market-install <name>     # Install by name
skills market-uninstall <name>   # Uninstall a skill
skills market-installed          # Show installed skills
skills market-sources            # List marketplace sources
```

### Agent Export

```bash
skills export --target all       # Export to all agents
skills export --target cursor    # Export to Cursor only
skills export --target claude    # Export to Claude Code only
skills export --target copilot   # Export to GitHub Copilot only
skills export --target codex     # Export to OpenAI Codex only
skills sync                      # Sync to Antigravity workflows
```

---

## 🤖 Supported AI Agents

| Agent | Skill Location | Format |
|-------|----------------|--------|
| **Cursor** | `.cursor/skills/<name>/SKILL.md` | Agent Skills Standard |
| **Claude Code** | `.claude/skills/<name>/SKILL.md` | Agent Skills Standard |
| **GitHub Copilot** | `.github/skills/<name>/SKILL.md` | Agent Skills Standard |
| **OpenAI Codex** | `.codex/skills/<name>/SKILL.md` | Agent Skills Standard |
| **Antigravity** | `.agent/workflows/<name>.md` | Workflow Format |

> **Note:** All major AI coding agents now support the same `SKILL.md` standard, making skills truly portable!

---

## 🌐 SkillsMP Integration

This CLI is powered by [SkillsMP](https://skillsmp.com), the largest Agent Skills marketplace:

- **40,779 skills** indexed from GitHub
- **Public API** — no authentication needed
- **Real-time updates** — skills indexed daily
- **Star-based ranking** — best skills surface first

### Top Skills by Stars

| Skill | Author | Stars |
|-------|--------|-------|
| at-dispatch-v2 | PyTorch | 95,362 ⭐ |
| skill-creator | OpenAI | 54,704 ⭐ |
| frontend-design | Anthropic | 47,860 ⭐ |
| typescript-review | Metabase | 44,733 ⭐ |

---

## 📚 Creating Your Own Skills

Create a `SKILL.md` file in your project:

```markdown
---
name: my-custom-skill
description: What this skill does and when to trigger it
---

# Instructions

Detailed instructions for the AI agent...

## Examples

Show examples of how to use this skill...
```

Then export to your agents:

```bash
skills export
```

### Skill Structure

```
my-skill/
├── SKILL.md          # Main skill file (required)
├── references/       # Reference documentation (optional)
│   └── guide.md
└── assets/           # Templates, images (optional)
    └── template.txt
```

---

## ⚙️ Configuration

Skills are stored in:
- **Installed skills:** `~/.antigravity/skills/`
- **Marketplace config:** `~/.antigravity/marketplace.json`

### Adding Custom Marketplace Sources

```bash
skills market-add-source
```

---

## 🔗 Related Projects

- **[SkillsMP](https://skillsmp.com)** — Agent Skills Marketplace (40k+ skills)
- **[anthropics/skills](https://github.com/anthropics/skills)** — Official Anthropic skills
- **[agentskills.io](https://agentskills.io)** — Agent Skills open specification

---

## 🏗️ Architecture

```
agent-skills-cli/
├── src/
│   ├── cli/index.ts          # Interactive CLI (Commander + Inquirer)
│   ├── core/
│   │   ├── skillsmp.ts       # SkillsMP API client
│   │   ├── marketplace.ts    # GitHub marketplace
│   │   ├── loader.ts         # Skill discovery
│   │   ├── validator.ts      # SKILL.md validation
│   │   ├── injector.ts       # Prompt generation
│   │   └── executor.ts       # Script execution
│   └── types/                # TypeScript definitions
├── dist/                     # Compiled output
└── package.json
```

---

## 📄 License

MIT © [Karanjot786](https://github.com/Karanjot786)

---

<div align="center">

**Built for developers who use multiple AI coding assistants.**

[SkillsMP](https://skillsmp.com) · [Report Bug](https://github.com/Karanjot786/agent-skills-cli/issues) · [Request Feature](https://github.com/Karanjot786/agent-skills-cli/issues)

</div>
