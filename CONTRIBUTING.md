# Contributing to AgentCensus

Thanks for your interest in improving AgentCensus! This guide will help you get set up.

## Quick Start

```bash
git clone https://github.com/varunrau/agent-census.git
cd agent-census
npm install
npm run build
npm start
```

## Development

```bash
# Run in dev mode (auto-reload)
npm run dev

# Type check
npm run typecheck

# Build
npm run build
```

## Project Structure

```
src/
├── index.ts       # CLI entry, argument parsing
├── types.ts       # TypeScript interfaces
├── scanner.ts     # Session log discovery and parsing
├── costs.ts       # Token cost calculation
├── outcomes.ts    # Outcome classification engine
└── report.ts      # Terminal and JSON formatters
```

## Areas That Could Use Help

### 🤖 Agent Support
- Add Codex session parsing (`~/.codex/`)
- Add Cursor session parsing
- Add Gemini CLI support

### 📊 Outcome Classification
- Improve heuristics in `outcomes.ts`
- Add git integration (map sessions to commits)
- Support user-defined classifiers

### 🎨 Report Formatting
- Add CSV output
- Add HTML report generation
- Improve terminal formatting

### 🧪 Testing
- Add unit tests for scanner
- Add unit tests for classifier
- Add integration tests with sample session data

### 📝 Documentation
- Usage examples
- Classification methodology docs
- API documentation

## Code Style

- TypeScript strict mode
- No `any` types
- Use `node:` prefix for built-in modules
- Explicit return types on exported functions
- ESM (`import`/`export`)

## Commit Messages

Follow conventional commits:
- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `refactor:` code restructuring
- `test:` adding tests
- `chore:` maintenance

## Pull Requests

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run `npm run typecheck` and `npm run build`
5. Commit and push
6. Open a PR with a clear description

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
