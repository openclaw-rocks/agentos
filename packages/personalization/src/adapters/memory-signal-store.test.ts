import { describe, it, expect, beforeEach } from "vitest";
import type { Signal } from "../ports/signal-store.js";
import { MemorySignalStore } from "./memory-signal-store.js";

describe("MemorySignalStore", () => {
  let store: MemorySignalStore;

  const makeSignal = (overrides: Partial<Signal> = {}): Signal => ({
    type: "space_visit",
    spaceId: "space-1",
    timestamp: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    store = new MemorySignalStore();
  });

  describe("record", () => {
    it("should store a signal", async () => {
      await store.record("user-1", makeSignal());
      expect(await store.getSignalCount("user-1")).toBe(1);
    });

    it("should accumulate multiple signals", async () => {
      await store.record("user-1", makeSignal());
      await store.record("user-1", makeSignal());
      await store.record("user-1", makeSignal());
      expect(await store.getSignalCount("user-1")).toBe(3);
    });
  });

  describe("getSignalCount", () => {
    it("should return 0 for unknown user", async () => {
      expect(await store.getSignalCount("unknown")).toBe(0);
    });
  });

  describe("getAggregated", () => {
    it("should return empty aggregation for unknown user", async () => {
      const agg = await store.getAggregated("unknown");
      expect(agg.totalSignals).toBe(0);
      expect(agg.topSpaces).toHaveLength(0);
      expect(agg.activeHours).toHaveLength(0);
      expect(agg.topComponents).toHaveLength(0);
      expect(agg.topAgents).toHaveLength(0);
      expect(agg.windowStart).toBe(0);
    });

    it("should aggregate space visits by frequency", async () => {
      await store.record("user-1", makeSignal({ spaceId: "s1" }));
      await store.record("user-1", makeSignal({ spaceId: "s1" }));
      await store.record("user-1", makeSignal({ spaceId: "s2" }));

      const agg = await store.getAggregated("user-1");
      expect(agg.topSpaces).toHaveLength(2);
      expect(agg.topSpaces[0].spaceId).toBe("s1");
      expect(agg.topSpaces[0].visitCount).toBe(2);
      expect(agg.topSpaces[1].spaceId).toBe("s2");
      expect(agg.topSpaces[1].visitCount).toBe(1);
    });

    it("should aggregate component interactions", async () => {
      await store.record(
        "user-1",
        makeSignal({
          type: "component_interaction",
          metadata: { componentType: "button" },
        }),
      );
      await store.record(
        "user-1",
        makeSignal({
          type: "component_interaction",
          metadata: { componentType: "button" },
        }),
      );
      await store.record(
        "user-1",
        makeSignal({
          type: "component_interaction",
          metadata: { componentType: "input" },
        }),
      );

      const agg = await store.getAggregated("user-1");
      expect(agg.topComponents).toHaveLength(2);
      expect(agg.topComponents[0].type).toBe("button");
      expect(agg.topComponents[0].count).toBe(2);
    });

    it("should aggregate agent invocations", async () => {
      await store.record("user-1", makeSignal({ type: "agent_invoked", agentId: "agent-a" }));
      await store.record("user-1", makeSignal({ type: "agent_invoked", agentId: "agent-a" }));
      await store.record("user-1", makeSignal({ type: "agent_invoked", agentId: "agent-b" }));

      const agg = await store.getAggregated("user-1");
      expect(agg.topAgents).toHaveLength(2);
      expect(agg.topAgents[0].agentId).toBe("agent-a");
      expect(agg.topAgents[0].count).toBe(2);
    });

    it("should track windowStart as earliest signal timestamp", async () => {
      await store.record("user-1", makeSignal({ timestamp: 1000 }));
      await store.record("user-1", makeSignal({ timestamp: 500 }));
      await store.record("user-1", makeSignal({ timestamp: 2000 }));

      const agg = await store.getAggregated("user-1");
      expect(agg.windowStart).toBe(500);
    });
  });

  describe("clear", () => {
    it("should remove all signals for a user", async () => {
      await store.record("user-1", makeSignal());
      await store.record("user-1", makeSignal());
      await store.clear("user-1");
      expect(await store.getSignalCount("user-1")).toBe(0);
    });

    it("should not affect other users", async () => {
      await store.record("user-1", makeSignal());
      await store.record("user-2", makeSignal());
      await store.clear("user-1");
      expect(await store.getSignalCount("user-2")).toBe(1);
    });
  });
});
