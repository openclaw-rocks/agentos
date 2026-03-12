import React from "react";
import { useMatrix } from "~/lib/matrix-context";

interface RoomListProps {
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
}

export function RoomList({ selectedRoomId, onSelectRoom }: RoomListProps) {
  const { client } = useMatrix();
  const rooms = client.getRooms().sort((a, b) => {
    const tsA = a.getLastActiveTimestamp();
    const tsB = b.getLastActiveTimestamp();
    return tsB - tsA;
  });

  return (
    <div className="flex-1 overflow-y-auto py-2">
      {rooms.map((room) => {
        const isSelected = room.roomId === selectedRoomId;
        const name = room.name || room.roomId;
        const memberCount = room.getJoinedMemberCount();

        return (
          <button
            key={room.roomId}
            onClick={() => onSelectRoom(room.roomId)}
            className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-colors ${
              isSelected
                ? "bg-surface-3 text-primary"
                : "text-secondary hover:bg-surface-2 hover:text-primary"
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-surface-4 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-medium">{name.charAt(0).toUpperCase()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{name}</p>
              <p className="text-xs text-muted">{memberCount} members</p>
            </div>
          </button>
        );
      })}

      {rooms.length === 0 && (
        <p className="px-4 py-8 text-sm text-muted text-center">No rooms yet</p>
      )}
    </div>
  );
}
