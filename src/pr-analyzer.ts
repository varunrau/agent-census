#!/usr/bin/env node

/**
 * PR Outcome Analyzer — GitHub Action entry point.
 *
 * Fetches changed files from a pull request, classifies each one
 * using the AgentCensus outcome engine, and reports what was built.
 *
 * This demonstrates the core AgentCensus value prop:
 *   "Don't just show the diff — classify what was BUILT."
 *
 * Environment variables (set by action.yml):
 *   GITHUB_TOKEN     — for API access
 *   PR_NUMBER        — pull request number
 *   REPO_OWNER       — repository owner
 *   REPO_NAME        — repository name
 *   INPUT_COMMENT    — whether to post a PR comment
 *   INPUT_SUMMARY    — whether to add to job summary
 *   GITHUB_STEP_SUMMARY — path to summary file (set by Actions)
 *   GITHUB_OUTPUT    — path to output file (set by Actions)
 */

import { writeFileSync, appendFileSync } from "node:fs";
import { extname, basename } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────────────

interface PRFile {
  filename: string;
  status: "added" | "modified" | "removed" | "renamed" | "copied";
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

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

interface ClassifiedFile {
  path: string;
  status: string;
  tag: OutcomeTag;
  additions: number;
  deletions: number;
  language: string;
}

interface Classification {
  totalFiles: number;
  filesAdded: number;
  filesModified: number;
  filesRemoved: number;
  filesRenamed: number;
  totalAdditions: number;
  totalDeletions: number;
  netLines: number;
  byTag: Record<OutcomeTag, number>;
  byLanguage: Record<string, number>;
  primaryTag: OutcomeTag;
  files: ClassifiedFile[];
}

// ── GitHub API ─────────────────────────────────────────────────────────────────

async function fetchPRFiles(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<PRFile[]> {
  const allFiles: PRFile[] = [];
  let page = 1;

  while (true) {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "agent-census-action",
      },
    });

    if (!res.ok) {
      throw new Error(
        `GitHub API error ${res.status}: ${await res.text()}`
      );
    }

    const files: PRFile[] = await res.json();
    if (files.length === 0) break;
    allFiles.push(...files);

    if (files.length < 100) break;
    page++;
  }

  return allFiles;
}

async function postPRComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  token: string
): Promise<void> {
  // First, check if we already have a comment (avoid duplicates)
  const commentsUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`;
  const commentsRes = await fetch(commentsUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "agent-census-action",
    },
  });

  if (commentsRes.ok) {
    const comments: { id: number; body: string }[] = await commentsRes.json();
    const existing = comments.find((c) =>
      c.body.includes("<!-- agent-census-classification -->")
    );

    if (existing) {
      // Update existing comment
      const updateUrl = `https://api.github.com/repos/${owner}/${repo}/issues/comments/${existing.id}`;
      await fetch(updateUrl, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "agent-census-action",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body }),
      });
      return;
    }
  }

  // Post new comment
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "agent-census-action",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
  });

  if (!res.ok) {
    console.error(`Failed to post comment: ${res.status} ${await res.text()}`);
  }
}

// ── Classification Engine ──────────────────────────────────────────────────────
// Adapted from src/outcomes.ts for PR context

