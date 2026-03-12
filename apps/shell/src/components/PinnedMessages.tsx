import type { MatrixClient, Room } from "matrix-js-sdk";
import React, { useState, useEffect, useCallback, useRef } from "react";

/** Shape of a fetched pinned event (subset of IEvent) */
interface PinnedEventData {
  event_id: string;
  sender: string;
  origin_server_ts: number;
  content: {
    body?: string;
    msgtype?: string;
    [key: string]: unknown;
  };
  type: string;
}

interface PinnedMessageEntry {
  eventId: string;
  sender: string;
  senderName: string;
  timestamp: number;
  preview: string;
  loading: boolean;
  error: boolean;
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

/**
 * Read the current list of pinned event IDs from room state.
 */
function getPinnedEventIds(room: Room | null): string[] {
  if (!room) return [];
  const stateEvent = room.currentState.getStateEvents("m.room.pinned_events", "");
  if (!stateEvent) return [];
  const content = stateEvent.getContent();
  const pinned: unknown = content?.pinned;
  if (!Array.isArray(pinned)) return [];
  return pinned.filter((id): id is string => typeof id === "string");
}

/**
 * Hook that returns the pinned event IDs for a room and re-reads on
 * interval (room state events arrive via sync, but we have no stable
 * listener for arbitrary state changes in matrix-js-sdk v36).
 */
function usePinnedEventIds(room: Room | null): string[] {
  const [ids, setIds] = useState<string[]>(() => getPinnedEventIds(room));

  useEffect(() => {
    const refresh = () => {
      const next = getPinnedEventIds(room);
      setIds((prev) => {
        if (prev.length === next.length && prev.every((id, i) => id === next[i])) return prev;
        return next;
      });
    };
    refresh();
    const interval = setInterval(refresh, 2_000);
    return () => clearInterval(interval);
  }, [room]);

  return ids;
}

/**
 * Fetch full event data for each pinned ID.
 */
function usePinnedEntries(
  client: MatrixClient,
  room: Room | null,
  pinnedIds: string[],
): PinnedMessageEntry[] {
  const [entries, setEntries] = useState<PinnedMessageEntry[]>([]);
  const prevIdsRef = useRef<string>("");

  useEffect(() => {
    const key = pinnedIds.join(",");
    if (key === prevIdsRef.current) return;
    prevIdsRef.current = key;

    if (pinnedIds.length === 0) {
      setEntries([]);
      return;
    }

    let cancelled = false;

    const fetchAll = async () => {
      const results: PinnedMessageEntry[] = await Promise.all(
        pinnedIds.map(async (eventId) => {
          try {
            const raw = (await client.fetchRoomEvent(
              room?.roomId ?? "",
              eventId,
            )) as Partial<PinnedEventData>;

            const sender = raw.sender ?? "";
            const senderName = room?.getMember(sender)?.name ?? sender;
            const body = raw.content?.body;
            const preview =
              typeof body === "string" ? body.split("\n")[0].slice(0, 120) : "(no preview)";

            return {
              eventId,
              sender,
              senderName,
              timestamp: raw.origin_server_ts ?? 0,
              preview,
              loading: false,
              error: false,
            };
          } catch {
            return {
              eventId,
              sender: "",
              senderName: "Unknown",
              timestamp: 0,
              preview: "(failed to load)",
              loading: false,
              error: true,
            };
          }
        }),
      );

      if (!cancelled) {
        setEntries(results);
      }
    };

    fetchAll();

    return () => {
      cancelled = true;
    };
  }, [client, room, pinnedIds]);

  return entries;
}

/* ------------------------------------------------------------------ */
/*  Pin / Unpin helpers                                                */
/* ------------------------------------------------------------------ */

export async function pinMessage(client: MatrixClient, room: Room, eventId: string): Promise<void> {
  const current = getPinnedEventIds(room);
  if (current.includes(eventId)) return;
  await client.sendStateEvent(
    room.roomId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    "m.room.pinned_events" as any,
    { pinned: [...current, eventId] },
    "",
  );
}

export async function unpinMessage(
  client: MatrixClient,
  room: Room,
  eventId: string,
): Promise<void> {
  const current = getPinnedEventIds(room);
  await client.sendStateEvent(
    room.roomId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    "m.room.pinned_events" as any,
    { pinned: current.filter((id) => id !== eventId) },
    "",
  );
}

/* ------------------------------------------------------------------ */
/*  Components                                                         */
/* ------------------------------------------------------------------ */

function PinIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "w-4 h-4"}
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
  );
}

