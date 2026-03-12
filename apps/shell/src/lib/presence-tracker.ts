import { UserEvent } from "matrix-js-sdk";
import type { MatrixClient, MatrixEvent, User } from "matrix-js-sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PresenceStatus = "online" | "unavailable" | "offline";

export interface PresenceInfo {
  status: PresenceStatus;
  lastActiveAgo?: number;
  statusMsg?: string;
  currentlyActive?: boolean;
}

type Listener = () => void;

const DEFAULT_PRESENCE: PresenceInfo = { status: "offline" };

// ---------------------------------------------------------------------------
// PresenceTracker
// ---------------------------------------------------------------------------

/**
 * Listens for `User.presence` events from the Matrix SDK and caches
 * presence info per userId.  Observable via subscribe / getVersion for
 * use with React's `useSyncExternalStore`.
 */
export class PresenceTracker {
  private cache = new Map<string, PresenceInfo>();
  private version = 0;
  private listeners = new Set<Listener>();
  private client: MatrixClient | null = null;
  private boundHandler: ((event: MatrixEvent | undefined, user: User) => void) | null = null;

  // ---- subscribe / getVersion (useSyncExternalStore) ----------------------

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  private notify(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  // ---- Lifecycle ----------------------------------------------------------

  /** Start listening for presence events on the given Matrix client. */
  startTracking(client: MatrixClient): void {
    this.stopTracking();
    this.client = client;

    this.boundHandler = (_event: MatrixEvent | undefined, user: User) => {
      this.handlePresenceEvent(user);
    };

    client.on(UserEvent.Presence, this.boundHandler);
  }

  /** Stop listening and release the client reference. */
  stopTracking(): void {
    if (this.client && this.boundHandler) {
      this.client.removeListener(UserEvent.Presence, this.boundHandler);
    }
    this.boundHandler = null;
    this.client = null;
  }

  // ---- Query --------------------------------------------------------------

  /** Return cached presence for `userId`, defaulting to offline. */
  getPresence = (userId: string): PresenceInfo => {
    return this.cache.get(userId) ?? DEFAULT_PRESENCE;
  };

  // ---- Mutate own presence ------------------------------------------------

  /** Set the current user's presence on the homeserver. */
  async setMyPresence(status: PresenceStatus, statusMsg?: string): Promise<void> {
    if (!this.client) return;
    await this.client.setPresence({
      presence: status,
      status_msg: statusMsg,
    });
  }

  // ---- Internal -----------------------------------------------------------

  private handlePresenceEvent(user: User): void {
    const status = toPresenceStatus(user.presence);
    const info: PresenceInfo = {
      status,
      lastActiveAgo: user.lastActiveAgo > 0 ? user.lastActiveAgo : undefined,
      statusMsg: user.presenceStatusMsg ?? undefined,
      currentlyActive: user.currentlyActive || undefined,
    };

    const prev = this.cache.get(user.userId);
    if (
      prev &&
      prev.status === info.status &&
      prev.lastActiveAgo === info.lastActiveAgo &&
      prev.statusMsg === info.statusMsg &&
      prev.currentlyActive === info.currentlyActive
    ) {
      return; // no change
    }

    this.cache.set(user.userId, info);
    this.notify();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPresenceStatus(raw: string): PresenceStatus {
  if (raw === "online") return "online";
  if (raw === "unavailable") return "unavailable";
  return "offline";
}
