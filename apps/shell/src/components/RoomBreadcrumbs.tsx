import React, { useMemo } from "react";
import { useMatrix } from "~/lib/matrix-context";
import { mxcToHttpUrl } from "~/lib/media";

const RECENT_ROOMS_KEY = "openclaw:recent-rooms";
const MAX_RECENT_ROOMS = 8;

interface RoomBreadcrumbsProps {
  recentRooms: readonly string[];
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
}

/**
 * Horizontal strip of recently visited rooms displayed as small avatar circles.
 * Most recent rooms appear on the left.
 */
export function RoomBreadcrumbs({
  recentRooms,
  selectedRoomId,
  onSelectRoom,
}: RoomBreadcrumbsProps): React.ReactElement | null {
  const { client } = useMatrix();
  const homeserverUrl = client.getHomeserverUrl();

  const roomInfos = useMemo(() => {
    return recentRooms
      .map((roomId) => {
        const room = client.getRoom(roomId);
        if (!room) return null;

        const avatarMxc = room.getMxcAvatarUrl?.() ?? undefined;
        const avatarUrl = mxcToHttpUrl(avatarMxc, homeserverUrl, 32, 32);
        const name = room.name || roomId;
        const initial = name.charAt(0).toUpperCase();

        return { roomId, name, avatarUrl, initial };
      })
      .filter((info): info is NonNullable<typeof info> => info !== null);
  }, [recentRooms, client, homeserverUrl]);

  if (roomInfos.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border overflow-x-auto scrollbar-none">
      {roomInfos.map((info) => {
        const isSelected = info.roomId === selectedRoomId;

        return (
          <button
            key={info.roomId}
            onClick={() => onSelectRoom(info.roomId)}
            className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center transition-all ${
              isSelected
                ? "ring-2 ring-accent ring-offset-1 ring-offset-surface-1"
                : "hover:ring-2 hover:ring-border hover:ring-offset-1 hover:ring-offset-surface-1"
            }`}
            title={info.name}
          >
            {info.avatarUrl ? (
              <img
                src={info.avatarUrl}
                alt={info.name}
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center">
                <span className="text-[10px] font-medium text-secondary">{info.initial}</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Load recent rooms from localStorage.
 */
export function loadRecentRooms(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_ROOMS_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string").slice(0, MAX_RECENT_ROOMS);
  } catch {
    return [];
  }
}

/**
 * Save recent rooms to localStorage.
 */
export function saveRecentRooms(rooms: readonly string[]): void {
  try {
    localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(rooms.slice(0, MAX_RECENT_ROOMS)));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Add a room to the front of the recent rooms list, deduplicating and capping at MAX_RECENT_ROOMS.
 */
export function addRecentRoom(current: readonly string[], roomId: string): string[] {
  const filtered = current.filter((id) => id !== roomId);
  return [roomId, ...filtered].slice(0, MAX_RECENT_ROOMS);
}