interface PinnedMessagesDropdownProps {
  entries: PinnedMessageEntry[];
  onUnpin: (eventId: string) => void;
  onJumpTo: (eventId: string) => void;
  onClose: () => void;
}

function PinnedMessagesDropdown({
  entries,
  onUnpin,
  onJumpTo,
  onClose,
}: PinnedMessagesDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full right-0 mt-1 w-80 bg-surface-1 border border-border rounded-xl shadow-lg z-50 overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold text-primary">Pinned Messages</span>
        <button
          onClick={onClose}
          className="text-muted hover:text-primary transition-colors"
          title="Close"
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
      <div className="max-h-[400px] overflow-y-auto">
        {entries.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-muted">No pinned messages</div>
        )}
        {entries.map((entry) => (
          <div
            key={entry.eventId}
            className="px-3 py-2 hover:bg-surface-2 transition-colors border-b border-border last:border-b-0 group/pin cursor-pointer"
            onClick={() => onJumpTo(entry.eventId)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-xs font-medium text-primary truncate">
                    {entry.senderName}
                  </span>
                  {entry.timestamp > 0 && (
                    <span className="text-[10px] text-faint flex-shrink-0">
                      {new Date(entry.timestamp).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
                <p
                  className={`text-xs truncate ${entry.error ? "text-faint italic" : "text-secondary"}`}
                >
                  {entry.preview}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUnpin(entry.eventId);
                }}
                className="opacity-0 group-hover/pin:opacity-100 p-1 text-muted hover:text-status-error rounded transition-all flex-shrink-0"
                title="Unpin message"
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
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Exported header button + dropdown                                  */
/* ------------------------------------------------------------------ */

interface PinnedMessagesButtonProps {
  client: MatrixClient;
  room: Room | null;
  roomId: string;
  onJumpToMessage?: (eventId: string) => void;
}

/**
 * Renders a pin icon with count badge in the chat header.
 * When clicked, opens a dropdown listing all pinned messages.
 * Hidden when there are no pinned messages.
 */
export function PinnedMessagesButton({
  client,
  room,
  roomId: _roomId,
  onJumpToMessage,
}: PinnedMessagesButtonProps) {
  const [open, setOpen] = useState(false);
  const pinnedIds = usePinnedEventIds(room);
  const entries = usePinnedEntries(client, room, pinnedIds);

  const handleUnpin = useCallback(
    async (eventId: string) => {
      if (!room) return;
      try {
        await unpinMessage(client, room, eventId);
      } catch {
        // best-effort
      }
    },
    [client, room],
  );

  const handleJumpTo = useCallback(
    (eventId: string) => {
      setOpen(false);
      onJumpToMessage?.(eventId);
    },
    [onJumpToMessage],
  );

  const handleClose = useCallback(() => setOpen(false), []);

  // Don't render anything if there are no pinned messages
  if (pinnedIds.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-secondary hover:text-primary bg-surface-2 hover:bg-surface-3 rounded-lg transition-colors"
        title={`${pinnedIds.length} pinned message${pinnedIds.length === 1 ? "" : "s"}`}
      >
        <PinIcon className="w-3.5 h-3.5" />
        <span>{pinnedIds.length}</span>
      </button>
      {open && (
        <PinnedMessagesDropdown
          entries={entries}
          onUnpin={handleUnpin}
          onJumpTo={handleJumpTo}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
