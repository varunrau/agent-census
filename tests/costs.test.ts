/**
 * Tests for the cost calculator module.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateCosts } from "../src/costs.js";
import type { Session } from "../src/types.js";

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
    costEstimate: 0,
    filesChanged: [],
    outcomes: [],
    sourcePath: "/test/path",
    ...overrides,
  };
}

describe("calculateCosts", () => {
  it("calculates cost for Claude Sonnet 4", () => {
    const sessions = [makeSession()];
    const result = calculateCosts(sessions);

    // Sonnet 4: $3/M input, $15/M output
    // 10000 input = $0.03, 5000 output = $0.075
    const expectedCost = (10000 / 1_000_000) * 3.0 + (5000 / 1_000_000) * 15.0;
    assert.equal(result.totalCost, expectedCost);
    assert.equal(result.totalTokensIn, 10000);
    assert.equal(result.totalTokensOut, 5000);
    assert.equal(result.totalTokens, 15000);
    assert.equal(result.totalSessions, 1);
  });

  it("calculates cost for Claude Opus 4", () => {
    const sessions = [
      makeSession({
        model: "claude-opus-4-20250514",
        tokensIn: 100000,
        tokensOut: 20000,
      }),
    ];
    const result = calculateCosts(sessions);

    // Opus 4: $15/M input, $75/M output
    const expectedCost =
      (100000 / 1_000_000) * 15.0 + (20000 / 1_000_000) * 75.0;
    assert.equal(result.totalCost, expectedCost);
  });

  it("calculates cost for GPT-4o", () => {
    const sessions = [
      makeSession({
        agent: "codex",
        model: "gpt-4o",
        tokensIn: 50000,
        tokensOut: 10000,
      }),
    ];
    const result = calculateCosts(sessions);

    // GPT-4o: $2.5/M input, $10/M output
    const expectedCost =
      (50000 / 1_000_000) * 2.5 + (10000 / 1_000_000) * 10.0;
    assert.equal(result.totalCost, expectedCost);
  });

  it("uses default pricing for unknown models", () => {
    const sessions = [
      makeSession({
        model: "some-unknown-model",
        tokensIn: 10000,
        tokensOut: 5000,
      }),
    ];
    const result = calculateCosts(sessions);

    // Default: $3/M input, $15/M output (same as Sonnet)
    const expectedCost =
      (10000 / 1_000_000) * 3.0 + (5000 / 1_000_000) * 15.0;
    assert.equal(result.totalCost, expectedCost);
  });

  it("aggregates costs across multiple sessions", () => {
    const sessions = [
      makeSession({ tokensIn: 10000, tokensOut: 5000 }),
      makeSession({
        id: "session-2",
        tokensIn: 20000,
        tokensOut: 10000,
      }),
    ];
    const result = calculateCosts(sessions);

    assert.equal(result.totalTokensIn, 30000);
    assert.equal(result.totalTokensOut, 15000);
    assert.equal(result.totalSessions, 2);
  });

  it("groups costs by agent", () => {
    const sessions = [
      makeSession({ agent: "claude", tokensIn: 10000, tokensOut: 5000 }),
      makeSession({
        id: "session-2",
        agent: "codex",
        model: "gpt-4o",
        tokensIn: 20000,
        tokensOut: 10000,
      }),
    ];
    const result = calculateCosts(sessions);

    assert.ok(result.byAgent.claude);
    assert.ok(result.byAgent.codex);
    assert.equal(result.byAgent.claude.sessions, 1);
    assert.equal(result.byAgent.codex.sessions, 1);
    assert.equal(result.byAgent.claude.tokensIn, 10000);
    assert.equal(result.byAgent.codex.tokensIn, 20000);
  });

  it("groups costs by project", () => {
    const sessions = [
      makeSession({ project: "project-a", tokensIn: 10000, tokensOut: 5000 }),
      makeSession({
        id: "session-2",
        project: "project-b",
        tokensIn: 20000,
        tokensOut: 10000,
      }),
    ];
    const result = calculateCosts(sessions);

    assert.ok("project-a" in result.byProject);
    assert.ok("project-b" in result.byProject);
  });

  it("groups costs by model", () => {
    const sessions = [
      makeSession({
        model: "claude-sonnet-4-20250514",
        tokensIn: 10000,
        tokensOut: 5000,
      }),
      makeSession({
        id: "session-2",
        model: "claude-opus-4-20250514",
        tokensIn: 20000,
        tokensOut: 10000,
      }),
    ];
    const result = calculateCosts(sessions);

    assert.ok("claude-sonnet-4-20250514" in result.byModel);
    assert.ok("claude-opus-4-20250514" in result.byModel);
  });

  it("handles empty sessions array", () => {
    const result = calculateCosts([]);
    assert.equal(result.totalCost, 0);
    assert.equal(result.totalSessions, 0);
    assert.equal(result.totalTokensIn, 0);
    assert.equal(result.totalTokensOut, 0);
  });

  it("handles sessions with zero tokens", () => {
    const sessions = [
      makeSession({ tokensIn: 0, tokensOut: 0, totalTokens: 0 }),
    ];
    const result = calculateCosts(sessions);
    assert.equal(result.totalCost, 0);
    assert.equal(result.totalSessions, 1);
  });

  it("mutates session.costEstimate", () => {
    const sessions = [makeSession()];
    assert.equal(sessions[0].costEstimate, 0);
    calculateCosts(sessions);
    assert.ok(sessions[0].costEstimate > 0);
  });

  it("uses fuzzy matching for model variants", () => {
    const sessions = [
      makeSession({
        model: "claude-sonnet-4-20250514-extended",
        tokensIn: 10000,
        tokensOut: 5000,
      }),
    ];
    const result = calculateCosts(sessions);

    // Should match Sonnet 4 pricing via fuzzy match
    const sonnetCost =
      (10000 / 1_000_000) * 3.0 + (5000 / 1_000_000) * 15.0;
    assert.equal(result.totalCost, sonnetCost);
  });

  it("uses heuristic pricing for model families", () => {
    // "opus" in the name → Opus pricing
    const sessions = [
      makeSession({
        model: "my-custom-opus-model",
        tokensIn: 1_000_000,
        tokensOut: 0,
      }),
    ];
    const result = calculateCosts(sessions);
    assert.equal(result.totalCost, 15.0); // Opus input: $15/M
  });

  it("accumulates duration across sessions", () => {
    const sessions = [
      makeSession({ durationMs: 60000 }),
      makeSession({ id: "s2", durationMs: 120000 }),
    ];
    const result = calculateCosts(sessions);
    assert.equal(result.totalDurationMs, 180000);
  });
});
