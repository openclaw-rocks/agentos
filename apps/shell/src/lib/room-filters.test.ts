import { describe, it, expect, beforeEach } from "vitest";
import { DMTracker } from "./dm-tracker";
import {
  filterRooms,
  isOrphanedRoom,
  calculateMidpointOrder,
  getAdjacentRoomId,
  getFavouriteOrder,
  type RoomFilter,
} from "./room-filters";
import { UnreadTracker } from "./unread-tracker";

/* -------------------------------------------------------------------------- */
/*  Minimal mocks                                                             */
/* -------------------------------------------------------------------------- */

function mockMember(userId: string) {
  return { userId };
}

function mockRoom(
  roomId: string,
  opts?: {
    isSpace?: boolean;
    isFavourite?: boolean;
    favouriteOrder?: number;
    memberCount?: number;
    members?: Array<{ userId: string }>;
    parentSpaceIds?: string[];
    spaceChildIds?: string[];
  },
) {
  const memberList = opts?.members ?? [mockMember("@alice:example.com")];
  const tags: Record<string, Record<string, unknown>> = {};
  if (opts?.isFavourite) {
    tags["m.favourite"] = { order: opts.favouriteOrder ?? 0.5 };
  }

  // Build m.space.parent mock events
  const parentEvents = (opts?.parentSpaceIds ?? []).map((spaceId) => ({
    getStateKey: () => spaceId,
    getContent: () => ({ via: ["example.com"] }),
  }));

  // Build m.space.child mock events
  const spaceChildEvents = (opts?.spaceChildIds ?? []).map((childId) => ({
    getStateKey: () => childId,
    getContent: () => ({ via: ["example.com"] }),
  }));

  return {
    roomId,
    name: roomId,
    tags,
    getJoinedMembers: () => memberList,
    getJoinedMemberCount: () => opts?.memberCount ?? memberList.length,
    getUnreadNotificationCount: () => 0,
    getLiveTimeline: () => ({ getEvents: () => [] }),
    getReadReceiptForUserId: () => null,
    currentState: {
      getStateEvents: (type: string, _stateKey?: string) => {
        if (type === "m.room.create") {
          return {
            getContent: () => (opts?.isSpace ? { type: "m.space" } : {}),
          };
        }
        if (type === "m.space.parent") {
          return parentEvents;
        }
        if (type === "m.space.child") {
          return spaceChildEvents;
        }
        return null;
      },
    },
  };
}

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
    getRoom: (id: string) => rooms.find((r) => r.roomId === id) ?? null,
    sendReadReceipt: () => Promise.resolve(undefined),
  };
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

