/**
 * Cost calculator — estimates spending based on token usage and model.
 *
 * Pricing is approximate and based on publicly available API pricing
 * as of June 2026. The actual cost may differ if using a subscription
 * plan (Claude Code Pro, Codex, etc.) rather than API billing.
 */

import type { Session, CostSummary, AgentCost } from "./types.js";

/** Price per million tokens (input, output) */
interface ModelPricing {
  inputPerM: number;
  outputPerM: number;
}

/**
 * Approximate model pricing as of June 2026.
 * Sources: anthropic.com/pricing, openai.com/pricing
 */
const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic
  "claude-sonnet-4-20250514": { inputPerM: 3.0, outputPerM: 15.0 },
  "claude-4-sonnet": { inputPerM: 3.0, outputPerM: 15.0 },
  "claude-opus-4-20250514": { inputPerM: 15.0, outputPerM: 75.0 },
  "claude-4-opus": { inputPerM: 15.0, outputPerM: 75.0 },
  "claude-3.5-sonnet": { inputPerM: 3.0, outputPerM: 15.0 },
  "claude-3-5-sonnet-20241022": { inputPerM: 3.0, outputPerM: 15.0 },
  "claude-3-opus": { inputPerM: 15.0, outputPerM: 75.0 },
  "claude-3-haiku": { inputPerM: 0.25, outputPerM: 1.25 },

  // OpenAI
  "gpt-4o": { inputPerM: 2.5, outputPerM: 10.0 },
  "gpt-4o-mini": { inputPerM: 0.15, outputPerM: 0.6 },
  "gpt-4-turbo": { inputPerM: 10.0, outputPerM: 30.0 },
  "o3": { inputPerM: 10.0, outputPerM: 40.0 },
  "o3-mini": { inputPerM: 1.1, outputPerM: 4.4 },
  "o4-mini": { inputPerM: 1.1, outputPerM: 4.4 },
  "codex-mini": { inputPerM: 1.5, outputPerM: 6.0 },

  // Google
  "gemini-2.5-pro": { inputPerM: 1.25, outputPerM: 10.0 },
  "gemini-2.5-flash": { inputPerM: 0.15, outputPerM: 0.6 },
};

/** Default pricing for unknown models */
const DEFAULT_PRICING: ModelPricing = { inputPerM: 3.0, outputPerM: 15.0 };

/**
 * Calculate costs for all sessions.
 */
export function calculateCosts(sessions: Session[]): CostSummary {
  const byAgent: Record<string, AgentCost> = {};
  const byProject: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  let totalCost = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalDurationMs = 0;

  for (const session of sessions) {
    const pricing = getModelPricing(session.model);
    const cost =
      (session.tokensIn / 1_000_000) * pricing.inputPerM +
      (session.tokensOut / 1_000_000) * pricing.outputPerM;

    // Update session cost estimate
    session.costEstimate = cost;

    totalCost += cost;
    totalTokensIn += session.tokensIn;
    totalTokensOut += session.tokensOut;
    totalDurationMs += session.durationMs;

    // Aggregate by agent
    if (!byAgent[session.agent]) {
      byAgent[session.agent] = {
        sessions: 0,
        cost: 0,
        tokensIn: 0,
        tokensOut: 0,
      };
    }
    byAgent[session.agent].sessions++;
    byAgent[session.agent].cost += cost;
    byAgent[session.agent].tokensIn += session.tokensIn;
    byAgent[session.agent].tokensOut += session.tokensOut;

    // Aggregate by project
    byProject[session.project] =
      (byProject[session.project] ?? 0) + cost;

    // Aggregate by model
    byModel[session.model] = (byModel[session.model] ?? 0) + cost;
  }

  return {
    totalCost,
    totalTokensIn,
    totalTokensOut,
    totalTokens: totalTokensIn + totalTokensOut,
    totalSessions: sessions.length,
    totalDurationMs,
    byAgent,
    byProject,
    byModel,
  };
}

/**
 * Look up pricing for a model, with fuzzy matching.
 */
function getModelPricing(model: string): ModelPricing {
  // Direct match
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];

  // Fuzzy match — check if any known model is a substring
  const lower = model.toLowerCase();
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return pricing;
    }
  }

  // Heuristic based on model family
  if (lower.includes("opus")) return { inputPerM: 15.0, outputPerM: 75.0 };
  if (lower.includes("sonnet")) return { inputPerM: 3.0, outputPerM: 15.0 };
  if (lower.includes("haiku")) return { inputPerM: 0.25, outputPerM: 1.25 };
  if (lower.includes("gpt-4")) return { inputPerM: 10.0, outputPerM: 30.0 };
  if (lower.includes("o3") || lower.includes("o4"))
    return { inputPerM: 1.1, outputPerM: 4.4 };

  return DEFAULT_PRICING;
}
