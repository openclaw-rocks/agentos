import { describe, it, expect, vi, beforeEach } from "vitest";
import { PresenceTracker } from "./presence-tracker";

// ---------------------------------------------------------------------------
// Minimal mocks
// ---------------------------------------------------------------------------

/** Minimal mock for a Matrix User object */
function mockUser(
  userId: string,
  presence: string,
  opts?: { lastActiveAgo?: number; presenceStatusMsg?: string; currentlyActive?: boolean },
) {
  return {
    userId,
    presence,
    lastActiveAgo: opts?.lastActiveAgo ?? 0,
    presenceStatusMsg: opts?.presenceStatusMsg ?? undefined,
    currentlyActive: opts?.currentlyActive ?? false,
  };
}

/** Minimal mock for a Matrix client that supports on/removeListener/setPresence */
function mockClient() {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
    }),
    removeListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const list = handlers.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
    }),
    setPresence: vi.fn().mockResolvedValue(undefined),
    /** Helper: emit a presence event to all registered handlers */
    _emitPresence(user: ReturnType<typeof mockUser>) {
      const list = handlers.get("User.presence");
      if (list) {
        for (const fn of list) fn(undefined, user);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PresenceTracker", () => {
  let tracker: PresenceTracker;

  beforeEach(() => {
    tracker = new PresenceTracker();
  });

  describe("given no presence data", () => {
    it("should return offline for an unknown user", () => {
      // When
      const info = tracker.getPresence("@unknown:example.com");

      // Then
      expect(info.status).toBe("offline");
      expect(info.lastActiveAgo).toBeUndefined();
      expect(info.statusMsg).toBeUndefined();
      expect(info.currentlyActive).toBeUndefined();
    });
  });

  describe("given a presence event is received", () => {
    it("should update status to online", () => {
      // Given
      const client = mockClient();

      tracker.startTracking(client as any);

      // When
      client._emitPresence(mockUser("@alice:example.com", "online"));

      // Then
      const info = tracker.getPresence("@alice:example.com");
      expect(info.status).toBe("online");
    });

    it("should update status to unavailable", () => {
      // Given
      const client = mockClient();

      tracker.startTracking(client as any);

      // When
      client._emitPresence(mockUser("@bob:example.com", "unavailable"));

      // Then
      const info = tracker.getPresence("@bob:example.com");
      expect(info.status).toBe("unavailable");
    });

    it("should treat unknown presence strings as offline", () => {
      // Given
      const client = mockClient();

      tracker.startTracking(client as any);

      // When
      client._emitPresence(mockUser("@carol:example.com", "some_unknown_status"));

      // Then
      const info = tracker.getPresence("@carol:example.com");
      expect(info.status).toBe("offline");
    });
  });

  describe("given lastActiveAgo tracking", () => {
    it("should capture lastActiveAgo when present", () => {
      // Given
      const client = mockClient();

      tracker.startTracking(client as any);

      // When
      client._emitPresence(mockUser("@alice:example.com", "unavailable", { lastActiveAgo: 60000 }));

      // Then
      const info = tracker.getPresence("@alice:example.com");
      expect(info.lastActiveAgo).toBe(60000);
    });

    it("should omit lastActiveAgo when zero", () => {
      // Given
      const client = mockClient();

      tracker.startTracking(client as any);

      // When
      client._emitPresence(mockUser("@alice:example.com", "online", { lastActiveAgo: 0 }));

      // Then
      const info = tracker.getPresence("@alice:example.com");
      expect(info.lastActiveAgo).toBeUndefined();
    });
  });

  describe("given statusMsg and currentlyActive", () => {
    it("should capture statusMsg", () => {
      // Given
      const client = mockClient();

      tracker.startTracking(client as any);

      // When
      client._emitPresence(
        mockUser("@alice:example.com", "online", { presenceStatusMsg: "In a meeting" }),
      );

      // Then
      const info = tracker.getPresence("@alice:example.com");
      expect(info.statusMsg).toBe("In a meeting");
    });

    it("should capture currentlyActive", () => {
      // Given
      const client = mockClient();

      tracker.startTracking(client as any);

      // When
      client._emitPresence(mockUser("@alice:example.com", "online", { currentlyActive: true }));

      // Then
      const info = tracker.getPresence("@alice:example.com");
      expect(info.currentlyActive).toBe(true);
    });
  });

  describe("setMyPresence", () => {
    it("should call client.setPresence with correct options", async () => {
      // Given
      const client = mockClient();

      tracker.startTracking(client as any);

      // When
      await tracker.setMyPresence("unavailable", "Lunch break");

      // Then
      expect(client.setPresence).toHaveBeenCalledWith({
        presence: "unavailable",
        status_msg: "Lunch break",
      });
    });

    it("should not throw when client is not set", async () => {
      // Given — no startTracking called

      // When / Then — should not throw
      await expect(tracker.setMyPresence("online")).resolves.toBeUndefined();
    });
  });

  describe("subscribe / notify", () => {
    it("should notify listeners when presence changes", () => {
      // Given
      const client = mockClient();

      tracker.startTracking(client as any);

      const listener = vi.fn();
      tracker.subscribe(listener);

      // When
      client._emitPresence(mockUser("@alice:example.com", "online"));

      // Then
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should not notify when presence data is identical", () => {
      // Given
      const client = mockClient();

      tracker.startTracking(client as any);

      // Prime the cache with initial data
      client._emitPresence(mockUser("@alice:example.com", "online"));

      const listener = vi.fn();
      tracker.subscribe(listener);

      // When — emit the same data again
      client._emitPresence(mockUser("@alice:example.com", "online"));

      // Then
      expect(listener).not.toHaveBeenCalled();
    });

    it("should increment version on each change", () => {
      // Given
      const client = mockClient();

      tracker.startTracking(client as any);

      const v0 = tracker.getVersion();

      // When
      client._emitPresence(mockUser("@alice:example.com", "online"));
      const v1 = tracker.getVersion();
      client._emitPresence(mockUser("@alice:example.com", "unavailable"));
      const v2 = tracker.getVersion();

      // Then
      expect(v1).toBe(v0 + 1);
      expect(v2).toBe(v0 + 2);
    });

    it("should allow unsubscription", () => {
      // Given
      const client = mockClient();

      tracker.startTracking(client as any);

      const listener = vi.fn();
      const unsub = tracker.subscribe(listener);

      // When
      unsub();
      client._emitPresence(mockUser("@alice:example.com", "online"));

      // Then
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("stopTracking", () => {
    it("should remove listener from client", () => {
      // Given
      const client = mockClient();

      tracker.startTracking(client as any);

      // When
      tracker.stopTracking();

      // Then
      expect(client.removeListener).toHaveBeenCalledWith("User.presence", expect.any(Function));
    });

    it("should not process events after stopping", () => {
      // Given
      const client = mockClient();

      tracker.startTracking(client as any);

      const listener = vi.fn();
      tracker.subscribe(listener);

      // When
      tracker.stopTracking();
      client._emitPresence(mockUser("@alice:example.com", "online"));

      // Then
      expect(listener).not.toHaveBeenCalled();
      expect(tracker.getPresence("@alice:example.com").status).toBe("offline");
    });
  });
});
