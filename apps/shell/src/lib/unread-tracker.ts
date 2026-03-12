import { NotificationCountType } from "matrix-js-sdk";
import type * as sdk from "matrix-js-sdk";

export interface UnreadCounts {
  total: number;
  highlight: number;
}

type Listener = () => void;

const EMPTY_COUNTS: UnreadCounts = { total: 0, highlight: 0 };

/**
 * Tracks unread message counts and highlight (mention) counts per room
 * using the Matrix SDK's built-in notification counts.
 *
 * Observable via subscribe/notify pattern (same as EventStore).
 */
export class UnreadTracker {
  private client: sdk.MatrixClient | null = null;
  private counts = new Map<string, UnreadCounts>();
  private lastReadEventIds = new Map<string, string>();
  private threadCounts = new Map<string, number>();
  private version = 0;
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify(): void {
    this.version++;
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Snapshot for useSyncExternalStore */
  getVersion = (): number => this.version;

  /** Bind to the Matrix client */
  setClient(client: sdk.MatrixClient): void {
    this.client = client;
  }

  /** Get unread counts for a room */
  getUnreadCount = (roomId: string): UnreadCounts => {
    return this.counts.get(roomId) ?? EMPTY_COUNTS;
  };

  /** Get the last-read event ID for a room (for the "new messages" divider) */
  getLastReadEventId = (roomId: string): string | undefined => {
    return this.lastReadEventIds.get(roomId);
  };

  /** Get unread count for a specific thread within a room. */
  getThreadUnreadCount = (roomId: string, threadRootId: string): number => {
    return this.threadCounts.get(`${roomId}:${threadRootId}`) ?? 0;
  };

  /** Get total unread count across all threads in a room. */
  getTotalThreadUnreadCount = (roomId: string): number => {
    const prefix = `${roomId}:`;
    let total = 0;
    for (const [key, count] of this.threadCounts) {
      if (key.startsWith(prefix)) {
        total += count;
      }
    }
    return total;
  };

  /** Mark a specific thread as read, resetting its unread count. */
  markThreadAsRead(roomId: string, threadRootId: string): void {
    const key = `${roomId}:${threadRootId}`;
    const prev = this.threadCounts.get(key);
    if (prev && prev > 0) {
      this.threadCounts.set(key, 0);
      this.notify();
    }
  }

  /**
   * Increment the unread count for a specific thread.
   * Called when a new message arrives in a thread the user is not actively viewing.
   */
  incrementThreadUnread(roomId: string, threadRootId: string): void {
    const key = `${roomId}:${threadRootId}`;
    const prev = this.threadCounts.get(key) ?? 0;
    this.threadCounts.set(key, prev + 1);
    this.notify();
  }

  /** Check if any room in a set of room IDs has unreads */
  hasUnreadsInRooms = (roomIds: Set<string>): boolean => {
    for (const roomId of roomIds) {
      const counts = this.counts.get(roomId);
      if (counts && counts.total > 0) return true;
    }
    return false;
  };

  /**
   * Mark a room as read by sending a read receipt for the last event.
   * Resets the local unread count immediately for responsive UI.
   */
  markAsRead(roomId: string, sendReceipt = true): void {
    if (!this.client) return;

    const room = this.client.getRoom(roomId);
    if (!room) return;

    const timeline = room.getLiveTimeline().getEvents();
    if (timeline.length === 0) return;

    const lastEvent = timeline[timeline.length - 1];
    const lastEventId = lastEvent.getId();

    // Store the last-read event ID (the last event at the time we marked as read)
    if (lastEventId) {
      this.lastReadEventIds.set(roomId, lastEventId);
    }

    // Optimistically reset counts
    const prev = this.counts.get(roomId);
    if (prev && (prev.total > 0 || prev.highlight > 0)) {
      this.counts.set(roomId, { total: 0, highlight: 0 });
      this.notify();
    }

    // Send read receipt to the server (unless the user has disabled it)
    if (sendReceipt) {
      this.client.sendReadReceipt(lastEvent).catch((err: unknown) => {
        console.warn("[UnreadTracker] Failed to send read receipt:", err);
      });
    }
  }

  /**
   * Refresh unread counts for all rooms from the Matrix SDK.
   * Called during sync and on timeline events.
   */
  refreshCounts(): void {
    if (!this.client) return;

    const rooms = this.client.getRooms();
    let changed = false;

    for (const room of rooms) {
      const total = room.getUnreadNotificationCount(NotificationCountType.Total) ?? 0;
      const highlight = room.getUnreadNotificationCount(NotificationCountType.Highlight) ?? 0;

      const prev = this.counts.get(room.roomId);
      if (!prev || prev.total !== total || prev.highlight !== highlight) {
        this.counts.set(room.roomId, { total, highlight });
        changed = true;
      }
    }

    if (changed) {
      this.notify();
    }
  }

  /**
   * Record the last-read event for a room, so we can show a "new messages"
   * divider line above the first unread message.
   */
  snapshotLastRead(roomId: string): void {
    if (!this.client) return;

    const room = this.client.getRoom(roomId);
    if (!room) return;

    // Use the fully-read marker or the read receipt position
    const userId = this.client.getUserId();
    if (!userId) return;

    const timeline = room.getLiveTimeline().getEvents();
    if (timeline.length === 0) return;

    // If the room has no unreads, there's no divider to show
    const counts = this.counts.get(roomId);
    if (!counts || counts.total === 0) return;

    // If we already have a last-read event ID stored, keep it
    if (this.lastReadEventIds.has(roomId)) return;

    // Try to find the read receipt position
    const receipts = room.getReadReceiptForUserId(userId);
    if (receipts?.eventId) {
      this.lastReadEventIds.set(roomId, receipts.eventId);
    }
  }
}
