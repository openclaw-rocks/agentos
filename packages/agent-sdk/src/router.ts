/**
 * US-3.1: Intent-Based Message Routing
 *
 * Routes incoming messages to the best-matching agent based on a
 * deterministic cascade: @mention > keyword > capability > primary fallback.
 *
 * The router is a pure function — no Matrix client dependency, no network
 * calls. Rule-based strategies are designed to resolve well within a 100 ms
 * latency budget.
 */

// ── Public types ────────────────────────────────────────────────────────

export interface RoutableAgent {
  /** Unique agent identifier (also used for @mention matching) */
  id: string;
  /** Agent role within the space */
  role: "primary" | "specialist" | "background";
  /** Free-text capability descriptions the agent advertises */
  capabilities: string[];
  /** Optional keyword / phrase patterns that trigger this agent */
  keywords?: string[];
}

export interface RoutingDecision {
  /** The agent the message should be delivered to */
  targetAgentId: string;
  /** Which routing strategy produced the decision */
  strategy: "mention" | "keyword" | "capability" | "primary_fallback";
  /** Confidence score 0-1 */
  confidence: number;
  /** Human-readable explanation (useful for debug logging) */
  reason: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Extract the first @mention from the start of a message.
 * Supports `@agentId` and `@display name` (quoted or bare first word).
 */
function extractLeadingMention(message: string): string | null {
  const trimmed = message.trimStart();
  if (!trimmed.startsWith("@")) return null;

  // Grab everything after the '@' up to the next whitespace (or end)
  const match = trimmed.match(/^@(\S+)/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Normalise a string for case-insensitive comparison.
 */
function norm(s: string): string {
  return s.toLowerCase();
}

// ── Router ──────────────────────────────────────────────────────────────

export class IntentRouter {
  private agents: RoutableAgent[] = [];

  constructor(agents: RoutableAgent[]) {
    this.updateAgents(agents);
  }

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Route a message to the best-matching agent.
   *
   * Resolution order:
   *  1. @mention override  (confidence 1.0)
   *  2. Keyword match      (confidence 0.8)
   *  3. Capability match   (confidence 0.6)
   *  4. Primary fallback   (confidence 0.5)
   *
   * Returns `null` when the roster is empty or contains no viable target.
   */
  route(message: string): RoutingDecision | null {
    if (this.agents.length === 0) return null;

    const mentionResult = this.tryMentionRoute(message);
    if (mentionResult) return mentionResult;

    const keywordResult = this.tryKeywordRoute(message);
    if (keywordResult) return keywordResult;

    const capabilityResult = this.tryCapabilityRoute(message);
    if (capabilityResult) return capabilityResult;

    return this.tryPrimaryFallback();
  }

  /**
   * Replace the agent roster at runtime (e.g. when agents join/leave).
   */
  updateAgents(agents: RoutableAgent[]): void {
    this.agents = [...agents];
  }

  // ── Strategy implementations ────────────────────────────────────────

  private tryMentionRoute(message: string): RoutingDecision | null {
    const mention = extractLeadingMention(message);
    if (!mention) return null;

    for (const agent of this.agents) {
      if (norm(agent.id) === mention) {
        return {
          targetAgentId: agent.id,
          strategy: "mention",
          confidence: 1.0,
          reason: `Message starts with @${agent.id}`,
        };
      }
    }

    return null;
  }

  private tryKeywordRoute(message: string): RoutingDecision | null {
    const lower = norm(message);

    for (const agent of this.agents) {
      if (agent.role === "background") continue;
      if (!agent.keywords || agent.keywords.length === 0) continue;

      for (const keyword of agent.keywords) {
        if (lower.includes(norm(keyword))) {
          return {
            targetAgentId: agent.id,
            strategy: "keyword",
            confidence: 0.8,
            reason: `Keyword "${keyword}" matched for agent ${agent.id}`,
          };
        }
      }
    }

    return null;
  }

  private tryCapabilityRoute(message: string): RoutingDecision | null {
    const words = new Set(
      norm(message)
        .split(/\s+/)
        .filter((w) => w.length > 0),
    );

    let bestAgent: RoutableAgent | null = null;
    let bestScore = 0;
    let bestCapability = "";

    for (const agent of this.agents) {
      if (agent.role === "background") continue;
      if (agent.capabilities.length === 0) continue;

      for (const capability of agent.capabilities) {
        const capWords = norm(capability)
          .split(/\s+/)
          .filter((w) => w.length > 0);
        let matches = 0;
        for (const cw of capWords) {
          if (words.has(cw)) matches++;
        }
        if (matches > 0 && matches > bestScore) {
          bestScore = matches;
          bestAgent = agent;
          bestCapability = capability;
        }
      }
    }

    if (bestAgent) {
      return {
        targetAgentId: bestAgent.id,
        strategy: "capability",
        confidence: 0.6,
        reason: `Capability "${bestCapability}" matched for agent ${bestAgent.id}`,
      };
    }

    return null;
  }

  private tryPrimaryFallback(): RoutingDecision | null {
    const primary = this.agents.find((a) => a.role === "primary");
    if (!primary) return null;

    return {
      targetAgentId: primary.id,
      strategy: "primary_fallback",
      confidence: 0.5,
      reason: `No specific match; falling back to primary agent ${primary.id}`,
    };
  }
}
