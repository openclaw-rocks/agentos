import type * as sdk from "matrix-js-sdk";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { BridgeIcon } from "./BridgeStatusBadge";
import { RoomBreadcrumbs } from "./RoomBreadcrumbs";
import { RoomContextMenu } from "./RoomContextMenu";
import { RoomListFilters } from "./RoomListFilters";
import { detectBridgeFromMembers } from "~/lib/bridge-detection";
import { useMatrix } from "~/lib/matrix-context";
import type { RoomFilter } from "~/lib/room-filters";
import {
  buildSpaceChildSet,
  calculateMidpointOrder,
  filterRooms,
  getFavouriteOrder,
  isFavourite,
} from "~/lib/room-filters";
import type { UnreadCounts } from "~/lib/unread-tracker";
import { isVideoRoom } from "~/lib/video-room";

/** Check if a room is a Matrix space */
function isSpace(room: sdk.Room): boolean {
  const createEvent = room.currentState.getStateEvents("m.room.create", "");
  return createEvent?.getContent()?.type === "m.space";
}

/** Get the timestamp of the most recent event in a room, or 0 as fallback. */
function getLastActivityTimestamp(room: sdk.Room): number {
  const timeline = room.getLiveTimeline().getEvents();
  if (timeline.length === 0) return 0;
  return timeline[timeline.length - 1].getTs();
}

/** Get the display name of the DM target user in a room */
function getDMDisplayName(room: sdk.Room, targetUserId: string): string {
  const member = room.getMember(targetUserId);
  return member?.name ?? targetUserId.replace(/^@/, "").split(":")[0];
}

/** Get the first letter for a DM avatar */
function getDMInitial(room: sdk.Room, targetUserId: string): string {
  const name = getDMDisplayName(room, targetUserId);
  return name.charAt(0).toUpperCase();
}

interface ChannelListProps {
  spaceId: string | null;
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  onCreateChannel: () => void;
  onNewDM: () => void;
  onBrowseRooms?: () => void;
  onOpenSpaceSettings?: () => void;
  onExploreSpace?: () => void;
  recentRooms?: readonly string[];
  /** Callback to report the current visible room IDs for Alt+Up/Down navigation */
  onVisibleRoomIdsChange?: (roomIds: string[]) => void;
}

