import { describe, it, expect, vi, beforeEach } from "vitest";
import { DMTracker } from "./dm-tracker";

/** Minimal mock for a Matrix room member */
function mockMember(userId: string) {
  return { userId };
}

/** Minimal mock for a Matrix room */
function mockRoom(
  roomId: string,
  members: Array<{ userId: string }>,
  opts?: { isSpace?: boolean },
) {
  return {
    roomId,
    getJoinedMembers: () => members,
    currentState: {
      getStateEvents: (type: string, _stateKey?: string) => {
        if (type === "m.room.create") {
          return {
            getContent: () => (opts?.isSpace ? { type: "m.space" } : {}),
          };
        }
        return null;
      },
    },
  };
}

/** Minimal mock for a Matrix client */
function mockClient(
  myUserId: string,
  mDirect: Record<string, string[]> | null,
  rooms: ReturnType<typeof mockRoom>[],
) {
  return {
    getUserId: () => myUserId,
    getAccountData: (type: string) => {
      if (type === "m.direct" && mDirect) {
        return { getContent: () => mDirect };
      }
      return undefined;
    },
    getRooms: () => rooms,
  };
}

describe("DMTracker", () => {
  let tracker: DMTracker;

  beforeEach(() => {
    tracker = new DMTracker();
  });

  describe("given m.direct account data", () => {
    it("should identify DM rooms", () => {
      // Given
      const client = mockClient(
        "@alice:example.com",
        {
          "@bob:example.com": ["!dm1:example.com"],
          "@carol:example.com": ["!dm2:example.com", "!dm3:example.com"],
        },
        [],
      );

      // When

      tracker.loadFromClient(client as any);

      // Then
      expect(tracker.isDM("!dm1:example.com")).toBe(true);
      expect(tracker.isDM("!dm2:example.com")).toBe(true);
      expect(tracker.isDM("!dm3:example.com")).toBe(true);
      expect(tracker.isDM("!other:example.com")).toBe(false);
    });

    it("should return the target user for a DM", () => {
      // Given
      const client = mockClient(
        "@alice:example.com",
        {
          "@bob:example.com": ["!dm1:example.com"],
        },
        [],
      );

      // When

      tracker.loadFromClient(client as any);

      // Then
      expect(tracker.getDMTarget("!dm1:example.com")).toBe("@bob:example.com");
      expect(tracker.getDMTarget("!nonexistent:example.com")).toBeNull();
    });
  });

  describe("given a room with 2 members", () => {
    it("should detect it as a likely DM", () => {
      // Given — a room with exactly 2 members, no m.direct data
      const room = mockRoom("!twopeople:example.com", [
        mockMember("@alice:example.com"),
        mockMember("@bob:example.com"),
      ]);
      const client = mockClient("@alice:example.com", null, [room]);

      // When

      tracker.loadFromClient(client as any);

      // Then
      expect(tracker.isDM("!twopeople:example.com")).toBe(true);
      expect(tracker.getDMTarget("!twopeople:example.com")).toBe("@bob:example.com");
    });

    it("should not detect a space with 2 members as a DM", () => {
      // Given — a space room with 2 members
      const room = mockRoom(
        "!space:example.com",
        [mockMember("@alice:example.com"), mockMember("@bob:example.com")],
        { isSpace: true },
      );
      const client = mockClient("@alice:example.com", null, [room]);

      // When

      tracker.loadFromClient(client as any);

      // Then
      expect(tracker.isDM("!space:example.com")).toBe(false);
    });

    it("should not detect a room with more than 2 members as a DM", () => {
      // Given
      const room = mockRoom("!group:example.com", [
        mockMember("@alice:example.com"),
        mockMember("@bob:example.com"),
        mockMember("@carol:example.com"),
      ]);
      const client = mockClient("@alice:example.com", null, [room]);

      // When

      tracker.loadFromClient(client as any);

      // Then
      expect(tracker.isDM("!group:example.com")).toBe(false);
    });
  });

  describe("getAllDMs", () => {
    it("should return all DM rooms with target users", () => {
      // Given — mix of m.direct and 2-member room detection
      const room = mockRoom("!detected:example.com", [
        mockMember("@alice:example.com"),
        mockMember("@dave:example.com"),
      ]);
      const client = mockClient(
        "@alice:example.com",
        {
          "@bob:example.com": ["!dm1:example.com"],
          "@carol:example.com": ["!dm2:example.com"],
        },
        [room],
      );

      // When

      tracker.loadFromClient(client as any);

      // Then
      const allDMs = tracker.getAllDMs();
      expect(allDMs).toHaveLength(3);

      const byRoomId = new Map(allDMs.map((dm) => [dm.roomId, dm.targetUserId]));
      expect(byRoomId.get("!dm1:example.com")).toBe("@bob:example.com");
      expect(byRoomId.get("!dm2:example.com")).toBe("@carol:example.com");
      expect(byRoomId.get("!detected:example.com")).toBe("@dave:example.com");
    });
  });

  describe("multi-party DM detection", () => {
    describe("given a room tagged as DM in m.direct with more than 2 members", () => {
      it("should still be identified as a DM", () => {
        // Given — m.direct tags the room as a DM even though it has 3+ members
        const client = mockClient(
          "@alice:example.com",
          {
            "@bob:example.com": ["!group-dm:example.com"],
          },
          [],
        );

        // When

        tracker.loadFromClient(client as any);

        // Then — it's a DM because m.direct says so
        expect(tracker.isDM("!group-dm:example.com")).toBe(true);
        expect(tracker.getDMTarget("!group-dm:example.com")).toBe("@bob:example.com");
      });
    });

    describe("given a room with 3 members that is NOT in m.direct", () => {
      it("should not be detected as a DM", () => {
        // Given — 3-member room without m.direct tag
        const room = mockRoom("!group:example.com", [
          mockMember("@alice:example.com"),
          mockMember("@bob:example.com"),
          mockMember("@carol:example.com"),
        ]);
        const client = mockClient("@alice:example.com", null, [room]);

        // When

        tracker.loadFromClient(client as any);

        // Then
        expect(tracker.isDM("!group:example.com")).toBe(false);
      });
    });

    describe("given a multi-party DM room in m.direct", () => {
      it("should allow detecting member count for multi-party DM display", () => {
        // The DM tracker identifies the room as DM.
        // The ChatView can then check member count > 2 for multi-party display.
        const client = mockClient(
          "@alice:example.com",
          {
            "@bob:example.com": ["!mpd:example.com"],
          },
          [],
        );

        tracker.loadFromClient(client as any);

        // The tracker says it's a DM
        expect(tracker.isDM("!mpd:example.com")).toBe(true);

        // The component would then check room.getJoinedMemberCount() > 2
        // to decide if it's a multi-party DM. We verify the tracker part here.
        expect(tracker.getDMTarget("!mpd:example.com")).toBe("@bob:example.com");
      });
    });
  });

  describe("subscribe / notify", () => {
    it("should notify listeners when DM state changes", () => {
      // Given
      const listener = vi.fn();
      tracker.subscribe(listener);

      const client = mockClient(
        "@alice:example.com",
        { "@bob:example.com": ["!dm1:example.com"] },
        [],
      );

      // When

      tracker.loadFromClient(client as any);

      // Then
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should not notify when reloading identical data", () => {
      // Given
      const client = mockClient(
        "@alice:example.com",
        { "@bob:example.com": ["!dm1:example.com"] },
        [],
      );

      tracker.loadFromClient(client as any);

      const listener = vi.fn();
      tracker.subscribe(listener);

      // When — reload with same data

      tracker.loadFromClient(client as any);

      // Then
      expect(listener).not.toHaveBeenCalled();
    });

    it("should allow unsubscription", () => {
      // Given
      const listener = vi.fn();
      const unsub = tracker.subscribe(listener);
      unsub();

      const client = mockClient(
        "@alice:example.com",
        { "@bob:example.com": ["!dm1:example.com"] },
        [],
      );

      // When

      tracker.loadFromClient(client as any);

      // Then
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
