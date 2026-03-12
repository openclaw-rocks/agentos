import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnreadTracker } from "./unread-tracker";

function createMockRoom(
  roomId: string,
  opts: {
    totalUnread?: number;
    highlightUnread?: number;
    timelineEvents?: Array<{ getId: () => string }>;
  } = {},
) {
  const { totalUnread = 0, highlightUnread = 0, timelineEvents = [] } = opts;
  return {
    roomId,
    getUnreadNotificationCount: (type: string) => {
      if (type === "total") return totalUnread;
      if (type === "highlight") return highlightUnread;
      return 0;
    },
    getLiveTimeline: () => ({
      getEvents: () => timelineEvents,
    }),
    getReadReceiptForUserId: () => null,
  };
}

function createMockClient(rooms: ReturnType<typeof createMockRoom>[]) {
  return {
    getRooms: () => rooms,
    getRoom: (id: string) => rooms.find((r) => r.roomId === id) ?? null,
    getUserId: () => "@user:example.com",
    sendReadReceipt: vi.fn().mockResolvedValue(undefined),
  };
}

describe("UnreadTracker", () => {
  let tracker: UnreadTracker;

  beforeEach(() => {
    tracker = new UnreadTracker();
  });

  describe("given a room with unread messages", () => {
    it("should return the unread count from the Matrix SDK", () => {
      // Given
      const room = createMockRoom("!room1:example.com", { totalUnread: 5 });
      const client = createMockClient([room]);

      tracker.setClient(client as any);

      // When
      tracker.refreshCounts();

      // Then
      const counts = tracker.getUnreadCount("!room1:example.com");
      expect(counts.total).toBe(5);
    });

    it("should return highlight count for mentions", () => {
      // Given
      const room = createMockRoom("!room1:example.com", {
        totalUnread: 3,
        highlightUnread: 2,
      });
      const client = createMockClient([room]);

      tracker.setClient(client as any);

      // When
      tracker.refreshCounts();

      // Then
      const counts = tracker.getUnreadCount("!room1:example.com");
      expect(counts.total).toBe(3);
      expect(counts.highlight).toBe(2);
    });

    it("should notify listeners when counts change", () => {
      // Given
      const room = createMockRoom("!room1:example.com", { totalUnread: 1 });
      const client = createMockClient([room]);

      tracker.setClient(client as any);

      const listener = vi.fn();
      tracker.subscribe(listener);

      // When
      tracker.refreshCounts();

      // Then
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should not notify if counts have not changed", () => {
      // Given
      const room = createMockRoom("!room1:example.com", { totalUnread: 3 });
      const client = createMockClient([room]);

      tracker.setClient(client as any);

      tracker.refreshCounts(); // initial load

      const listener = vi.fn();
      tracker.subscribe(listener);

      // When
      tracker.refreshCounts(); // same counts

      // Then
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("given a room with no unreads", () => {
    it("should return zero counts", () => {
      // Given
      const room = createMockRoom("!room1:example.com");
      const client = createMockClient([room]);

      tracker.setClient(client as any);

      // When
      tracker.refreshCounts();

      // Then
      const counts = tracker.getUnreadCount("!room1:example.com");
      expect(counts.total).toBe(0);
      expect(counts.highlight).toBe(0);
    });
  });

  describe("given markAsRead is called", () => {
    it("should reset the unread count for the room", () => {
      // Given
      const mockEvent = { getId: () => "$last-event" };
      const room = createMockRoom("!room1:example.com", {
        totalUnread: 5,
        highlightUnread: 1,
        timelineEvents: [mockEvent],
      });
      const client = createMockClient([room]);

      tracker.setClient(client as any);
      tracker.refreshCounts();

      // When
      tracker.markAsRead("!room1:example.com");

      // Then
      const counts = tracker.getUnreadCount("!room1:example.com");
      expect(counts.total).toBe(0);
      expect(counts.highlight).toBe(0);
    });

    it("should send a read receipt to the server", () => {
      // Given
      const mockEvent = { getId: () => "$last-event" };
      const room = createMockRoom("!room1:example.com", {
        totalUnread: 2,
        timelineEvents: [mockEvent],
      });
      const client = createMockClient([room]);

      tracker.setClient(client as any);
      tracker.refreshCounts();

      // When
      tracker.markAsRead("!room1:example.com");

      // Then
      expect(client.sendReadReceipt).toHaveBeenCalledWith(mockEvent);
    });

    it("should store the last-read event ID", () => {
      // Given
      const mockEvent = { getId: () => "$evt-42" };
      const room = createMockRoom("!room1:example.com", {
        totalUnread: 1,
        timelineEvents: [mockEvent],
      });
      const client = createMockClient([room]);

      tracker.setClient(client as any);
      tracker.refreshCounts();

      // When
      tracker.markAsRead("!room1:example.com");

      // Then
      expect(tracker.getLastReadEventId("!room1:example.com")).toBe("$evt-42");
    });
  });

  describe("given hasUnreadsInRooms is called", () => {
    it("should return true if any room in the set has unreads", () => {
      // Given
      const room1 = createMockRoom("!room1:example.com", { totalUnread: 0 });
      const room2 = createMockRoom("!room2:example.com", { totalUnread: 3 });
      const client = createMockClient([room1, room2]);

      tracker.setClient(client as any);
      tracker.refreshCounts();

      // When / Then
      expect(tracker.hasUnreadsInRooms(new Set(["!room1:example.com", "!room2:example.com"]))).toBe(
        true,
      );
    });

    it("should return false if no rooms have unreads", () => {
      // Given
      const room1 = createMockRoom("!room1:example.com");
      const room2 = createMockRoom("!room2:example.com");
      const client = createMockClient([room1, room2]);

      tracker.setClient(client as any);
      tracker.refreshCounts();

      // When / Then
      expect(tracker.hasUnreadsInRooms(new Set(["!room1:example.com", "!room2:example.com"]))).toBe(
        false,
      );
    });
  });

  describe("given thread-level unread tracking", () => {
    describe("when incrementThreadUnread is called", () => {
      it("should track unread count per thread", () => {
        // Given
        const room = createMockRoom("!room1:example.com");
        const client = createMockClient([room]);

        tracker.setClient(client as any);

        // When
        tracker.incrementThreadUnread("!room1:example.com", "$thread-root-1");
        tracker.incrementThreadUnread("!room1:example.com", "$thread-root-1");
        tracker.incrementThreadUnread("!room1:example.com", "$thread-root-2");

        // Then
        expect(tracker.getThreadUnreadCount("!room1:example.com", "$thread-root-1")).toBe(2);
        expect(tracker.getThreadUnreadCount("!room1:example.com", "$thread-root-2")).toBe(1);
      });

      it("should return zero for threads with no unreads", () => {
        // Given / When / Then
        expect(tracker.getThreadUnreadCount("!room1:example.com", "$nonexistent")).toBe(0);
      });

      it("should notify listeners when thread unread count changes", () => {
        // Given
        const listener = vi.fn();
        tracker.subscribe(listener);

        // When
        tracker.incrementThreadUnread("!room1:example.com", "$thread-root-1");

        // Then
        expect(listener).toHaveBeenCalledTimes(1);
      });
    });

    describe("when markThreadAsRead is called", () => {
      it("should reset the thread unread count to zero", () => {
        // Given
        tracker.incrementThreadUnread("!room1:example.com", "$thread-root-1");
        tracker.incrementThreadUnread("!room1:example.com", "$thread-root-1");

        // When
        tracker.markThreadAsRead("!room1:example.com", "$thread-root-1");

        // Then
        expect(tracker.getThreadUnreadCount("!room1:example.com", "$thread-root-1")).toBe(0);
      });

      it("should notify listeners when marking a thread as read", () => {
        // Given
        tracker.incrementThreadUnread("!room1:example.com", "$thread-root-1");
        const listener = vi.fn();
        tracker.subscribe(listener);

        // When
        tracker.markThreadAsRead("!room1:example.com", "$thread-root-1");

        // Then
        expect(listener).toHaveBeenCalledTimes(1);
      });

      it("should not notify if thread already has zero unreads", () => {
        // Given
        const listener = vi.fn();
        tracker.subscribe(listener);

        // When
        tracker.markThreadAsRead("!room1:example.com", "$thread-root-1");

        // Then
        expect(listener).not.toHaveBeenCalled();
      });
    });

    describe("when getTotalThreadUnreadCount is called", () => {
      it("should sum all thread unread counts for a room", () => {
        // Given
        tracker.incrementThreadUnread("!room1:example.com", "$thread-1");
        tracker.incrementThreadUnread("!room1:example.com", "$thread-1");
        tracker.incrementThreadUnread("!room1:example.com", "$thread-2");
        tracker.incrementThreadUnread("!room2:example.com", "$thread-3");

        // When
        const total = tracker.getTotalThreadUnreadCount("!room1:example.com");

        // Then
        expect(total).toBe(3);
      });

      it("should return zero when no threads have unreads", () => {
        // When / Then
        expect(tracker.getTotalThreadUnreadCount("!room1:example.com")).toBe(0);
      });
    });
  });

  describe("given subscribe is called", () => {
    it("should allow unsubscribing via the returned function", () => {
      // Given
      const room = createMockRoom("!room1:example.com", { totalUnread: 0 });
      const client = createMockClient([room]);

      tracker.setClient(client as any);

      const listener = vi.fn();
      const unsub = tracker.subscribe(listener);

      // When — unsubscribe then trigger a change
      unsub();

      const roomAfter = createMockRoom("!room1:example.com", { totalUnread: 5 });
      const clientAfter = createMockClient([roomAfter]);

      tracker.setClient(clientAfter as any);
      tracker.refreshCounts();

      // Then
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
