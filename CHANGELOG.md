# Changelog

All notable changes to this project will be documented in this file.

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
