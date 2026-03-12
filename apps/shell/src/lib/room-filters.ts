import type * as sdk from "matrix-js-sdk";
import type { DMTracker } from "./dm-tracker";
import type { UnreadTracker } from "./unread-tracker";

export type RoomFilter = "all" | "unreads" | "people" | "rooms" | "favourites" | "orphaned";

/**
 * Build a set of room IDs that are known children of any space.
 * Used by the orphaned filter to accurately detect rooms outside all spaces.
 */
export function buildSpaceChildSet(client: sdk.MatrixClient): Set<string> {
  const childRoomIds = new Set<string>();
  for (const room of client.getRooms()) {
    const createEvent = room.currentState.getStateEvents("m.room.create", "");
    if (createEvent?.getContent()?.type === "m.space") {
      const spaceChildren = room.currentState.getStateEvents("m.space.child");
      if (spaceChildren) {
        for (const child of spaceChildren) {
          const stateKey = child.getStateKey();
          const content = child.getContent();
          if (stateKey && content && Object.keys(content).length > 0) {
            childRoomIds.add(stateKey);
          }
        }
      }
    }
  }
  return childRoomIds;
}

/**
 * Check whether a room is orphaned (not in any space).
 *
 * A room is orphaned if:
 * 1. It is not a space itself.
 * 2. It has no non-empty m.space.parent state event.
 * 3. It is not listed as a child of any known space (via spaceChildIds set).
 */
export function isOrphanedRoom(room: sdk.Room, spaceChildIds: Set<string>): boolean {
  // Exclude spaces
  const createEvent = room.currentState.getStateEvents("m.room.create", "");
  if (createEvent?.getContent()?.type === "m.space") return false;

  // Exclude rooms that are children of a space
  if (spaceChildIds.has(room.roomId)) return false;

  // Exclude rooms with a parent space
  const parentEvents = room.currentState.getStateEvents("m.space.parent");
  if (parentEvents && parentEvents.length > 0) {
    for (const ev of parentEvents) {
      const content = ev.getContent();
      if (content && Object.keys(content).length > 0) return false;
    }
  }

  return true;
}

/**
 * Filters an array of Matrix rooms according to the specified filter type.
 *
 * - `all`: Returns all rooms unchanged.
 * - `unreads`: Returns only rooms that have unread messages (total > 0).
 * - `people`: Returns only DM rooms (1:1 or m.direct-tagged).
 * - `rooms`: Returns only group rooms (not DMs, not Spaces).
 * - `favourites`: Returns only rooms tagged with `m.favourite`.
 * - `orphaned`: Returns only rooms not belonging to any space and not spaces themselves.
 *
 * When `spaceChildIds` is provided it is used for a more accurate orphan check.
 */
export function filterRooms(
  rooms: sdk.Room[],
  filter: RoomFilter,
  unreadTracker: UnreadTracker,
  dmTracker: DMTracker,
  spaceChildIds?: Set<string>,
): sdk.Room[] {
  switch (filter) {
    case "all":
      return rooms;

    case "unreads":
      return rooms.filter((room) => {
        const counts = unreadTracker.getUnreadCount(room.roomId);
        return counts.total > 0;
      });

    case "people":
      return rooms.filter((room) => dmTracker.isDM(room.roomId));

    case "rooms":
      return rooms.filter((room) => {
        // Exclude DMs
        if (dmTracker.isDM(room.roomId)) return false;

        // Exclude Spaces
        const createEvent = room.currentState.getStateEvents("m.room.create", "");
        if (createEvent?.getContent()?.type === "m.space") return false;

        return true;
      });

    case "favourites":
      return rooms.filter((room) => {
        const tags = room.tags;
        return tags != null && "m.favourite" in tags;
      });

    case "orphaned": {
      const childIds = spaceChildIds ?? new Set<string>();
      return rooms.filter((room) => isOrphanedRoom(room, childIds));
    }

    default:
      return rooms;
  }
}

/**
 * Check whether a room is tagged as a favourite.
 */
export function isFavourite(room: sdk.Room): boolean {
  const tags = room.tags;
  return tags != null && "m.favourite" in tags;
}

/**
 * Toggle the m.favourite tag on a room.
 * - If already favourited, removes the tag.
 * - If not, adds it with order 0.5.
 */