export const ChannelList = React.memo(function ChannelList({
  spaceId,
  selectedRoomId,
  onSelectRoom,
  onCreateChannel,
  onNewDM,
  onBrowseRooms,
  onOpenSpaceSettings,
  onExploreSpace,
  recentRooms,
  onVisibleRoomIdsChange,
}: ChannelListProps) {
  const { client, eventStore, dmTracker, unreadTracker, presenceTracker } = useMatrix();

  const [filter, setFilter] = useState<RoomFilter>("all");
  const [contextMenu, setContextMenu] = useState<{ roomId: string; x: number; y: number } | null>(
    null,
  );

  // Sub-space navigation: breadcrumb trail of space IDs the user has drilled into
  const [subSpaceStack, setSubSpaceStack] = useState<string[]>([]);

  // Drag-and-drop state for favourites reorder
  const [draggedRoomId, setDraggedRoomId] = useState<string | null>(null);
  const [dragOverRoomId, setDragOverRoomId] = useState<string | null>(null);

  // Roving tabindex: which room currently has focus in the tree
  const [focusedRoomId, setFocusedRoomId] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const roomButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // The effective space ID is the deepest sub-space in the stack, or the top-level spaceId
  const effectiveSpaceId =
    subSpaceStack.length > 0 ? subSpaceStack[subSpaceStack.length - 1] : spaceId;

  // Reset sub-space stack when the top-level spaceId changes
  const prevSpaceIdRef = React.useRef(spaceId);
  if (prevSpaceIdRef.current !== spaceId) {
    prevSpaceIdRef.current = spaceId;
    if (subSpaceStack.length > 0) {
      setSubSpaceStack([]);
    }
  }

  const handleNavigateSubSpace = useCallback((subSpaceId: string) => {
    setSubSpaceStack((prev) => [...prev, subSpaceId]);
  }, []);

  const handleBreadcrumbClick = useCallback((index: number) => {
    if (index < 0) {
      // Click on root space
      setSubSpaceStack([]);
    } else {
      // Click on a sub-space in the breadcrumb trail
      setSubSpaceStack((prev) => prev.slice(0, index + 1));
    }
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, roomId: string) => {
    e.preventDefault();
    setContextMenu({ roomId, x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Re-render when the event store changes (new rooms/events from sync)
  const storeVersion = useSyncExternalStore(eventStore.subscribe, eventStore.getVersion);

  // Re-render when unread counts change
  const _unreadVersion = useSyncExternalStore(unreadTracker.subscribe, unreadTracker.getVersion);

  // Re-render when DM state changes
  const _dmVersion = useSyncExternalStore(dmTracker.subscribe, dmTracker.getVersion);

  // Re-render when presence changes (for DM online indicators)
  const _presenceVersion = useSyncExternalStore(
    presenceTracker.subscribe,
    presenceTracker.getVersion,
  );

  // Build the space child set for the orphaned filter
  const spaceChildIds = useMemo(() => buildSpaceChildSet(client), [client, storeVersion]);

  const { channels, dmRooms, childSpaces, spaceName, breadcrumbNames } = useMemo(() => {
    const allRooms = client.getRooms();

    // Build breadcrumb names for the sub-space stack
    const breadcrumbs: string[] = [];
    if (spaceId) {
      const rootSpace = client.getRoom(spaceId);
      breadcrumbs.push(rootSpace?.name ?? "Space");
      for (const subId of subSpaceStack) {
        const subRoom = client.getRoom(subId);
        breadcrumbs.push(subRoom?.name ?? "Sub-space");
      }
    }

    if (effectiveSpaceId === null) {
      // "Home" view: show rooms that aren't in any Space, and aren't Spaces themselves
      const spaceIds = new Set<string>();
      const childRoomIds = new Set<string>();

      for (const room of allRooms) {
        if (isSpace(room)) {
          spaceIds.add(room.roomId);
          // Get children of this space
          const spaceChildren = room.currentState.getStateEvents("m.space.child");
          if (spaceChildren) {
            for (const child of spaceChildren) {
              const stateKey = child.getStateKey();
              if (stateKey) childRoomIds.add(stateKey);
            }
          }
        }
      }

      const orphanRooms = allRooms.filter(
        (r) => !spaceIds.has(r.roomId) && !childRoomIds.has(r.roomId),
      );

      // Separate DMs from channels
      const dms: sdk.Room[] = [];
      const chans: sdk.Room[] = [];

      for (const room of orphanRooms) {
        if (dmTracker.isDM(room.roomId)) {
          dms.push(room);
        } else {
          chans.push(room);
        }
      }

      const sortByActivity = (a: sdk.Room, b: sdk.Room) => {
        const tsA = getLastActivityTimestamp(a);
        const tsB = getLastActivityTimestamp(b);
        if (tsA !== tsB) return tsB - tsA;
        return (a.name || "").localeCompare(b.name || "");
      };

      return {
        channels: chans.sort(sortByActivity),
        dmRooms: dms.sort(sortByActivity),
        childSpaces: [] as sdk.Room[],
        spaceName: "Home",
        breadcrumbNames: [] as string[],
      };
    }

    // Show children of the selected (possibly nested) Space
    const space = client.getRoom(effectiveSpaceId);
    if (!space)
      return {
        channels: [],
        dmRooms: [],
        childSpaces: [] as sdk.Room[],
        spaceName: "Unknown",
        breadcrumbNames: breadcrumbs,
      };

    const spaceChildren = space.currentState.getStateEvents("m.space.child");
    const childIds = new Set<string>();
    const suggestedRoomIds = new Set<string>();
    if (spaceChildren) {
      for (const child of spaceChildren) {
        const stateKey = child.getStateKey();
        const content = child.getContent();
        // Skip cleared child events (empty content = removed)
        if (stateKey && content && Object.keys(content).length > 0) {
          childIds.add(stateKey);
          if (content.suggested === true) {
            suggestedRoomIds.add(stateKey);
          }
        }
      }
    }

    const childRoomsList: sdk.Room[] = [];
    const childSpacesList: sdk.Room[] = [];

    for (const r of allRooms) {
      if (!childIds.has(r.roomId)) continue;
      if (isSpace(r)) {
        childSpacesList.push(r);
      } else {
        childRoomsList.push(r);
      }
    }

    // Sort: recommended rooms first, then by activity
    const sortByRecommendedThenActivity = (a: sdk.Room, b: sdk.Room): number => {
      const aSuggested = suggestedRoomIds.has(a.roomId);
      const bSuggested = suggestedRoomIds.has(b.roomId);
      if (aSuggested !== bSuggested) return aSuggested ? -1 : 1;
      const tsA = getLastActivityTimestamp(a);
      const tsB = getLastActivityTimestamp(b);
      if (tsA !== tsB) return tsB - tsA;
      return (a.name || "").localeCompare(b.name || "");
    };

    childRoomsList.sort(sortByRecommendedThenActivity);
    childSpacesList.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    return {
      channels: childRoomsList,
      dmRooms: [],
      childSpaces: childSpacesList,
      spaceName: space.name || "Space",
      breadcrumbNames: breadcrumbs,
    };
  }, [client, spaceId, effectiveSpaceId, subSpaceStack, dmTracker, storeVersion]);

  // Apply active filter to both lists, passing spaceChildIds for accurate orphan detection
  const filteredChannels = useMemo(() => {
    if (filter === "people") return [];
    return filterRooms(channels, filter, unreadTracker, dmTracker, spaceChildIds);
  }, [channels, filter, unreadTracker, dmTracker, spaceChildIds]);

  const filteredDMs = useMemo(() => {
    if (filter === "rooms") return [];
    return filterRooms(dmRooms, filter, unreadTracker, dmTracker, spaceChildIds);
  }, [dmRooms, filter, unreadTracker, dmTracker, spaceChildIds]);

  // Separate favourite channels from non-favourite channels for drag-reorder section
  const { favouriteChannels, nonFavouriteChannels } = useMemo(() => {
    const favs: sdk.Room[] = [];
    const nonFavs: sdk.Room[] = [];
    for (const room of filteredChannels) {
      if (isFavourite(room)) {
        favs.push(room);
      } else {
        nonFavs.push(room);
      }
    }
    // Sort favourites by their tag order
    favs.sort((a, b) => {
      const orderA = getFavouriteOrder(a) ?? 0.5;
      const orderB = getFavouriteOrder(b) ?? 0.5;
      return orderA - orderB;
    });
    return { favouriteChannels: favs, nonFavouriteChannels: nonFavs };
  }, [filteredChannels]);

  // Build the flat visible room ID list (favourites + channels + DMs)
  const visibleRoomIds = useMemo(() => {
    const ids: string[] = [];
    for (const r of favouriteChannels) ids.push(r.roomId);
    for (const r of nonFavouriteChannels) ids.push(r.roomId);
    for (const r of filteredDMs) ids.push(r.roomId);
    return ids;
  }, [favouriteChannels, nonFavouriteChannels, filteredDMs]);

  // Report visible room IDs to parent for Alt+Up/Down navigation
  useEffect(() => {
    onVisibleRoomIdsChange?.(visibleRoomIds);
  }, [visibleRoomIds, onVisibleRoomIdsChange]);

  /* ---- Drag-and-drop handlers for favourite rooms ---- */
  const handleDragStart = useCallback((e: React.DragEvent, roomId: string) => {
    setDraggedRoomId(roomId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", roomId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, roomId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverRoomId(roomId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverRoomId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      setDragOverRoomId(null);
      const sourceRoomId = draggedRoomId;
      setDraggedRoomId(null);

      if (!sourceRoomId) return;
      if (favouriteChannels.length === 0) return;

      const sourceIndex = favouriteChannels.findIndex((r) => r.roomId === sourceRoomId);
      if (sourceIndex === -1 || sourceIndex === targetIndex) return;

      // Calculate the new order using midpoint between neighbors
      const before =
        targetIndex > 0 ? getFavouriteOrder(favouriteChannels[targetIndex - 1]) : undefined;
      const after =
        targetIndex < favouriteChannels.length
          ? getFavouriteOrder(favouriteChannels[targetIndex])
          : undefined;

      // If dropping after the source position, adjust for the item being removed
      const adjustedBefore =
        targetIndex > sourceIndex
          ? targetIndex < favouriteChannels.length
            ? getFavouriteOrder(favouriteChannels[targetIndex])
            : undefined
          : before;
      const adjustedAfter =
        targetIndex > sourceIndex
          ? targetIndex + 1 < favouriteChannels.length
            ? getFavouriteOrder(favouriteChannels[targetIndex + 1])
            : undefined
          : after;

      const newOrder = calculateMidpointOrder(adjustedBefore, adjustedAfter);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any)
        .setRoomTag(sourceRoomId, "m.favourite", { order: newOrder })
        .catch((err: unknown) => {
          console.error("[ChannelList] Failed to reorder favourite:", err);
        });
    },
    [draggedRoomId, favouriteChannels, client],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedRoomId(null);
    setDragOverRoomId(null);
  }, []);

  /* ---- Keyboard navigation (roving tabindex for tree) ---- */
  const handleTreeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (visibleRoomIds.length === 0) return;

      const currentIndex = focusedRoomId ? visibleRoomIds.indexOf(focusedRoomId) : -1;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const nextIndex = currentIndex < visibleRoomIds.length - 1 ? currentIndex + 1 : 0;
          const nextId = visibleRoomIds[nextIndex];
          setFocusedRoomId(nextId);
          roomButtonRefs.current.get(nextId)?.focus();
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : visibleRoomIds.length - 1;
          const prevId = visibleRoomIds[prevIndex];
          setFocusedRoomId(prevId);
          roomButtonRefs.current.get(prevId)?.focus();
          break;
        }
        case "Home": {
          e.preventDefault();
          const firstId = visibleRoomIds[0];
          setFocusedRoomId(firstId);
          roomButtonRefs.current.get(firstId)?.focus();
          break;
        }
        case "End": {
          e.preventDefault();
          const lastId = visibleRoomIds[visibleRoomIds.length - 1];
          setFocusedRoomId(lastId);
          roomButtonRefs.current.get(lastId)?.focus();
          break;
        }
        case "Enter":
        case " ": {
          e.preventDefault();
          if (focusedRoomId) {
            onSelectRoom(focusedRoomId);
          }
          break;
        }
      }
    },
    [visibleRoomIds, focusedRoomId, onSelectRoom],
  );

  /** Helper to set a button ref for roving tabindex */
  const setRoomButtonRef = useCallback((roomId: string, el: HTMLButtonElement | null) => {
    if (el) {
      roomButtonRefs.current.set(roomId, el);
    } else {
      roomButtonRefs.current.delete(roomId);
    }
  }, []);

  const renderFavouriteItem = (room: sdk.Room, index: number) => {
    const isSelected = room.roomId === selectedRoomId;
    const isFocused = room.roomId === focusedRoomId;
    const name = room.name || room.roomId;
    const unread: UnreadCounts = unreadTracker.getUnreadCount(room.roomId);
    const hasUnread = unread.total > 0;
    const hasMention = unread.highlight > 0;
    const isDragOver = room.roomId === dragOverRoomId;

    return (
      <button
        key={room.roomId}
        ref={(el) => setRoomButtonRef(room.roomId, el)}
        onClick={() => onSelectRoom(room.roomId)}
        onContextMenu={(e) => handleContextMenu(e, room.roomId)}
        onFocus={() => setFocusedRoomId(room.roomId)}
        draggable
        onDragStart={(e) => handleDragStart(e, room.roomId)}
        onDragOver={(e) => handleDragOver(e, room.roomId)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, index)}
        onDragEnd={handleDragEnd}
        role="treeitem"
        aria-selected={isSelected}
        tabIndex={isFocused || (!focusedRoomId && index === 0) ? 0 : -1}
        aria-label={`Favourite ${name}${hasUnread ? `, ${unread.total} unread` : ""}${hasMention ? `, ${unread.highlight} mentions` : ""}`}
        className={`w-full px-3 py-1.5 flex items-center gap-2 text-left transition-colors ${
          isDragOver ? "border-t-2 border-accent" : ""
        } ${draggedRoomId === room.roomId ? "opacity-50" : ""} ${
          isSelected
            ? "bg-surface-3/50 text-primary"
            : hasUnread
              ? "text-primary hover:bg-surface-2"
              : "text-secondary hover:bg-surface-2 hover:text-primary"
        }`}
      >
        <span className="text-yellow-500 text-sm">&#9733;</span>
        <span
          className={`text-sm truncate flex-1 ${hasUnread && !isSelected ? "font-semibold" : ""}`}
        >
          {name}
        </span>
        {hasMention ? (
          <span className="flex-shrink-0 min-w-[20px] h-5 flex items-center justify-center px-1.5 bg-red-500 text-inverse text-[10px] font-bold rounded-full">
            @{unread.highlight}
          </span>
        ) : hasUnread ? (
          <span className="flex-shrink-0 min-w-[20px] h-5 flex items-center justify-center px-1.5 bg-accent text-inverse text-[10px] font-bold rounded-full">
            {unread.total}
          </span>
        ) : null}
      </button>
    );
  };

  const renderChannelItem = (room: sdk.Room, indexOffset: number) => {
    const isSelected = room.roomId === selectedRoomId;
    const isFocused = room.roomId === focusedRoomId;
    const name = room.name || room.roomId;
    const members = room.getJoinedMembers();
    const hasAgents = members.some((m) => m.userId.includes("agent-"));
    const unread: UnreadCounts = unreadTracker.getUnreadCount(room.roomId);
    const hasUnread = unread.total > 0;
    const hasMention = unread.highlight > 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const videoRoom = isVideoRoom(room as any);

    // Bridge detection for channel list icon
    const bridge = detectBridgeFromMembers(members);

    // For roving tabindex: first item in the list is tabbable if no focus is set
    const globalIndex = favouriteChannels.length + indexOffset;
    const isFirstItem = globalIndex === 0 && favouriteChannels.length === 0;

    return (
      <button
        key={room.roomId}
        ref={(el) => setRoomButtonRef(room.roomId, el)}
        onClick={() => onSelectRoom(room.roomId)}
        onContextMenu={(e) => handleContextMenu(e, room.roomId)}
        onFocus={() => setFocusedRoomId(room.roomId)}
        role="treeitem"
        aria-selected={isSelected}
        tabIndex={isFocused || (!focusedRoomId && isFirstItem) ? 0 : -1}
        aria-label={`${videoRoom ? "Video room" : "Channel"} ${name}${bridge ? `, bridged to ${bridge.protocol}` : ""}${hasUnread ? `, ${unread.total} unread` : ""}${hasMention ? `, ${unread.highlight} mentions` : ""}`}
        className={`w-full px-3 py-1.5 flex items-center gap-2 text-left transition-colors ${
          isSelected
            ? "bg-surface-3/50 text-primary"
            : hasUnread
              ? "text-primary hover:bg-surface-2"
              : "text-secondary hover:bg-surface-2 hover:text-primary"
        }`}
      >
        {videoRoom ? (
          <svg
            className="w-3.5 h-3.5 text-muted flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        ) : (
          <span className="text-muted text-sm">#</span>
        )}
        <span
          className={`text-sm truncate flex-1 ${hasUnread && !isSelected ? "font-semibold" : ""}`}
        >
          {name}
        </span>
        {bridge && <BridgeIcon protocol={bridge.protocol} size="xs" />}
        {hasMention ? (
          <span className="flex-shrink-0 min-w-[20px] h-5 flex items-center justify-center px-1.5 bg-red-500 text-inverse text-[10px] font-bold rounded-full">
            @{unread.highlight}
          </span>
        ) : hasUnread ? (
          <span className="flex-shrink-0 min-w-[20px] h-5 flex items-center justify-center px-1.5 bg-accent text-inverse text-[10px] font-bold rounded-full">
            {unread.total}
          </span>
        ) : (
          hasAgents && <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
        )}
      </button>
    );
  };

  const renderDMItem = (room: sdk.Room, indexOffset: number) => {
    const isSelected = room.roomId === selectedRoomId;
    const isFocused = room.roomId === focusedRoomId;
    const targetUserId = dmTracker.getDMTarget(room.roomId);
    const displayName = targetUserId
      ? getDMDisplayName(room, targetUserId)
      : room.name || room.roomId;
    const initial = targetUserId ? getDMInitial(room, targetUserId) : "?";
    const unread: UnreadCounts = unreadTracker.getUnreadCount(room.roomId);
    const hasUnread = unread.total > 0;
    const hasMention = unread.highlight > 0;

    // Check presence via the presence tracker
    const presenceStatus = targetUserId
      ? presenceTracker.getPresence(targetUserId).status
      : "offline";
    const isOnline = presenceStatus === "online";
    const isAway = presenceStatus === "unavailable";

    // For roving tabindex
    const globalIndex = favouriteChannels.length + nonFavouriteChannels.length + indexOffset;
    const isFirstItem = globalIndex === 0;

    return (
      <button
        key={room.roomId}
        ref={(el) => setRoomButtonRef(room.roomId, el)}
        onClick={() => onSelectRoom(room.roomId)}
        onContextMenu={(e) => handleContextMenu(e, room.roomId)}
        onFocus={() => setFocusedRoomId(room.roomId)}
        role="treeitem"
        aria-selected={isSelected}
        tabIndex={isFocused || (!focusedRoomId && isFirstItem) ? 0 : -1}
        aria-label={`Direct message with ${displayName}${hasUnread ? `, ${unread.total} unread` : ""}${isOnline ? ", online" : isAway ? ", away" : ""}`}
        className={`w-full px-3 py-1.5 flex items-center gap-2 text-left transition-colors ${
          isSelected
            ? "bg-surface-3/50 text-primary"
            : hasUnread
              ? "text-primary hover:bg-surface-2"
              : "text-secondary hover:bg-surface-2 hover:text-primary"
        }`}
      >
        {/* Avatar with presence dot */}
        <div className="relative flex-shrink-0">
          <div className="w-5 h-5 rounded-full bg-surface-3 flex items-center justify-center">
            <span className="text-[10px] font-medium text-secondary">{initial}</span>
          </div>
          {(isOnline || isAway) && (
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-surface-1 ${isOnline ? "bg-status-success" : "bg-status-warning"}`}
            />
          )}
        </div>
        <span
          className={`text-sm truncate flex-1 ${hasUnread && !isSelected ? "font-semibold" : ""}`}
        >
          {displayName}
        </span>
        {hasMention ? (
          <span className="flex-shrink-0 min-w-[20px] h-5 flex items-center justify-center px-1.5 bg-red-500 text-inverse text-[10px] font-bold rounded-full">
            @{unread.highlight}
          </span>
        ) : hasUnread ? (
          <span className="flex-shrink-0 min-w-[20px] h-5 flex items-center justify-center px-1.5 bg-accent text-inverse text-[10px] font-bold rounded-full">
            {unread.total}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <nav
      className="w-60 flex-shrink-0 bg-surface-1 border-r border-border flex flex-col"
      aria-label="Channel list"
    >
      {/* Space name header with settings/explore buttons */}
      <div className="h-14 flex items-center px-4 border-b border-border gap-2">
        <h2 className="text-sm font-bold text-primary truncate flex-1">{spaceName}</h2>
        {spaceId !== null && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {onExploreSpace && (
              <button
                onClick={onExploreSpace}
                className="p-1 text-muted hover:text-secondary hover:bg-surface-3 rounded transition-colors"
                title="Explore space"
                aria-label="Explore space"
              >
                <svg
                  className="w-3.5 h-3.5"
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
              </button>
            )}
            {onOpenSpaceSettings && (
              <button
                onClick={onOpenSpaceSettings}
                className="p-1 text-muted hover:text-secondary hover:bg-surface-3 rounded transition-colors"
                title="Space settings"
                aria-label="Space settings"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Breadcrumb trail for sub-space navigation */}
      {breadcrumbNames.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border overflow-x-auto scrollbar-none">
          {breadcrumbNames.map((name, index) => {
            const isLast = index === breadcrumbNames.length - 1;
            return (
              <React.Fragment key={index}>
                {index > 0 && (
                  <svg
                    className="w-3 h-3 text-faint flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
                <button
                  onClick={() => handleBreadcrumbClick(index - 1)}
                  disabled={isLast}
                  className={`text-[10px] flex-shrink-0 truncate max-w-[80px] ${
                    isLast
                      ? "text-primary font-medium cursor-default"
                      : "text-muted hover:text-secondary transition-colors"
                  }`}
                  title={name}
                >
                  {name}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Room breadcrumbs -- recently visited rooms */}
      {recentRooms && recentRooms.length > 0 && (
        <RoomBreadcrumbs
          recentRooms={recentRooms}
          selectedRoomId={selectedRoomId}
          onSelectRoom={onSelectRoom}
        />
      )}

      <RoomListFilters active={filter} onChange={setFilter} />

      {/* Channel list with tree role and keyboard navigation */}
      <div
        ref={treeRef}
        className="flex-1 overflow-y-auto py-2"
        role="tree"
        aria-label="Room list"
        onKeyDown={handleTreeKeyDown}
      >
        {/* Sub-spaces section -- shown when a space is selected and has child spaces */}
        {effectiveSpaceId !== null && childSpaces.length > 0 && filter !== "people" && (
          <>
            <div className="px-4 mb-1">
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                Sub-spaces
              </p>
            </div>
            {childSpaces.map((subSpace) => (
              <button
                key={subSpace.roomId}
                onClick={() => handleNavigateSubSpace(subSpace.roomId)}
                className="w-full px-3 py-1.5 flex items-center gap-2 text-left transition-colors text-secondary hover:bg-surface-2 hover:text-primary"
              >
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
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
                <span className="text-sm truncate flex-1">{subSpace.name || subSpace.roomId}</span>
                <svg
                  className="w-3 h-3 text-faint flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </>
        )}

        {/* Favourites section -- shown when there are favourited channels */}
        {filter !== "people" && favouriteChannels.length > 0 && (
          <>
            <div className="px-4 mb-1 mt-2 flex items-center justify-between">
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                Favourites
              </p>
            </div>
            {favouriteChannels.map((room, index) => renderFavouriteItem(room, index))}
          </>
        )}

        {/* Channels section -- hidden when "people" filter is active */}
        {filter !== "people" && (
          <>
            <div className="px-4 mb-1 mt-2 flex items-center justify-between">
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                Channels
              </p>
              <div className="flex items-center gap-1">
                {onBrowseRooms && (
                  <button
                    onClick={onBrowseRooms}
                    className="text-muted hover:text-secondary transition-colors"
                    title="Browse rooms"
                    aria-label="Browse rooms"
                  >
                    <svg
                      className="w-3.5 h-3.5"
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
                  </button>
                )}
                <button
                  onClick={onCreateChannel}
                  className="text-muted hover:text-secondary transition-colors"
                  title="Create channel"
                  aria-label="Create channel"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>

            {nonFavouriteChannels.map((room, index) => renderChannelItem(room, index))}

            {nonFavouriteChannels.length === 0 && favouriteChannels.length === 0 && (
              <p className="px-4 py-4 text-sm text-muted text-center">No channels yet</p>
            )}
          </>
        )}

        {/* Direct Messages section -- only shown in Home view, hidden when "rooms" filter is active */}
        {spaceId === null && filter !== "rooms" && (
          <>
            <div className="px-4 mt-4 mb-1 flex items-center justify-between">
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                Direct Messages
              </p>
              <button
                onClick={onNewDM}
                className="text-muted hover:text-secondary transition-colors"
                title="New message"
                aria-label="New direct message"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>

            {filteredDMs.map((room, index) => renderDMItem(room, index))}

            {filteredDMs.length === 0 && (
              <p className="px-4 py-4 text-sm text-muted text-center">No conversations yet</p>
            )}
          </>
        )}
      </div>

      {/* Room context menu */}
      {contextMenu && (
        <RoomContextMenu
          roomId={contextMenu.roomId}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={closeContextMenu}
        />
      )}
    </nav>
  );
});
