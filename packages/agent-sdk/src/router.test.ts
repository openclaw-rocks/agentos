import { describe, it, expect, beforeEach } from "vitest";
import { IntentRouter, type RoutableAgent, type RoutingDecision } from "./router.js";

// ── Fixtures ────────────────────────────────────────────────────────────

function buildRoster(): RoutableAgent[] {
  return [
    {
      id: "assistant",
      role: "primary",
      capabilities: ["general questions", "summarisation"],
    },
    {
      id: "nutrition",
      role: "specialist",
      capabilities: ["meal logging", "calorie tracking"],
      keywords: ["log meal", "calories", "nutrition"],
    },
    {
      id: "fitness",
      role: "specialist",
      capabilities: ["workout planning", "exercise tracking"],
      keywords: ["workout", "exercise", "steps"],
    },
    {
      id: "analytics",
      role: "background",
      capabilities: ["data aggregation", "reporting"],
      keywords: ["report"],
    },
  ];
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("IntentRouter", () => {
  // ── Roster with primary + specialists + background ──────────────────

  describe("given a roster with primary and specialist agents", () => {
    let router: IntentRouter;

    beforeEach(() => {
      router = new IntentRouter(buildRoster());
    });

    // ── @mention routing ────────────────────────────────────────────

    describe("when a message starts with @mention (exact id)", () => {
      it("then it should route to the mentioned agent with confidence 1.0", () => {
        const decision = router.route("@nutrition log my lunch");

        expect(decision).not.toBeNull();
        expect(decision!.targetAgentId).toBe("nutrition");
        expect(decision!.strategy).toBe("mention");
        expect(decision!.confidence).toBe(1.0);
      });
    });

    describe("when a message starts with @mention (case-insensitive)", () => {
      it("then it should route to the mentioned agent regardless of casing", () => {
        const decision = router.route("@Nutrition log my lunch");

        expect(decision).not.toBeNull();
        expect(decision!.targetAgentId).toBe("nutrition");
        expect(decision!.strategy).toBe("mention");
        expect(decision!.confidence).toBe(1.0);
      });
    });

    describe("when a message starts with @mention for the primary agent", () => {
      it("then it should route to the primary agent via mention (not fallback)", () => {
        const decision = router.route("@assistant what is the weather?");

        expect(decision).not.toBeNull();
        expect(decision!.targetAgentId).toBe("assistant");
        expect(decision!.strategy).toBe("mention");
        expect(decision!.confidence).toBe(1.0);
      });
    });

    describe("when a message starts with @mention for an unknown agent", () => {
      it("then it should fall through to keyword/capability/primary fallback", () => {
        const decision = router.route("@unknown do something");

        expect(decision).not.toBeNull();
        // should fall to primary fallback since "unknown" is not in the roster
        expect(decision!.strategy).not.toBe("mention");
      });
    });

    // ── Keyword routing ─────────────────────────────────────────────

    describe("when a message contains a specialist keyword", () => {
      it("then it should route to the specialist agent with confidence 0.8", () => {
        const decision = router.route("I want to log meal for today");

        expect(decision).not.toBeNull();
        expect(decision!.targetAgentId).toBe("nutrition");
        expect(decision!.strategy).toBe("keyword");
        expect(decision!.confidence).toBe(0.8);
      });
    });

    describe("when a message contains a keyword (case-insensitive)", () => {
      it("then it should match regardless of casing", () => {
        const decision = router.route("Show me my CALORIES today");

        expect(decision).not.toBeNull();
        expect(decision!.targetAgentId).toBe("nutrition");
        expect(decision!.strategy).toBe("keyword");
      });
    });

    describe("when a message matches multiple specialists by keyword", () => {
      it("then it should route to the first specialist with a match", () => {
        // Both "calories" (nutrition) and "workout" (fitness) are keywords,
        // but nutrition comes first in the roster.
        const decision = router.route("calories and workout plan");

        expect(decision).not.toBeNull();
        expect(decision!.targetAgentId).toBe("nutrition");
        expect(decision!.strategy).toBe("keyword");
      });
    });

    describe("when a message contains a background agent keyword", () => {
      it("then it should skip the background agent for keyword matching", () => {
        const decision = router.route("generate a report for me");

        expect(decision).not.toBeNull();
        // "report" is a keyword for the background agent, which should be
        // skipped. The word "report" does not match other specialists'
        // keywords, so it should fall through.
        expect(decision!.targetAgentId).not.toBe("analytics");
      });
    });

    // ── Capability routing ──────────────────────────────────────────

    describe("when a message matches a specialist capability (but no keyword)", () => {
      it("then it should route via capability with confidence 0.6", () => {
        // "planning" appears in fitness capability "workout planning"
        // but is NOT a keyword for any agent, so keyword matching is skipped
        const decision = router.route("I need help planning");

        expect(decision).not.toBeNull();
        expect(decision!.targetAgentId).toBe("fitness");
        expect(decision!.strategy).toBe("capability");
        expect(decision!.confidence).toBe(0.6);
      });
    });

    describe("when a message matches capabilities of a background agent only", () => {
      it("then it should skip the background agent and fall back to primary", () => {
        const decision = router.route("data aggregation please");

        expect(decision).not.toBeNull();
        // Background agents are excluded from capability matching
        expect(decision!.targetAgentId).not.toBe("analytics");
      });
    });

    // ── Primary fallback ────────────────────────────────────────────

    describe("when a message has no keyword or capability match", () => {
      it("then it should route to the primary agent with confidence 0.5", () => {
        const decision = router.route("tell me a joke");

        expect(decision).not.toBeNull();
        expect(decision!.targetAgentId).toBe("assistant");
        expect(decision!.strategy).toBe("primary_fallback");
        expect(decision!.confidence).toBe(0.5);
      });
    });

    // ── @mention takes precedence over keywords ─────────────────────

    describe("when a message has both an @mention and a keyword for a different agent", () => {
      it("then it should route via @mention (highest priority)", () => {
        const decision = router.route("@fitness log meal for me");

        expect(decision).not.toBeNull();
        expect(decision!.targetAgentId).toBe("fitness");
        expect(decision!.strategy).toBe("mention");
      });
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  describe("given an empty agent roster", () => {
    it("then route() should return null", () => {
      const router = new IntentRouter([]);
      const decision = router.route("hello world");
      expect(decision).toBeNull();
    });
  });

  describe("given a roster with only background agents", () => {
    it("then route() should return null (no primary fallback available)", () => {
      const router = new IntentRouter([
        {
          id: "bg",
          role: "background",
          capabilities: ["monitoring"],
        },
      ]);

      const decision = router.route("hello world");
      expect(decision).toBeNull();
    });
  });

  describe("given a roster with only a primary agent (no specialists)", () => {
    it("then route() should fall back to the primary agent", () => {
      const router = new IntentRouter([
        {
          id: "main",
          role: "primary",
          capabilities: [],
        },
      ]);

      const decision = router.route("anything at all");

      expect(decision).not.toBeNull();
      expect(decision!.targetAgentId).toBe("main");
      expect(decision!.strategy).toBe("primary_fallback");
    });
  });

  // ── updateAgents ──────────────────────────────────────────────────

  describe("given the roster is updated at runtime", () => {
    let router: IntentRouter;

    beforeEach(() => {
      router = new IntentRouter(buildRoster());
    });

    describe("when a new specialist is added", () => {
      it("then messages matching the new specialist should route to it", () => {
        router.updateAgents([
          ...buildRoster(),
          {
            id: "finance",
            role: "specialist",
            capabilities: ["budgeting"],
            keywords: ["budget", "expense"],
          },
        ]);

        const decision = router.route("help me set a budget");

        expect(decision).not.toBeNull();
        expect(decision!.targetAgentId).toBe("finance");
        expect(decision!.strategy).toBe("keyword");
      });
    });

    describe("when all agents are removed", () => {
      it("then route() should return null", () => {
        router.updateAgents([]);
        expect(router.route("hello")).toBeNull();
      });
    });
  });

  // ── Routing decision structure ────────────────────────────────────

  describe("given any successful routing", () => {
    it("then the decision should contain all required fields", () => {
      const router = new IntentRouter(buildRoster());
      const decision = router.route("plan a workout for me") as RoutingDecision;

      expect(decision).toHaveProperty("targetAgentId");
      expect(decision).toHaveProperty("strategy");
      expect(decision).toHaveProperty("confidence");
      expect(decision).toHaveProperty("reason");
      expect(typeof decision.targetAgentId).toBe("string");
      expect(typeof decision.confidence).toBe("number");
      expect(decision.confidence).toBeGreaterThanOrEqual(0);
      expect(decision.confidence).toBeLessThanOrEqual(1);
      expect(typeof decision.reason).toBe("string");
      expect(decision.reason.length).toBeGreaterThan(0);
    });
  });
});
