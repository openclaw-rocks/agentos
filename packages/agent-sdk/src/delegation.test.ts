import { TaskStatusValues } from "@openclaw/protocol";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DelegationManager } from "./delegation.js";
import type { DelegationRequest } from "./delegation.js";

describe("DelegationManager", () => {
  let manager: DelegationManager;
  /** Collect promises created during each test so cleanup never causes unhandled rejections */
  let pendingPromises: Promise<unknown>[];

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new DelegationManager();
    pendingPromises = [];
  });

  afterEach(() => {
    // Suppress unhandled rejections from promises that were not consumed by the test
    for (const p of pendingPromises) {
      p.catch(() => {});
    }
    manager.cancelAll();
    vi.useRealTimers();
  });

  /** Helper: create a delegation and track its promise for safe cleanup */
  function createTracked(from: string, request: DelegationRequest) {
    const result = manager.createDelegation(from, request);
    pendingPromises.push(result.promise);
    return result;
  }

  // ── Creating a delegation ──────────────────────────────────────────

  describe("given a delegation is created", () => {
    const request: DelegationRequest = {
      targetAgentId: "agent-b",
      title: "Identify food",
      description: "Use vision to identify food in image",
      input: { imageUrl: "https://example.com/food.jpg" },
    };

    it("then it should return task content and a promise", () => {
      const { taskContent, promise } = createTracked("agent-a", request);

      expect(taskContent).toBeDefined();
      expect(promise).toBeInstanceOf(Promise);
    });

    it("then the task content should have correct fields", () => {
      const { taskContent } = createTracked("agent-a", request);

      expect(taskContent.task_id).toBeDefined();
      expect(taskContent.task_id).toMatch(/^delegation-/);
      expect(taskContent.title).toBe("Identify food");
      expect(taskContent.description).toBe("Use vision to identify food in image");
      expect(taskContent.status).toBe(TaskStatusValues.Pending);
      expect(taskContent.assigned_to).toBe("agent-b");
      expect(taskContent.created_by).toBe("agent-a");
      expect(taskContent.metadata).toEqual({
        input: { imageUrl: "https://example.com/food.jpg" },
      });
    });

    it("then each delegation should get a unique task_id", () => {
      const first = createTracked("agent-a", request);
      const second = createTracked("agent-a", request);

      expect(first.taskContent.task_id).not.toBe(second.taskContent.task_id);
    });
  });

  // ── Handling a completed result ────────────────────────────────────

  describe("given a delegation result is received with status completed", () => {
    it("then the promise should resolve with the result", async () => {
      const { taskContent, promise } = createTracked("agent-a", {
        targetAgentId: "agent-b",
        title: "Identify food",
        input: { imageUrl: "https://example.com/food.jpg" },
      });

      const handled = manager.handleTaskResult(taskContent.task_id, "completed", {
        food: "pizza",
        calories: 285,
      });

      expect(handled).toBe(true);

      const result = await promise;
      expect(result.taskId).toBe(taskContent.task_id);
      expect(result.status).toBe("completed");
      expect(result.result).toEqual({ food: "pizza", calories: 285 });
      expect(result.error).toBeUndefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Handling a failed result ───────────────────────────────────────

  describe("given a delegation result is received with status failed", () => {
    it("then the promise should resolve with the error", async () => {
      const { taskContent, promise } = createTracked("agent-a", {
        targetAgentId: "agent-b",
        title: "Identify food",
        input: {},
      });

      manager.handleTaskResult(
        taskContent.task_id,
        "failed",
        undefined,
        "Image analysis failed: unsupported format",
      );

      const result = await promise;
      expect(result.status).toBe("failed");
      expect(result.error).toBe("Image analysis failed: unsupported format");
      expect(result.result).toBeUndefined();
    });
  });

  // ── Timeout ────────────────────────────────────────────────────────

  describe("given a delegation times out", () => {
    it("then the promise should resolve with status timeout after default period", async () => {
      const { promise } = createTracked("agent-a", {
        targetAgentId: "agent-b",
        title: "Slow task",
        input: {},
      });

      // Advance past the default 30s timeout
      vi.advanceTimersByTime(DelegationManager.DEFAULT_TIMEOUT + 1);

      const result = await promise;
      expect(result.status).toBe("timeout");
      expect(result.error).toContain("timed out");
      expect(result.error).toContain("agent-b");
      expect(result.error).toContain("30000ms");
    });

    it("then a custom timeout should override the default", async () => {
      const { promise } = createTracked("agent-a", {
        targetAgentId: "agent-b",
        title: "Quick task",
        input: {},
        timeoutMs: 5000,
      });

      // Should not have timed out yet at 4999ms
      vi.advanceTimersByTime(4999);
      expect(manager.getPendingCount()).toBe(1);

      // Should time out at 5001ms
      vi.advanceTimersByTime(2);

      const result = await promise;
      expect(result.status).toBe("timeout");
      expect(result.error).toContain("5000ms");
    });
  });

  // ── Circular delegation detection ─────────────────────────────────

  describe("given circular delegation detection", () => {
    it("then self-delegation (A to A) should be detected as circular", () => {
      expect(manager.wouldCreateCycle("agent-a", "agent-a")).toBe(true);
    });

    it("then A to B then B to A should be detected as circular", () => {
      manager.trackDelegation("agent-a", "agent-b", "task-1");

      expect(manager.wouldCreateCycle("agent-b", "agent-a")).toBe(true);
    });

    it("then A to B and A to C should NOT be circular", () => {
      manager.trackDelegation("agent-a", "agent-b", "task-1");

      expect(manager.wouldCreateCycle("agent-a", "agent-c")).toBe(false);
    });

    it("then deep chain A to B to C, then C to A should be circular", () => {
      manager.trackDelegation("agent-a", "agent-b", "task-1");
      manager.trackDelegation("agent-b", "agent-c", "task-2");

      expect(manager.wouldCreateCycle("agent-c", "agent-a")).toBe(true);
    });

    it("then deep chain A to B to C, C to D should NOT be circular", () => {
      manager.trackDelegation("agent-a", "agent-b", "task-1");
      manager.trackDelegation("agent-b", "agent-c", "task-2");

      expect(manager.wouldCreateCycle("agent-c", "agent-d")).toBe(false);
    });
  });

  // ── cancelAll ──────────────────────────────────────────────────────

  describe("given cancelAll is called", () => {
    it("then all pending delegations should be rejected", async () => {
      const { promise: p1 } = createTracked("agent-a", {
        targetAgentId: "agent-b",
        title: "Task 1",
        input: {},
      });

      const { promise: p2 } = createTracked("agent-a", {
        targetAgentId: "agent-c",
        title: "Task 2",
        input: {},
      });

      manager.cancelAll();

      await expect(p1).rejects.toThrow("cancelled");
      await expect(p2).rejects.toThrow("cancelled");
    });

    it("then getPendingCount should return 0 after cancelAll", () => {
      createTracked("agent-a", {
        targetAgentId: "agent-b",
        title: "Task 1",
        input: {},
      });

      expect(manager.getPendingCount()).toBe(1);
      manager.cancelAll();
      expect(manager.getPendingCount()).toBe(0);
    });
  });

  // ── handleTaskResult for unknown task ──────────────────────────────

  describe("given handleTaskResult is called for an unknown task", () => {
    it("then it should return false", () => {
      expect(manager.handleTaskResult("nonexistent-task", "completed", {})).toBe(false);
    });
  });

  // ── getPendingCount ────────────────────────────────────────────────

  describe("given multiple delegations are created and resolved", () => {
    it("then getPendingCount should track pending delegations correctly", () => {
      expect(manager.getPendingCount()).toBe(0);

      const { taskContent: tc1 } = createTracked("agent-a", {
        targetAgentId: "agent-b",
        title: "Task 1",
        input: {},
      });

      expect(manager.getPendingCount()).toBe(1);

      createTracked("agent-a", {
        targetAgentId: "agent-c",
        title: "Task 2",
        input: {},
      });

      expect(manager.getPendingCount()).toBe(2);

      manager.handleTaskResult(tc1.task_id, "completed", {});

      expect(manager.getPendingCount()).toBe(1);
    });
  });

  // ── untrackDelegation ──────────────────────────────────────────────

  describe("given untrackDelegation is called", () => {
    it("then the delegation should be removed from the chain tracker", () => {
      manager.trackDelegation("agent-a", "agent-b", "task-1");

      // Before untrack: B to A would be circular
      expect(manager.wouldCreateCycle("agent-b", "agent-a")).toBe(true);

      manager.untrackDelegation("task-1");

      // After untrack: B to A is no longer circular
      expect(manager.wouldCreateCycle("agent-b", "agent-a")).toBe(false);
    });
  });

  // ── handleTaskResult clears timeout ────────────────────────────────

  describe("given a result arrives before timeout", () => {
    it("then the timeout should not fire after result is handled", async () => {
      const { taskContent, promise } = createTracked("agent-a", {
        targetAgentId: "agent-b",
        title: "Fast task",
        input: {},
        timeoutMs: 5000,
      });

      manager.handleTaskResult(taskContent.task_id, "completed", { answer: 42 });

      const result = await promise;
      expect(result.status).toBe("completed");

      // Advance past the timeout -- should not cause issues
      vi.advanceTimersByTime(10000);
      expect(manager.getPendingCount()).toBe(0);
    });
  });

  // ── DelegationResult.durationMs ────────────────────────────────────

  describe("given time passes before a result is received", () => {
    it("then durationMs should reflect elapsed time", async () => {
      const { taskContent, promise } = createTracked("agent-a", {
        targetAgentId: "agent-b",
        title: "Timed task",
        input: {},
      });

      vi.advanceTimersByTime(1500);
      manager.handleTaskResult(taskContent.task_id, "completed", {});

      const result = await promise;
      expect(result.durationMs).toBeGreaterThanOrEqual(1500);
    });
  });
});
