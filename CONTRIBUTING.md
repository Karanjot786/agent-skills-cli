# Contributing to Agent Skills CLI

Thank you for your interest in contributing! 🎉

## Ways to Contribute

- 🐛 Report bugs
- 💡 Suggest features
- 📝 Improve documentation
- 🔧 Submit pull requests

## Development Setup

```bash
# Clone the repo
git clone https://github.com/Karanjot786/agent-skills-cli.git
cd agent-skills-cli

# Install dependencies
npm install

# Build
npm run build

# Test locally
node dist/cli/index.js --help
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run `npm run build` to ensure it compiles
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Code Style

- Use TypeScript
- Follow existing code patterns
- Add JSDoc comments for public functions

## Testing

Before submitting:
```bash
npm run build
skills --help
skills market-list --limit 5
skills install pdf
```

## Questions?

Open an issue or reach out on [GitHub Discussions](https://github.com/Karanjot786/agent-skills-cli/discussions).