function classifyFile(file: PRFile): OutcomeTag {
  const path = file.filename;
  const lower = path.toLowerCase();
  const name = basename(lower);

  // 1. Test files
  if (isTestFile(lower)) return "test";

  // 2. CI/CD
  if (
    lower.includes(".github/workflows") ||
    lower.includes("dockerfile") ||
    lower.includes("docker-compose") ||
    lower.includes("jenkinsfile") ||
    lower.includes(".circleci") ||
    lower.includes(".gitlab-ci") ||
    lower.includes(".travis.yml") ||
    name === "action.yml" ||
    name === "action.yaml"
  ) {
    return "ci";
  }

  // 3. Documentation
  if (isDocFile(lower)) return "docs";

  // 4. Dependencies
  if (isDependencyFile(name)) return "dependency";

  // 5. Config files (only when modified, not created)
  if (isConfigFile(lower) && file.status !== "added") return "config";

  // 6. New files → feature
  if (file.status === "added") return "feature";

  // 7. Modified files → heuristic
  if (file.status === "modified") {
    // Mostly deletions → refactor
    if (file.deletions > file.additions * 2) return "refactor";

    // Small targeted changes → bugfix
    if (file.additions < 10 && file.deletions < 10) return "bugfix";

    // Larger changes → feature
    return "feature";
  }

  // 8. Removed files → refactor (cleaning up)
  if (file.status === "removed") return "refactor";

  // 9. Renamed → refactor
  if (file.status === "renamed") return "refactor";

  return "unknown";
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
  const ext = extname(path);
  const name = basename(path);
  return (
    ext === ".md" ||
    ext === ".mdx" ||
    ext === ".txt" ||
    ext === ".rst" ||
    name === "readme" ||
    name === "changelog" ||
    name === "contributing" ||
    name === "license" ||
    name === "authors" ||
    path.includes("/docs/") ||
    path.includes("/documentation/")
  );
}

function isDependencyFile(name: string): boolean {
  return [
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "cargo.toml",
    "cargo.lock",
    "requirements.txt",
    "pyproject.toml",
    "poetry.lock",
    "go.mod",
    "go.sum",
    "gemfile",
    "gemfile.lock",
    "composer.json",
    "composer.lock",
    "build.gradle",
    "build.gradle.kts",
    "pom.xml",
    "pubspec.yaml",
    "pubspec.lock",
  ].includes(name);
}

function isConfigFile(path: string): boolean {
  const name = basename(path.toLowerCase());
  return (
    name.startsWith(".") ||
    name === "tsconfig.json" ||
    name === "vite.config.ts" ||
    name === "vitest.config.ts" ||
    name === "eslint.config.js" ||
    name === "jest.config.ts" ||
    name === "jest.config.js" ||
    name === ".eslintrc.json" ||
    name === ".prettierrc" ||
    name.includes("config")
  );
}

function extToLanguage(ext: string): string {
  const map: Record<string, string> = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".py": "Python",
    ".rs": "Rust",
    ".go": "Go",
    ".java": "Java",
    ".rb": "Ruby",
    ".swift": "Swift",
    ".kt": "Kotlin",
    ".c": "C",
    ".cpp": "C++",
    ".h": "C/C++",
    ".cs": "C#",
    ".php": "PHP",
    ".html": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".sql": "SQL",
    ".sh": "Shell",
    ".bash": "Shell",
    ".yml": "YAML",
    ".yaml": "YAML",
    ".json": "JSON",
    ".toml": "TOML",
    ".md": "Markdown",
    ".mdx": "MDX",
    ".dockerfile": "Docker",
    ".tf": "Terraform",
    ".hcl": "HCL",
    ".vue": "Vue",
    ".svelte": "Svelte",
    ".dart": "Dart",
    ".r": "R",
    ".scala": "Scala",
    ".ex": "Elixir",
    ".exs": "Elixir",
    ".zig": "Zig",
  };
  return map[ext] ?? "Other";
}

// ── Classification ───────────────────────────────────────────────────────────

