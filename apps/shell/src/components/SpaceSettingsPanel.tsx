import { EventType } from "matrix-js-sdk";
import type { MatrixClient, Room } from "matrix-js-sdk";
import React, { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { canDo, powerLevelLabel, sortMembers } from "./RoomSettingsPanel";
import { uploadFile } from "~/lib/file-upload";
import { useMatrix } from "~/lib/matrix-context";
import { mxcToHttpUrl } from "~/lib/media";
import type { PresenceStatus } from "~/lib/presence-tracker";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpaceSettingsPanelProps {
  spaceId: string;
  onClose: () => void;
  onLeaveSpace: () => void;
}

type Tab = "general" | "members" | "rooms" | "advanced";

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useRoom(client: MatrixClient, roomId: string): Room | null {
  const { eventStore } = useMatrix();
  useSyncExternalStore(eventStore.subscribe, eventStore.getVersion);
  return client.getRoom(roomId) ?? null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
        active ? "bg-surface-3 text-primary" : "text-muted hover:text-secondary hover:bg-surface-2"
      }`}
    >
      {label}
    </button>
  );
}

// ---- General Tab ----------------------------------------------------------

function GeneralTab({
  room,
  client,
  isAdmin,
}: {
  room: Room;
  client: MatrixClient;
  isAdmin: boolean;
}): React.JSX.Element {
  const [name, setName] = useState(room.name ?? "");
  const [topic, setTopic] = useState(
    room.currentState.getStateEvents(EventType.RoomTopic, "")?.getContent()?.topic ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const avatarMxc = room.getMxcAvatarUrl();
  const avatarUrl = avatarMxc ? mxcToHttpUrl(avatarMxc, client.getHomeserverUrl(), 80, 80) : null;

  const dirty =
    name !== (room.name ?? "") ||
    topic !==
      (room.currentState.getStateEvents(EventType.RoomTopic, "")?.getContent()?.topic ?? "");

  const save = async (): Promise<void> => {
    setSaving(true);
    setError("");
    try {
      const currentName = room.name ?? "";
      const currentTopic =
        room.currentState.getStateEvents(EventType.RoomTopic, "")?.getContent()?.topic ?? "";

      if (name !== currentName) {
        await client.setRoomName(room.roomId, name);
      }
      if (topic !== currentTopic) {
        await client.setRoomTopic(room.roomId, topic);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setError("");
    try {
      const result = await uploadFile(client, file);
      await client.sendStateEvent(room.roomId, EventType.RoomAvatar, { url: result.mxcUrl });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload avatar");
    } finally {
      setAvatarUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-xl bg-surface-3 flex items-center justify-center overflow-hidden flex-shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Space avatar" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl font-bold text-muted">
              {(room.name ?? "?").charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        {isAdmin && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              className="px-3 py-1.5 text-xs bg-surface-2 border border-border text-secondary rounded-lg hover:bg-surface-3 transition-colors disabled:opacity-50"
            >
              {avatarUploading ? "Uploading..." : "Change avatar"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </>
        )}
      </div>

      {/* Space name */}
      <div>
        <label className="block text-xs font-medium text-secondary mb-1.5">Space name</label>
        {isAdmin ? (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
          />
        ) : (
          <p className="text-sm text-secondary">{name || "\u2014"}</p>
        )}
      </div>

      {/* Topic */}
      <div>
        <label className="block text-xs font-medium text-secondary mb-1.5">Topic</label>
        {isAdmin ? (
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted resize-none focus:outline-none focus:border-accent"
          />
        ) : (
          <p className="text-sm text-secondary">{topic || "No topic set"}</p>
        )}
      </div>

      {/* Save */}
      {isAdmin && dirty && (
        <button
          onClick={save}
          disabled={saving}
          className="w-full px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      )}

      {error && <p className="text-sm text-status-error">{error}</p>}
    </div>
  );
}

// ---- Members Tab ----------------------------------------------------------

function MembersTab({
  room,
  client,
  myPowerLevel,
}: {
  room: Room;
  client: MatrixClient;
  myPowerLevel: number;
}): React.JSX.Element {
  const { presenceTracker } = useMatrix();
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");

  useSyncExternalStore(presenceTracker.subscribe, presenceTracker.getVersion);

  const plEvent = room.currentState.getStateEvents(EventType.RoomPowerLevels, "");
  const plContent = plEvent?.getContent() as { kick?: number; ban?: number } | undefined;
  const kickLevel = plContent?.kick ?? 50;

  const getPresenceStatus = useCallback(
    (userId: string): PresenceStatus => presenceTracker.getPresence(userId).status,
    [presenceTracker],
  );

  const joinedMembers = useMemo(
    () => sortMembers(room.getJoinedMembers(), getPresenceStatus),
    [room, getPresenceStatus],
  );

  const handleInvite = async (): Promise<void> => {
    const uid = inviteUserId.trim();
    if (!uid) return;
    setInviting(true);
    setError("");
    try {
      await client.invite(room.roomId, uid);
      setInviteUserId("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to invite user");
    } finally {
      setInviting(false);
    }
  };

  const handleKick = async (userId: string): Promise<void> => {
    try {
      await client.kick(room.roomId, userId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove user");
    }
  };

  return (
    <div className="space-y-4">
      {/* Invite */}
      <div>
        <label className="block text-xs font-medium text-secondary mb-1.5">Invite user</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={inviteUserId}
            onChange={(e) => setInviteUserId(e.target.value)}
            placeholder="@user:server.com"
            className="flex-1 px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleInvite}
            disabled={inviting || !inviteUserId.trim()}
            className="px-3 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-xs font-medium rounded-lg transition-colors"
          >
            {inviting ? "..." : "Invite"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-status-error">{error}</p>}

      {/* Member list */}
      <div>
        <p className="text-xs font-medium text-secondary mb-2">Members ({joinedMembers.length})</p>
        <div className="space-y-1">
          {joinedMembers.map((member) => {
            const avatarMxc = member.getMxcAvatarUrl();
            const avatarHttpUrl = avatarMxc
              ? mxcToHttpUrl(avatarMxc, client.getHomeserverUrl(), 32, 32)
              : null;
            const isMe = member.userId === client.getSafeUserId();
            const canKick = canDo(myPowerLevel, kickLevel) && member.powerLevel < myPowerLevel;
            const presence = presenceTracker.getPresence(member.userId);
            const presenceDotColor =
              presence.status === "online"
                ? "bg-status-success"
                : presence.status === "unavailable"
                  ? "bg-status-warning"
                  : "bg-surface-4";

            return (
              <div
                key={member.userId}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-2 transition-colors group"
              >
                <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                  {avatarHttpUrl ? (
                    <img src={avatarHttpUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-medium text-secondary">
                      {(member.name ?? member.userId).charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span
                    className={`absolute bottom-0 right-0 w-2 h-2 rounded-full ${presenceDotColor} border border-surface-1`}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-xs text-primary truncate">{member.name ?? member.userId}</p>
                  <p className="text-[10px] text-muted truncate">{member.userId}</p>
                </div>

                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    member.powerLevel >= 100
                      ? "bg-accent/20 text-accent"
                      : member.powerLevel >= 50
                        ? "bg-status-warning/20 text-status-warning"
                        : "bg-surface-3 text-muted"
                  }`}
                >
                  {powerLevelLabel(member.powerLevel)}
                </span>

                {!isMe && canKick && (
                  <button
                    onClick={() => handleKick(member.userId)}
                    title="Remove"
                    className="p-1 text-muted hover:text-status-warning rounded transition-colors opacity-0 group-hover:opacity-100"
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
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---- Rooms Tab ------------------------------------------------------------

function RoomsTab({
  space,
  client,
  isAdmin,
}: {
  space: Room;
  client: MatrixClient;
  isAdmin: boolean;
}): React.JSX.Element {
  const { eventStore } = useMatrix();
  const [error, setError] = useState("");
  const [removingRoomId, setRemovingRoomId] = useState<string | null>(null);
  const [addRoomId, setAddRoomId] = useState("");
  const [adding, setAdding] = useState(false);
  const [togglingRoomId, setTogglingRoomId] = useState<string | null>(null);

  useSyncExternalStore(eventStore.subscribe, eventStore.getVersion);

  // Get child rooms from space state
  const childRooms = useMemo(() => {
    const spaceChildren = space.currentState.getStateEvents("m.space.child");
    const result: Array<{ roomId: string; name: string; isSpace: boolean; suggested: boolean }> =
      [];

    if (spaceChildren) {
      for (const child of spaceChildren) {
        const stateKey = child.getStateKey();
        const content = child.getContent();
        // Skip if the child event has been cleared (empty content = removed)
        if (!stateKey || !content || Object.keys(content).length === 0) continue;

        const room = client.getRoom(stateKey);
        const roomName = room?.name ?? stateKey;

        // Check if the child is itself a space
        let isChildSpace = false;
        if (room) {
          const createEvent = room.currentState.getStateEvents("m.room.create", "");
          isChildSpace = createEvent?.getContent()?.type === "m.space";
        }

        const suggested = content.suggested === true;

        result.push({ roomId: stateKey, name: roomName, isSpace: isChildSpace, suggested });
      }
    }

    // Sort: recommended rooms first, then alphabetically
    return result.sort((a, b) => {
      if (a.suggested !== b.suggested) return a.suggested ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [space, client]);

  const handleRemoveRoom = async (roomId: string): Promise<void> => {
    setRemovingRoomId(roomId);
    setError("");
    try {
      // Send empty m.space.child state event to remove from space
      await client.sendStateEvent(
        space.roomId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "m.space.child" as any,
        {},
        roomId,
      );
      // Also clear the parent reference on the room
      try {
        await client.sendStateEvent(
          roomId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "m.space.parent" as any,
          {},
          space.roomId,
        );
      } catch {
        // Not critical if we can't clear the parent ref
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove room from space");
    } finally {
      setRemovingRoomId(null);
    }
  };

  const handleToggleRecommended = async (
    roomId: string,
    currentSuggested: boolean,
  ): Promise<void> => {
    setTogglingRoomId(roomId);
    setError("");
    try {
      const childEvent = space.currentState.getStateEvents("m.space.child", roomId);
      const existingContent = childEvent?.getContent() ?? {};
      await client.sendStateEvent(
        space.roomId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "m.space.child" as any,
        { ...existingContent, suggested: !currentSuggested },
        roomId,
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update recommended status");
    } finally {
      setTogglingRoomId(null);
    }
  };

  const handleAddRoom = async (): Promise<void> => {
    const trimmed = addRoomId.trim();
    if (!trimmed) return;
    setAdding(true);
    setError("");
    try {
      const domain = client.getDomain() ?? "matrix.org";
      await client.sendStateEvent(
        space.roomId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "m.space.child" as any,
        { via: [domain] },
        trimmed,
      );
      await client.sendStateEvent(
        trimmed,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "m.space.parent" as any,
        { canonical: true, via: [domain] },
        space.roomId,
      );
      setAddRoomId("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add room to space");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Add room */}
      {isAdmin && (
        <div>
          <label className="block text-xs font-medium text-secondary mb-1.5">
            Add room to space
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={addRoomId}
              onChange={(e) => setAddRoomId(e.target.value)}
              placeholder="!room_id:server.com"
              className="flex-1 px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
            />
            <button
              onClick={handleAddRoom}
              disabled={adding || !addRoomId.trim()}
              className="px-3 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-xs font-medium rounded-lg transition-colors"
            >
              {adding ? "..." : "Add"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-status-error">{error}</p>}

      {/* Room list */}
      <div>
        <p className="text-xs font-medium text-secondary mb-2">Rooms ({childRooms.length})</p>
        <div className="space-y-1">
          {childRooms.map((child) => (
            <div
              key={child.roomId}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-2 transition-colors group"
            >
              <span className="text-muted text-sm flex-shrink-0">
                {child.isSpace ? (
                  <svg
                    className="w-4 h-4"
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
                ) : (
                  "#"
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-primary truncate">{child.name}</p>
                  {child.suggested && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 bg-status-success/20 text-status-success rounded flex-shrink-0"
                      title="Recommended"
                    >
                      Recommended
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted truncate font-mono">{child.roomId}</p>
              </div>
              {child.isSpace && (
                <span className="text-[10px] px-1.5 py-0.5 bg-surface-3 text-muted rounded flex-shrink-0">
                  Space
                </span>
              )}
              {isAdmin && !child.isSpace && (
                <button
                  onClick={() => handleToggleRecommended(child.roomId, child.suggested)}
                  disabled={togglingRoomId === child.roomId}
                  title={child.suggested ? "Remove recommendation" : "Mark as recommended"}
                  className={`p-1 rounded transition-colors flex-shrink-0 disabled:opacity-50 ${
                    child.suggested
                      ? "text-status-success hover:text-muted"
                      : "text-muted hover:text-status-success opacity-0 group-hover:opacity-100"
                  }`}
                >
                  {togglingRoomId === child.roomId ? (
                    <div className="w-3.5 h-3.5 border border-surface-4 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg
                      className="w-3.5 h-3.5"
                      fill={child.suggested ? "currentColor" : "none"}
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                      />
                    </svg>
                  )}
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => handleRemoveRoom(child.roomId)}
                  disabled={removingRoomId === child.roomId}
                  title="Remove from space"
                  className="p-1 text-muted hover:text-status-error rounded transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                >
                  {removingRoomId === child.roomId ? (
                    <div className="w-3.5 h-3.5 border border-surface-4 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          ))}
          {childRooms.length === 0 && (
            <p className="text-sm text-muted text-center py-4">No rooms in this space</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Advanced Tab ---------------------------------------------------------

function AdvancedTab({
  room,
  onLeaveSpace,
}: {
  room: Room;
  onLeaveSpace: () => void;
}): React.JSX.Element {
  const [confirmLeave, setConfirmLeave] = useState(false);

  const createEvent = room.currentState.getStateEvents(EventType.RoomCreate, "");
  const roomVersion = (createEvent?.getContent()?.room_version as string | undefined) ?? "\u2014";
  const createdBy = createEvent?.getSender() ?? "\u2014";

  const copySpaceId = (): void => {
    navigator.clipboard.writeText(room.roomId).catch(() => {
      /* clipboard not available */
    });
  };

  return (
    <div className="space-y-5">
      {/* Space ID */}
      <div>
        <label className="block text-xs font-medium text-secondary mb-1.5">Space ID</label>
        <div className="flex items-center gap-2">
          <code className="text-xs text-secondary font-mono bg-surface-2 px-2 py-1 rounded break-all flex-1">
            {room.roomId}
          </code>
          <button
            onClick={copySpaceId}
            title="Copy Space ID"
            className="p-1.5 text-muted hover:text-secondary hover:bg-surface-3 rounded transition-colors flex-shrink-0"
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
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Room version */}
      <div>
        <label className="block text-xs font-medium text-secondary mb-1.5">Room version</label>
        <p className="text-sm text-secondary">{roomVersion}</p>
      </div>

      {/* Created by */}
      <div>
        <label className="block text-xs font-medium text-secondary mb-1.5">Created by</label>
        <p className="text-sm text-secondary font-mono">{createdBy}</p>
      </div>

      {/* Leave space */}
      <div className="pt-4 border-t border-border">
        {!confirmLeave ? (
          <button
            onClick={() => setConfirmLeave(true)}
            className="w-full px-4 py-2 bg-status-error/10 hover:bg-status-error/20 text-status-error text-sm font-medium rounded-lg transition-colors"
          >
            Leave space
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-secondary">Are you sure you want to leave this space?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmLeave(false)}
                className="flex-1 px-3 py-2 text-sm text-secondary hover:text-primary bg-surface-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onLeaveSpace}
                className="flex-1 px-3 py-2 text-sm font-medium text-primary bg-status-error hover:bg-status-error/80 rounded-lg transition-colors"
              >
                Leave
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SpaceSettingsPanel({
  spaceId,
  onClose,
  onLeaveSpace,
}: SpaceSettingsPanelProps): React.JSX.Element | null {
  const { client, eventStore } = useMatrix();
  const [activeTab, setActiveTab] = useState<Tab>("general");

  useSyncExternalStore(eventStore.subscribe, eventStore.getVersion);

  const room = useRoom(client, spaceId);

  const myUserId = client.getSafeUserId();
  const myMember = room?.getMember(myUserId) ?? null;
  const myPowerLevel = myMember?.powerLevel ?? 0;

  const plEvent = room?.currentState.getStateEvents(EventType.RoomPowerLevels, "");
  const plContent = plEvent?.getContent() as { state_default?: number } | undefined;
  const stateDefault = plContent?.state_default ?? 50;
  const isAdmin = canDo(myPowerLevel, stateDefault);

  const handleTabChange = useCallback((tab: Tab) => setActiveTab(tab), []);

  if (!room) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="w-full max-w-lg bg-surface-1 border border-border rounded-xl p-6 text-center">
          <p className="text-sm text-muted">Space not found</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] bg-surface-1 border border-border rounded-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b border-border flex-shrink-0">
          <h3 className="text-sm font-semibold text-primary">Space Settings</h3>
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

        {/* Tab bar */}
        <div className="flex gap-1 px-6 py-2 border-b border-border flex-shrink-0">
          <TabButton
            active={activeTab === "general"}
            label="General"
            onClick={() => handleTabChange("general")}
          />
          <TabButton
            active={activeTab === "members"}
            label="Members"
            onClick={() => handleTabChange("members")}
          />
          <TabButton
            active={activeTab === "rooms"}
            label="Rooms"
            onClick={() => handleTabChange("rooms")}
          />
          <TabButton
            active={activeTab === "advanced"}
            label="Advanced"
            onClick={() => handleTabChange("advanced")}
          />
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab === "general" && <GeneralTab room={room} client={client} isAdmin={isAdmin} />}
          {activeTab === "members" && (
            <MembersTab room={room} client={client} myPowerLevel={myPowerLevel} />
          )}
          {activeTab === "rooms" && <RoomsTab space={room} client={client} isAdmin={isAdmin} />}
          {activeTab === "advanced" && <AdvancedTab room={room} onLeaveSpace={onLeaveSpace} />}
        </div>
      </div>
    </div>
  );
}
