import { describe, it, expect, beforeEach } from "vitest";
import { MemorySignalStore } from "../adapters/memory-signal-store.js";
import type { Signal } from "../ports/signal-store.js";
import { SignalCollector } from "./signal-collector.js";

describe("SignalCollector", () => {
  let store: MemorySignalStore;
  let collector: SignalCollector;

  const makeSignal = (overrides: Partial<Signal> = {}): Signal => ({
    type: "space_visit",
    spaceId: "space-1",
    timestamp: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    store = new MemorySignalStore();
    collector = new SignalCollector(store);
  });

  describe("record", () => {
    it("should record signals when enabled", async () => {
      await collector.record("user-1", makeSignal());
      const count = await store.getSignalCount("user-1");
      expect(count).toBe(1);
    });

    it("should no-op when disabled", async () => {
      collector.setEnabled(false);
      await collector.record("user-1", makeSignal());
      const count = await store.getSignalCount("user-1");
      expect(count).toBe(0);
    });

    it("should record multiple signals for the same user", async () => {
      await collector.record("user-1", makeSignal());
      await collector.record("user-1", makeSignal({ spaceId: "space-2" }));
      await collector.record("user-1", makeSignal({ type: "message_sent" }));
      const count = await store.getSignalCount("user-1");
      expect(count).toBe(3);
    });

    it("should record signals for different users independently", async () => {
      await collector.record("user-1", makeSignal());
      await collector.record("user-2", makeSignal());
      expect(await store.getSignalCount("user-1")).toBe(1);
      expect(await store.getSignalCount("user-2")).toBe(1);
    });
  });

  describe("getPatterns", () => {
    it("should return aggregated data", async () => {
      await collector.record("user-1", makeSignal({ type: "space_visit", spaceId: "space-1" }));
      await collector.record("user-1", makeSignal({ type: "space_visit", spaceId: "space-1" }));
      await collector.record("user-1", makeSignal({ type: "space_visit", spaceId: "space-2" }));

      const patterns = await collector.getPatterns("user-1");
      expect(patterns.totalSignals).toBe(3);
      expect(patterns.topSpaces).toHaveLength(2);
      expect(patterns.topSpaces[0].spaceId).toBe("space-1");
      expect(patterns.topSpaces[0].visitCount).toBe(2);
    });

    it("should return empty aggregation for unknown user", async () => {
      const patterns = await collector.getPatterns("unknown-user");
      expect(patterns.totalSignals).toBe(0);
      expect(patterns.topSpaces).toHaveLength(0);
      expect(patterns.activeHours).toHaveLength(0);
    });
  });

  describe("clearSignals", () => {
    it("should remove all signals for a user", async () => {
      await collector.record("user-1", makeSignal());
      await collector.record("user-1", makeSignal());
      await collector.clearSignals("user-1");
      const count = await store.getSignalCount("user-1");
      expect(count).toBe(0);
    });

    it("should not affect other users", async () => {
      await collector.record("user-1", makeSignal());
      await collector.record("user-2", makeSignal());
      await collector.clearSignals("user-1");
      expect(await store.getSignalCount("user-1")).toBe(0);
      expect(await store.getSignalCount("user-2")).toBe(1);
    });
  });

  describe("isEnabled / setEnabled", () => {
    it("should be enabled by default", () => {
      expect(collector.isEnabled()).toBe(true);
    });

    it("should toggle enabled state", () => {
      collector.setEnabled(false);
      expect(collector.isEnabled()).toBe(false);
      collector.setEnabled(true);
      expect(collector.isEnabled()).toBe(true);
    });

    it("should respect config disabled on construction", () => {
      const disabledCollector = new SignalCollector(store, { enabled: false });
      expect(disabledCollector.isEnabled()).toBe(false);
    });
  });

  describe("config defaults", () => {
    it("should use default config values when none provided", () => {
      const defaultCollector = new SignalCollector(store);
      expect(defaultCollector.isEnabled()).toBe(true);
    });

    it("should accept partial config overrides", () => {
      const customCollector = new SignalCollector(store, {
        retentionDays: 7,
      });
      expect(customCollector.isEnabled()).toBe(true);
    });
  });
});
