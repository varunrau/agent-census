# Changelog

## [0.2.0] — 2026-06-16

### Added
- **GitHub Action** — automatically classify PR outcomes (features, bugfixes, tests, etc.)
  - Posts classification comment on every PR
  - Adds classification to GitHub Actions job summary
  - Sets outputs: `classification` (JSON), `primary-tag`, `files-changed`
  - Updates existing comments instead of creating duplicates
  - Example workflow in `examples/classify-pr.yml`
- Dogfood workflow: AgentCensus classifies its own PRs
- 26 new tests for PR file classification (80 total across 8 suites)
- Detects test files starting with `tests/` or `test/` (not just containing `/tests/`)
- Extended language support: Vue, Svelte, Dart, R, Scala, Elixir, Zig, Terraform, HCL

## [0.1.0] — 2026-06-12

### Added
- Initial release
- Claude Code session scanning (`~/.claude/projects/`)
- Token cost estimation with model-specific pricing
- Outcome classification: features, bugfixes, tests, docs, CI, config, dependencies
- Terminal reports with color support
- JSON output for programmatic consumption
- Project and agent filtering
- Agent comparison view
- Support for `--days`, `--project`, `--agent`, `--json`, `--no-color` flags
