/**
 * Tests for PR file classification logic.
 *
 * These test the classification heuristics used by the GitHub Action.
 * The actual GitHub API integration is tested via the dogfood workflow.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

// ── Re-implement the classification helpers for testing ────────────────
// (The pr-analyzer.ts is a standalone script; we extract the pure functions here)

type OutcomeTag =
  | "feature"
  | "bugfix"
  | "refactor"
  | "test"
  | "docs"
  | "config"
  | "ci"
  | "dependency"
  | "unknown";

interface PRFile {
  filename: string;
  status: "added" | "modified" | "removed" | "renamed" | "copied";
  additions: number;
  deletions: number;
  changes: number;
}

function isTestFile(path: string): boolean {
  return (
    path.includes(".test.") ||
    path.includes(".spec.") ||
    path.includes("_test.") ||
    path.includes("__tests__") ||
    path.includes("/test/") ||
    path.includes("/tests/") ||
    path.includes("/testing/") ||
    path.startsWith("test/") ||
    path.startsWith("tests/") ||
    path.startsWith("testing/") ||
    path.endsWith("_test.go") ||
    path.endsWith("_test.py")
  );
}

function isDocFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  return (
    ["md", "mdx", "txt", "rst"].includes(ext) ||
    ["readme", "changelog", "contributing", "license", "authors"].includes(
      name.replace(/\.[^.]+$/, "")
    ) ||
    path.includes("/docs/") ||
    path.includes("/documentation/")
  );
}

function isDependencyFile(name: string): boolean {
  return [
    "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
    "cargo.toml", "cargo.lock", "requirements.txt", "pyproject.toml",
    "poetry.lock", "go.mod", "go.sum", "gemfile", "gemfile.lock",
    "composer.json", "composer.lock", "build.gradle", "build.gradle.kts",
    "pom.xml", "pubspec.yaml", "pubspec.lock",
  ].includes(name);
}

function isConfigFile(path: string): boolean {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  return (
    name.startsWith(".") ||
    name === "tsconfig.json" || name === "vite.config.ts" ||
    name === "vitest.config.ts" || name === "eslint.config.js" ||
    name === "jest.config.ts" || name === "jest.config.js" ||
    name === ".eslintrc.json" || name === ".prettierrc" ||
    name.includes("config")
  );
}

function classifyFile(file: PRFile): OutcomeTag {
  const lower = file.filename.toLowerCase();
  const name = lower.split("/").pop() ?? "";

  if (isTestFile(lower)) return "test";
  if (
    lower.includes(".github/workflows") || lower.includes("dockerfile") ||
    lower.includes("docker-compose") || lower.includes("jenkinsfile") ||
    lower.includes(".circleci") || lower.includes(".gitlab-ci") ||
    lower.includes(".travis.yml") || name === "action.yml" || name === "action.yaml"
  ) return "ci";
  if (isDocFile(lower)) return "docs";
  if (isDependencyFile(name)) return "dependency";
  if (isConfigFile(lower) && file.status !== "added") return "config";
  if (file.status === "added") return "feature";
  if (file.status === "modified") {
    if (file.deletions > file.additions * 2) return "refactor";
    if (file.additions < 10 && file.deletions < 10) return "bugfix";
    return "feature";
  }
  if (file.status === "removed") return "refactor";
  if (file.status === "renamed") return "refactor";
  return "unknown";
}

// ── Tests ──────────────────────────────────────────────────────────────────────────

describe("PR file classification", () => {
  describe("test files", () => {
    it("classifies .test.ts files as test", () => {
      const file: PRFile = { filename: "src/utils.test.ts", status: "added", additions: 50, deletions: 0, changes: 50 };
      assert.equal(classifyFile(file), "test");
    });
    it("classifies .spec.js files as test", () => {
      const file: PRFile = { filename: "components/Button.spec.js", status: "modified", additions: 10, deletions: 5, changes: 15 };
      assert.equal(classifyFile(file), "test");
    });
    it("classifies Go test files as test", () => {
      const file: PRFile = { filename: "pkg/handler_test.go", status: "added", additions: 100, deletions: 0, changes: 100 };
      assert.equal(classifyFile(file), "test");
    });
    it("classifies __tests__ directory files as test", () => {
      const file: PRFile = { filename: "src/__tests__/App.tsx", status: "modified", additions: 20, deletions: 10, changes: 30 };
      assert.equal(classifyFile(file), "test");
    });
    it("classifies files in /tests/ directory as test", () => {
      const file: PRFile = { filename: "tests/integration/api.ts", status: "added", additions: 80, deletions: 0, changes: 80 };
      assert.equal(classifyFile(file), "test");
    });
  });

  describe("CI/CD files", () => {
    it("classifies GitHub Actions workflows as ci", () => {
      const file: PRFile = { filename: ".github/workflows/ci.yml", status: "modified", additions: 5, deletions: 3, changes: 8 };
      assert.equal(classifyFile(file), "ci");
    });
    it("classifies Dockerfile as ci", () => {
      const file: PRFile = { filename: "Dockerfile", status: "added", additions: 30, deletions: 0, changes: 30 };
      assert.equal(classifyFile(file), "ci");
    });
    it("classifies docker-compose files as ci", () => {
      const file: PRFile = { filename: "docker-compose.prod.yml", status: "modified", additions: 10, deletions: 5, changes: 15 };
      assert.equal(classifyFile(file), "ci");
    });
    it("classifies action.yml as ci", () => {
      const file: PRFile = { filename: "action.yml", status: "added", additions: 40, deletions: 0, changes: 40 };
      assert.equal(classifyFile(file), "ci");
    });
  });

  describe("documentation", () => {
    it("classifies .md files as docs", () => {
      const file: PRFile = { filename: "README.md", status: "modified", additions: 20, deletions: 5, changes: 25 };
      assert.equal(classifyFile(file), "docs");
    });
    it("classifies CONTRIBUTING.md as docs", () => {
      const file: PRFile = { filename: "CONTRIBUTING.md", status: "added", additions: 100, deletions: 0, changes: 100 };
      assert.equal(classifyFile(file), "docs");
    });
    it("classifies files in /docs/ as docs", () => {
      const file: PRFile = { filename: "docs/api-reference.md", status: "added", additions: 200, deletions: 0, changes: 200 };
      assert.equal(classifyFile(file), "docs");
    });
  });

  describe("dependencies", () => {
    it("classifies package.json as dependency", () => {
      const file: PRFile = { filename: "package.json", status: "modified", additions: 3, deletions: 2, changes: 5 };
      assert.equal(classifyFile(file), "dependency");
    });
    it("classifies Cargo.toml as dependency", () => {
      const file: PRFile = { filename: "Cargo.toml", status: "modified", additions: 1, deletions: 1, changes: 2 };
      assert.equal(classifyFile(file), "dependency");
    });
    it("classifies go.mod as dependency", () => {
      const file: PRFile = { filename: "go.mod", status: "modified", additions: 5, deletions: 3, changes: 8 };
      assert.equal(classifyFile(file), "dependency");
    });
  });

  describe("features", () => {
    it("classifies new source files as feature", () => {
      const file: PRFile = { filename: "src/components/Dashboard.tsx", status: "added", additions: 150, deletions: 0, changes: 150 };
      assert.equal(classifyFile(file), "feature");
    });
    it("classifies large modifications as feature", () => {
      const file: PRFile = { filename: "src/api/handler.ts", status: "modified", additions: 50, deletions: 10, changes: 60 };
      assert.equal(classifyFile(file), "feature");
    });
  });

  describe("bugfixes", () => {
    it("classifies small modifications as bugfix", () => {
      const file: PRFile = { filename: "src/utils/parser.ts", status: "modified", additions: 3, deletions: 2, changes: 5 };
      assert.equal(classifyFile(file), "bugfix");
    });
  });

  describe("refactors", () => {
    it("classifies heavy-deletion modifications as refactor", () => {
      const file: PRFile = { filename: "src/legacy/old-module.ts", status: "modified", additions: 5, deletions: 50, changes: 55 };
      assert.equal(classifyFile(file), "refactor");
    });
    it("classifies removed files as refactor", () => {
      const file: PRFile = { filename: "src/deprecated/old.ts", status: "removed", additions: 0, deletions: 100, changes: 100 };
      assert.equal(classifyFile(file), "refactor");
    });
    it("classifies renamed files as refactor", () => {
      const file: PRFile = { filename: "src/utils/helper.ts", status: "renamed", additions: 0, deletions: 0, changes: 0 };
      assert.equal(classifyFile(file), "refactor");
    });
  });

  describe("config", () => {
    it("classifies modified tsconfig.json as config", () => {
      const file: PRFile = { filename: "tsconfig.json", status: "modified", additions: 2, deletions: 1, changes: 3 };
      assert.equal(classifyFile(file), "config");
    });
    it("classifies new config files as feature (not config)", () => {
      const file: PRFile = { filename: "vitest.config.ts", status: "added", additions: 20, deletions: 0, changes: 20 };
      assert.equal(classifyFile(file), "feature");
    });
  });
});

describe("classification priorities", () => {
  it("test > feature (test files that are newly created)", () => {
    const file: PRFile = { filename: "tests/new-feature.test.ts", status: "added", additions: 100, deletions: 0, changes: 100 };
    assert.equal(classifyFile(file), "test");
  });
  it("ci > docs (CI files that happen to be .yml)", () => {
    const file: PRFile = { filename: ".github/workflows/deploy.yml", status: "added", additions: 50, deletions: 0, changes: 50 };
    assert.equal(classifyFile(file), "ci");
  });
  it("test > ci (test file in a CI-like path)", () => {
    const file: PRFile = { filename: "tests/ci-helpers.test.ts", status: "added", additions: 30, deletions: 0, changes: 30 };
    assert.equal(classifyFile(file), "test");
  });
});
