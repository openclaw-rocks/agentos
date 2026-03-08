import React, { useMemo } from "react";
import { useMatrix } from "~/lib/matrix-context";

interface ChannelListProps {
  spaceId: string | null;
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
}

export function ChannelList({ spaceId, selectedRoomId, onSelectRoom }: ChannelListProps) {
  const { client } = useMatrix();

  const { channels, spaceName } = useMemo(() => {
    const allRooms = client.getRooms();

    if (spaceId === null) {
      // "Home" view: show rooms that aren't in any Space, and aren't Spaces themselves
      const spaceIds = new Set<string>();
      const childRoomIds = new Set<string>();

      for (const room of allRooms) {
        const createEvent = room.currentState.getStateEvents("m.room.create", "");
        if (createEvent?.getContent()?.type === "m.space") {
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
        (r) => !spaceIds.has(r.roomId) && !childRoomIds.has(r.roomId)
      );

      return {
        channels: orphanRooms.sort((a, b) => (a.name || "").localeCompare(b.name || "")),
        spaceName: "Home",
      };
    }

    // Show children of the selected Space
    const space = client.getRoom(spaceId);
    if (!space) return { channels: [], spaceName: "Unknown" };

    const spaceChildren = space.currentState.getStateEvents("m.space.child");
    const childIds = new Set<string>();
    if (spaceChildren) {
      for (const child of spaceChildren) {
        const stateKey = child.getStateKey();
        if (stateKey) childIds.add(stateKey);
      }
    }

    const childRooms = allRooms
      .filter((r) => childIds.has(r.roomId))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    return {
      channels: childRooms,
      spaceName: space.name || "Workspace",
    };
  }, [client, spaceId]);

  return (
    <div className="w-60 flex-shrink-0 bg-surface-1 border-r border-border flex flex-col">
      {/* Space name header */}
      <div className="h-14 flex items-center px-4 border-b border-border">
        <h2 className="text-sm font-bold text-white truncate">{spaceName}</h2>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto py-2">
        <p className="px-4 mb-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
          Channels
        </p>

        {channels.map((room) => {
          const isSelected = room.roomId === selectedRoomId;
          const name = room.name || room.roomId;
          const hasAgents = room.getJoinedMembers().some((m: any) => m.userId.includes("agent-"));

          return (
            <button
              key={room.roomId}
              onClick={() => onSelectRoom(room.roomId)}
              className={`w-full px-3 py-1.5 flex items-center gap-2 text-left transition-colors ${
                isSelected
                  ? "bg-surface-3/50 text-white"
                  : "text-gray-400 hover:bg-surface-2 hover:text-gray-200"
              }`}
            >
              <span className="text-gray-500 text-sm">#</span>
              <span className="text-sm truncate flex-1">{name}</span>
              {hasAgents && (
                <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
              )}
            </button>
          );
        })}

        {channels.length === 0 && (
          <p className="px-4 py-8 text-sm text-gray-500 text-center">
            No channels yet
          </p>
        )}
      </div>
    </div>
  );
}
