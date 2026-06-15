# 📊 AgentCensus

**The only AI agent observability tool that tracks what was actually built.**

Every other tool tells you how many tokens your agents used. AgentCensus tells you what they accomplished.

```
$ agent-census --days 7

  📊 AgentCensus — 23 sessions
  ──────────────────────────────

  💰 Spending
    Total:    $47.32
    Tokens:   1.2M in / 489.3K out
    Duration: 4h 12m

  🤖 By Agent
    claude     $38.14   18 sessions
    codex      $9.18    5 sessions

  🎯 What Was Built (only in AgentCensus)
    Files:   +12 created, ~31 modified, -3 deleted
    🚀 feature: 18  🐛 bugfix: 8  🧪 test: 7  📝 docs: 4  🔧 ci: 2
    Languages: TypeScript: 24, Python: 8, YAML: 3
```

## Why?

You're spending $50-500+/week on AI coding agents. You know the token count. **But do you know what was built?**

| Question | Other tools | AgentCensus |
|----------|-----------|-------------|
| How much did I spend? | ✅ | ✅ |
| Which model costs most? | ✅ | ✅ |
| What files were changed? | ❌ | ✅ |
| How many bugs were fixed? | ❌ | ✅ |
| How many tests were added? | ❌ | ✅ |
| Features vs maintenance ratio? | ❌ | ✅ |
| Cost per artifact? | ❌ | ✅ |
| Cost per outcome? | ❌ | ✅ |

## Install

```bash
# Install from GitHub (recommended — works right now)
npm install -g github:varunrau/agent-census
agent-census

# Or run directly from source
git clone https://github.com/varunrau/agent-census.git
cd agent-census && npm install && npm run build && npm start

# Coming soon: npm install -g agent-census
```

Requires Node.js 20+.

## Usage

```bash
# Today's summary
agent-census

# Last 7 days
agent-census --days 7

# Outcome-focused report
agent-census outcomes --days 30

# Filter by project
agent-census --project my-app

# Compare agents
agent-census compare --days 7

# JSON output (for scripts/dashboards)
agent-census --json > report.json

# CSV export (for spreadsheets)
agent-census --csv > report.csv

# Filter by agent
agent-census --agent claude --days 7
```

### Commands

| Command | Description |
|---------|-------------|
| `summary` | Token usage + cost + outcomes (default) |
| `outcomes` | Detailed breakdown of what was built |
| `sessions` | List individual sessions |
| `compare` | Compare agents/models side by side |

### Options

| Flag | Short | Description |
|------|-------|-------------|
| `--days <n>` | `-d` | Look back N days (default: 1) |
| `--project <name>` | `-p` | Filter by project name |
| `--agent <name>` | `-a` | Filter by agent (claude, codex) |
| `--json` | | JSON output |
| `--csv` | | CSV export (opens in Excel/Sheets) |
| `--no-color` | | Disable terminal colors |

## Supported Agents

| Agent | Status | Data Source |
|-------|--------|-------------|
| Claude Code | ✅ Supported | `~/.claude/projects/` |
| OpenAI Codex | 🔜 Coming | `~/.codex/` |
| Cursor | 🔜 Planned | — |
| Gemini CLI | 🔜 Planned | — |
| AmpCode | 🔜 Planned | — |

## How It Works

1. **Scan** — Reads session JSONL files from agent data directories
2. **Parse** — Extracts token counts, timing, model info, and tool calls
3. **Classify** — Analyzes file changes to determine outcomes (feature, bugfix, test, etc.)
4. **Report** — Generates a human-readable or machine-readable report

The classification is heuristic-based:
- New files → features
- Test files → tests
- CI/Docker files → infrastructure
- Small patches → bugfixes
- Large restructuring → refactors
- Markdown/docs → documentation

Future versions will support:
- User-defined classifiers
- Git integration (map sessions to commits/PRs)
- LLM-assisted classification
- Team dashboards (SaaS)

## Comparison (updated June 15, 2026)

| Tool | Stars | Type | Tokens | Costs | **Outcomes** |
|------|-------|------|--------|-------|---------:|
| **AgentCensus** | new | CLI+JSON+CSV | ✅ | ✅ | **✅** |
| claude-hud | 25,211⭐ | Claude Code plugin | ✅ | ❌ | ❌ |
| tokscale | 3,733⭐ | Rust CLI+TUI+Web | ✅ | ✅ | ❌ |
| claude-devtools | 3,567⭐ | Electron desktop | ✅ | ✅ | ❌ |
| claude-usage | 1,826⭐ | Python dashboard | ✅ | ✅ | ❌ |
| Clawdmeter | 1,623⭐ | ESP32 hardware | ✅ | ❌ | ❌ |
| TokenTracker (mm) | 712⭐ | macOS widgets | ✅ | ✅ | ❌ |
| ai-token-monitor | 240⭐ | macOS menu bar | ✅ | ✅ | ❌ |
| splitrail | 198⭐ | Rust cross-platform | ✅ | ✅ | ❌ |

**30+ tools** track AI agent *inputs* (tokens, cost, time). AgentCensus is the **only one** that tracks *outputs* (files changed, features built, bugs fixed, tests written).

## Philosophy

> "You spent $47 on Claude Code this week" — *every tool*
>
> "Claude wrote 12 files, fixed 3 bugs, added 41 tests, and opened 2 PRs across 8 sessions" — *only AgentCensus*

The question isn't how much AI costs. The question is **what AI accomplished.**

This tool exists because the current generation of AI agent observability tools stops at the financial layer. They answer "how much?" but not "what for?" AgentCensus bridges that gap.

## Development

```bash
git clone https://github.com/varunrau/agent-census.git
cd agent-census
npm install
npm run build
npm start
```

### Testing

```bash
# Run all 54 tests
npm test
```

Tests cover cost calculation (14 tests), outcome classification (13 tests), and report formatting/CSV/JSON (27 tests). Uses Node.js built-in test runner — no extra dependencies.

### Project Structure

```
src/
├── index.ts       # CLI entry point
├── types.ts       # Type definitions
├── scanner.ts     # Session log discovery and parsing
├── costs.ts       # Token cost calculation
├── outcomes.ts    # Outcome classification (the differentiator)
└── report.ts      # Terminal and JSON formatters

tests/
├── costs.test.ts     # 14 tests — model-specific pricing
├── outcomes.test.ts  # 13 tests — classification engine
└── report.test.ts    # 27 tests — formatting, CSV, JSON
```

## Roadmap

- [x] Claude Code session scanning
- [x] Token cost estimation
- [x] Outcome classification
- [x] Terminal reports with color
- [x] JSON output
- [x] CSV export
- [x] 54 tests across 6 suites
- [ ] Codex session support
- [ ] Git integration (map sessions → commits → PRs)
- [ ] Custom classifiers
- [ ] Team dashboard (web UI)
- [ ] Historical trend charts
- [ ] Slack/Discord notifications
- [ ] CI integration (block deploys over budget)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT — see [LICENSE](LICENSE).
