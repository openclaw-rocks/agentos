import { EventTypes, type SpaceConfigEventContent } from "@openclaw/protocol";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { UserAvatar } from "./UserAvatar";
import { useMatrix } from "~/lib/matrix-context";

interface SpaceRailProps {
  selectedSpaceId: string | null;
  onSelectSpace: (spaceId: string | null) => void;
  onCreateSpace: () => void;
  onLogout: () => void;
  onOpenProfileSettings: () => void;
}

export const SpaceRail = React.memo(function SpaceRail({
  selectedSpaceId,
  onSelectSpace,
  onCreateSpace,
  onLogout,
  onOpenProfileSettings,
}: SpaceRailProps) {
  const { client, homeserverUrl, eventStore, unreadTracker } = useMatrix();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Re-render when the event store changes (new rooms/events from sync)
  const storeVersion = useSyncExternalStore(eventStore.subscribe, eventStore.getVersion);

  // Re-render when unread counts change
  const _unreadVersion = useSyncExternalStore(unreadTracker.subscribe, unreadTracker.getVersion);

  const spaces = useMemo(() => {
    return client
      .getRooms()
      .filter((room) => {
        const createEvent = room.currentState.getStateEvents("m.room.create", "");
        const roomType = createEvent?.getContent()?.type;
        return roomType === "m.space";
      })
      .map((room) => {
        const configEvent = room.currentState.getStateEvents(EventTypes.SpaceConfig, "");
        const config = configEvent?.getContent() as SpaceConfigEventContent | undefined;

        // Collect child room IDs to check for unreads
        const spaceChildren = room.currentState.getStateEvents("m.space.child");
        const childRoomIds = new Set<string>();
        if (spaceChildren) {
          for (const child of spaceChildren) {
            const stateKey = child.getStateKey();
            if (stateKey) childRoomIds.add(stateKey);
          }
        }

        return {
          roomId: room.roomId,
          name: room.name || "?",
          icon: config?.icon,
          childRoomIds,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [client, storeVersion]);

  // Current user info for the avatar button
  const currentUserId = client.getUserId() ?? "";
  const currentUser = client.getUser(currentUserId);
  const currentUserName = currentUser?.displayName ?? currentUserId;
  const currentUserAvatarMxc = currentUser?.avatarUrl;

  // Close user menu when clicking outside
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
      setShowUserMenu(false);
    }
  }, []);

  useEffect(() => {
    if (showUserMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showUserMenu, handleClickOutside]);

  return (
    <nav
      className="w-16 flex-shrink-0 bg-surface-0 border-r border-border flex flex-col items-center py-3 gap-2"
      aria-label="Spaces"
    >
      {/* Home button - shows all rooms not in any space */}
      <button
        onClick={() => onSelectSpace(null)}
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
          selectedSpaceId === null
            ? "bg-accent text-inverse rounded-2xl"
            : "bg-surface-2 text-secondary hover:bg-surface-3 hover:text-primary hover:rounded-xl"
        }`}
        title="Home"
        aria-label="Home"
        aria-current={selectedSpaceId === null ? "true" : undefined}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </svg>
      </button>

      <div className="w-8 h-px bg-border my-1" />

      {/* Space icons */}
      {spaces.map((space) => {
        const isSelected = selectedSpaceId === space.roomId;
        const hasUnreads = unreadTracker.hasUnreadsInRooms(space.childRoomIds);

        return (
          <button
            key={space.roomId}
            onClick={() => onSelectSpace(space.roomId)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all group relative ${
              isSelected
                ? "bg-accent text-inverse rounded-2xl"
                : "bg-surface-2 text-secondary hover:bg-surface-3 hover:text-primary hover:rounded-xl"
            }`}
            title={space.name}
            aria-label={`Space: ${space.name}`}
            aria-current={isSelected ? "true" : undefined}
          >
            {space.icon ? (
              <span className="text-lg">{space.icon}</span>
            ) : (
              <span className="text-sm font-bold">{space.name.charAt(0).toUpperCase()}</span>
            )}
            {/* Selection indicator */}
            {isSelected && (
              <div className="absolute -left-[11px] w-1 h-8 bg-white rounded-r-full" />
            )}
            {/* Unread dot indicator */}
            {hasUnreads && !isSelected && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-accent rounded-full border-2 border-surface-0" />
            )}
          </button>
        );
      })}

      {/* Create space button */}
      <button
        onClick={onCreateSpace}
        className="w-10 h-10 rounded-xl bg-surface-2 text-muted hover:bg-surface-3 hover:text-secondary flex items-center justify-center transition-all hover:rounded-xl mt-1"
        title="Create space"
        aria-label="Create space"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Current user avatar with dropdown */}
      <div className="relative" ref={userMenuRef}>
        <button
          onClick={() => setShowUserMenu((prev) => !prev)}
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:opacity-80"
          title={currentUserName}
        >
          <UserAvatar
            displayName={currentUserName}
            avatarMxcUrl={currentUserAvatarMxc}
            homeserverUrl={homeserverUrl}
            size="sm"
            showStatusDot={true}
            presence="online"
          />
        </button>

        {/* User dropdown menu */}
        {showUserMenu && (
          <div className="absolute bottom-12 left-0 w-48 bg-surface-1 border border-border rounded-lg shadow-xl z-50 py-1">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-xs font-medium text-primary truncate">{currentUserName}</p>
              <p className="text-[10px] text-muted truncate">{currentUserId}</p>
            </div>
            <button
              onClick={() => {
                setShowUserMenu(false);
                onOpenProfileSettings();
              }}
              className="w-full px-3 py-2 text-left text-xs text-secondary hover:bg-surface-2 transition-colors flex items-center gap-2"
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
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              Profile Settings
            </button>
            <button
              onClick={() => {
                setShowUserMenu(false);
                onLogout();
              }}
              className="w-full px-3 py-2 text-left text-xs text-secondary hover:bg-surface-2 transition-colors flex items-center gap-2"
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
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
});
