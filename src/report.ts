/**
 * Report formatter — renders session data as terminal output or JSON.
 *
 * Follows the AgentCensus design principle: "efficiency is the visual language."
 * Dense, scannable, no noise. Every number is meaningful.
 */

import type {
  Session,
  CostSummary,
  OutcomeSummary,
  OutcomeTag,
  FormatOptions,
} from "./types.js";

// ── Color helpers ──────────────────────────────────────────────────────────

const ESC = "\x1b[";
const colors = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  blue: `${ESC}34m`,
  magenta: `${ESC}35m`,
  cyan: `${ESC}36m`,
  red: `${ESC}31m`,
  white: `${ESC}37m`,
  gray: `${ESC}90m`,
};

function c(color: keyof typeof colors, text: string, noColor?: boolean): string {
  if (noColor) return text;
  return `${colors[color]}${text}${colors.reset}`;
}

// ── Formatting utilities ─────────────────────────────────────────────────────

function formatDollars(amount: number): string {
  if (amount < 0.01) return "<$0.01";
  return `$${amount.toFixed(2)}`;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function tagEmoji(tag: OutcomeTag): string {
  const map: Record<OutcomeTag, string> = {
    feature: "🚀",
    bugfix: "🐛",
    refactor: "♻️",
    test: "🧪",
    docs: "📝",
    config: "⚙️",
    ci: "🔧",
    dependency: "📦",
    unknown: "❓",
  };
  return map[tag] ?? "❓";
}

function padRight(str: string, len: number): string {
  // Strip ANSI for length calculation
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, "");
  const pad = Math.max(0, len - stripped.length);
  return str + " ".repeat(pad);
}

// ── Main formatters ────────────────────────────────────────────────────────

/**
 * Format the summary report (default command).
 */
