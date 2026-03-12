import React, { useState, useRef, useCallback, useEffect } from "react";
import { useMatrix } from "~/lib/matrix-context";

interface UserSearchResult {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
  fromEmailLookup?: boolean;
}

interface NewDMModalProps {
  onClose: () => void;
  onCreated: (roomId: string) => void;
}

/**
 * Check whether a search query looks like an email address
 * (contains @ but not a Matrix user ID which uses : as separator).
 */
function looksLikeEmail(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.includes("@") && !trimmed.includes(":");
}

export function NewDMModal({ onClose, onCreated }: NewDMModalProps) {
  const { client } = useMatrix();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const lookupEmailViaIdentityServer = useCallback(
    async (email: string): Promise<UserSearchResult | null> => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = client as any;
        // Check if an identity server is configured
        const identityServerUrl = c.getIdentityServerUrl?.();
        if (!identityServerUrl) return null;

        const result = await c.lookupThreePid("email", email);
        if (result?.mxid) {
          return {
            userId: result.mxid,
            displayName: result.displayname ?? undefined,
            avatarUrl: result.avatar_url ?? undefined,
            fromEmailLookup: true,
          };
        }
        return null;
      } catch {
        // Identity server lookup failed or not configured
        return null;
      }
    },
    [client],
  );

  const searchUsers = useCallback(
    async (term: string) => {
      if (!term.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const myUserId = client.getUserId();

        // Run directory search and email lookup in parallel
        const directorySearchPromise = client
          .searchUserDirectory({ term })
          .then((response) =>
            response.results
              .filter((u) => u.user_id !== myUserId)
              .map((u) => ({
                userId: u.user_id,
                displayName: u.display_name ?? undefined,
                avatarUrl: u.avatar_url ?? undefined,
              })),
          )
          .catch(() => [] as UserSearchResult[]);

        const emailLookupPromise = looksLikeEmail(term)
          ? lookupEmailViaIdentityServer(term.trim())
          : Promise.resolve(null);

        const [directoryResults, emailResult] = await Promise.all([
          directorySearchPromise,
          emailLookupPromise,
        ]);

        // Merge results: email lookup result first (if found), then directory results
        const merged: UserSearchResult[] = [...directoryResults];
        if (emailResult && !merged.some((u) => u.userId === emailResult.userId)) {
          merged.unshift(emailResult);
        }

        setResults(merged);
      } catch (err) {
        console.error("[NewDMModal] search error:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [client, lookupEmailViaIdentityServer],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      setError("");

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        searchUsers(value);
      }, 300);
    },
    [searchUsers],
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleSelectUser = useCallback(
    async (userId: string) => {
      setCreating(true);
      setError("");

      try {
        // Check if we already have a DM with this user via m.direct
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mDirectEvent = client.getAccountData("m.direct" as any);
        const mDirect = (mDirectEvent?.getContent() ?? {}) as Record<string, string[]>;
        const existingRoomIds = mDirect[userId];

        if (existingRoomIds && existingRoomIds.length > 0) {
          // Check if any of these rooms still exist and we're joined
          for (const roomId of existingRoomIds) {
            const room = client.getRoom(roomId);
            if (room) {
              onCreated(roomId);
              return;
            }
          }
        }

        // Create a new DM room
        const result = await client.createRoom({
          is_direct: true,
          invite: [userId],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          preset: "trusted_private_chat" as any,
          initial_state: [
            {
              type: "m.room.history_visibility",
              content: { history_visibility: "shared" },
            },
          ],
        });

        // Update m.direct account data
        const updatedDirect = { ...mDirect };
        if (!updatedDirect[userId]) {
          updatedDirect[userId] = [];
        }
        updatedDirect[userId] = [...updatedDirect[userId], result.room_id];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (client as any).setAccountData("m.direct", updatedDirect);

        onCreated(result.room_id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create conversation");
        setCreating(false);
      }
    },
    [client, onCreated],
  );

  const getInitial = (user: UserSearchResult): string => {
    const name = user.displayName ?? user.userId;
    return name.replace(/^[@]/, "").charAt(0).toUpperCase();
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
        <h2 className="text-lg font-bold text-primary mb-1">New Message</h2>
        <p className="text-sm text-secondary mb-4">Search for a user to start a direct message.</p>

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
            onChange={handleInputChange}
            className="flex-1 bg-transparent text-sm text-primary placeholder-muted focus:outline-none"
            placeholder="Search by name, user ID, or email..."
            disabled={creating}
          />
        </div>

        {/* Error */}
        {error && <p className="text-sm text-status-error mb-3">{error}</p>}

        {/* Results */}
        <div className="max-h-64 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && query.trim() && results.length === 0 && (
            <p className="text-sm text-muted text-center py-8">No users found</p>
          )}

          {!loading &&
            results.map((user) => (
              <button
                key={user.userId}
                onClick={() => handleSelectUser(user.userId)}
                disabled={creating}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-2 transition-colors disabled:opacity-50 text-left"
              >
                <div className="w-8 h-8 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-medium text-secondary">{getInitial(user)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {user.displayName && (
                      <p className="text-sm text-primary truncate">{user.displayName}</p>
                    )}
                    {user.fromEmailLookup && (
                      <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-accent/20 text-accent rounded flex-shrink-0">
                        via email
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted truncate">{user.userId}</p>
                </div>
              </button>
            ))}
        </div>

        {/* Creating indicator */}
        {creating && (
          <div className="flex items-center gap-2 justify-center py-3">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-secondary">Starting conversation...</span>
          </div>
        )}

        {/* Cancel button */}
        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            disabled={creating}
            className="px-4 py-2 text-sm text-secondary hover:text-primary transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
