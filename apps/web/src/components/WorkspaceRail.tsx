import React, { useMemo } from "react";
import { useMatrix } from "~/lib/matrix-context";

interface WorkspaceRailProps {
  selectedSpaceId: string | null;
  onSelectSpace: (spaceId: string | null) => void;
  onLogout: () => void;
}

export function WorkspaceRail({ selectedSpaceId, onSelectSpace, onLogout }: WorkspaceRailProps) {
  const { client } = useMatrix();

  const spaces = useMemo(() => {
    return client.getRooms().filter((room) => {
      // A Space has the m.space type in its create event
      const createEvent = room.currentState.getStateEvents("m.room.create", "");
      const roomType = createEvent?.getContent()?.type;
      return roomType === "m.space";
    }).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [client]);

  return (
    <div className="w-16 flex-shrink-0 bg-surface-0 border-r border-border flex flex-col items-center py-3 gap-2">
      {/* Home button - shows all rooms not in any space */}
      <button
        onClick={() => onSelectSpace(null)}
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
          selectedSpaceId === null
            ? "bg-accent text-white rounded-2xl"
            : "bg-surface-2 text-gray-400 hover:bg-surface-3 hover:text-gray-200 hover:rounded-xl"
        }`}
        title="Home"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </button>

      <div className="w-8 h-px bg-border my-1" />

      {/* Space icons */}
      {spaces.map((space) => {
        const isSelected = selectedSpaceId === space.roomId;
        const name = space.name || "?";
        const initial = name.charAt(0).toUpperCase();

        return (
          <button
            key={space.roomId}
            onClick={() => onSelectSpace(space.roomId)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all group relative ${
              isSelected
                ? "bg-accent text-white rounded-2xl"
                : "bg-surface-2 text-gray-400 hover:bg-surface-3 hover:text-gray-200 hover:rounded-xl"
            }`}
            title={name}
          >
            <span className="text-sm font-bold">{initial}</span>
            {/* Selection indicator */}
            {isSelected && (
              <div className="absolute -left-[11px] w-1 h-8 bg-white rounded-r-full" />
            )}
          </button>
        );
      })}

      {/* Create workspace button */}
      <button
        className="w-10 h-10 rounded-xl bg-surface-2 text-gray-500 hover:bg-surface-3 hover:text-gray-300 flex items-center justify-center transition-all hover:rounded-xl mt-1"
        title="Create workspace"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* User / logout */}
      <button
        onClick={onLogout}
        className="w-10 h-10 rounded-xl bg-surface-2 text-gray-500 hover:bg-surface-3 hover:text-gray-300 flex items-center justify-center transition-all"
        title="Logout"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      </button>
    </div>
  );
}
