/**
 * Tests for the report formatter module.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatReport,
  formatJson,
  formatCsv,
  formatOutcomeReport,
} from "../src/report.js";
import type {
  Session,
  CostSummary,
  OutcomeSummary,
} from "../src/types.js";

function makeCosts(overrides: Partial<CostSummary> = {}): CostSummary {
  return {
    totalCost: 47.32,
    totalTokensIn: 1200000,
    totalTokensOut: 489300,
    totalTokens: 1689300,
    totalSessions: 23,
    totalDurationMs: 15120000,
    byAgent: {
      claude: { sessions: 18, cost: 38.14, tokensIn: 900000, tokensOut: 350000 },
      codex: { sessions: 5, cost: 9.18, tokensIn: 300000, tokensOut: 139300 },
    },
    byProject: { "my-app": 30.0, "other-project": 17.32 },
    byModel: {
      "claude-sonnet-4-20250514": 38.14,
      "gpt-4o": 9.18,
    },
    ...overrides,
  };
}

function makeOutcomes(
  overrides: Partial<OutcomeSummary> = {}
): OutcomeSummary {
  return {
    totalFiles: 35,
    filesCreated: 12,
    filesModified: 20,
    filesDeleted: 3,
    totalLinesAdded: 1500,
    totalLinesRemoved: 300,
    netLines: 1200,
    testsAdded: 7,
    docsChanged: 4,
    byTag: {
      feature: 18,
      bugfix: 8,
      refactor: 0,
      test: 7,
      docs: 4,
      config: 1,
      ci: 2,
      dependency: 0,
      unknown: 0,
    },
    byLanguage: { TypeScript: 24, Python: 8, YAML: 3 },
    byProject: {},
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "test-session",
    agent: "claude",
    project: "test-project",
    startTime: new Date("2026-06-10T09:00:00Z"),
    endTime: new Date("2026-06-10T09:30:00Z"),
    durationMs: 1800000,
    model: "claude-sonnet-4-20250514",
    tokensIn: 10000,
    tokensOut: 5000,
    totalTokens: 15000,
    costEstimate: 0.105,
    filesChanged: [],
    outcomes: ["feature"],
    sourcePath: "/test/path",
    ...overrides,
  };
}

describe("formatReport", () => {
  it("includes session count", () => {
    const output = formatReport(
      [makeSession()],
      makeCosts({ totalSessions: 23 }),
      makeOutcomes(),
      { noColor: true }
    );
    assert.ok(output.includes("23 sessions"));
  });

  it("includes cost total", () => {
    const output = formatReport(
      [makeSession()],
      makeCosts({ totalCost: 47.32 }),
      makeOutcomes(),
      { noColor: true }
    );
    assert.ok(output.includes("$47.32"));
  });

  it("includes agent breakdown", () => {
    const output = formatReport(
      [makeSession()],
      makeCosts(),
      makeOutcomes(),
      { noColor: true }
    );
    assert.ok(output.includes("claude"));
    assert.ok(output.includes("codex"));
  });

  it("includes outcome tags", () => {
    const output = formatReport(
      [makeSession()],
      makeCosts(),
      makeOutcomes(),
      { noColor: true }
    );
    assert.ok(output.includes("feature"));
    assert.ok(output.includes("\ud83d\ude80"));
  });

  it("includes file change counts", () => {
    const output = formatReport(
      [makeSession()],
      makeCosts(),
      makeOutcomes({ filesCreated: 12, filesModified: 20, filesDeleted: 3 }),
      { noColor: true }
    );
    assert.ok(output.includes("+12"));
    assert.ok(output.includes("~20"));
    assert.ok(output.includes("-3"));
  });

  it("shows sessions in detail mode", () => {
    const output = formatReport(
      [makeSession({ project: "test-project" })],
      makeCosts(),
      makeOutcomes(),
      { noColor: true, detail: "sessions" }
    );
    assert.ok(output.includes("Sessions"));
    assert.ok(output.includes("test-project"));
  });

  it("shows compare view with multiple agents", () => {
    const output = formatReport(
      [makeSession()],
      makeCosts(),
      makeOutcomes(),
      { noColor: true, detail: "compare" }
    );
    assert.ok(output.includes("Agent Comparison"));
  });

  it("handles no-file-changes gracefully", () => {
    const output = formatReport(
      [makeSession()],
      makeCosts(),
      makeOutcomes({ totalFiles: 0 }),
      { noColor: true }
    );
    assert.ok(output.includes("No file changes"));
  });

  it("strips ANSI codes when noColor is true", () => {
    const output = formatReport(
      [makeSession()],
      makeCosts(),
      makeOutcomes(),
      { noColor: true }
    );
    assert.ok(!output.includes("\x1b["));
  });

  it("includes ANSI codes when noColor is false", () => {
    const output = formatReport(
      [makeSession()],
      makeCosts(),
      makeOutcomes(),
      { noColor: false }
    );
    assert.ok(output.includes("\x1b["));
  });
});

describe("formatOutcomeReport", () => {
  it("includes cost and session count", () => {
    const output = formatOutcomeReport(makeOutcomes(), makeCosts(), {
      noColor: true,
    });
    assert.ok(output.includes("$47.32"));
    assert.ok(output.includes("23 sessions"));
  });

  it("includes classification breakdown", () => {
    const output = formatOutcomeReport(makeOutcomes(), makeCosts(), {
      noColor: true,
    });
    assert.ok(output.includes("feature"));
    assert.ok(output.includes("bugfix"));
    assert.ok(output.includes("test"));
  });

  it("includes language breakdown", () => {
    const output = formatOutcomeReport(makeOutcomes(), makeCosts(), {
      noColor: true,
    });
    assert.ok(output.includes("TypeScript"));
    assert.ok(output.includes("Python"));
  });

  it("shows cost per file insight", () => {
    const output = formatOutcomeReport(
      makeOutcomes({ filesCreated: 10 }),
      makeCosts({ totalCost: 50 }),
      { noColor: true }
    );
    assert.ok(output.includes("Cost per new file"));
    assert.ok(output.includes("$5.00"));
  });
});

describe("formatCsv", () => {
  it("includes header row", () => {
    const output = formatCsv([makeSession()]);
    const firstLine = output.split("\n")[0];
    assert.ok(firstLine.includes("id"));
    assert.ok(firstLine.includes("agent"));
    assert.ok(firstLine.includes("project"));
    assert.ok(firstLine.includes("cost_estimate"));
    assert.ok(firstLine.includes("outcomes"));
  });

  it("includes session data rows", () => {
    const output = formatCsv([
      makeSession({ id: "abc123", agent: "claude", project: "my-app" }),
    ]);
    const lines = output.trim().split("\n");
    assert.equal(lines.length, 2); // header + 1 row
    assert.ok(lines[1].includes("abc123"));
    assert.ok(lines[1].includes("claude"));
    assert.ok(lines[1].includes("my-app"));
  });

  it("handles multiple sessions", () => {
    const output = formatCsv([
      makeSession({ id: "s1" }),
      makeSession({ id: "s2" }),
      makeSession({ id: "s3" }),
    ]);
    const lines = output.trim().split("\n");
    assert.equal(lines.length, 4); // header + 3 rows
  });

  it("escapes fields containing commas", () => {
    const output = formatCsv([
      makeSession({ project: "my,app" }),
    ]);
    assert.ok(output.includes('"my,app"'));
  });

  it("escapes fields containing quotes", () => {
    const output = formatCsv([
      makeSession({ project: 'my"app' }),
    ]);
    assert.ok(output.includes('"my""app"'));
  });

  it("returns empty CSV for no sessions", () => {
    const output = formatCsv([]);
    const lines = output.trim().split("\n");
    assert.equal(lines.length, 1); // just the header
  });

  it("includes ISO dates", () => {
    const output = formatCsv([
      makeSession({ startTime: new Date("2026-06-10T09:00:00Z") }),
    ]);
    assert.ok(output.includes("2026-06-10T09:00:00.000Z"));
  });
});

describe("formatJson", () => {
  it("returns valid JSON", () => {
    const output = formatJson({
      sessions: [makeSession()],
      costs: makeCosts(),
      outcomes: makeOutcomes(),
    });
    const parsed = JSON.parse(output);
    assert.ok(parsed);
    assert.ok(parsed.version);
    assert.ok(parsed.generated);
  });

  it("includes summary fields", () => {
    const output = formatJson({
      sessions: [makeSession()],
      costs: makeCosts(),
      outcomes: makeOutcomes(),
    });
    const parsed = JSON.parse(output);
    assert.ok("sessions" in parsed.summary);
    assert.ok("totalCost" in parsed.summary);
    assert.ok("filesCreated" in parsed.summary);
  });

  it("includes session details", () => {
    const output = formatJson({
      sessions: [makeSession({ id: "my-session", agent: "claude" })],
      costs: makeCosts(),
      outcomes: makeOutcomes(),
    });
    const parsed = JSON.parse(output);
    assert.equal(parsed.sessions.length, 1);
    assert.equal(parsed.sessions[0].id, "my-session");
    assert.equal(parsed.sessions[0].agent, "claude");
  });

  it("includes cost breakdowns", () => {
    const output = formatJson({
      sessions: [makeSession()],
      costs: makeCosts(),
      outcomes: makeOutcomes(),
    });
    const parsed = JSON.parse(output);
    assert.ok(parsed.costs.byAgent);
    assert.ok(parsed.costs.byProject);
    assert.ok(parsed.costs.byModel);
  });

  it("includes outcome breakdowns", () => {
    const output = formatJson({
      sessions: [makeSession()],
      costs: makeCosts(),
      outcomes: makeOutcomes(),
    });
    const parsed = JSON.parse(output);
    assert.ok(parsed.outcomes.byTag);
    assert.ok(parsed.outcomes.byLanguage);
  });

  it("serializes dates as ISO strings", () => {
    const output = formatJson({
      sessions: [makeSession({ startTime: new Date("2026-06-10T09:00:00Z") })],
      costs: makeCosts(),
      outcomes: makeOutcomes(),
    });
    const parsed = JSON.parse(output);
    assert.equal(parsed.sessions[0].startTime, "2026-06-10T09:00:00.000Z");
  });
});