function classifyPR(files: PRFile[]): Classification {
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
  const classified: ClassifiedFile[] = [];

  let filesAdded = 0;
  let filesModified = 0;
  let filesRemoved = 0;
  let filesRenamed = 0;
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const file of files) {
    const tag = classifyFile(file);
    byTag[tag]++;

    const ext = extname(file.filename).toLowerCase();
    const lang = extToLanguage(ext);
    byLanguage[lang] = (byLanguage[lang] ?? 0) + 1;

    switch (file.status) {
      case "added":
        filesAdded++;
        break;
      case "modified":
        filesModified++;
        break;
      case "removed":
        filesRemoved++;
        break;
      case "renamed":
        filesRenamed++;
        break;
    }

    totalAdditions += file.additions;
    totalDeletions += file.deletions;

    classified.push({
      path: file.filename,
      status: file.status,
      tag,
      additions: file.additions,
      deletions: file.deletions,
      language: lang,
    });
  }

  // Primary tag = most common non-unknown tag
  const primaryTag =
    (Object.entries(byTag)
      .filter(([t]) => t !== "unknown")
      .sort(([, a], [, b]) => b - a)[0]?.[0] as OutcomeTag) ?? "unknown";

  return {
    totalFiles: files.length,
    filesAdded,
    filesModified,
    filesRemoved,
    filesRenamed,
    totalAdditions,
    totalDeletions,
    netLines: totalAdditions - totalDeletions,
    byTag,
    byLanguage,
    primaryTag,
    files: classified,
  };
}

// ── Report Formatting ────────────────────────────────────────────────────────

const TAG_EMOJI: Record<OutcomeTag, string> = {
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

const TAG_LABEL: Record<OutcomeTag, string> = {
  feature: "Feature",
  bugfix: "Bug Fix",
  refactor: "Refactor",
  test: "Tests",
  docs: "Documentation",
  config: "Config",
  ci: "CI/CD",
  dependency: "Dependencies",
  unknown: "Other",
};

function formatMarkdown(
  c: Classification,
  prNumber: number,
  repo: string
): string {
  const lines: string[] = [];

  lines.push("<!-- agent-census-classification -->");
  lines.push("## 📊 AgentCensus — PR Classification");
  lines.push("");

  // Primary classification
  const primary = `${TAG_EMOJI[c.primaryTag]} **${TAG_LABEL[c.primaryTag]}**`;
  lines.push(`> This PR is primarily a **${primary}** change.`);
  lines.push("");

  // Summary stats
  lines.push("### Summary");
  lines.push("");
  lines.push(
    `| Files | Added | Modified | Removed | Lines |`
  );
  lines.push(`|:-----:|:-----:|:--------:|:-------:|:-----:|`);
  lines.push(
    `| ${c.totalFiles} | +${c.filesAdded} | ~${c.filesModified} | -${c.filesRemoved} | ${c.netLines >= 0 ? "+" : ""}${c.netLines} net |`
  );
  lines.push("");

  // Outcome breakdown
  const activeTags = Object.entries(c.byTag)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);

  if (activeTags.length > 0) {
    lines.push("### Outcome Breakdown");
    lines.push("");
    lines.push("| Category | Files | |");
    lines.push("|:---------|------:|:-|");

    for (const [tag, count] of activeTags) {
      const t = tag as OutcomeTag;
      const pct = Math.round((count / c.totalFiles) * 100);
      const bar = "█".repeat(Math.max(1, Math.round(pct / 5)));
      lines.push(
        `| ${TAG_EMOJI[t]} ${TAG_LABEL[t]} | ${count} | ${bar} ${pct}% |`
      );
    }
    lines.push("");
  }

  // Language breakdown
  const activeLangs = Object.entries(c.byLanguage)
    .filter(([lang]) => lang !== "Other")
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  if (activeLangs.length > 0) {
    lines.push("### Languages");
    lines.push("");
    lines.push(
      activeLangs
        .map(([lang, count]) => `\`${lang}\` (${count})`)
        .join(" \u00b7 ")
    );
    lines.push("");
  }

  // File details (collapsed)
  if (c.files.length > 0 && c.files.length <= 50) {
    lines.push("<details>");
    lines.push(
      `<summary>📋 File classification details (${c.files.length} files)</summary>`
    );
    lines.push("");
    lines.push("| File | Status | Classification | +/- |");
    lines.push("|:-----|:------:|:--------------:|----:|");

    for (const f of c.files) {
      const t = f.tag;
      const shortPath =
        f.path.length > 50 ? `\u2026${f.path.slice(-47)}` : f.path;
      lines.push(
        `| \`${shortPath}\` | ${f.status} | ${TAG_EMOJI[t]} ${TAG_LABEL[t]} | +${f.additions}/-${f.deletions} |`
      );
    }

    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  // Footer
  lines.push(
    `<sub>📊 Classified by [AgentCensus](https://github.com/varunrau/agent-census) \u2014 the only tool that tracks what was actually **built**.</sub>`
  );

  return lines.join("\n");
}

// ── GitHub Actions Output ──────────────────────────────────────────────────────

function setOutput(name: string, value: string): void {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    // Handle multi-line values with delimiter
    if (value.includes("\n")) {
      const delimiter = `ghadelimiter_${Date.now()}`;
      appendFileSync(
        outputFile,
        `${name}<<${delimiter}\n${value}\n${delimiter}\n`
      );
    } else {
      appendFileSync(outputFile, `${name}=${value}\n`);
    }
  }
}

