/**
 * Session scanner — discovers and parses AI agent session data.
 *
 * Supported agents:
 * - Claude Code: reads JSONL from ~/.claude/projects/
 * - OpenAI Codex: reads from ~/.codex/ (when available)
 *
 * Each session is parsed into a normalized Session object with
 * token counts, timing, model info, and file changes.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { homedir } from "node:os";
import type { Session, FileChange, ScanOptions, OutcomeTag } from "./types.js";

/** Known session data directories */
const SESSION_DIRS = [
  { path: join(homedir(), ".claude", "projects"), agent: "claude" as const },
  { path: join(homedir(), ".codex"), agent: "codex" as const },
];

/**
 * Scan for agent sessions within the given time range.
 */
export async function scanSessions(opts: ScanOptions): Promise<Session[]> {
  const sessions: Session[] = [];

  for (const { path, agent } of SESSION_DIRS) {
    if (opts.agent && opts.agent !== agent) continue;
    try {
      const found = await scanAgentDir(path, agent, opts);
      sessions.push(...found);
    } catch {
      // Directory doesn't exist or isn't readable — skip
    }
  }

  // Sort by start time, most recent first
  sessions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  return sessions;
}

/**
 * Scan a single agent's directory for session data.
 */
async function scanAgentDir(
  basePath: string,
  agent: Session["agent"],
  opts: ScanOptions
): Promise<Session[]> {
  const sessions: Session[] = [];
  const entries = await readdir(basePath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const projectPath = join(basePath, entry.name);
    const projectName = decodeProjectName(entry.name);

    // Filter by project if specified
    if (opts.project && !projectName.toLowerCase().includes(opts.project.toLowerCase())) {
      continue;
    }

    try {
      const projectSessions = await scanProjectDir(
        projectPath,
        projectName,
        agent,
        opts.since
      );
      sessions.push(...projectSessions);
    } catch {
      // Skip unreadable projects
    }
  }

  return sessions;
}

/**
 * Scan a project directory for individual session files.
 */
async function scanProjectDir(
  projectPath: string,
  projectName: string,
  agent: Session["agent"],
  since: Date
): Promise<Session[]> {
  const sessions: Session[] = [];
  const entries = await readdir(projectPath, { withFileTypes: true });

  for (const entry of entries) {
    const filePath = join(projectPath, entry.name);

    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      try {
        const fileStat = await stat(filePath);
        if (fileStat.mtime < since) continue;

        const session = await parseSessionFile(
          filePath,
          projectName,
          agent,
          entry.name
        );
        if (session && session.startTime >= since) {
          sessions.push(session);
        }
      } catch {
        // Skip unparseable files
      }
    }

    // Also check subdirectories (some agents nest sessions)
    if (entry.isDirectory()) {
      try {
        const nested = await scanProjectDir(
          filePath,
          projectName,
          agent,
          since
        );
        sessions.push(...nested);
      } catch {
        // Skip
      }
    }
  }

  return sessions;
}

/**
 * Parse a single JSONL session file into a Session object.
 */
