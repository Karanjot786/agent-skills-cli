# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please:

1. **Do not** open a public issue
2. Email the maintainer directly or use GitHub's private vulnerability reporting
3. Include details about the vulnerability and steps to reproduce

We will respond within 48 hours and work to address the issue promptly.

## Security Considerations

- This CLI fetches skills from public GitHub repositories
- Skills are downloaded from `raw.githubusercontent.com`
- No authentication required for SkillsMP API
- Skills are stored locally in `~/.antigravity/skills/`

## Best Practices

- Review skill content before using in production
- Only install skills from trusted sources
- Keep the CLI updated to the latest version
