import React, { useState, useCallback, useRef, useEffect } from "react";
import { useMatrix } from "~/lib/matrix-context";

interface PublicRoomEntry {
  roomId: string;
  name: string | undefined;
  topic: string | undefined;
  memberCount: number;
  alias: string | undefined;
  worldReadable: boolean;
  guestCanJoin: boolean;
  avatarUrl: string | undefined;
}

interface RoomDirectoryProps {
  onClose: () => void;
  onJoined: (roomId: string) => void;
}

/**
 * Modal to browse and join public rooms from the homeserver's room directory.
 *
 * Features:
 * - Free-text search across public rooms
 * - Custom server selector (defaults to the user's homeserver)
 * - Pagination via "Load more" button
 * - Already-joined indicator
 */
export function RoomDirectory({ onClose, onJoined }: RoomDirectoryProps) {
  const { client } = useMatrix();

  const [query, setQuery] = useState("");
  const [server, setServer] = useState(client.getDomain() ?? "");
  const [rooms, setRooms] = useState<PublicRoomEntry[]>([]);
  const [nextBatch, setNextBatch] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [joiningIds, setJoiningIds] = useState<Set<string>>(new Set());

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track joined room IDs for the "already joined" indicator
  const joinedRoomIds = new Set(client.getRooms().map((r) => r.roomId));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const fetchRooms = useCallback(
    async (searchQuery: string, serverName: string, since?: string) => {
      setLoading(true);
      setError("");

      try {
        const response = await client.publicRooms({
          limit: 50,
          server: serverName || undefined,
          filter: searchQuery.trim() ? { generic_search_term: searchQuery.trim() } : undefined,
          since,
        });

        const entries: PublicRoomEntry[] = (response.chunk ?? []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (r: any) => ({
            roomId: r.room_id as string,
            name: r.name as string | undefined,
            topic: r.topic as string | undefined,
            memberCount: (r.num_joined_members as number) ?? 0,
            alias: r.canonical_alias as string | undefined,
            worldReadable: Boolean(r.world_readable),
            guestCanJoin: Boolean(r.guest_can_join),
            avatarUrl: r.avatar_url as string | undefined,
          }),
        );

        if (since) {
          // Append to existing results
          setRooms((prev) => [...prev, ...entries]);
        } else {
          setRooms(entries);
        }

        setNextBatch(response.next_batch ?? undefined);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load room directory");
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  // Initial load on mount
  useEffect(() => {
    fetchRooms("", server);
  }, []);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(() => {
        setNextBatch(undefined);
        fetchRooms(value, server);
      }, 350);
    },
    [fetchRooms, server],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleServerChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setServer(value);
  }, []);

  const handleServerSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setNextBatch(undefined);
      fetchRooms(query, server);
    },
    [fetchRooms, query, server],
  );

  const handleLoadMore = useCallback(() => {
    if (nextBatch) {
      fetchRooms(query, server, nextBatch);
    }
  }, [fetchRooms, query, server, nextBatch]);

  const handleJoin = useCallback(
    async (roomIdOrAlias: string) => {
      setJoiningIds((prev) => new Set(prev).add(roomIdOrAlias));
      try {
        const result = await client.joinRoom(roomIdOrAlias);
        const joinedId =
          typeof result === "object" && result !== null && "roomId" in result
            ? (result as { roomId: string }).roomId
            : roomIdOrAlias;
        onJoined(joinedId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to join room");
      } finally {
        setJoiningIds((prev) => {
          const next = new Set(prev);
          next.delete(roomIdOrAlias);
          return next;
        });
      }
    },
    [client, onJoined],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] bg-surface-1 border border-border rounded-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold text-primary">Browse Rooms</h2>
            <button
              onClick={onClose}
              className="p-1 text-secondary hover:text-primary hover:bg-surface-3 rounded-lg transition-colors"
              title="Close"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-secondary mb-4">
            Discover and join public rooms on the server.
          </p>

          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 bg-surface-2 border border-border rounded-lg focus-within:border-accent mb-3">
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
              onChange={handleSearchChange}
              className="flex-1 bg-transparent text-sm text-primary placeholder-muted focus:outline-none"
              placeholder="Search rooms..."
            />
          </div>

          {/* Server selector */}
          <form onSubmit={handleServerSubmit} className="flex items-center gap-2">
            <label className="text-xs text-muted flex-shrink-0">Server:</label>
            <input
              type="text"
              value={server}
              onChange={handleServerChange}
              className="flex-1 px-2 py-1 bg-surface-2 border border-border rounded text-xs text-secondary focus:outline-none focus:border-accent"
              placeholder="matrix.org"
            />
            <button
              type="submit"
              className="px-2.5 py-1 text-xs bg-surface-2 text-secondary hover:text-primary hover:bg-surface-3 border border-border rounded transition-colors"
            >
              Go
            </button>
          </form>
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && <p className="text-sm text-status-error mb-3">{error}</p>}

          {!loading && rooms.length === 0 && (
            <p className="text-sm text-muted text-center py-8">
              {query.trim() ? "No rooms found" : "No public rooms available"}
            </p>
          )}

          <div className="space-y-1">
            {rooms.map((room) => {
              const isJoined = joinedRoomIds.has(room.roomId);
              const isJoining = joiningIds.has(room.roomId) || joiningIds.has(room.alias ?? "");
              const joinTarget = room.alias ?? room.roomId;

              return (
                <div
                  key={room.roomId}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-2 transition-colors"
                >
                  {/* Room avatar / initial */}
                  <div className="w-10 h-10 rounded-lg bg-surface-3 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-medium text-secondary">
                      {(room.name ?? room.alias ?? "#").charAt(0).toUpperCase()}
                    </span>
                  </div>

                  {/* Room info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p className="text-sm font-medium text-primary truncate">
                        {room.name ?? room.alias ?? room.roomId}
                      </p>
                      <span className="text-[10px] text-faint flex-shrink-0">
                        {room.memberCount} {room.memberCount === 1 ? "member" : "members"}
                      </span>
                    </div>
                    {room.alias && room.name && (
                      <p className="text-xs text-muted truncate">{room.alias}</p>
                    )}
                    {room.topic && (
                      <p className="text-xs text-secondary mt-0.5 line-clamp-2">{room.topic}</p>
                    )}
                  </div>

                  {/* Join / Joined button */}
                  <div className="flex-shrink-0">
                    {isJoined ? (
                      <span className="px-3 py-1.5 text-xs text-muted bg-surface-2 border border-border rounded-lg">
                        Joined
                      </span>
                    ) : (
                      <button
                        onClick={() => handleJoin(joinTarget)}
                        disabled={isJoining}
                        className="px-3 py-1.5 text-xs font-medium text-primary bg-accent hover:bg-accent-hover disabled:opacity-50 rounded-lg transition-colors"
                      >
                        {isJoining ? "Joining..." : "Join"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Loading spinner */}
          {loading && (
            <div className="flex items-center justify-center py-6">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Load more button */}
          {!loading && nextBatch && rooms.length > 0 && (
            <div className="flex justify-center pt-4">
              <button
                onClick={handleLoadMore}
                className="px-4 py-2 text-sm text-secondary hover:text-primary bg-surface-2 hover:bg-surface-3 border border-border rounded-lg transition-colors"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
