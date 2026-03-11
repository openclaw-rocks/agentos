import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { AuditLog } from "./audit.js";

describe("AuditLog", () => {
  let log: AuditLog;

  beforeEach(() => {
    vi.useFakeTimers();
    log = new AuditLog();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── record ───────────────────────────────────────────────────────

  describe("given an entry is recorded", () => {
    it("then it should automatically set the timestamp", () => {
      const now = Date.now();
      log.record({
        agentId: "agent-a",
        spaceId: "space-1",
        action: "send_message",
        permissionUsed: "send_messages",
        success: true,
      });

      const entries = log.export();
      expect(entries).toHaveLength(1);
      expect(entries[0].timestamp).toBe(now);
    });

    it("then it should store all provided fields", () => {
      log.record({
        agentId: "agent-a",
        spaceId: "space-1",
        action: "read_state",
        permissionUsed: "read_state",
        success: true,
        metadata: { key: "value" },
      });

      const entries = log.export();
      expect(entries[0].agentId).toBe("agent-a");
      expect(entries[0].spaceId).toBe("space-1");
      expect(entries[0].action).toBe("read_state");
      expect(entries[0].permissionUsed).toBe("read_state");
      expect(entries[0].success).toBe(true);
      expect(entries[0].metadata).toEqual({ key: "value" });
    });
  });

  // ── query ────────────────────────────────────────────────────────

  describe("given multiple entries are recorded", () => {
    beforeEach(() => {
      log.record({
        agentId: "agent-a",
        spaceId: "space-1",
        action: "send_message",
        permissionUsed: "send_messages",
        success: true,
      });
      vi.advanceTimersByTime(1000);
      log.record({
        agentId: "agent-b",
        spaceId: "space-1",
        action: "read_state",
        permissionUsed: "read_state",
        success: true,
      });
      vi.advanceTimersByTime(1000);
      log.record({
        agentId: "agent-a",
        spaceId: "space-2",
        action: "write_state",
        permissionUsed: "write_state",
        success: false,
      });
    });

    it("then query by agentId should return matching entries", () => {
      const results = log.query({ agentId: "agent-a" });
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.agentId === "agent-a")).toBe(true);
    });

    it("then query by spaceId should return matching entries", () => {
      const results = log.query({ spaceId: "space-1" });
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.spaceId === "space-1")).toBe(true);
    });

    it("then query by action should return matching entries", () => {
      const results = log.query({ action: "read_state" });
      expect(results).toHaveLength(1);
      expect(results[0].agentId).toBe("agent-b");
    });

    it("then query with since filter should return entries at or after that time", () => {
      const entries = log.export();
      const sinceTime = entries[1].timestamp;
      const results = log.query({ since: sinceTime });
      expect(results).toHaveLength(2);
    });

    it("then query with limit should cap the number of results", () => {
      const results = log.query({ limit: 1 });
      expect(results).toHaveLength(1);
    });
  });

  // ── count ────────────────────────────────────────────────────────

  describe("given entries are recorded", () => {
    it("then count should track the number of entries", () => {
      expect(log.count()).toBe(0);

      log.record({
        agentId: "agent-a",
        spaceId: "space-1",
        action: "test",
        permissionUsed: "read_messages",
        success: true,
      });
      expect(log.count()).toBe(1);

      log.record({
        agentId: "agent-b",
        spaceId: "space-1",
        action: "test",
        permissionUsed: "read_messages",
        success: true,
      });
      expect(log.count()).toBe(2);
    });
  });

  // ── clear ────────────────────────────────────────────────────────

  describe("given clear is called", () => {
    it("then all entries should be removed", () => {
      log.record({
        agentId: "agent-a",
        spaceId: "space-1",
        action: "test",
        permissionUsed: "read_messages",
        success: true,
      });
      log.record({
        agentId: "agent-b",
        spaceId: "space-1",
        action: "test",
        permissionUsed: "read_messages",
        success: true,
      });

      expect(log.count()).toBe(2);
      log.clear();
      expect(log.count()).toBe(0);
      expect(log.export()).toEqual([]);
    });
  });

  // ── export ───────────────────────────────────────────────────────

  describe("given export is called", () => {
    it("then it should return a copy of all entries", () => {
      log.record({
        agentId: "agent-a",
        spaceId: "space-1",
        action: "action-1",
        permissionUsed: "read_messages",
        success: true,
      });
      log.record({
        agentId: "agent-b",
        spaceId: "space-2",
        action: "action-2",
        permissionUsed: "send_messages",
        success: false,
      });

      const exported = log.export();
      expect(exported).toHaveLength(2);
      expect(exported[0].agentId).toBe("agent-a");
      expect(exported[1].agentId).toBe("agent-b");
    });
  });

  // ── max entries cap ──────────────────────────────────────────────

  describe("given a max entries cap is configured", () => {
    it("then recording beyond the cap should evict the oldest entries", () => {
      const smallLog = new AuditLog(3);

      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(100);
        smallLog.record({
          agentId: `agent-${i}`,
          spaceId: "space-1",
          action: `action-${i}`,
          permissionUsed: "read_messages",
          success: true,
        });
      }

      expect(smallLog.count()).toBe(3);
      const entries = smallLog.export();
      // The oldest two (agent-0, agent-1) should be evicted
      expect(entries[0].agentId).toBe("agent-2");
      expect(entries[1].agentId).toBe("agent-3");
      expect(entries[2].agentId).toBe("agent-4");
    });
  });
});
