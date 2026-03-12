import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMatrix } from "~/lib/matrix-context";

interface QuickSwitcherProps {
  onSelectSpace: (spaceId: string | null) => void;
  onSelectRoom: (roomId: string) => void;
  onClose: () => void;
}

interface SwitchItem {
  id: string;
  name: string;
  kind: "space" | "room";
  spaceId: string | null;
}

interface GroupedResults {
  spaces: SwitchItem[];
  rooms: SwitchItem[];
}

export function QuickSwitcher({ onSelectSpace, onSelectRoom, onClose }: QuickSwitcherProps) {
  const { client } = useMatrix();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const allItems = useMemo((): SwitchItem[] => {
    const rooms = client.getRooms();
    const items: SwitchItem[] = [];

    // Gather space IDs and their children
    const spaceChildMap = new Map<string, Set<string>>();

    for (const room of rooms) {
      const createEvent = room.currentState.getStateEvents("m.room.create", "");
      if (createEvent?.getContent()?.type === "m.space") {
        items.push({
          id: room.roomId,
          name: room.name || "Unnamed Space",
          kind: "space",
          spaceId: null,
        });

        const children = room.currentState.getStateEvents("m.space.child");
        const childIds = new Set<string>();
        if (children) {
          for (const child of children) {
            const key = child.getStateKey();
            if (key) childIds.add(key);
          }
        }
        spaceChildMap.set(room.roomId, childIds);
      }
    }

    // Add rooms
    for (const room of rooms) {
      const createEvent = room.currentState.getStateEvents("m.room.create", "");
      if (createEvent?.getContent()?.type === "m.space") continue;

      let parentSpaceId: string | null = null;
      for (const [spaceId, childIds] of spaceChildMap) {
        if (childIds.has(room.roomId)) {
          parentSpaceId = spaceId;
          break;
        }
      }

      items.push({
        id: room.roomId,
        name: room.name || room.roomId,
        kind: "room",
        spaceId: parentSpaceId,
      });
    }

    return items;
  }, [client]);

  const grouped = useMemo((): GroupedResults => {
    let filtered: SwitchItem[];
    if (!query.trim()) {
      filtered = allItems.slice(0, 15);
    } else {
      const lower = query.toLowerCase();
      filtered = allItems.filter((item) => item.name.toLowerCase().includes(lower)).slice(0, 15);
    }

    const spaces = filtered.filter((item) => item.kind === "space");
    const rooms = filtered.filter((item) => item.kind === "room");
    return { spaces, rooms };
  }, [allItems, query]);

  // Flat list for keyboard navigation
  const flatItems = useMemo(() => {
    return [...grouped.spaces, ...grouped.rooms];
  }, [grouped]);

  const isShowingRecent = !query.trim();

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = useCallback(
    (item: SwitchItem) => {
      if (item.kind === "space") {
        onSelectSpace(item.id);
      } else {
        if (item.spaceId) onSelectSpace(item.spaceId);
        onSelectRoom(item.id);
      }
      onClose();
    },
    [onSelectSpace, onSelectRoom, onClose],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && flatItems[selectedIndex]) {
      e.preventDefault();
      handleSelect(flatItems[selectedIndex]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  // Compute which flat index starts each section
  const spacesStartIndex = 0;
  const roomsStartIndex = grouped.spaces.length;

  const renderItem = (item: SwitchItem, flatIndex: number) => (
    <button
      key={item.id}
      onClick={() => handleSelect(item)}
      onMouseEnter={() => setSelectedIndex(flatIndex)}
      className={`w-full px-4 py-2 flex items-center gap-3 text-left transition-colors ${
        flatIndex === selectedIndex ? "bg-surface-3" : "hover:bg-surface-2"
      }`}
    >
      <span className="text-muted text-sm flex-shrink-0">
        {item.kind === "space" ? "\u25C6" : "#"}
      </span>
      <span className="text-sm text-secondary truncate flex-1">{item.name}</span>
      <span className="text-[10px] text-faint uppercase">{item.kind}</span>
    </button>
  );

  const hasResults = flatItems.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Switch to space or channel..."
            className="w-full bg-transparent text-sm text-primary placeholder-muted focus:outline-none"
          />
        </div>

        <div className="max-h-64 overflow-y-auto py-1">
          {!hasResults && <p className="px-4 py-6 text-sm text-muted text-center">No results</p>}

          {hasResults && isShowingRecent && (
            <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-muted uppercase tracking-wider">
              Recent
            </p>
          )}

          {/* Spaces section */}
          {grouped.spaces.length > 0 && !isShowingRecent && (
            <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-muted uppercase tracking-wider">
              Spaces
            </p>
          )}
          {grouped.spaces.map((item, i) => renderItem(item, spacesStartIndex + i))}

          {/* Rooms section */}
          {grouped.rooms.length > 0 && !isShowingRecent && (
            <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-muted uppercase tracking-wider">
              Rooms
            </p>
          )}
          {grouped.rooms.map((item, i) => renderItem(item, roomsStartIndex + i))}
        </div>

        <div className="px-4 py-2 border-t border-border flex gap-3 text-[10px] text-faint">
          <span>
            <kbd className="px-1 py-0.5 bg-surface-3 rounded text-muted">{"\u2191\u2193"}</kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-surface-3 rounded text-muted">{"\u21B5"}</kbd> select
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-surface-3 rounded text-muted">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
