import React, { useCallback, useEffect, useRef, useMemo, useState } from "react";
import { pinMessage, unpinMessage } from "./PinnedMessages";
import type { TimelineMessage } from "~/lib/event-store";
import { useMatrix } from "~/lib/matrix-context";
import { makePermalink } from "~/lib/permalink";

interface MessageContextMenuProps {
  msg: TimelineMessage;
  roomId: string;
  position: { x: number; y: number };
  onClose: () => void;
  onReply?: (eventId: string, senderName: string, body: string) => void;
  onOpenThread?: (eventId: string) => void;
  onForward?: (
    eventId: string,
    senderName: string,
    body: string,
    msgtype: string,
    content: Record<string, unknown>,
  ) => void;
  onEdit?: (eventId: string, currentBody: string) => void;
  onDelete?: (eventId: string) => void;
  onReport?: (eventId: string) => void;
}

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  action: () => void;
  danger?: boolean;
  separator?: false;
}

interface MenuSeparator {
  separator: true;
}

type MenuEntry = MenuItem | MenuSeparator;

export function MessageContextMenu({
  msg,
  roomId,
  position,
  onClose,
  onReply,
  onOpenThread,
  onForward,
  onEdit,
  onDelete,
  onReport,
}: MessageContextMenuProps): React.ReactElement {
  const { client } = useMatrix();
  const menuRef = useRef<HTMLDivElement>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [viewSource, setViewSource] = useState(false);

  const userId = client.getUserId() ?? "";
  const isOwnMessage = msg.sender === userId;

  // Check if message is pinned
  useEffect(() => {
    const room = client.getRoom(roomId);
    if (!room) return;
    const pinnedEvents = room.currentState.getStateEvents("m.room.pinned_events", "");
    const pinned = (pinnedEvents?.getContent()?.pinned as string[] | undefined) ?? [];
    setIsPinned(pinned.includes(msg.id));
  }, [client, roomId, msg.id]);

  // Moderator check
  const isModerator = useMemo(() => {
    const room = client.getRoom(roomId);
    if (!room) return false;
    const myMember = room.getMember(userId);
    const myPowerLevel = myMember?.powerLevel ?? 0;
    const plEvent = room.currentState.getStateEvents("m.room.power_levels", "");
    const plContent = plEvent?.getContent() as Record<string, unknown> | undefined;
    const events = plContent?.events as Record<string, number> | undefined;
    const redactLevel = events?.["m.room.redaction"] ?? 50;
    return myPowerLevel >= redactLevel;
  }, [client, roomId, userId]);

  // Position the menu within the viewport
  const adjustedPosition = useMemo(() => {
    const menuWidth = 220;
    const menuHeight = 400;

    let x = position.x;
    let y = position.y;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 8;
    }
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 8;
    }
    if (x < 8) x = 8;
    if (y < 8) y = 8;

    return { x, y };
  }, [position]);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };

    const handleClickOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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

  const handleReply = useCallback(() => {
    if (onReply) {
      onReply(msg.id, msg.senderName, (msg.content.body as string) ?? "");
    }
    onClose();
  }, [onReply, msg, onClose]);

  const handleReplyInThread = useCallback(() => {
    if (onOpenThread) {
      onOpenThread(msg.id);
    }
    onClose();
  }, [onOpenThread, msg.id, onClose]);

  const handleForward = useCallback(() => {
    if (onForward) {
      onForward(
        msg.id,
        msg.senderName,
        (msg.content.body as string) ?? "",
        (msg.content.msgtype as string) ?? "m.text",
        msg.content,
      );
    }
    onClose();
  }, [onForward, msg, onClose]);

  const handlePin = useCallback(async () => {
    const room = client.getRoom(roomId);
    if (!room) return;
    try {
      if (isPinned) {
        await unpinMessage(client, room, msg.id);
      } else {
        await pinMessage(client, room, msg.id);
      }
    } catch (err) {
      console.error("[MessageContextMenu] Pin toggle failed:", err);
    }
    onClose();
  }, [client, roomId, msg.id, isPinned, onClose]);

  const handleEdit = useCallback(() => {
    if (onEdit) {
      onEdit(msg.id, (msg.content.body as string) ?? "");
    }
    onClose();
  }, [onEdit, msg, onClose]);

  const handleDelete = useCallback(() => {
    if (onDelete) {
      onDelete(msg.id);
    }
    onClose();
  }, [onDelete, msg.id, onClose]);

  const handleCopyText = useCallback(() => {
    const text = (msg.content.body as string) ?? "";
    navigator.clipboard.writeText(text).catch(() => {
      /* best-effort */
    });
    onClose();
  }, [msg.content, onClose]);

  const handleCopyLink = useCallback(() => {
    const link = makePermalink(roomId, msg.id);
    navigator.clipboard.writeText(link).catch(() => {
      /* best-effort */
    });
    onClose();
  }, [roomId, msg.id, onClose]);

  const handleViewSource = useCallback(() => {
    setViewSource(true);
  }, []);

  const handleReport = useCallback(() => {
    if (onReport) {
      onReport(msg.id);
    }
    onClose();
  }, [onReport, msg.id, onClose]);

  if (viewSource) {
    return (
      <div className="fixed inset-0 z-[200]">
        <div
          ref={menuRef}
          className="absolute bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden"
          style={{ top: adjustedPosition.y, left: adjustedPosition.x, width: 400, maxHeight: 500 }}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <h4 className="text-xs font-semibold text-primary">Event Source</h4>
            <button
              onClick={onClose}
              className="p-1 text-muted hover:text-secondary hover:bg-surface-3 rounded transition-colors"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <pre className="p-4 text-xs font-mono text-secondary overflow-auto max-h-[420px]">
            {JSON.stringify(
              {
                event_id: msg.id,
                type: msg.type,
                sender: msg.sender,
                timestamp: msg.timestamp,
                content: msg.content,
              },
              null,
              2,
            )}
          </pre>
        </div>
      </div>
    );
  }

  const entries: MenuEntry[] = [];

  // Reply
  if (onReply) {
    entries.push({
      label: "Reply",
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
          />
        </svg>
      ),
      action: handleReply,
    });
  }

  // Reply in Thread
  if (onOpenThread) {
    entries.push({
      label: "Reply in Thread",
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      ),
      action: handleReplyInThread,
    });
  }

  // Forward
  if (onForward) {
    entries.push({
      label: "Forward",
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6"
          />
        </svg>
      ),
      action: handleForward,
    });
  }

  entries.push({ separator: true });

  // Pin / Unpin
  entries.push({
    label: isPinned ? "Unpin" : "Pin",
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
        />
      </svg>
    ),
    action: handlePin,
  });

  // Edit (own messages only)
  if (isOwnMessage && msg.type === "m.room.message" && onEdit) {
    entries.push({
      label: "Edit",
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      ),
      action: handleEdit,
    });
  }

  // Delete (own messages or moderator)
  if ((isOwnMessage || isModerator) && onDelete) {
    entries.push({
      label: isOwnMessage ? "Delete" : "Delete (mod)",
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      ),
      action: handleDelete,
      danger: true,
    });
  }

  entries.push({ separator: true });

  // Copy Text
  if (msg.type === "m.room.message" && msg.content.body) {
    entries.push({
      label: "Copy Text",
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      ),
      action: handleCopyText,
    });
  }

  // Copy Link
  entries.push({
    label: "Copy Link",
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L5.25 9.879"
        />
      </svg>
    ),
    action: handleCopyLink,
  });

  // View Source
  entries.push({
    label: "View Source",
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
        />
      </svg>
    ),
    action: handleViewSource,
  });

  // Report (others' messages only)
  if (!isOwnMessage && onReport) {
    entries.push({ separator: true });
    entries.push({
      label: "Report",
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"
          />
        </svg>
      ),
      action: handleReport,
      danger: true,
    });
  }

  return (
    <div className="fixed inset-0 z-[200]">
      <div
        ref={menuRef}
        className="absolute bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden py-1"
        style={{ top: adjustedPosition.y, left: adjustedPosition.x, minWidth: 200 }}
      >
        {entries.map((entry, i) => {
          if (entry.separator) {
            return <div key={`sep-${i}`} className="h-px bg-border my-1" />;
          }

          return (
            <button
              key={entry.label}
              onClick={entry.action}
              className={`w-full px-3 py-2 flex items-center gap-3 text-left text-sm transition-colors ${
                entry.danger
                  ? "text-status-error hover:bg-status-error/10"
                  : "text-secondary hover:bg-surface-2 hover:text-primary"
              }`}
            >
              <span className={entry.danger ? "text-status-error" : "text-muted"}>
                {entry.icon}
              </span>
              {entry.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