export function formatReport(
  sessions: Session[],
  costs: CostSummary,
  outcomes: OutcomeSummary,
  opts: FormatOptions = {}
): string {
  const nc = opts.noColor;
  const lines: string[] = [];

  // Header
  lines.push("");
  lines.push(
    c("bold", "  📊 AgentCensus", nc) +
      c("dim", ` — ${costs.totalSessions} session${costs.totalSessions === 1 ? "" : "s"}`, nc)
  );
  lines.push(c("dim", "  ─".repeat(30), nc));

  // Cost summary
  lines.push("");
  lines.push(c("bold", "  💰 Spending", nc));
  lines.push(
    `    Total:    ${c("yellow", formatDollars(costs.totalCost), nc)}`
  );
  lines.push(
    `    Tokens:   ${c("cyan", formatTokens(costs.totalTokensIn), nc)} in / ${c("cyan", formatTokens(costs.totalTokensOut), nc)} out`
  );
  lines.push(
    `    Duration: ${c("dim", formatDuration(costs.totalDurationMs), nc)}`
  );

  // By agent breakdown
  if (Object.keys(costs.byAgent).length > 0) {
    lines.push("");
    lines.push(c("bold", "  🤖 By Agent", nc));
    for (const [agent, data] of Object.entries(costs.byAgent)) {
      lines.push(
        `    ${padRight(agent, 10)} ${c("yellow", padRight(formatDollars(data.cost), 8), nc)} ${c("dim", `${data.sessions} sessions`, nc)}`
      );
    }
  }

  // By project breakdown
  if (Object.keys(costs.byProject).length > 0) {
    lines.push("");
    lines.push(c("bold", "  📁 By Project", nc));
    const sorted = Object.entries(costs.byProject).sort(
      ([, a], [, b]) => b - a
    );
    for (const [project, cost] of sorted.slice(0, 10)) {
      const shortName =
        project.length > 30 ? `...${project.slice(-27)}` : project;
      lines.push(
        `    ${padRight(shortName, 32)} ${c("yellow", formatDollars(cost), nc)}`
      );
    }
    if (sorted.length > 10) {
      lines.push(c("dim", `    ... and ${sorted.length - 10} more`, nc));
    }
  }

  // Outcomes (the differentiator!)
  lines.push("");
  lines.push(c("bold", "  🎯 What Was Built", nc) + c("dim", " (only in AgentCensus)", nc));
  if (outcomes.totalFiles > 0) {
    lines.push(
      `    Files:   ${c("green", `+${outcomes.filesCreated}`, nc)} created, ${c("blue", `~${outcomes.filesModified}`, nc)} modified, ${c("red", `-${outcomes.filesDeleted}`, nc)} deleted`
    );

    // Outcome tags
    const activeTags = Object.entries(outcomes.byTag)
      .filter(([, count]) => count > 0)
      .sort(([, a], [, b]) => b - a);

    if (activeTags.length > 0) {
      const tagLine = activeTags
        .map(([tag, count]) => `${tagEmoji(tag as OutcomeTag)} ${tag}: ${count}`)
        .join("  ");
      lines.push(`    ${tagLine}`);
    }

    // Languages
    if (Object.keys(outcomes.byLanguage).length > 0) {
      const langLine = Object.entries(outcomes.byLanguage)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([lang, count]) => `${lang}: ${count}`)
        .join(", ");
      lines.push(`    Languages: ${c("dim", langLine, nc)}`);
    }
  } else {
    lines.push(c("dim", "    No file changes detected in session data", nc));
  }

  // Session detail (if requested)
  if (opts.detail === "sessions") {
    lines.push("");
    lines.push(c("bold", "  📋 Sessions", nc));
    for (const session of sessions.slice(0, 20)) {
      const time = session.startTime.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const dur = formatDuration(session.durationMs);
      const cost = formatDollars(session.costEstimate);
      const files = session.filesChanged.length;
      lines.push(
        `    ${c("dim", time, nc)} ${padRight(session.agent, 8)} ${padRight(session.project.slice(0, 20), 22)} ${c("yellow", padRight(cost, 8), nc)} ${c("cyan", `${formatTokens(session.totalTokens)} tok`, nc)} ${c("green", `${files} files`, nc)} ${c("dim", dur, nc)}`
      );
    }
    if (sessions.length > 20) {
      lines.push(c("dim", `    ... and ${sessions.length - 20} more sessions`, nc));
    }
  }

  // Compare view
  if (opts.detail === "compare" && Object.keys(costs.byAgent).length > 1) {
    lines.push("");
    lines.push(c("bold", "  ⚔️  Agent Comparison", nc));
    lines.push(
      `    ${padRight("Agent", 12)} ${padRight("Sessions", 10)} ${padRight("Cost", 10)} ${padRight("Tokens", 12)} ${padRight("$/Session", 10)}`
    );
    lines.push(c("dim", "    " + "─".repeat(54), nc));
    for (const [agent, data] of Object.entries(costs.byAgent)) {
      const perSession =
        data.sessions > 0 ? data.cost / data.sessions : 0;
      lines.push(
        `    ${padRight(agent, 12)} ${padRight(String(data.sessions), 10)} ${padRight(formatDollars(data.cost), 10)} ${padRight(formatTokens(data.tokensIn + data.tokensOut), 12)} ${padRight(formatDollars(perSession), 10)}`
      );
    }
  }

  lines.push("");
  lines.push(
    c("dim", "  Run `agent-census outcomes` for a detailed outcome breakdown", nc)
  );
  lines.push("");

  return lines.join("\n");
}

/**
 * Format the outcome-focused report.
 */