export async function toggleFavourite(client: sdk.MatrixClient, roomId: string): Promise<void> {
  const room = client.getRoom(roomId);
  if (!room) return;

  if (isFavourite(room)) {
    await client.deleteRoomTag(roomId, "m.favourite");
  } else {
    await client.setRoomTag(roomId, "m.favourite", { order: 0.5 });
  }
}

/**
 * Returns all rooms that are not in any space and are not spaces themselves.
 *
 * A room is considered "orphaned" if:
 * 1. It is not a space (no `m.space` type in `m.room.create`).
 * 2. It has no non-empty `m.space.parent` state event.
 * 3. It is not listed as a child of any known space via `m.space.child`.
 */
export function getRoomsNotInAnySpace(client: sdk.MatrixClient): sdk.Room[] {
  const allRooms = client.getRooms();

  // Build a set of all room IDs that are children of any space
  const childRoomIds = new Set<string>();
  const spaceIds = new Set<string>();

  for (const room of allRooms) {
    const createEvent = room.currentState.getStateEvents("m.room.create", "");
    if (createEvent?.getContent()?.type === "m.space") {
      spaceIds.add(room.roomId);
      const spaceChildren = room.currentState.getStateEvents("m.space.child");
      if (spaceChildren) {
        for (const child of spaceChildren) {
          const stateKey = child.getStateKey();
          const content = child.getContent();
          if (stateKey && content && Object.keys(content).length > 0) {
            childRoomIds.add(stateKey);
          }
        }
      }
    }
  }

  return allRooms.filter((room) => {
    // Exclude spaces themselves
    if (spaceIds.has(room.roomId)) return false;

    // Exclude rooms that are children of a space
    if (childRoomIds.has(room.roomId)) return false;

    // Also check m.space.parent state events on the room itself
    const parentEvents = room.currentState.getStateEvents("m.space.parent");
    if (parentEvents && parentEvents.length > 0) {
      for (const ev of parentEvents) {
        const content = ev.getContent();
        if (content && Object.keys(content).length > 0) return false;
      }
    }

    return true;
  });
}

/* -------------------------------------------------------------------------- */
/*  Drag-to-reorder favourites                                                */
/* -------------------------------------------------------------------------- */

/**
 * Calculate a new order value for an item dropped between two neighbors.
 *
 * Used by drag-to-reorder favourites to compute the `order` field for the
 * `m.favourite` room tag.
 *
 * - If both neighbors exist, returns the midpoint of their orders.
 * - If only `before` exists (dropping at end), returns `before + 1`.
 * - If only `after` exists (dropping at start), returns `after / 2`.
 * - If neither exists (single item), returns `0.5`.
 */
export function calculateMidpointOrder(
  before: number | undefined,
  after: number | undefined,
): number {
  if (before !== undefined && after !== undefined) {
    return (before + after) / 2;
  }
  if (before !== undefined) {
    return before + 1;
  }
  if (after !== undefined) {
    return after / 2;
  }
  return 0.5;
}

/**
 * Get the tag order value for m.favourite on a room, or undefined if not set.
 */
export function getFavouriteOrder(room: sdk.Room): number | undefined {
  const tags = room.tags;
  if (tags == null || !("m.favourite" in tags)) return undefined;
  const order = tags["m.favourite"]?.order;
  return typeof order === "number" ? order : undefined;
}

/* -------------------------------------------------------------------------- */
/*  Visible room list navigation                                              */
/* -------------------------------------------------------------------------- */

/**
 * Given a list of visible room IDs, a current room ID, and a direction,
 * return the room ID to navigate to.
 *
 * - `up`: previous room in list (or first if none selected / at top).
 * - `down`: next room in list (or first if none selected / at bottom).
 *
 * Returns `null` if the list is empty.
 */
export function getAdjacentRoomId(
  visibleRoomIds: readonly string[],
  currentRoomId: string | null,
  direction: "up" | "down",
): string | null {
  if (visibleRoomIds.length === 0) return null;

  if (currentRoomId === null) {
    return visibleRoomIds[0];
  }

  const currentIndex = visibleRoomIds.indexOf(currentRoomId);
  if (currentIndex === -1) {
    return visibleRoomIds[0];
  }

  if (direction === "up") {
    return visibleRoomIds[Math.max(0, currentIndex - 1)];
  }
  return visibleRoomIds[Math.min(visibleRoomIds.length - 1, currentIndex + 1)];
}