async function parseSessionFile(
  filePath: string,
  project: string,
  agent: Session["agent"],
  filename: string
): Promise<Session | null> {
  const content = await readFile(filePath, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);

  if (lines.length === 0) return null;

  let tokensIn = 0;
  let tokensOut = 0;
  let model = "unknown";
  let startTime: Date | null = null;
  let endTime: Date | null = null;
  const filesChanged: FileChange[] = [];
  const outcomeTagsSet = new Set<OutcomeTag>();

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // Extract timing
      const ts = entry.timestamp ?? entry.ts ?? entry.created_at;
      if (ts) {
        const date = new Date(ts);
        if (!startTime || date < startTime) startTime = date;
        if (!endTime || date > endTime) endTime = date;
      }

      // Extract model
      if (entry.model) {
        model = entry.model;
      }

      // Extract token usage
      if (entry.usage) {
        tokensIn += entry.usage.input_tokens ?? entry.usage.prompt_tokens ?? 0;
        tokensOut +=
          entry.usage.output_tokens ?? entry.usage.completion_tokens ?? 0;
      }

      // Extract file changes from tool use
      if (entry.type === "tool_use" || entry.tool_name) {
        const toolName = entry.tool_name ?? entry.name ?? "";
        const toolInput = entry.tool_input ?? entry.input ?? {};

        if (
          toolName === "write_to_file" ||
          toolName === "create_file" ||
          toolName === "Write"
        ) {
          const path = toolInput.path ?? toolInput.file_path ?? "";
          if (path) {
            const fc = makeFileChange(path, "created");
            filesChanged.push(fc);
            classifyFileChange(fc, outcomeTagsSet);
          }
        }

        if (
          toolName === "edit_file" ||
          toolName === "replace_in_file" ||
          toolName === "Edit"
        ) {
          const path = toolInput.path ?? toolInput.file_path ?? "";
          if (path) {
            const fc = makeFileChange(path, "modified");
            filesChanged.push(fc);
            classifyFileChange(fc, outcomeTagsSet);
          }
        }
      }

      // Extract file changes from content blocks
      if (Array.isArray(entry.content)) {
        for (const block of entry.content) {
          if (block.type === "tool_use") {
            const toolName = block.name ?? "";
            const toolInput = block.input ?? {};

            if (["write_to_file", "create_file", "Write"].includes(toolName)) {
              const path = toolInput.path ?? toolInput.file_path ?? "";
              if (path) {
                const fc = makeFileChange(path, "created");
                filesChanged.push(fc);
                classifyFileChange(fc, outcomeTagsSet);
              }
            }

            if (
              ["edit_file", "replace_in_file", "Edit"].includes(toolName)
            ) {
              const path = toolInput.path ?? toolInput.file_path ?? "";
              if (path) {
                const fc = makeFileChange(path, "modified");
                filesChanged.push(fc);
                classifyFileChange(fc, outcomeTagsSet);
              }
            }
          }
        }
      }
    } catch {
      // Skip malformed JSON lines
    }
  }

  if (!startTime) {
    // Fall back to file modification time
    const fileStat = await stat(filePath);
    startTime = fileStat.birthtime;
    endTime = fileStat.mtime;
  }

  const totalTokens = tokensIn + tokensOut;
  const durationMs = endTime
    ? endTime.getTime() - startTime.getTime()
    : 0;

  return {
    id: basename(filename, extname(filename)),
    agent,
    project,
    startTime,
    endTime,
    durationMs,
    model,
    tokensIn,
    tokensOut,
    totalTokens,
    costEstimate: 0, // filled in by costs module
    filesChanged: dedupeFiles(filesChanged),
    outcomes: [...outcomeTagsSet],
    sourcePath: filePath,
  };
}

/**
 * Create a FileChange from a path and action.
 */
function makeFileChange(
  path: string,
  action: FileChange["action"]
): FileChange {
  const ext = extname(path).toLowerCase();
  return {
    path,
    action,
    linesAdded: 0,
    linesRemoved: 0,
    isTest: isTestFile(path),
    isConfig: isConfigFile(path),
    isDoc: isDocFile(path),
    language: extToLanguage(ext),
  };
}

/**
 * Classify a file change into outcome tags.
 */
function classifyFileChange(fc: FileChange, tags: Set<OutcomeTag>): void {
  if (fc.isTest) tags.add("test");
  if (fc.isDoc) tags.add("docs");
  if (fc.isConfig) tags.add("config");
  if (
    fc.path.includes(".github/workflows") ||
    fc.path.includes("Dockerfile") ||
    fc.path.includes("docker-compose")
  ) {
    tags.add("ci");
  }
  if (
    fc.path.includes("package.json") ||
    fc.path.includes("Cargo.toml") ||
    fc.path.includes("requirements.txt") ||
    fc.path.includes("go.mod")
  ) {
    tags.add("dependency");
  }
}

/**
 * Deduplicate file changes by path (keep the last action).
 */
function dedupeFiles(files: FileChange[]): FileChange[] {
  const map = new Map<string, FileChange>();
  for (const f of files) {
    map.set(f.path, f);
  }
  return [...map.values()];
}

/**
 * Decode URL-encoded project directory names.
 */
function decodeProjectName(dirName: string): string {
  try {
    return decodeURIComponent(dirName.replace(/\+/g, " "));
  } catch {
    return dirName;
  }
}

function isTestFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes(".test.") ||
    lower.includes(".spec.") ||
    lower.includes("_test.") ||
    lower.includes("__tests__") ||
    lower.includes("/test/") ||
    lower.includes("/tests/")
  );
}

function isConfigFile(path: string): boolean {
  const lower = path.toLowerCase();
  const name = basename(lower);
  return (
    name.startsWith(".") ||
    name === "tsconfig.json" ||
    name === "package.json" ||
    name === "vite.config.ts" ||
    name === "vitest.config.ts" ||
    name === "eslint.config.js" ||
    name.includes("config")
  );
}

function isDocFile(path: string): boolean {
  const lower = path.toLowerCase();
  const ext = extname(lower);
  const name = basename(lower);
  return (
    ext === ".md" ||
    ext === ".mdx" ||
    ext === ".txt" ||
    ext === ".rst" ||
    name === "readme" ||
    name === "changelog" ||
    name === "contributing" ||
    name === "license"
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
  };
  return map[ext] ?? "Other";
}
