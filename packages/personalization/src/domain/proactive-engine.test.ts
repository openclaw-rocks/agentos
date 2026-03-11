import { describe, it, expect, beforeEach } from "vitest";
import type { AggregatedSignals } from "../ports/signal-store.js";
import type { ProactiveTrigger, ProactiveMessage } from "./proactive-engine.js";
import { ProactiveEngine } from "./proactive-engine.js";

describe("ProactiveEngine", () => {
  let engine: ProactiveEngine;

  const emptySignals: AggregatedSignals = {
    topSpaces: [],
    activeHours: [],
    topComponents: [],
    topAgents: [],
    totalSignals: 0,
    windowStart: 0,
  };

  const makeTimeTrigger = (overrides: Partial<ProactiveTrigger> = {}): ProactiveTrigger => ({
    id: "trigger-1",
    agentId: "agent-1",
    spaceId: "space-1",
    type: "time_based",
    condition: { type: "time_based", hour: 9 },
    ...overrides,
  });

  const makePatternTrigger = (overrides: Partial<ProactiveTrigger> = {}): ProactiveTrigger => ({
    id: "trigger-pattern",
    agentId: "agent-1",
    spaceId: "space-1",
    type: "pattern_based",
    condition: { type: "pattern_based", signal: "space_visit", threshold: 5 },
    ...overrides,
  });

  const makeEventTrigger = (overrides: Partial<ProactiveTrigger> = {}): ProactiveTrigger => ({
    id: "trigger-event",
    agentId: "agent-1",
    spaceId: "space-1",
    type: "event_based",
    condition: { type: "event_based", eventType: "deployment" },
    ...overrides,
  });

  beforeEach(() => {
    engine = new ProactiveEngine();
  });

  describe("register / unregister", () => {
    it("should register a trigger", () => {
      engine.register(makeTimeTrigger());
      expect(engine.getTriggers()).toHaveLength(1);
    });

    it("should unregister a trigger and return true", () => {
      engine.register(makeTimeTrigger());
      const removed = engine.unregister("trigger-1");
      expect(removed).toBe(true);
      expect(engine.getTriggers()).toHaveLength(0);
    });

    it("should return false when unregistering a non-existent trigger", () => {
      const removed = engine.unregister("nonexistent");
      expect(removed).toBe(false);
    });

    it("should allow registering multiple triggers", () => {
      engine.register(makeTimeTrigger({ id: "t1" }));
      engine.register(makeTimeTrigger({ id: "t2" }));
      engine.register(makeTimeTrigger({ id: "t3" }));
      expect(engine.getTriggers()).toHaveLength(3);
    });
  });

  describe("evaluate - time_based triggers", () => {
    it("should fire at the correct hour", () => {
      engine.register(makeTimeTrigger({ condition: { type: "time_based", hour: 9 } }));
      const messages = engine.evaluate(9, emptySignals);
      expect(messages).toHaveLength(1);
      expect(messages[0].triggerId).toBe("trigger-1");
      expect(messages[0].reason).toContain("9");
    });

    it("should not fire at the wrong hour", () => {
      engine.register(makeTimeTrigger({ condition: { type: "time_based", hour: 9 } }));
      const messages = engine.evaluate(14, emptySignals);
      expect(messages).toHaveLength(0);
    });
  });

  describe("evaluate - pattern_based triggers", () => {
    it("should fire when threshold is met", () => {
      engine.register(makePatternTrigger());

      const signals: AggregatedSignals = {
        ...emptySignals,
        topSpaces: [
          { spaceId: "s1", visitCount: 3 },
          { spaceId: "s2", visitCount: 3 },
        ],
      };

      const messages = engine.evaluate(10, signals);
      expect(messages).toHaveLength(1);
      expect(messages[0].reason).toContain("threshold");
    });

    it("should not fire when threshold is not met", () => {
      engine.register(makePatternTrigger());

      const signals: AggregatedSignals = {
        ...emptySignals,
        topSpaces: [{ spaceId: "s1", visitCount: 2 }],
      };

      const messages = engine.evaluate(10, signals);
      expect(messages).toHaveLength(0);
    });
  });

  describe("evaluate - event_based triggers", () => {
    it("should generate a message", () => {
      engine.register(makeEventTrigger());
      const messages = engine.evaluate(10, emptySignals);
      expect(messages).toHaveLength(1);
      expect(messages[0].reason).toContain("deployment");
      expect(messages[0].dismissable).toBe(true);
    });
  });

  describe("maxPerDay limiting", () => {
    it("should limit fires per day", () => {
      engine.register(makeEventTrigger({ maxPerDay: 2 }));

      const m1 = engine.evaluate(10, emptySignals);
      expect(m1).toHaveLength(1);

      const m2 = engine.evaluate(11, emptySignals);
      expect(m2).toHaveLength(1);

      const m3 = engine.evaluate(12, emptySignals);
      expect(m3).toHaveLength(0); // exceeded max
    });

    it("should use default maxPerDay of 3 when not specified", () => {
      engine.register(makeEventTrigger({ maxPerDay: undefined }));

      engine.evaluate(10, emptySignals);
      engine.evaluate(11, emptySignals);
      engine.evaluate(12, emptySignals);
      const m4 = engine.evaluate(13, emptySignals);
      expect(m4).toHaveLength(0); // default is 3
    });
  });

  describe("snooze", () => {
    it("should prevent trigger from firing after snooze", () => {
      engine.register(makeEventTrigger());
      const m1 = engine.evaluate(10, emptySignals);
      expect(m1).toHaveLength(1);

      engine.snooze("trigger-event");
      const m2 = engine.evaluate(11, emptySignals);
      expect(m2).toHaveLength(0);
    });

    it("should allow firing after resetDailyCounters clears snooze", () => {
      engine.register(makeEventTrigger());
      engine.evaluate(10, emptySignals);
      engine.snooze("trigger-event");

      engine.resetDailyCounters();
      const messages = engine.evaluate(11, emptySignals);
      expect(messages).toHaveLength(1);
    });
  });

  describe("disableAgent / enableAgent", () => {
    it("should suppress all triggers from a disabled agent", () => {
      engine.register(makeEventTrigger({ agentId: "agent-x" }));
      engine.disableAgent("agent-x");

      const messages = engine.evaluate(10, emptySignals);
      expect(messages).toHaveLength(0);
    });

    it("should re-enable an agent", () => {
      engine.register(makeEventTrigger({ agentId: "agent-x" }));
      engine.disableAgent("agent-x");
      engine.enableAgent("agent-x");

      const messages = engine.evaluate(10, emptySignals);
      expect(messages).toHaveLength(1);
    });

    it("should report agent enabled status correctly", () => {
      expect(engine.isAgentEnabled("agent-1")).toBe(true);
      engine.disableAgent("agent-1");
      expect(engine.isAgentEnabled("agent-1")).toBe(false);
      engine.enableAgent("agent-1");
      expect(engine.isAgentEnabled("agent-1")).toBe(true);
    });

    it("should only suppress the specific disabled agent", () => {
      engine.register(makeEventTrigger({ id: "t1", agentId: "agent-a" }));
      engine.register(makeEventTrigger({ id: "t2", agentId: "agent-b" }));
      engine.disableAgent("agent-a");

      const messages = engine.evaluate(10, emptySignals);
      expect(messages).toHaveLength(1);
      expect(messages[0].agentId).toBe("agent-b");
    });
  });

  describe("resetDailyCounters", () => {
    it("should clear fire counts", () => {
      engine.register(makeEventTrigger({ maxPerDay: 1 }));

      engine.evaluate(10, emptySignals);
      expect(engine.evaluate(11, emptySignals)).toHaveLength(0);

      engine.resetDailyCounters();
      expect(engine.evaluate(12, emptySignals)).toHaveLength(1);
    });
  });

  describe("multiple triggers firing simultaneously", () => {
    it("should fire multiple triggers in one evaluation", () => {
      engine.register(
        makeTimeTrigger({ id: "time-1", condition: { type: "time_based", hour: 10 } }),
      );
      engine.register(makeEventTrigger({ id: "event-1" }));

      const messages = engine.evaluate(10, emptySignals);
      expect(messages).toHaveLength(2);

      const triggerIds = messages.map((m: ProactiveMessage) => m.triggerId);
      expect(triggerIds).toContain("time-1");
      expect(triggerIds).toContain("event-1");
    });
  });
});