export function formatOutcomeReport(
  outcomes: OutcomeSummary,
  costs: CostSummary,
  opts: { noColor?: boolean } = {}
): string {
  const nc = opts.noColor;
  const lines: string[] = [];

  lines.push("");
  lines.push(
    c("bold", "  🎯 AgentCensus — Outcome Report", nc)
  );
  lines.push(c("dim", "  ─".repeat(30), nc));
  lines.push("");

  // The key question
  const costStr = formatDollars(costs.totalCost);
  lines.push(
    c("bold", `  You spent ${c("yellow", costStr, nc)} across ${costs.totalSessions} sessions. Here's what was built:`, nc)
  );
  lines.push("");

  // File summary
  lines.push(c("bold", "  📦 Artifacts", nc));
  lines.push(`    ${c("green", `${outcomes.filesCreated}`, nc)} files created`);
  lines.push(`    ${c("blue", `${outcomes.filesModified}`, nc)} files modified`);
  lines.push(`    ${c("red", `${outcomes.filesDeleted}`, nc)} files deleted`);
  lines.push(
    `    ${c("dim", `Net: ${outcomes.netLines >= 0 ? "+" : ""}${outcomes.netLines} lines`, nc)}`
  );

  // Outcome classification
  lines.push("");
  lines.push(c("bold", "  🏷️  Classification", nc));
  const sorted = Object.entries(outcomes.byTag)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);

  if (sorted.length === 0) {
    lines.push(c("dim", "    No classifiable changes found", nc));
  } else {
    for (const [tag, count] of sorted) {
      const emoji = tagEmoji(tag as OutcomeTag);
      const bar = "█".repeat(Math.min(count, 40));
      lines.push(`    ${emoji} ${padRight(tag, 12)} ${c("cyan", bar, nc)} ${count}`);
    }
  }

  // Language breakdown
  if (Object.keys(outcomes.byLanguage).length > 0) {
    lines.push("");
    lines.push(c("bold", "  💻 Languages", nc));
    const langSorted = Object.entries(outcomes.byLanguage)
      .sort(([, a], [, b]) => b - a);
    for (const [lang, count] of langSorted) {
      const bar = "█".repeat(Math.min(count, 40));
      lines.push(`    ${padRight(lang, 14)} ${c("magenta", bar, nc)} ${count}`);
    }
  }

  // Per-project breakdown
  if (Object.keys(outcomes.byProject).length > 0) {
    lines.push("");
    lines.push(c("bold", "  📁 By Project", nc));
    for (const [project, data] of Object.entries(outcomes.byProject)) {
      const shortName =
        project.length > 25 ? `...${project.slice(-22)}` : project;
      const tagStr = data.tags
        .map((t) => tagEmoji(t))
        .join(" ");
      lines.push(
        `    ${padRight(shortName, 27)} ${c("green", `${data.files} files`, nc)} ${tagStr}`
      );
    }
  }

  // Insight
  lines.push("");
  lines.push(c("bold", "  💡 Insight", nc));
  if (outcomes.testsAdded > 0) {
    const testPct = Math.round(
      (outcomes.testsAdded / Math.max(outcomes.totalFiles, 1)) * 100
    );
    lines.push(
      `    ${testPct}% of changes were tests — ${testPct > 20 ? c("green", "good test coverage", nc) : c("yellow", "consider adding more tests", nc)}`
    );
  }
  if (costs.totalCost > 0 && outcomes.filesCreated > 0) {
    const costPerFile = costs.totalCost / outcomes.filesCreated;
    lines.push(
      `    Cost per new file: ${c("yellow", formatDollars(costPerFile), nc)}`
    );
  }
  if (costs.totalCost > 0 && outcomes.totalFiles > 0) {
    const costPerOutcome = costs.totalCost / outcomes.totalFiles;
    lines.push(
      `    Cost per artifact: ${c("yellow", formatDollars(costPerOutcome), nc)}`
    );
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Format as JSON for programmatic consumption.
 */
export function formatJson(data: {
  sessions: Session[];
  costs: CostSummary;
  outcomes: OutcomeSummary;
}): string {
  return JSON.stringify(
    {
      version: "0.1.0",
      generated: new Date().toISOString(),
      summary: {
        sessions: data.costs.totalSessions,
        totalCost: Math.round(data.costs.totalCost * 100) / 100,
        totalTokens: data.costs.totalTokens,
        totalDurationMs: data.costs.totalDurationMs,
        filesCreated: data.outcomes.filesCreated,
        filesModified: data.outcomes.filesModified,
        filesDeleted: data.outcomes.filesDeleted,
        netLines: data.outcomes.netLines,
      },
      costs: {
        byAgent: data.costs.byAgent,
        byProject: data.costs.byProject,
        byModel: data.costs.byModel,
      },
      outcomes: {
        byTag: data.outcomes.byTag,
        byLanguage: data.outcomes.byLanguage,
        byProject: data.outcomes.byProject,
      },
      sessions: data.sessions.map((s) => ({
        id: s.id,
        agent: s.agent,
        project: s.project,
        startTime: s.startTime.toISOString(),
        endTime: s.endTime?.toISOString() ?? null,
        durationMs: s.durationMs,
        model: s.model,
        tokensIn: s.tokensIn,
        tokensOut: s.tokensOut,
        costEstimate: Math.round(s.costEstimate * 100) / 100,
        filesChanged: s.filesChanged.length,
        outcomes: s.outcomes,
      })),
    },
    null,
    2
  );
}
