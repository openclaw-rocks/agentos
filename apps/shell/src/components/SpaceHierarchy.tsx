import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useMatrix } from "~/lib/matrix-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpaceHierarchyProps {
  spaceId: string;
  onClose: () => void;
  onJoinRoom: (roomId: string) => void;
}

interface HierarchyRoom {
  roomId: string;
  name: string;
  topic: string;
  memberCount: number;
  isSpace: boolean;
  isJoined: boolean;
  childrenIds: string[];
  suggested: boolean;
}

// ---------------------------------------------------------------------------
// Tree node component
// ---------------------------------------------------------------------------

function HierarchyNode({
  node,
  allNodes,
  depth,
  expandedIds,
  onToggle,
  onJoin,
  joiningRoomId,
}: {
  node: HierarchyRoom;
  allNodes: Map<string, HierarchyRoom>;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (roomId: string) => void;
  onJoin: (roomId: string) => void;
  joiningRoomId: string | null;
}): React.JSX.Element {
  const isExpanded = expandedIds.has(node.roomId);
  const children = node.childrenIds
    .map((id) => allNodes.get(id))
    .filter((n): n is HierarchyRoom => n !== undefined);

  return (
    <div>
      <div
        className="flex items-center gap-2 px-3 py-2 hover:bg-surface-2 rounded-lg transition-colors group"
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        {/* Expand/collapse toggle for spaces */}
        {node.isSpace ? (
          <button
            onClick={() => onToggle(node.roomId)}
            className="w-5 h-5 flex items-center justify-center text-muted hover:text-secondary transition-colors flex-shrink-0"
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <span className="w-5 h-5 flex items-center justify-center text-muted text-sm flex-shrink-0">
            #
          </span>
        )}

        {/* Room info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm text-primary truncate">{node.name}</p>
            {node.isSpace && (
              <span className="text-[10px] px-1.5 py-0.5 bg-surface-3 text-muted rounded flex-shrink-0">
                Space
              </span>
            )}
            {node.suggested && !node.isSpace && (
              <span
                className="text-[10px] px-1.5 py-0.5 bg-status-success/20 text-status-success rounded flex-shrink-0 flex items-center gap-0.5"
                title="Recommended"
              >
                <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24" stroke="none">
                  <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
                Recommended
              </span>
            )}
          </div>
          {node.topic && <p className="text-xs text-muted truncate mt-0.5">{node.topic}</p>}
        </div>

        {/* Member count */}
        <span className="text-[10px] text-muted flex-shrink-0">
          {node.memberCount} {node.memberCount === 1 ? "member" : "members"}
        </span>

        {/* Join button */}
        {!node.isJoined && !node.isSpace && (
          <button
            onClick={() => onJoin(node.roomId)}
            disabled={joiningRoomId === node.roomId}
            className="px-2.5 py-1 text-xs font-medium bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse rounded-md transition-colors flex-shrink-0"
          >
            {joiningRoomId === node.roomId ? "Joining..." : "Join"}
          </button>
        )}

        {node.isJoined && (
          <span className="text-[10px] text-status-success flex-shrink-0">Joined</span>
        )}
      </div>

      {/* Children */}
      {node.isSpace && isExpanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <HierarchyNode
              key={child.roomId}
              node={child}
              allNodes={allNodes}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onJoin={onJoin}
              joiningRoomId={joiningRoomId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SpaceHierarchy({
  spaceId,
  onClose,
  onJoinRoom,
}: SpaceHierarchyProps): React.JSX.Element {
  const { client } = useMatrix();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [allNodes, setAllNodes] = useState<Map<string, HierarchyRoom>>(new Map());
  const [rootChildrenIds, setRootChildrenIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);

  const spaceName = client.getRoom(spaceId)?.name ?? "Space";

  // Fetch hierarchy
  useEffect(() => {
    let cancelled = false;

    const fetchHierarchy = async (): Promise<void> => {
      setLoading(true);
      setError("");
      try {
        // getRoomHierarchy returns { rooms, next_batch }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (client as any).getRoomHierarchy(spaceId, 100, 5);
        if (cancelled) return;

        const rooms: Array<{
          room_id: string;
          name?: string;
          topic?: string;
          num_joined_members?: number;
          room_type?: string;
          canonical_alias?: string;
          children_state?: Array<{
            type: string;
            state_key: string;
            content: Record<string, unknown>;
          }>;
        }> = response?.rooms ?? [];

        const joinedRoomIds = new Set(client.getRooms().map((r) => r.roomId));

        const nodeMap = new Map<string, HierarchyRoom>();
        const rootChildren: string[] = [];

        // Build a map of room_id -> suggested from parent children_state
        const suggestedMap = new Map<string, boolean>();
        for (const room of rooms) {
          if (room.children_state) {
            for (const state of room.children_state) {
              if (
                state.type === "m.space.child" &&
                state.content &&
                Object.keys(state.content).length > 0
              ) {
                suggestedMap.set(state.state_key, state.content.suggested === true);
              }
            }
          }
        }

        for (const room of rooms) {
          const isSpace = room.room_type === "m.space";
          const childrenIds: string[] = [];

          if (room.children_state) {
            for (const state of room.children_state) {
              if (
                state.type === "m.space.child" &&
                state.content &&
                Object.keys(state.content).length > 0
              ) {
                childrenIds.push(state.state_key);
              }
            }
          }

          nodeMap.set(room.room_id, {
            roomId: room.room_id,
            name: room.name ?? room.room_id,
            topic: room.topic ?? "",
            memberCount: room.num_joined_members ?? 0,
            isSpace,
            isJoined: joinedRoomIds.has(room.room_id),
            childrenIds,
            suggested: suggestedMap.get(room.room_id) ?? false,
          });

          // The first room in the response is the root space
          if (room.room_id === spaceId) {
            rootChildren.push(...childrenIds);
          }
        }

        setAllNodes(nodeMap);
        setRootChildrenIds(rootChildren);
        // Expand root space by default
        setExpandedIds(new Set([spaceId]));
      } catch (err: unknown) {
        if (!cancelled) {
          // Fallback: use local state to build a basic hierarchy
          try {
            const space = client.getRoom(spaceId);
            if (!space) throw new Error("Space not found", { cause: err });

            const spaceChildren = space.currentState.getStateEvents("m.space.child");
            const joinedRoomIds = new Set(client.getRooms().map((r) => r.roomId));
            const nodeMap = new Map<string, HierarchyRoom>();
            const rootChildren: string[] = [];

            if (spaceChildren) {
              for (const child of spaceChildren) {
                const stateKey = child.getStateKey();
                const content = child.getContent();
                if (!stateKey || !content || Object.keys(content).length === 0) continue;

                const room = client.getRoom(stateKey);
                const isChildSpace = room
                  ? room.currentState.getStateEvents("m.room.create", "")?.getContent()?.type ===
                    "m.space"
                  : false;

                nodeMap.set(stateKey, {
                  roomId: stateKey,
                  name: room?.name ?? stateKey,
                  topic:
                    room?.currentState.getStateEvents("m.room.topic", "")?.getContent()?.topic ??
                    "",
                  memberCount: room?.getJoinedMemberCount() ?? 0,
                  isSpace: isChildSpace,
                  isJoined: joinedRoomIds.has(stateKey),
                  childrenIds: [],
                  suggested: content.suggested === true,
                });
                rootChildren.push(stateKey);
              }
            }

            setAllNodes(nodeMap);
            setRootChildrenIds(rootChildren);
            setExpandedIds(new Set([spaceId]));
            setError("");
          } catch {
            setError(err instanceof Error ? err.message : "Failed to load space hierarchy");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchHierarchy();
    return () => {
      cancelled = true;
    };
  }, [client, spaceId]);

  const handleToggle = useCallback((roomId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) {
        next.delete(roomId);
      } else {
        next.add(roomId);
      }
      return next;
    });
  }, []);

  const handleJoin = useCallback(
    async (roomId: string) => {
      setJoiningRoomId(roomId);
      try {
        await client.joinRoom(roomId);
        // Update node's joined state
        setAllNodes((prev) => {
          const next = new Map(prev);
          const node = next.get(roomId);
          if (node) {
            next.set(roomId, { ...node, isJoined: true });
          }
          return next;
        });
        onJoinRoom(roomId);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to join room");
      } finally {
        setJoiningRoomId(null);
      }
    },
    [client, onJoinRoom],
  );

  // Filter nodes by search query
  const filteredRootChildren = useMemo(() => {
    if (!searchQuery.trim()) return rootChildrenIds;

    const query = searchQuery.toLowerCase();
    const matchingIds = new Set<string>();

    for (const [id, node] of allNodes) {
      if (node.name.toLowerCase().includes(query) || node.topic.toLowerCase().includes(query)) {
        matchingIds.add(id);
      }
    }

    return rootChildrenIds.filter((id) => {
      const node = allNodes.get(id);
      if (!node) return false;
      if (matchingIds.has(id)) return true;
      // Also include spaces if any children match
      if (node.isSpace) {
        return node.childrenIds.some((childId) => matchingIds.has(childId));
      }
      return false;
    });
  }, [rootChildrenIds, allNodes, searchQuery]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[80vh] bg-surface-1 border border-border rounded-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b border-border flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-primary">Explore {spaceName}</h3>
            <p className="text-[10px] text-muted">Browse rooms and sub-spaces</p>
          </div>
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

        {/* Search */}
        <div className="px-6 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 bg-surface-2 border border-border rounded-lg focus-within:border-accent">
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
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rooms..."
              className="flex-1 bg-transparent text-sm text-primary placeholder-muted focus:outline-none"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="px-6 py-4">
              <p className="text-sm text-status-error">{error}</p>
            </div>
          )}

          {!loading && !error && filteredRootChildren.length === 0 && (
            <p className="text-sm text-muted text-center py-12">
              {searchQuery.trim() ? "No matching rooms found" : "No rooms in this space"}
            </p>
          )}

          {!loading &&
            filteredRootChildren.map((childId) => {
              const node = allNodes.get(childId);
              if (!node) return null;
              return (
                <HierarchyNode
                  key={childId}
                  node={node}
                  allNodes={allNodes}
                  depth={0}
                  expandedIds={expandedIds}
                  onToggle={handleToggle}
                  onJoin={handleJoin}
                  joiningRoomId={joiningRoomId}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
}
