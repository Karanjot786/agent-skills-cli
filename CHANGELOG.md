# Changelog

All notable changes to this project will be documented in this file.

## [1.0.6] - 2026-01-19

### 🔍 Interactive Search (`skills search`)
- New `skills search <query>` command to search 67K+ skills
- **Interactive by default** - search, select, and install in one command
- JSON output with `--json` flag for scripting (non-interactive)
- Sort by stars, recent, or name with `--sort`
- Limit results with `--limit`

---

## [1.0.5] - 2026-01-16

### 🌐 Global Install (`-g/--global`)
- Install skills globally to home directory instead of project-level
- Works with all commands: `skills install pdf -g -t claude`

### 🤖 5 New Agents (10 Total)
- **OpenCode** (`.opencode/skill`)
- **Amp** (`.agents/skills`)
- **Kilo Code** (`.kilocode/skills`)
- **Roo Code** (`.roo/skills`)
- **Goose** (`.goose/skills`)

### 📦 Git URL Support (`skills add`)
- Install from GitHub/GitLab repos: `skills add owner/repo`
- Support full URLs and subpaths
- `--list` to browse skills in repos
- `--skill` to install specific skills
- `-y` for non-interactive CI/CD mode

### ✨ UI Improvements
- Modern UI with @clack/prompts
- Shows install paths and hints
- Better cancellation handling

### 🔧 Build Optimization
- Added `npm run build:fast` using tsup
- Added @clack/prompts dependency

---

## [1.0.4] - 2026-01-11

### ⚡ Parallel Downloads
- Multiple skills now download in parallel for faster installation
- Significantly faster when installing 4+ skills at once

### 🔧 Interactive Install Fixes
- Fixed interactive wizard to install directly to platform directories
- Now copies ALL skill files (including subdirectories, references, etc.)
- Output now matches `skills install` command format
- Fixed database field name mismatch (githubUrl vs github_url)

---

## [1.0.3] - 2026-01-11

### 🌐 Website Launch
- Official website launched at [agentskills.in](https://agentskills.in)
- Browse 50,000+ skills in the marketplace
- Full documentation with interactive examples
- SEO & GEO optimized for AI search engines

### 🎯 Platform Targeting
- New `-t/--target` flag for installing to specific platforms
- Positional platform arguments: `skills install pdf claude cursor`
- `--all` flag to install to all platforms at once
- Auto-detection improvements for installed platforms

### 🔧 Improvements
- Fixed Antigravity installation to copy all skill files (including subdirectories)
- Updated API to use production endpoint
- Improved README documentation

---

## [1.0.0] - 2026-01-04

### 🚀 Initial Release

**Core Features:**
- Interactive wizard with `skills` command
- Support for 5 AI agents: Cursor, Claude Code, GitHub Copilot, OpenAI Codex, Antigravity

### 🌐 SkillsMP Integration
- Access to **40,779+ skills** from [skillsmp.com](https://skillsmp.com)
- No API key required - completely free and public
- Skills sorted by GitHub stars
- Pagination support with `--limit` and `--page` options

### 📦 Marketplace Commands
- `skills market-list` - List skills from SkillsMP (40k+ skills)
- `skills market-search <query>` - Search skills with results count
- `skills market-sources` - Show registered marketplaces
- `skills market-list --legacy` - Fallback to GitHub sources

### ⬇️ Installation Commands
- `skills install <name>` - Install by name from SkillsMP
- `skills install-url <url>` - Install from GitHub URL
- `skills market-install <name>` - Alias for install
- `skills market-uninstall <name>` - Remove installed skill

### 📤 Export Commands
- `skills export` - Export to all agents
- `skills export --target <agent>` - Export to specific agent (cursor, claude, copilot, codex, antigravity)
- `skills sync` - Sync to `.agent/workflows/` for Antigravity

### 🔧 Skill Management
- `skills list` - List all discovered skills
- `skills show <name>` - Show skill details
- `skills validate <path>` - Validate SKILL.md against spec
- `skills init <name>` - Create new skill from template

### 🔄 Update & Maintenance
- `skills market-installed` - List installed marketplace skills
- `skills market-update-check` - Check for skill updates

### 📁 Project Structure
- TypeScript codebase
- Commander.js CLI framework
- Inquirer.js for interactive prompts
- Ora spinners for progress feedback
- Chalk for colored output

### 📄 Open Source
- MIT License
- Contributing guidelines
- Security policy
- GitHub issue templates
- Pull request template