describe("Room Filters", () => {
  let unreadTracker: UnreadTracker;
  let dmTracker: DMTracker;

  beforeEach(() => {
    unreadTracker = new UnreadTracker();
    dmTracker = new DMTracker();
  });

  describe("filterRooms", () => {
    describe("given filter is 'all'", () => {
      it("should return all rooms unchanged", () => {
        // Given
        const rooms = [
          mockRoom("!room1:example.com"),
          mockRoom("!room2:example.com"),
          mockRoom("!room3:example.com"),
        ];

        // When

        const result = filterRooms(rooms as any, "all", unreadTracker, dmTracker);

        // Then
        expect(result).toHaveLength(3);
      });
    });

    describe("given filter is 'unreads'", () => {
      it("should return only rooms with unread messages", () => {
        // Given
        const roomWithUnread = mockRoom("!unread:example.com");

        (roomWithUnread as any).getUnreadNotificationCount = (type: string) =>
          type === "total" ? 5 : 0;
        const roomNoUnread = mockRoom("!read:example.com");

        const client = mockClient("@alice:example.com", null, [roomWithUnread, roomNoUnread]);

        unreadTracker.setClient(client as any);
        unreadTracker.refreshCounts();

        // When

        const result = filterRooms(
          [roomWithUnread, roomNoUnread] as any,
          "unreads",
          unreadTracker,
          dmTracker,
        );

        // Then
        expect(result).toHaveLength(1);
        expect(result[0].roomId).toBe("!unread:example.com");
      });

      it("should return empty array when no rooms have unreads", () => {
        // Given
        const room1 = mockRoom("!room1:example.com");
        const room2 = mockRoom("!room2:example.com");
        const client = mockClient("@alice:example.com", null, [room1, room2]);

        unreadTracker.setClient(client as any);
        unreadTracker.refreshCounts();

        // When

        const result = filterRooms([room1, room2] as any, "unreads", unreadTracker, dmTracker);

        // Then
        expect(result).toHaveLength(0);
      });
    });

    describe("given filter is 'favourites'", () => {
      it("should return only rooms with m.favourite tag", () => {
        // Given
        const favRoom = mockRoom("!fav:example.com", { isFavourite: true });
        const normalRoom = mockRoom("!normal:example.com");

        // When

        const result = filterRooms(
          [favRoom, normalRoom] as any,
          "favourites",
          unreadTracker,
          dmTracker,
        );

        // Then
        expect(result).toHaveLength(1);
        expect(result[0].roomId).toBe("!fav:example.com");
      });

      it("should return empty array when no rooms are favourited", () => {
        // Given
        const room1 = mockRoom("!room1:example.com");
        const room2 = mockRoom("!room2:example.com");

        // When

        const result = filterRooms([room1, room2] as any, "favourites", unreadTracker, dmTracker);

        // Then
        expect(result).toHaveLength(0);
      });
    });

    describe("given filter is 'people'", () => {
      it("should return only DM rooms", () => {
        // Given
        const dmRoom = mockRoom("!dm:example.com", {
          members: [mockMember("@alice:example.com"), mockMember("@bob:example.com")],
        });
        const groupRoom = mockRoom("!group:example.com", {
          members: [
            mockMember("@alice:example.com"),
            mockMember("@bob:example.com"),
            mockMember("@carol:example.com"),
          ],
        });

        const client = mockClient(
          "@alice:example.com",
          { "@bob:example.com": ["!dm:example.com"] },
          [dmRoom, groupRoom],
        );

        dmTracker.loadFromClient(client as any);

        // When

        const result = filterRooms([dmRoom, groupRoom] as any, "people", unreadTracker, dmTracker);

        // Then
        expect(result).toHaveLength(1);
        expect(result[0].roomId).toBe("!dm:example.com");
      });

      it("should also detect 2-member rooms as DMs", () => {
        // Given -- no m.direct data, but a 2-member room
        const twoMemberRoom = mockRoom("!2member:example.com", {
          members: [mockMember("@alice:example.com"), mockMember("@bob:example.com")],
        });
        const groupRoom = mockRoom("!group:example.com", {
          members: [
            mockMember("@alice:example.com"),
            mockMember("@bob:example.com"),
            mockMember("@carol:example.com"),
          ],
        });

        const client = mockClient("@alice:example.com", null, [twoMemberRoom, groupRoom]);

        dmTracker.loadFromClient(client as any);

        // When

        const result = filterRooms(
          [twoMemberRoom, groupRoom] as any,
          "people",
          unreadTracker,
          dmTracker,
        );

        // Then
        expect(result).toHaveLength(1);
        expect(result[0].roomId).toBe("!2member:example.com");
      });
    });

    describe("given filter is 'rooms'", () => {
      it("should return only group rooms", () => {
        // Given
        const dmRoom = mockRoom("!dm:example.com", {
          members: [mockMember("@alice:example.com"), mockMember("@bob:example.com")],
        });
        const groupRoom = mockRoom("!group:example.com", {
          members: [
            mockMember("@alice:example.com"),
            mockMember("@bob:example.com"),
            mockMember("@carol:example.com"),
          ],
        });
        const spaceRoom = mockRoom("!space:example.com", { isSpace: true });

        const client = mockClient(
          "@alice:example.com",
          { "@bob:example.com": ["!dm:example.com"] },
          [dmRoom, groupRoom, spaceRoom],
        );

        dmTracker.loadFromClient(client as any);

        // When
        const result = filterRooms(
          [dmRoom, groupRoom, spaceRoom] as any,
          "rooms",
          unreadTracker,
          dmTracker,
        );

        // Then
        expect(result).toHaveLength(1);
        expect(result[0].roomId).toBe("!group:example.com");
      });

      it("should exclude spaces from the result", () => {
        // Given
        const spaceRoom = mockRoom("!space:example.com", { isSpace: true });
        const normalRoom = mockRoom("!normal:example.com");

        const client = mockClient("@alice:example.com", null, [spaceRoom, normalRoom]);

        dmTracker.loadFromClient(client as any);

        // When

        const result = filterRooms(
          [spaceRoom, normalRoom] as any,
          "rooms",
          unreadTracker,
          dmTracker,
        );

        // Then
        expect(result).toHaveLength(1);
        expect(result[0].roomId).toBe("!normal:example.com");
      });
    });

    describe("given an unknown filter value", () => {
      it("should return all rooms as a fallback", () => {
        // Given
        const rooms = [mockRoom("!room1:example.com"), mockRoom("!room2:example.com")];

        // When

        const result = filterRooms(rooms as any, "unknown" as RoomFilter, unreadTracker, dmTracker);

        // Then
        expect(result).toHaveLength(2);
      });
    });
  });

  /* ======================================================================== */
  /*  Feature 19.15: Orphaned room detection                                  */
  /* ======================================================================== */

  describe("isOrphanedRoom", () => {
    describe("given a room that is not in any space", () => {
      it("should return true for a regular room with no parent and not a space child", () => {
        // Given
        const room = mockRoom("!orphan:example.com");
        const spaceChildIds = new Set<string>();

        // When

        const result = isOrphanedRoom(room as any, spaceChildIds);

        // Then
        expect(result).toBe(true);
      });
    });

    describe("given a room that is a space itself", () => {
      it("should return false because spaces are not considered orphaned", () => {
        // Given
        const spaceRoom = mockRoom("!space:example.com", { isSpace: true });
        const spaceChildIds = new Set<string>();

        // When

        const result = isOrphanedRoom(spaceRoom as any, spaceChildIds);

        // Then
        expect(result).toBe(false);
      });
    });

    describe("given a room that has a m.space.parent state event", () => {
      it("should return false because the room belongs to a space", () => {
        // Given
        const room = mockRoom("!child:example.com", {
          parentSpaceIds: ["!space:example.com"],
        });
        const spaceChildIds = new Set<string>();

        // When

        const result = isOrphanedRoom(room as any, spaceChildIds);

        // Then
        expect(result).toBe(false);
      });
    });

    describe("given a room listed as a child of a space via spaceChildIds", () => {
      it("should return false even if it has no m.space.parent event", () => {
        // Given
        const room = mockRoom("!child:example.com");
        const spaceChildIds = new Set<string>(["!child:example.com"]);

        // When

        const result = isOrphanedRoom(room as any, spaceChildIds);

        // Then
        expect(result).toBe(false);
      });
    });

    describe("given a room NOT in the spaceChildIds set and no parent events", () => {
      it("should return true", () => {
        // Given
        const room = mockRoom("!lonely:example.com");
        const spaceChildIds = new Set<string>(["!other-child:example.com"]);

        // When

        const result = isOrphanedRoom(room as any, spaceChildIds);

        // Then
        expect(result).toBe(true);
      });
    });
  });

  describe("filterRooms with 'orphaned' filter", () => {
    describe("given a mix of orphaned and space-child rooms with spaceChildIds", () => {
      it("should return only rooms not in any space", () => {
        // Given
        const orphanRoom = mockRoom("!orphan:example.com");
        const spaceChildRoom = mockRoom("!child:example.com");
        const spaceRoom = mockRoom("!space:example.com", { isSpace: true });
        const spaceChildIds = new Set<string>(["!child:example.com"]);

        // When
        const result = filterRooms(
          [orphanRoom, spaceChildRoom, spaceRoom] as any,
          "orphaned",
          unreadTracker,
          dmTracker,
          spaceChildIds,
        );

        // Then
        expect(result).toHaveLength(1);
        expect(result[0].roomId).toBe("!orphan:example.com");
      });
    });

    describe("given rooms with m.space.parent state events", () => {
      it("should exclude rooms that have parent space events", () => {
        // Given
        const parentedRoom = mockRoom("!parented:example.com", {
          parentSpaceIds: ["!space:example.com"],
        });
        const orphanRoom = mockRoom("!orphan:example.com");

        // When
        const result = filterRooms(
          [parentedRoom, orphanRoom] as any,
          "orphaned",
          unreadTracker,
          dmTracker,
          new Set<string>(),
        );

        // Then
        expect(result).toHaveLength(1);
        expect(result[0].roomId).toBe("!orphan:example.com");
      });
    });
  });

  /* ======================================================================== */
  /*  Feature 31.5: Drag-to-reorder midpoint calculation                      */
  /* ======================================================================== */

  describe("calculateMidpointOrder", () => {
    describe("given both before and after neighbors exist", () => {
      it("should return the midpoint of their orders", () => {
        // Given
        const before = 0.25;
        const after = 0.75;

        // When
        const result = calculateMidpointOrder(before, after);

        // Then
        expect(result).toBe(0.5);
      });

      it("should handle asymmetric order values", () => {
        // Given
        const before = 0.1;
        const after = 0.3;

        // When
        const result = calculateMidpointOrder(before, after);

        // Then
        expect(result).toBeCloseTo(0.2, 10);
      });

      it("should handle very close order values", () => {
        // Given
        const before = 0.5;
        const after = 0.501;

        // When
        const result = calculateMidpointOrder(before, after);

        // Then
        expect(result).toBeCloseTo(0.5005, 10);
      });
    });

    describe("given only the before neighbor exists (dropping at end)", () => {
      it("should return before + 1", () => {
        // Given
        const before = 0.75;

        // When
        const result = calculateMidpointOrder(before, undefined);

        // Then
        expect(result).toBe(1.75);
      });
    });

    describe("given only the after neighbor exists (dropping at start)", () => {
      it("should return after / 2", () => {
        // Given
        const after = 0.5;

        // When
        const result = calculateMidpointOrder(undefined, after);

        // Then
        expect(result).toBe(0.25);
      });
    });

    describe("given neither neighbor exists (single item)", () => {
      it("should return 0.5 as default order", () => {
        // When
        const result = calculateMidpointOrder(undefined, undefined);

        // Then
        expect(result).toBe(0.5);
      });
    });
  });

  describe("getFavouriteOrder", () => {
    describe("given a room with m.favourite tag and an order", () => {
      it("should return the order number", () => {
        // Given
        const room = mockRoom("!fav:example.com", { isFavourite: true, favouriteOrder: 0.3 });

        // When

        const result = getFavouriteOrder(room as any);

        // Then
        expect(result).toBe(0.3);
      });
    });

    describe("given a room without m.favourite tag", () => {
      it("should return undefined", () => {
        // Given
        const room = mockRoom("!normal:example.com");

        // When

        const result = getFavouriteOrder(room as any);

        // Then
        expect(result).toBeUndefined();
      });
    });
  });

  /* ======================================================================== */
  /*  Feature 26.28: Visible room list navigation                             */
  /* ======================================================================== */

  describe("getAdjacentRoomId", () => {
    describe("given an empty visible room list", () => {
      it("should return null", () => {
        // When
        const result = getAdjacentRoomId([], "!room:example.com", "up");

        // Then
        expect(result).toBeNull();
      });
    });

    describe("given no room is currently selected", () => {
      it("should return the first room in the list", () => {
        // Given
        const visibleRoomIds = ["!room1:ex.com", "!room2:ex.com", "!room3:ex.com"];

        // When
        const result = getAdjacentRoomId(visibleRoomIds, null, "down");

        // Then
        expect(result).toBe("!room1:ex.com");
      });

      it("should return the first room even for 'up' direction", () => {
        // Given
        const visibleRoomIds = ["!room1:ex.com", "!room2:ex.com"];

        // When
        const result = getAdjacentRoomId(visibleRoomIds, null, "up");

        // Then
        expect(result).toBe("!room1:ex.com");
      });
    });

    describe("given the current room is not in the visible list", () => {
      it("should return the first room", () => {
        // Given
        const visibleRoomIds = ["!room1:ex.com", "!room2:ex.com"];

        // When
        const result = getAdjacentRoomId(visibleRoomIds, "!unknown:ex.com", "down");

        // Then
        expect(result).toBe("!room1:ex.com");
      });
    });

    describe("given the current room is in the middle of the list", () => {
      describe("when navigating down", () => {
        it("should return the next room", () => {
          // Given
          const visibleRoomIds = ["!room1:ex.com", "!room2:ex.com", "!room3:ex.com"];

          // When
          const result = getAdjacentRoomId(visibleRoomIds, "!room2:ex.com", "down");

          // Then
          expect(result).toBe("!room3:ex.com");
        });
      });

      describe("when navigating up", () => {
        it("should return the previous room", () => {
          // Given
          const visibleRoomIds = ["!room1:ex.com", "!room2:ex.com", "!room3:ex.com"];

          // When
          const result = getAdjacentRoomId(visibleRoomIds, "!room2:ex.com", "up");

          // Then
          expect(result).toBe("!room1:ex.com");
        });
      });
    });

    describe("given the current room is at the start of the list", () => {
      describe("when navigating up", () => {
        it("should stay at the first room (clamp)", () => {
          // Given
          const visibleRoomIds = ["!room1:ex.com", "!room2:ex.com", "!room3:ex.com"];

          // When
          const result = getAdjacentRoomId(visibleRoomIds, "!room1:ex.com", "up");

          // Then
          expect(result).toBe("!room1:ex.com");
        });
      });
    });

    describe("given the current room is at the end of the list", () => {
      describe("when navigating down", () => {
        it("should stay at the last room (clamp)", () => {
          // Given
          const visibleRoomIds = ["!room1:ex.com", "!room2:ex.com", "!room3:ex.com"];

          // When
          const result = getAdjacentRoomId(visibleRoomIds, "!room3:ex.com", "down");

          // Then
          expect(result).toBe("!room3:ex.com");
        });
      });
    });

    describe("given a single-element list", () => {
      it("should return that element for both directions", () => {
        // Given
        const visibleRoomIds = ["!only:ex.com"];

        // When / Then
        expect(getAdjacentRoomId(visibleRoomIds, "!only:ex.com", "up")).toBe("!only:ex.com");
        expect(getAdjacentRoomId(visibleRoomIds, "!only:ex.com", "down")).toBe("!only:ex.com");
      });
    });
  });
});
