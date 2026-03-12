import type * as sdk from "matrix-js-sdk";
import { getRoomNotificationLevel } from "./room-notifications";

export interface NotificationOptions {
  /** The currently selected room ID (don't notify for this room if app is focused) */
  selectedRoomId: string | null;
}

/**
 * Manages desktop notifications for new messages.
 *
 * - Requests browser notification permission on first use
 * - Shows desktop notification for new messages when tab is not focused
 * - Does not notify for own messages or when the active room is focused
 */
export class NotificationManager {
  private client: sdk.MatrixClient | null = null;
  private permissionGranted = false;
  private selectedRoomId: string | null = null;

  setClient(client: sdk.MatrixClient): void {
    this.client = client;
  }

  /** Update the currently active room */
  setSelectedRoom(roomId: string | null): void {
    this.selectedRoomId = roomId;
  }

  /** Request notification permission from the browser */
  async requestPermission(): Promise<boolean> {
    if (typeof Notification === "undefined") return false;

    if (Notification.permission === "granted") {
      this.permissionGranted = true;
      return true;
    }

    if (Notification.permission === "denied") {
      return false;
    }

    const result = await Notification.requestPermission();
    this.permissionGranted = result === "granted";
    return this.permissionGranted;
  }

  /**
   * Evaluate whether a new timeline event should trigger a desktop notification,
   * and show one if appropriate.
   */
  handleTimelineEvent(event: sdk.MatrixEvent, room: sdk.Room | null): void {
    if (!room) return;
    if (!this.client) return;

    // Only notify for message events
    const type = event.getType();
    if (type !== "m.room.message") return;

    const sender = event.getSender();
    const myUserId = this.client.getUserId();

    // Don't notify for own messages
    if (sender === myUserId) return;

    // Don't notify if the app is focused and this is the selected room
    if (this.isAppFocused() && room.roomId === this.selectedRoomId) return;

    // Check for @room mention — always notify unless room is muted
    const content = event.getContent();
    const body = typeof content.body === "string" ? content.body : "";
    if (body.includes("@room")) {
      const level = getRoomNotificationLevel(this.client, room.roomId);
      if (level === "mute") return;
      // Force notification for @room even if user would normally only get mention notifications
      if (
        this.permissionGranted ||
        (typeof Notification !== "undefined" && Notification.permission === "granted")
      ) {
        this.permissionGranted = true;
        this.showNotification(event, room);
        return;
      }
    }

    // Request permission lazily on first notification attempt
    if (!this.permissionGranted && typeof Notification !== "undefined") {
      if (Notification.permission === "granted") {
        this.permissionGranted = true;
      } else if (Notification.permission !== "denied") {
        this.requestPermission().then(() => {
          // If permission was just granted, show the notification now
          if (this.permissionGranted) {
            this.showNotification(event, room);
          }
        });
        return;
      } else {
        return;
      }
    }

    if (!this.permissionGranted) return;

    this.showNotification(event, room);
  }

  private showNotification(event: sdk.MatrixEvent, room: sdk.Room): void {
    if (typeof Notification === "undefined") return;

    const sender = event.getSender() ?? "";
    const senderName = room.getMember(sender)?.name ?? sender;
    const content = event.getContent();
    const body = typeof content.body === "string" ? content.body : "";
    const preview = body.length > 100 ? body.slice(0, 100) + "..." : body;

    const roomName = room.name ?? room.roomId;

    const notification = new Notification(senderName, {
      body: `[${roomName}] ${preview}`,
      tag: event.getId() ?? undefined,
      silent: false,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);
  }

  /** Check if the browser tab/window is currently focused */
  private isAppFocused(): boolean {
    return typeof document !== "undefined" && document.hasFocus();
  }
}
