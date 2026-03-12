import type { MatrixClient, Room } from "matrix-js-sdk";

/**
 * All known Matrix room versions that can be used as upgrade targets.
 */
export function getAvailableRoomVersions(): string[] {
  return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
}

/**
 * Read the current room version from the room's `m.room.create` state event.
 * Returns "1" if no version field is present (Matrix spec default).
 */
export function getCurrentRoomVersion(room: Room): string {
  const createEvent = room.currentState.getStateEvents("m.room.create", "");
  const version = createEvent?.getContent()?.room_version as string | undefined;
  return version ?? "1";
}

/**
 * Upgrade a room to a new version by calling `client.upgradeRoom`.
 * This creates a new room with the specified version and tombstones the old one.
 * Returns the new room ID.
 */
export async function upgradeRoom(
  client: MatrixClient,
  roomId: string,
  newVersion: string,
): Promise<string> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const result = await (client as any).upgradeRoom(roomId, { version: newVersion });
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return result.replacement_room as string;
}
