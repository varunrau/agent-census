/**
 * Core types for AgentCensus.
 */

export interface Session {
  id: string;
  agent: "claude" | "codex" | "cursor" | "unknown";
  project: string;
  startTime: Date;
  endTime: Date | null;
  durationMs: number;
  model: string;
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  costEstimate: number;
  /** Files touched during this session */
  filesChanged: FileChange[];
  /** Detected outcomes */
  outcomes: OutcomeTag[];
  /** Raw session directory path */
  sourcePath: string;
}

export interface FileChange {
  path: string;
  action: "created" | "modified" | "deleted";
  linesAdded: number;
  linesRemoved: number;
  isTest: boolean;
  isConfig: boolean;
  isDoc: boolean;
  language: string;
}

export type OutcomeTag =
  | "feature"
  | "bugfix"
  | "refactor"
  | "test"
  | "docs"
  | "config"
  | "ci"
  | "dependency"
  | "unknown";

export interface CostSummary {
  totalCost: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalTokens: number;
  totalSessions: number;
  totalDurationMs: number;
  byAgent: Record<string, AgentCost>;
  byProject: Record<string, number>;
  byModel: Record<string, number>;
}

export interface AgentCost {
  sessions: number;
  cost: number;
  tokensIn: number;
  tokensOut: number;
}

export interface OutcomeSummary {
  totalFiles: number;
  filesCreated: number;
  filesModified: number;
  filesDeleted: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  netLines: number;
  testsAdded: number;
  docsChanged: number;
  byTag: Record<OutcomeTag, number>;
  byLanguage: Record<string, number>;
  byProject: Record<string, ProjectOutcome>;
}

export interface ProjectOutcome {
  files: number;
  linesAdded: number;
  linesRemoved: number;
  tags: OutcomeTag[];
}

export interface ScanOptions {
  since: Date;
  project?: string;
  agent?: string;
}

export interface FormatOptions {
  noColor?: boolean;
  detail?: "summary" | "sessions" | "compare";
}
