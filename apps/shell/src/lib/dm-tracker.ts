import type * as sdk from "matrix-js-sdk";

export interface DMInfo {
  roomId: string;
  targetUserId: string;
}

type Listener = () => void;

/**
 * Tracks Direct Message rooms by reading the user's `m.direct` account data
 * and detecting rooms with exactly 2 joined members as likely DMs.
 */
export class DMTracker {
  /** room_id -> target user ID (the other person in the DM) */
  private dmRooms = new Map<string, string>();

  private version = 0;
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  private notify(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  /** Check whether a room is a DM */
  isDM(roomId: string): boolean {
    return this.dmRooms.has(roomId);
  }

  /** Get the other user's ID for a DM room, or null if not a DM */
  getDMTarget(roomId: string): string | null {
    return this.dmRooms.get(roomId) ?? null;
  }

  /** Get all known DM rooms with their target users */
  getAllDMs(): DMInfo[] {
    const result: DMInfo[] = [];
    for (const [roomId, targetUserId] of this.dmRooms) {
      result.push({ roomId, targetUserId });
    }
    return result;
  }

  /**
   * Load DM information from the Matrix client.
   * Reads `m.direct` account data and also detects 2-member rooms.
   */
  loadFromClient(client: sdk.MatrixClient): void {
    const myUserId = client.getUserId();
    if (!myUserId) return;

    let changed = false;
    const newDmRooms = new Map<string, string>();

    // 1. Read m.direct account data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mDirectEvent = client.getAccountData("m.direct" as any);
    if (mDirectEvent) {
      const content = mDirectEvent.getContent() as Record<string, string[]>;
      for (const [userId, roomIds] of Object.entries(content)) {
        if (!Array.isArray(roomIds)) continue;
        for (const roomId of roomIds) {
          if (typeof roomId === "string") {
            newDmRooms.set(roomId, userId);
          }
        }
      }
    }

    // 2. Also detect rooms with exactly 2 joined members as likely DMs
    const allRooms = client.getRooms();
    for (const room of allRooms) {
      if (newDmRooms.has(room.roomId)) continue;

      const joinedMembers = room.getJoinedMembers();
      if (joinedMembers.length === 2) {
        // Check it's not a Space
        const createEvent = room.currentState.getStateEvents("m.room.create", "");
        if (createEvent?.getContent()?.type === "m.space") continue;

        const other = joinedMembers.find((m) => m.userId !== myUserId);
        if (other) {
          newDmRooms.set(room.roomId, other.userId);
        }
      }
    }

    // Diff against existing state
    if (newDmRooms.size !== this.dmRooms.size) {
      changed = true;
    } else {
      for (const [roomId, target] of newDmRooms) {
        if (this.dmRooms.get(roomId) !== target) {
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      this.dmRooms = newDmRooms;
      this.notify();
    }
  }
}
