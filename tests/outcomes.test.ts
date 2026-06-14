/**
 * Tests for the outcome classification module.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyOutcomes } from "../src/outcomes.js";
import type { Session, FileChange } from "../src/types.js";

function makeFileChange(overrides: Partial<FileChange> = {}): FileChange {
  return {
    path: "src/index.ts",
    action: "created",
    linesAdded: 50,
    linesRemoved: 0,
    isTest: false,
    isConfig: false,
    isDoc: false,
    language: "TypeScript",
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
    outcomes: [],
    sourcePath: "/test/path",
    ...overrides,
  };
}

describe("classifyOutcomes", () => {
  it("classifies new source files as features", async () => {
    const sessions = [
      makeSession({
        filesChanged: [
          makeFileChange({ path: "src/auth.ts", action: "created" }),
          makeFileChange({ path: "src/db.ts", action: "created" }),
        ],
      }),
    ];
    const result = await classifyOutcomes(sessions);
    assert.equal(result.byTag.feature, 2);
    assert.equal(result.filesCreated, 2);
  });

  it("classifies test files as tests", async () => {
    const sessions = [
      makeSession({
        filesChanged: [
          makeFileChange({
            path: "src/__tests__/auth.test.ts",
            action: "created",
            isTest: true,
          }),
          makeFileChange({
            path: "tests/feature.spec.ts",
            action: "created",
            isTest: true,
          }),
        ],
      }),
    ];
    const result = await classifyOutcomes(sessions);
    assert.equal(result.byTag.test, 2);
    assert.equal(result.testsAdded, 2);
  });

  it("classifies CI files correctly", async () => {
    const sessions = [
      makeSession({
        filesChanged: [
          makeFileChange({
            path: ".github/workflows/ci.yml",
            action: "created",
          }),
          makeFileChange({ path: "Dockerfile", action: "created" }),
        ],
      }),
    ];
    const result = await classifyOutcomes(sessions);
    assert.equal(result.byTag.ci, 2);
  });

  it("classifies documentation files", async () => {
    const sessions = [
      makeSession({
        filesChanged: [
          makeFileChange({
            path: "README.md",
            action: "modified",
            isDoc: true,
          }),
          makeFileChange({
            path: "docs/guide.md",
            action: "created",
            isDoc: true,
          }),
        ],
      }),
    ];
    const result = await classifyOutcomes(sessions);
    assert.equal(result.byTag.docs, 2);
    assert.equal(result.docsChanged, 2);
  });

  it("classifies dependency files", async () => {
    const sessions = [
      makeSession({
        filesChanged: [
          makeFileChange({
            path: "package.json",
            action: "modified",
            isConfig: true,
          }),
          makeFileChange({
            path: "requirements.txt",
            action: "modified",
          }),
        ],
      }),
    ];
    const result = await classifyOutcomes(sessions);
    assert.equal(result.byTag.dependency, 2);
  });

  it("classifies config file modifications as config", async () => {
    const sessions = [
      makeSession({
        filesChanged: [
          makeFileChange({
            path: "tsconfig.json",
            action: "modified",
            isConfig: true,
          }),
        ],
      }),
    ];
    const result = await classifyOutcomes(sessions);
    assert.equal(result.byTag.config, 1);
  });

  it("counts sessions with no file changes as unknown", async () => {
    const sessions = [
      makeSession({
        filesChanged: [],
        totalTokens: 5000,
      }),
    ];
    const result = await classifyOutcomes(sessions);
    assert.equal(result.byTag.unknown, 1);
  });

  it("aggregates file counts correctly", async () => {
    const sessions = [
      makeSession({
        filesChanged: [
          makeFileChange({ action: "created" }),
          makeFileChange({ path: "b.ts", action: "modified" }),
          makeFileChange({ path: "c.ts", action: "modified" }),
        ],
      }),
    ];
    const result = await classifyOutcomes(sessions);
    assert.equal(result.totalFiles, 3);
    assert.equal(result.filesCreated, 1);
    assert.equal(result.filesModified, 2);
    assert.equal(result.filesDeleted, 0);
  });

  it("aggregates line counts", async () => {
    const sessions = [
      makeSession({
        filesChanged: [
          makeFileChange({ linesAdded: 100, linesRemoved: 20 }),
          makeFileChange({ path: "b.ts", linesAdded: 50, linesRemoved: 30 }),
        ],
      }),
    ];
    const result = await classifyOutcomes(sessions);
    assert.equal(result.totalLinesAdded, 150);
    assert.equal(result.totalLinesRemoved, 50);
    assert.equal(result.netLines, 100);
  });

  it("tracks languages correctly", async () => {
    const sessions = [
      makeSession({
        filesChanged: [
          makeFileChange({ path: "a.ts", language: "TypeScript" }),
          makeFileChange({ path: "b.ts", language: "TypeScript" }),
          makeFileChange({ path: "c.py", language: "Python" }),
        ],
      }),
    ];
    const result = await classifyOutcomes(sessions);
    assert.equal(result.byLanguage["TypeScript"], 2);
    assert.equal(result.byLanguage["Python"], 1);
  });

  it("tracks per-project outcomes", async () => {
    const sessions = [
      makeSession({
        project: "project-a",
        filesChanged: [
          makeFileChange({ path: "a.ts" }),
          makeFileChange({ path: "b.ts" }),
        ],
      }),
      makeSession({
        id: "s2",
        project: "project-b",
        filesChanged: [makeFileChange({ path: "c.py", language: "Python" })],
      }),
    ];
    const result = await classifyOutcomes(sessions);
    assert.equal(result.byProject["project-a"].files, 2);
    assert.equal(result.byProject["project-b"].files, 1);
  });

  it("handles empty sessions array", async () => {
    const result = await classifyOutcomes([]);
    assert.equal(result.totalFiles, 0);
    assert.equal(result.filesCreated, 0);
    assert.equal(result.filesModified, 0);
    assert.equal(result.filesDeleted, 0);
  });

  it("handles mixed outcome types in one session", async () => {
    const sessions = [
      makeSession({
        filesChanged: [
          makeFileChange({ path: "src/auth.ts", action: "created" }),
          makeFileChange({
            path: "tests/auth.test.ts",
            action: "created",
            isTest: true,
          }),
          makeFileChange({
            path: "README.md",
            action: "modified",
            isDoc: true,
          }),
          makeFileChange({
            path: ".github/workflows/ci.yml",
            action: "created",
          }),
          makeFileChange({
            path: "package.json",
            action: "modified",
            isConfig: true,
          }),
        ],
      }),
    ];
    const result = await classifyOutcomes(sessions);
    assert.equal(result.byTag.feature, 1); // auth.ts
    assert.equal(result.byTag.test, 1); // auth.test.ts
    assert.equal(result.byTag.docs, 1); // README.md
    assert.equal(result.byTag.ci, 1); // ci.yml
    assert.equal(result.byTag.dependency, 1); // package.json
    assert.equal(result.totalFiles, 5);
  });
});
