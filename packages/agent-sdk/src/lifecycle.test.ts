import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AgentLifecycleManager, type AgentState, type LifecycleEvents } from "./lifecycle.js";

describe("AgentLifecycleManager", () => {
  let events: LifecycleEvents;
  let manager: AgentLifecycleManager;

  beforeEach(() => {
    vi.useFakeTimers();
    events = {
      onStateChange: vi.fn(),
      onHealthCheck: vi.fn(),
      onRestart: vi.fn(),
    };
    manager = new AgentLifecycleManager("agent-1", events);
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  // ─── Initial state ───────────────────────────────────────────

  describe("given a newly created manager", () => {
    it("then the initial state should be offline", () => {
      expect(manager.getState()).toBe("offline");
    });

    it("then the agent id should match the constructor argument", () => {
      expect(manager.getAgentId()).toBe("agent-1");
    });

    it("then the restart count should be 0", () => {
      expect(manager.getRestartCount()).toBe(0);
    });
  });

  // ─── Valid transitions ────────────────────────────────────────

  describe("given valid state transitions", () => {
    const validPaths: [AgentState, AgentState][] = [
      ["offline", "starting"],
      ["starting", "online"],
      ["starting", "error"],
      ["starting", "offline"],
      ["online", "busy"],
      ["online", "offline"],
      ["online", "error"],
      ["busy", "online"],
      ["busy", "offline"],
      ["busy", "error"],
      ["error", "starting"],
      ["error", "offline"],
    ];

    for (const [from, to] of validPaths) {
      it(`then ${from} → ${to} should succeed`, () => {
        // Navigate to the 'from' state first
        navigateTo(manager, from);
        expect(() => manager.transition(to)).not.toThrow();
        expect(manager.getState()).toBe(to);
      });
    }
  });

  // ─── Invalid transitions ──────────────────────────────────────

  describe("given invalid state transitions", () => {
    const invalidPaths: [AgentState, AgentState][] = [
      ["offline", "online"],
      ["offline", "busy"],
      ["offline", "error"],
      ["online", "starting"],
      ["starting", "busy"],
      ["busy", "starting"],
      ["error", "online"],
      ["error", "busy"],
    ];

    for (const [from, to] of invalidPaths) {
      it(`then ${from} → ${to} should throw`, () => {
        navigateTo(manager, from);
        expect(() => manager.transition(to)).toThrow(`Invalid state transition: ${from} → ${to}`);
      });
    }
  });

  // ─── canTransition ────────────────────────────────────────────

  describe("given canTransition is called", () => {
    it("then it should return true for valid transitions from offline", () => {
      expect(manager.canTransition("starting")).toBe(true);
    });

    it("then it should return false for invalid transitions from offline", () => {
      expect(manager.canTransition("online")).toBe(false);
      expect(manager.canTransition("busy")).toBe(false);
      expect(manager.canTransition("error")).toBe(false);
    });

    it("then it should return correct values for online state", () => {
      navigateTo(manager, "online");
      expect(manager.canTransition("busy")).toBe(true);
      expect(manager.canTransition("offline")).toBe(true);
      expect(manager.canTransition("error")).toBe(true);
      expect(manager.canTransition("starting")).toBe(false);
    });
  });

  // ─── State change callback ────────────────────────────────────

  describe("given a state change callback is registered", () => {
    it("then it should fire with the from and to states on valid transitions", () => {
      manager.transition("starting");
      expect(events.onStateChange).toHaveBeenCalledWith("offline", "starting");
    });

    it("then it should not fire when a transition throws", () => {
      expect(() => manager.transition("online")).toThrow();
      expect(events.onStateChange).not.toHaveBeenCalled();
    });
  });

  // ─── Backoff schedule ─────────────────────────────────────────

  describe("given the backoff schedule", () => {
    it("then getBackoffDelay should return 5000 for the first restart", () => {
      expect(manager.getBackoffDelay()).toBe(5_000);
    });

    it("then getBackoffDelay should return 15000 after one restart", () => {
      manager.recordRestart();
      expect(manager.getBackoffDelay()).toBe(15_000);
    });

    it("then getBackoffDelay should return 60000 after two restarts", () => {
      manager.recordRestart();
      manager.recordRestart();
      expect(manager.getBackoffDelay()).toBe(60_000);
    });

    it("then getBackoffDelay should return 300000 after three restarts", () => {
      manager.recordRestart();
      manager.recordRestart();
      manager.recordRestart();
      expect(manager.getBackoffDelay()).toBe(300_000);
    });

    it("then getBackoffDelay should cap at 300000 after four or more restarts", () => {
      manager.recordRestart();
      manager.recordRestart();
      manager.recordRestart();
      manager.recordRestart();
      expect(manager.getBackoffDelay()).toBe(300_000);
      manager.recordRestart();
      expect(manager.getBackoffDelay()).toBe(300_000);
    });
  });

  // ─── recordRestart ────────────────────────────────────────────

  describe("given recordRestart is called", () => {
    it("then it should increment the restart count", () => {
      manager.recordRestart();
      expect(manager.getRestartCount()).toBe(1);
      manager.recordRestart();
      expect(manager.getRestartCount()).toBe(2);
    });

    it("then it should return the backoff delay before incrementing", () => {
      expect(manager.recordRestart()).toBe(5_000);
      expect(manager.recordRestart()).toBe(15_000);
      expect(manager.recordRestart()).toBe(60_000);
      expect(manager.recordRestart()).toBe(300_000);
      expect(manager.recordRestart()).toBe(300_000);
    });
  });

  // ─── resetRestartCount ────────────────────────────────────────

  describe("given resetRestartCount is called", () => {
    it("then it should reset the count to 0", () => {
      manager.recordRestart();
      manager.recordRestart();
      expect(manager.getRestartCount()).toBe(2);
      manager.resetRestartCount();
      expect(manager.getRestartCount()).toBe(0);
    });

    it("then getBackoffDelay should return the initial delay", () => {
      manager.recordRestart();
      manager.recordRestart();
      manager.resetRestartCount();
      expect(manager.getBackoffDelay()).toBe(5_000);
    });
  });

  // ─── Health checks ────────────────────────────────────────────

  describe("given health checks are started", () => {
    describe("when the agent is online and the check returns unhealthy", () => {
      it("then the agent should transition to error", async () => {
        navigateTo(manager, "online");
        (events.onHealthCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
          healthy: false,
          latencyMs: 50,
          error: "unhealthy",
        });

        manager.startHealthChecks();
        // Advance past one interval tick and flush the resulting promise
        await vi.advanceTimersByTimeAsync(AgentLifecycleManager.HEALTH_CHECK_INTERVAL);

        expect(manager.getState()).toBe("error");
      });
    });

    describe("when the agent is online and the check times out", () => {
      it("then the agent should transition to error", async () => {
        navigateTo(manager, "online");
        (events.onHealthCheck as ReturnType<typeof vi.fn>).mockImplementation(
          () =>
            new Promise(() => {
              /* never resolves */
            }),
        );

        manager.startHealthChecks();
        // Advance past the interval to trigger the health check
        await vi.advanceTimersByTimeAsync(AgentLifecycleManager.HEALTH_CHECK_INTERVAL);
        // Then advance past the timeout so the race rejects
        await vi.advanceTimersByTimeAsync(AgentLifecycleManager.HEALTH_CHECK_TIMEOUT);

        expect(manager.getState()).toBe("error");
      });
    });

    describe("when the agent is online and the check returns healthy", () => {
      it("then the agent should remain online", async () => {
        navigateTo(manager, "online");
        (events.onHealthCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
          healthy: true,
          latencyMs: 5,
        });

        manager.startHealthChecks();
        await vi.advanceTimersByTimeAsync(AgentLifecycleManager.HEALTH_CHECK_INTERVAL);

        expect(manager.getState()).toBe("online");
      });
    });

    describe("when the agent is busy and the check returns unhealthy", () => {
      it("then the agent should transition to error", async () => {
        navigateTo(manager, "busy");
        (events.onHealthCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
          healthy: false,
          latencyMs: 50,
        });

        manager.startHealthChecks();
        await vi.advanceTimersByTimeAsync(AgentLifecycleManager.HEALTH_CHECK_INTERVAL);

        expect(manager.getState()).toBe("error");
      });
    });

    describe("when the agent is offline", () => {
      it("then health checks should not trigger state changes", async () => {
        // Agent starts offline
        (events.onHealthCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
          healthy: false,
          latencyMs: 50,
        });

        manager.startHealthChecks();
        await vi.advanceTimersByTimeAsync(AgentLifecycleManager.HEALTH_CHECK_INTERVAL);

        expect(manager.getState()).toBe("offline");
        expect(events.onHealthCheck).not.toHaveBeenCalled();
      });
    });
  });

  // ─── dispose ──────────────────────────────────────────────────

  describe("given dispose is called", () => {
    it("then health checks should stop", async () => {
      navigateTo(manager, "online");
      (events.onHealthCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
        healthy: false,
        latencyMs: 50,
      });

      manager.startHealthChecks();
      manager.dispose();

      vi.advanceTimersByTime(AgentLifecycleManager.HEALTH_CHECK_INTERVAL * 2);
      await vi.runAllTimersAsync();

      // onHealthCheck should never have been called because we disposed
      expect(events.onHealthCheck).not.toHaveBeenCalled();
      expect(manager.getState()).toBe("online");
    });
  });
});

// ── helpers ──────────────────────────────────────────────────────

/** Navigate a manager to a given state through valid transitions. */
function navigateTo(manager: AgentLifecycleManager, target: AgentState): void {
  const paths: Record<AgentState, AgentState[]> = {
    offline: [],
    starting: ["starting"],
    online: ["starting", "online"],
    busy: ["starting", "online", "busy"],
    error: ["starting", "error"],
  };

  for (const step of paths[target]) {
    manager.transition(step);
  }
}
