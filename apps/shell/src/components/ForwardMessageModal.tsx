import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { buildForwardedContent, forwardMessage } from "~/lib/forward-message";
import { useMatrix } from "~/lib/matrix-context";

interface ForwardMessageModalProps {
  message: {
    body: string;
    msgtype: string;
    sender: string;
    content: Record<string, unknown>;
  };
  onClose: () => void;
  onForwarded: (roomId: string) => void;
}

interface JoinedRoom {
  roomId: string;
  name: string;
  isDM: boolean;
}

export function ForwardMessageModal({ message, onClose, onForwarded }: ForwardMessageModalProps) {
  const { client, dmTracker } = useMatrix();
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [successRoomId, setSuccessRoomId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Build list of joined rooms
  const joinedRooms = useMemo((): JoinedRoom[] => {
    const rooms = client.getRooms();
    const _myUserId = client.getUserId();
    const result: JoinedRoom[] = [];

    for (const room of rooms) {
      // Only include rooms the user has actually joined
      const membership = room.getMyMembership();
      if (membership !== "join") continue;

      // Skip spaces (they have m.space type)
      const createEvent = room.currentState.getStateEvents("m.room.create", "");
      const roomType = createEvent?.getContent()?.type as string | undefined;
      if (roomType === "m.space") continue;

      const isDM = dmTracker.isDM(room.roomId);
      let name = room.name ?? room.roomId;

      // For DMs, show the other user's display name
      if (isDM) {
        const dmTarget = dmTracker.getDMTarget(room.roomId);
        if (dmTarget) {
          const member = room.getMember(dmTarget);
          name = member?.name ?? dmTarget.replace(/^@/, "").split(":")[0];
        }
      }

      result.push({ roomId: room.roomId, name, isDM });
    }

    // Sort alphabetically by name
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [client, dmTracker]);

  // Filter rooms by search query
  const filteredRooms = useMemo((): JoinedRoom[] => {
    const q = query.trim().toLowerCase();
    if (!q) return joinedRooms;
    return joinedRooms.filter((room) => room.name.toLowerCase().includes(q));
  }, [joinedRooms, query]);

  // Resolve sender display name
  const senderDisplayName = useMemo((): string => {
    const user = client.getUser(message.sender);
    return user?.displayName ?? message.sender.replace(/^@/, "").split(":")[0];
  }, [client, message.sender]);

  const handleSelectRoom = useCallback(
    async (targetRoomId: string) => {
      setSending(true);
      setError("");

      try {
        const content = buildForwardedContent(message.content, senderDisplayName);
        await forwardMessage(client, targetRoomId, content);
        setSuccessRoomId(targetRoomId);
        // Auto-close after a brief delay so the user sees the success state
        setTimeout(() => {
          onForwarded(targetRoomId);
        }, 600);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to forward message");
        setSending(false);
      }
    },
    [client, message.content, senderDisplayName, onForwarded],
  );

  const getInitial = (name: string): string => {
    return name.replace(/^[@#]/, "").charAt(0).toUpperCase();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-surface-1 border border-border rounded-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-primary mb-1">Forward message</h2>
        <p className="text-sm text-secondary mb-4">Select a room to forward this message to.</p>

        {/* Message preview */}
        <div className="mb-4 px-3 py-2 bg-surface-2 border border-border rounded-lg">
          <p className="text-xs text-muted mb-0.5">{senderDisplayName}</p>
          <p className="text-sm text-secondary truncate">
            {message.msgtype === "m.text" ||
            message.msgtype === "m.notice" ||
            message.msgtype === "m.emote"
              ? message.body
              : `[${message.msgtype.replace("m.", "")}] ${message.body}`}
          </p>
        </div>

        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2 bg-surface-2 border border-border rounded-lg focus-within:border-accent mb-4">
          <svg
            className="w-4 h-4 text-muted flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-primary placeholder-muted focus:outline-none"
            placeholder="Search rooms..."
            disabled={sending}
          />
        </div>

        {/* Error */}
        {error && <p className="text-sm text-status-error mb-3">{error}</p>}

        {/* Success */}
        {successRoomId && (
          <div className="flex items-center gap-2 justify-center py-3 mb-3">
            <svg
              className="w-5 h-5 text-status-success"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-status-success">Message forwarded</span>
          </div>
        )}

        {/* Room list */}
        {!successRoomId && (
          <div className="max-h-64 overflow-y-auto">
            {filteredRooms.length === 0 && (
              <p className="text-sm text-muted text-center py-8">
                {query.trim() ? "No matching rooms" : "No rooms available"}
              </p>
            )}

            {filteredRooms.map((room) => (
              <button
                key={room.roomId}
                onClick={() => handleSelectRoom(room.roomId)}
                disabled={sending}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-2 transition-colors disabled:opacity-50 text-left"
              >
                <div className="w-8 h-8 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0">
                  {room.isDM ? (
                    <span className="text-sm font-medium text-secondary">
                      {getInitial(room.name)}
                    </span>
                  ) : (
                    <span className="text-sm font-medium text-secondary">#</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-primary truncate">
                    {room.isDM ? room.name : `# ${room.name}`}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Sending indicator */}
        {sending && !successRoomId && (
          <div className="flex items-center gap-2 justify-center py-3">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-secondary">Forwarding...</span>
          </div>
        )}

        {/* Cancel button */}
        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            disabled={sending && !successRoomId}
            className="px-4 py-2 text-sm text-secondary hover:text-primary transition-colors"
          >
            {successRoomId ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