function addSummary(markdown: string): void {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    appendFileSync(summaryFile, markdown + "\n");
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const prNumber = parseInt(process.env.PR_NUMBER ?? "0", 10);
  const owner = process.env.REPO_OWNER ?? "";
  const repoName = process.env.REPO_NAME ?? "";
  const shouldComment = process.env.INPUT_COMMENT !== "false";
  const shouldSummary = process.env.INPUT_SUMMARY !== "false";

  if (!token) {
    console.error("Error: GITHUB_TOKEN is required");
    process.exit(1);
  }

  if (!prNumber) {
    console.log("No PR number found \u2014 skipping classification.");
    console.log(
      "This action only runs on pull_request events."
    );
    process.exit(0);
  }

  const repo = `${owner}/${repoName}`;
  console.log(`\ud83d\udcca AgentCensus \u2014 classifying PR #${prNumber} on ${repo}`);

  // Fetch PR files
  const files = await fetchPRFiles(owner, repoName, prNumber, token);

  if (files.length === 0) {
    console.log("No files changed in this PR.");
    setOutput("classification", "{}");
    setOutput("primary_tag", "unknown");
    setOutput("files_changed", "0");
    return;
  }

  console.log(`Found ${files.length} changed files. Classifying...`);

  // Classify
  const classification = classifyPR(files);

  // Log results
  console.log(`\n  Primary: ${TAG_EMOJI[classification.primaryTag]} ${TAG_LABEL[classification.primaryTag]}`);
  for (const [tag, count] of Object.entries(classification.byTag)) {
    if (count > 0) {
      const t = tag as OutcomeTag;
      console.log(`    ${TAG_EMOJI[t]} ${TAG_LABEL[t]}: ${count} files`);
    }
  }
  console.log(
    `\n  +${classification.totalAdditions} / -${classification.totalDeletions} (net ${classification.netLines >= 0 ? "+" : ""}${classification.netLines})\n`
  );

  // Set outputs
  setOutput("classification", JSON.stringify(classification));
  setOutput("primary_tag", classification.primaryTag);
  setOutput("files_changed", String(classification.totalFiles));

  // Generate Markdown
  const markdown = formatMarkdown(classification, prNumber, repo);

  // Post PR comment
  if (shouldComment && prNumber) {
    console.log("Posting classification comment on PR...");
    try {
      await postPRComment(owner, repoName, prNumber, markdown, token);
      console.log("\u2705 Comment posted.");
    } catch (err) {
      console.error(`Failed to post comment: ${err}`);
    }
  }

  // Add to job summary
  if (shouldSummary) {
    addSummary(markdown);
    console.log("\u2705 Added to job summary.");
  }

  console.log("\ud83d\udcca Classification complete.");
}

main().catch((err) => {
  console.error(`Fatal error: ${err}`);
  process.exit(1);
});
