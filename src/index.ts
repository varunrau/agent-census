#!/usr/bin/env node

/**
 * AgentCensus — AI agent observability with outcome tracking.
 *
 * Reads Claude Code and Codex session data, calculates costs,
 * classifies what was built, and generates outcome reports.
 *
 * Usage:
 *   npx agent-census                    # summary of today's sessions
 *   npx agent-census --days 7           # last 7 days
 *   npx agent-census --json             # JSON output
 *   npx agent-census --project myapp    # filter by project
 *   npx agent-census outcomes           # outcome-focused report
 */

import { parseArgs } from "node:util";
import { scanSessions } from "./scanner.js";
import { classifyOutcomes } from "./outcomes.js";
import { calculateCosts } from "./costs.js";
import { formatReport, formatJson, formatOutcomeReport } from "./report.js";

const VERSION = "0.1.0";

function printHelp(): void {
  console.log(`
📊 AgentCensus v${VERSION} — AI agent observability with outcome tracking

USAGE
  agent-census [command] [options]

COMMANDS
  summary     Token usage + cost summary (default)
  outcomes    What your agents actually built
  sessions    List individual sessions
  compare     Compare agents/models side by side

OPTIONS
  --days, -d <n>       Look back N days (default: 1)
  --project, -p <name> Filter by project name
  --agent, -a <name>   Filter by agent (claude, codex, cursor)
  --json               Output as JSON
  --csv                Output as CSV
  --no-color           Disable colors
  --version, -v        Show version
  --help, -h           Show this help

EXAMPLES
  agent-census                         # today's summary
  agent-census --days 7                # last week
  agent-census outcomes --days 30      # monthly outcomes
  agent-census --project my-app --json # JSON for a project
  agent-census compare --days 7        # compare agents

WHAT MAKES THIS DIFFERENT
  Every other tool stops at tokens and costs.
  AgentCensus tracks what was actually BUILT:
  • Files created, modified, deleted
  • Tests added or changed
  • Bugs fixed vs features built
  • PRs opened, commits pushed
  • Build/deploy outcomes

  → "You spent $47 on Claude Code this week"        (every tool)
  → "Claude wrote 12 files, fixed 3 bugs, added     (only AgentCensus)
     41 tests, and opened 2 PRs across 8 sessions"

Learn more: https://github.com/varunrau/agent-census
`);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      days: { type: "string", short: "d", default: "1" },
      project: { type: "string", short: "p" },
      agent: { type: "string", short: "a" },
      json: { type: "boolean", default: false },
      csv: { type: "boolean", default: false },
      "no-color": { type: "boolean", default: false },
      version: { type: "boolean", short: "v", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.version) {
    console.log(`agent-census v${VERSION}`);
    process.exit(0);
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const command = positionals[0] ?? "summary";
  const days = parseInt(values.days ?? "1", 10);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const noColor = values["no-color"] ?? false;

  try {
    // Scan for sessions
    const sessions = await scanSessions({
      since,
      project: values.project,
      agent: values.agent,
    });

    if (sessions.length === 0) {
      const timeframe = days === 1 ? "today" : `the last ${days} days`;
      console.log(`\n  No agent sessions found for ${timeframe}.`);
      console.log(`  AgentCensus looks for session data in:`);
      console.log(`    • ~/.claude/projects/    (Claude Code)`);
      console.log(`    • ~/.codex/              (OpenAI Codex)`);
      console.log(`\n  Run an AI coding agent first, then try again.\n`);
      process.exit(0);
    }

    // Calculate costs
    const costs = calculateCosts(sessions);

    // Classify outcomes
    const outcomes = await classifyOutcomes(sessions);

    // Format output
    if (values.json) {
      console.log(formatJson({ sessions, costs, outcomes }));
    } else {
      switch (command) {
        case "outcomes":
          console.log(formatOutcomeReport(outcomes, costs, { noColor }));
          break;
        case "sessions":
          console.log(
            formatReport(sessions, costs, outcomes, {
              noColor,
              detail: "sessions",
            })
          );
          break;
        case "compare":
          console.log(
            formatReport(sessions, costs, outcomes, {
              noColor,
              detail: "compare",
            })
          );
          break;
        case "summary":
        default:
          console.log(
            formatReport(sessions, costs, outcomes, { noColor, detail: "summary" })
          );
          break;
      }
    }
  } catch (err) {
    if (err instanceof Error) {
      console.error(`Error: ${err.message}`);
    } else {
      console.error("An unknown error occurred");
    }
    process.exit(1);
  }
}

main();
