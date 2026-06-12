/**
 * Outcome classifier — determines what agents actually built.
 *
 * This is the core differentiator of AgentCensus. While every other tool
 * stops at "how many tokens were used," AgentCensus classifies the OUTCOMES:
 *
 * - Features: new files, new functions, new components
 * - Bug fixes: patches to existing code
 * - Refactors: structural changes without new behavior
 * - Tests: test files created or modified
 * - Docs: documentation updates
 * - CI/CD: workflow, Docker, deploy changes
 * - Dependencies: package updates
 *
 * Classification is heuristic-based (analyzing file paths, change patterns,
 * and tool usage). Future versions will support user-defined classifiers
 * and LLM-assisted classification.
 */

import type {
  Session,
  OutcomeSummary,
  OutcomeTag,
  ProjectOutcome,
  FileChange,
} from "./types.js";

/**
 * Classify outcomes across all sessions.
 */
export async function classifyOutcomes(
  sessions: Session[]
): Promise<OutcomeSummary> {
  let totalFiles = 0;
  let filesCreated = 0;
  let filesModified = 0;
  let filesDeleted = 0;
  let totalLinesAdded = 0;
  let totalLinesRemoved = 0;
  let testsAdded = 0;
  let docsChanged = 0;

  const byTag: Record<OutcomeTag, number> = {
    feature: 0,
    bugfix: 0,
    refactor: 0,
    test: 0,
    docs: 0,
    config: 0,
    ci: 0,
    dependency: 0,
    unknown: 0,
  };

  const byLanguage: Record<string, number> = {};
  const byProject: Record<string, ProjectOutcome> = {};

  for (const session of sessions) {
    for (const file of session.filesChanged) {
      totalFiles++;

      switch (file.action) {
        case "created":
          filesCreated++;
          break;
        case "modified":
          filesModified++;
          break;
        case "deleted":
          filesDeleted++;
          break;
      }

      totalLinesAdded += file.linesAdded;
      totalLinesRemoved += file.linesRemoved;

      if (file.isTest) testsAdded++;
      if (file.isDoc) docsChanged++;

      // Count by language
      byLanguage[file.language] = (byLanguage[file.language] ?? 0) + 1;

      // Classify the file change
      const tag = classifyFile(file, session);
      byTag[tag]++;

      // Aggregate by project
      if (!byProject[session.project]) {
        byProject[session.project] = {
          files: 0,
          linesAdded: 0,
          linesRemoved: 0,
          tags: [],
        };
      }
      const proj = byProject[session.project];
      proj.files++;
      proj.linesAdded += file.linesAdded;
      proj.linesRemoved += file.linesRemoved;
      if (!proj.tags.includes(tag)) proj.tags.push(tag);
    }

    // If session has no file changes but has token usage, count as unknown
    if (session.filesChanged.length === 0 && session.totalTokens > 0) {
      byTag.unknown++;
    }
  }

  return {
    totalFiles,
    filesCreated,
    filesModified,
    filesDeleted,
    totalLinesAdded,
    totalLinesRemoved,
    netLines: totalLinesAdded - totalLinesRemoved,
    testsAdded,
    docsChanged,
    byTag,
    byLanguage,
    byProject,
  };
}

/**
 * Classify a single file change into an outcome tag.
 *
 * Priority order:
 * 1. Test files → "test"
 * 2. CI/CD files → "ci"
 * 3. Documentation → "docs"
 * 4. Config files → "config"
 * 5. Dependency files → "dependency"
 * 6. New files → "feature"
 * 7. Modified files → heuristic (bugfix vs refactor vs feature)
 * 8. Everything else → "unknown"
 */
function classifyFile(file: FileChange, session: Session): OutcomeTag {
  // Test files
  if (file.isTest) return "test";

  // CI/CD
  if (
    file.path.includes(".github/workflows") ||
    file.path.includes("Dockerfile") ||
    file.path.includes("docker-compose") ||
    file.path.includes("Jenkinsfile") ||
    file.path.includes(".circleci") ||
    file.path.includes(".gitlab-ci")
  ) {
    return "ci";
  }

  // Documentation
  if (file.isDoc) return "docs";

  // Dependency management
  if (isDependencyFile(file.path)) return "dependency";

  // Config files
  if (file.isConfig && file.action !== "created") return "config";

  // New files are typically features
  if (file.action === "created") return "feature";

  // Modified files — try to infer intent
  // This is where future LLM classification would shine
  if (file.action === "modified") {
    // If mostly deletions, likely a refactor
    if (file.linesRemoved > file.linesAdded * 2) return "refactor";

    // Small changes to existing files are often bugfixes
    if (file.linesAdded < 10 && file.linesRemoved < 10) return "bugfix";

    // Otherwise, feature addition
    return "feature";
  }

  return "unknown";
}

function isDependencyFile(path: string): boolean {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  return [
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "cargo.toml",
    "cargo.lock",
    "requirements.txt",
    "pyproject.toml",
    "go.mod",
    "go.sum",
    "gemfile",
    "gemfile.lock",
    "composer.json",
    "composer.lock",
  ].includes(name);
}
