import React, { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useMatrix } from "~/lib/matrix-context";
import { formatMessageTimestamp } from "~/lib/theme";
import type { UnreadCounts } from "~/lib/unread-tracker";

interface NotificationItem {
  roomId: string;
  roomName: string;
  eventId: string;
  sender: string;
  senderName: string;
  body: string;
  timestamp: number;
  highlight: boolean;
}

interface NotificationPanelProps {
  onNavigateToRoom: (roomId: string) => void;
  onClose: () => void;
}

export function NotificationPanel({
  onNavigateToRoom,
  onClose,
}: NotificationPanelProps): React.ReactElement {
  const { client, unreadTracker, eventStore } = useMatrix();
  const panelRef = useRef<HTMLDivElement>(null);

  // Re-render when unread counts change
  const _unreadVersion = useSyncExternalStore(unreadTracker.subscribe, unreadTracker.getVersion);
  const _storeVersion = useSyncExternalStore(eventStore.subscribe, eventStore.getVersion);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };

    const handleClickOutside = (e: MouseEvent): void => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Build notification items from rooms with unread highlights or mentions
  const notifications = useMemo((): NotificationItem[] => {
    const items: NotificationItem[] = [];
    const rooms = client.getRooms();
    const myUserId = client.getUserId() ?? "";

    for (const room of rooms) {
      const counts: UnreadCounts = unreadTracker.getUnreadCount(room.roomId);
      if (counts.total === 0) continue;

      const timeline = room.getLiveTimeline().getEvents();

      // Scan recent timeline events for mentions / highlights
      for (let i = timeline.length - 1; i >= 0 && i >= timeline.length - 50; i--) {
        const event = timeline[i];
        if (!event) continue;

        const evType = event.getType();
        if (evType !== "m.room.message") continue;

        const sender = event.getSender();
        if (sender === myUserId) continue;

        const content = event.getContent();
        const body = (content.body as string) ?? "";
        const eventId = event.getId() ?? "";

        // Check if this message mentions the user
        const isHighlight =
          body.toLowerCase().includes(myUserId.toLowerCase()) ||
          body.toLowerCase().includes(myUserId.split(":")[0].slice(1).toLowerCase());

        const member = room.getMember(sender ?? "");
        const senderName = member?.name ?? sender ?? "Unknown";

        items.push({
          roomId: room.roomId,
          roomName: room.name || room.roomId,
          eventId,
          sender: sender ?? "",
          senderName,
          body: body.length > 100 ? body.slice(0, 100) + "..." : body,
          timestamp: event.getTs(),
          highlight: isHighlight || counts.highlight > 0,
        });

        // Only include the most recent notification per room for brevity
        break;
      }
    }

    // Sort by timestamp, most recent first
    items.sort((a, b) => b.timestamp - a.timestamp);
    return items;
  }, [client, unreadTracker, _unreadVersion, _storeVersion]);

  const totalHighlights = useMemo((): number => {
    let total = 0;
    const rooms = client.getRooms();
    for (const room of rooms) {
      total += unreadTracker.getUnreadCount(room.roomId).highlight;
    }
    return total;
  }, [client, unreadTracker, _unreadVersion]);

  const handleMarkAllRead = useCallback(() => {
    const rooms = client.getRooms();
    for (const room of rooms) {
      const counts = unreadTracker.getUnreadCount(room.roomId);
      if (counts.total > 0) {
        unreadTracker.markAsRead(room.roomId, true);
      }
    }
  }, [client, unreadTracker]);

  const handleItemClick = useCallback(
    (roomId: string) => {
      onNavigateToRoom(roomId);
      onClose();
    },
    [onNavigateToRoom, onClose],
  );

  return (
    <div
      ref={panelRef}
      className="absolute top-12 right-4 z-50 w-96 max-h-[70vh] bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-primary">Notifications</h3>
          {totalHighlights > 0 && (
            <span className="min-w-[20px] h-5 flex items-center justify-center px-1.5 bg-red-500 text-inverse text-[10px] font-bold rounded-full">
              {totalHighlights}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleMarkAllRead}
            className="text-xs text-secondary hover:text-primary transition-colors"
          >
            Mark all read
          </button>
          <button
            onClick={onClose}
            className="p-1 text-muted hover:text-secondary hover:bg-surface-3 rounded transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <svg
              className="w-10 h-10 text-faint mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
              />
            </svg>
            <p className="text-sm text-muted">No notifications</p>
            <p className="text-xs text-faint mt-1">You're all caught up!</p>
          </div>
        ) : (
          notifications.map((item) => (
            <button
              key={`${item.roomId}-${item.eventId}`}
              onClick={() => handleItemClick(item.roomId)}
              className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-surface-2 transition-colors border-b border-border/50 last:border-b-0"
            >
              {/* Room initial */}
              <div className="w-8 h-8 rounded-lg bg-surface-3 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-secondary">
                  {item.roomName.charAt(0).toUpperCase()}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium text-secondary truncate">
                    {item.roomName}
                  </span>
                  <span className="text-[10px] text-faint flex-shrink-0">
                    {formatMessageTimestamp(item.timestamp, false, false)}
                  </span>
                </div>
                <p className="text-sm text-primary font-medium truncate">{item.senderName}</p>
                <p className="text-xs text-secondary truncate mt-0.5">{item.body}</p>
              </div>

              {item.highlight && (
                <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 mt-2" />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/** Hook to get the total highlight count across all rooms */
export function useTotalHighlightCount(): number {
  const { client, unreadTracker } = useMatrix();
  const _version = useSyncExternalStore(unreadTracker.subscribe, unreadTracker.getVersion);

  return useMemo(() => {
    let total = 0;
    const rooms = client.getRooms();
    for (const room of rooms) {
      total += unreadTracker.getUnreadCount(room.roomId).highlight;
    }
    return total;
  }, [client, unreadTracker, _version]);
}
