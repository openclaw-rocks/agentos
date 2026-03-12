import React, { useCallback, useEffect, useRef, useState } from "react";
import { useMatrix } from "~/lib/matrix-context";
import { isFavourite, toggleFavourite } from "~/lib/room-filters";
import {
  getRoomNotificationLevel,
  setRoomNotificationLevel,
  markRoomAsRead,
} from "~/lib/room-notifications";
import type { RoomNotificationLevel } from "~/lib/room-notifications";

interface RoomContextMenuProps {
  roomId: string;
  position: { x: number; y: number };
  onClose: () => void;
}

const NOTIFICATION_LEVELS: Array<{ level: RoomNotificationLevel; label: string }> = [
  { level: "all_loud", label: "All messages (loud)" },
  { level: "all", label: "All messages" },
  { level: "mentions", label: "Mentions only" },
  { level: "mute", label: "Mute" },
];

export const RoomContextMenu = React.memo(function RoomContextMenu({
  roomId,
  position,
  onClose,
}: RoomContextMenuProps) {
  const { client, unreadTracker } = useMatrix();
  const menuRef = useRef<HTMLDivElement>(null);
  const [showNotifSubmenu, setShowNotifSubmenu] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({
    position: "fixed",
    left: position.x,
    top: position.y,
    zIndex: 9999,
    opacity: 0,
  });

  const room = client.getRoom(roomId);
  const currentNotifLevel = getRoomNotificationLevel(client, roomId);
  const roomIsFavourite = room ? isFavourite(room) : false;
  const isLowPriority = room?.tags != null && "m.lowpriority" in room.tags;

  // Adjust position to stay within viewport
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const rect = menu.getBoundingClientRect();
    let x = position.x;
    let y = position.y;

    if (x + rect.width > window.innerWidth) {
      x = window.innerWidth - rect.width - 8;
    }
    if (y + rect.height > window.innerHeight) {
      y = window.innerHeight - rect.height - 8;
    }
    if (x < 0) x = 8;
    if (y < 0) y = 8;

    setMenuStyle({
      position: "fixed",
      left: x,
      top: y,
      zIndex: 9999,
      opacity: 1,
    });
  }, [position.x, position.y]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay adding listener to prevent the same right-click from immediately closing
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  const handleMarkAsRead = useCallback(async () => {
    unreadTracker.markAsRead(roomId);
    await markRoomAsRead(client, roomId);
    onClose();
  }, [client, roomId, unreadTracker, onClose]);

  const handleNotifLevel = useCallback(
    async (level: RoomNotificationLevel) => {
      await setRoomNotificationLevel(client, roomId, level);
      setShowNotifSubmenu(false);
      onClose();
    },
    [client, roomId, onClose],
  );

  const handleToggleFavourite = useCallback(async () => {
    await toggleFavourite(client, roomId);
    onClose();
  }, [client, roomId, onClose]);

  const handleToggleLowPriority = useCallback(async () => {
    if (isLowPriority) {
      await client.deleteRoomTag(roomId, "m.lowpriority");
    } else {
      await client.setRoomTag(roomId, "m.lowpriority", { order: 0.5 });
    }
    onClose();
  }, [client, roomId, isLowPriority, onClose]);

  const handleInvite = useCallback(() => {
    // For now, copy room ID to clipboard as a simple invite mechanism
    // A full invite modal could be wired in later
    navigator.clipboard.writeText(roomId).catch(() => {
      /* ignore clipboard errors */
    });
    onClose();
  }, [roomId, onClose]);

  const handleLeave = useCallback(async () => {
    if (!showLeaveConfirm) {
      setShowLeaveConfirm(true);
      return;
    }
    await client.leave(roomId);
    onClose();
  }, [client, roomId, showLeaveConfirm, onClose]);

  const handleCopyLink = useCallback(() => {
    const alias = room?.getCanonicalAlias() ?? roomId;
    const link = `https://matrix.to/#/${alias}`;
    navigator.clipboard.writeText(link).catch(() => {
      /* ignore clipboard errors */
    });
    onClose();
  }, [room, roomId, onClose]);

  const handleRoomSettings = useCallback(() => {
    // Emit a custom event that the parent can listen for to open room settings
    window.dispatchEvent(new CustomEvent("openclaw:open-room-settings", { detail: { roomId } }));
    onClose();
  }, [roomId, onClose]);

  const menuItemClass =
    "w-full px-3 py-1.5 text-left text-sm text-secondary hover:bg-surface-3 hover:text-primary transition-colors flex items-center gap-2";
  const dangerItemClass =
    "w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-surface-3 hover:text-red-300 transition-colors flex items-center gap-2";
  const separatorClass = "border-t border-border my-1";

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className="bg-surface-2 border border-border rounded-lg shadow-xl py-1 min-w-[200px] max-w-[280px]"
      role="menu"
      aria-label="Room context menu"
    >
      {/* Mark as Read */}
      <button onClick={handleMarkAsRead} className={menuItemClass} role="menuitem">
        <MarkReadIcon />
        Mark as read
      </button>

      <div className={separatorClass} />

      {/* Notification level */}
      <div className="relative">
        <button
          onClick={() => setShowNotifSubmenu(!showNotifSubmenu)}
          className={menuItemClass}
          role="menuitem"
          aria-haspopup="true"
          aria-expanded={showNotifSubmenu}
        >
          <BellIcon />
          <span className="flex-1">Notifications</span>
          <ChevronRightIcon />
        </button>

        {showNotifSubmenu && (
          <div className="pl-2">
            {NOTIFICATION_LEVELS.map(({ level, label }) => (
              <button
                key={level}
                onClick={() => handleNotifLevel(level)}
                className={menuItemClass}
                role="menuitemradio"
                aria-checked={currentNotifLevel === level}
              >
                <span className="w-4 text-center">
                  {currentNotifLevel === level ? (
                    <CheckIcon />
                  ) : (
                    <span className="w-4 inline-block" />
                  )}
                </span>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={separatorClass} />

      {/* Favourite */}
      <button onClick={handleToggleFavourite} className={menuItemClass} role="menuitem">
        <StarIcon filled={roomIsFavourite} />
        {roomIsFavourite ? "Unfavourite" : "Favourite"}
      </button>

      {/* Low priority */}
      <button onClick={handleToggleLowPriority} className={menuItemClass} role="menuitem">
        <ArrowDownIcon />
        {isLowPriority ? "Remove low priority" : "Low priority"}
      </button>

      <div className={separatorClass} />

      {/* Invite people */}
      <button onClick={handleInvite} className={menuItemClass} role="menuitem">
        <PersonAddIcon />
        Invite people
      </button>

      {/* Copy room link */}
      <button onClick={handleCopyLink} className={menuItemClass} role="menuitem">
        <LinkIcon />
        Copy room link
      </button>

      {/* Room settings */}
      <button onClick={handleRoomSettings} className={menuItemClass} role="menuitem">
        <SettingsIcon />
        Room settings
      </button>

      <div className={separatorClass} />

      {/* Leave room */}
      <button onClick={handleLeave} className={dangerItemClass} role="menuitem">
        <LeaveIcon />
        {showLeaveConfirm ? "Click again to confirm" : "Leave room"}
      </button>
    </div>
  );
});

/* ----- Icon components ----- */

function MarkReadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="w-4 h-4 text-accent"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className="w-4 h-4"
      fill={filled ? "currentColor" : "none"}
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
      />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </svg>
  );
}

function PersonAddIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
      />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function LeaveIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
      />
    </svg>
  );
}
