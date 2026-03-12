import { EventType, HistoryVisibility } from "matrix-js-sdk";
import type { MatrixClient, Room, RoomMember } from "matrix-js-sdk";
import React, { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ExportChatModal } from "./ExportChatModal";
import { PollHistory } from "./PollHistory";
import { PowerLevelEditor } from "./PowerLevelEditor";
import { RoomFilesPanel } from "./RoomFilesPanel";
import { uploadFile } from "~/lib/file-upload";
import { useMatrix } from "~/lib/matrix-context";
import { mxcToHttpUrl } from "~/lib/media";
import type { PresenceStatus } from "~/lib/presence-tracker";
import { generateQRCodeSVG, makeMatrixRoomQRData } from "~/lib/qr-code";
import { getAvailableRoomVersions, getCurrentRoomVersion, upgradeRoom } from "~/lib/room-upgrade";
import {
  parseServerAcl,
  parseServerList,
  serializeServerList,
  validateServerAcl,
  buildServerAclContent,
} from "~/lib/server-acl";
import type { ServerAclContent } from "~/lib/server-acl";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoomSettingsPanelProps {
  roomId: string;
  onClose: () => void;
  onLeaveRoom: () => void;
  onNavigateRoom?: (roomId: string) => void;
}

type Tab = "general" | "members" | "permissions" | "files" | "polls" | "advanced";

type JoinRule = "invite" | "public" | "knock" | "restricted";
type GuestAccess = "can_join" | "forbidden";

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Label for a power level value. */
export function powerLevelLabel(level: number): string {
  if (level >= 100) return "Admin";
  if (level >= 50) return "Moderator";
  if (level < 0) return "Muted";
  return "Default";
}

/** Whether a user is muted (negative power level). */
export function isMuted(powerLevel: number): boolean {
  return powerLevel < 0;
}

const PRESENCE_SORT_ORDER: Record<PresenceStatus, number> = {
  online: 0,
  unavailable: 1,
  offline: 2,
};

/**
 * Sort members: highest power level first, then by presence (online first),
 * then alphabetically by name.
 *
 * When no `getPresence` resolver is provided, presence is ignored (legacy behaviour).
 */
export function sortMembers(
  members: readonly RoomMember[],
  getPresence?: (userId: string) => PresenceStatus,
): RoomMember[] {
  return [...members].sort((a, b) => {
    if (b.powerLevel !== a.powerLevel) return b.powerLevel - a.powerLevel;
    if (getPresence) {
      const pa = PRESENCE_SORT_ORDER[getPresence(a.userId)];
      const pb = PRESENCE_SORT_ORDER[getPresence(b.userId)];
      if (pa !== pb) return pa - pb;
    }
    return (a.name ?? a.userId).localeCompare(b.name ?? b.userId);
  });
}

/** Whether the given user may perform an action requiring `requiredLevel`. */
export function canDo(myLevel: number, requiredLevel: number): boolean {
  return myLevel >= requiredLevel;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useRoom(client: MatrixClient, roomId: string): Room | null {
  const { eventStore } = useMatrix();
  // Re-render when the event store ticks so that room state changes propagate
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

// ---- URL Preview Toggle ---------------------------------------------------

function UrlPreviewToggle({
  roomId,
  client,
}: {
  roomId: string;
  client: MatrixClient;
}): React.JSX.Element {
  const [disabled, setDisabled] = useState<boolean>(() => {
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const data = (client as any)
        .getRoom(roomId)
        ?.getAccountData?.("org.matrix.room.preview_urls");
      /* eslint-enable @typescript-eslint/no-explicit-any */
      return data?.getContent()?.disabled === true;
    } catch {
      return false;
    }
  });
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    const newVal = !disabled;
    setDisabled(newVal);
    setSaving(true);
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      await (client as any).setRoomAccountData(roomId, "org.matrix.room.preview_urls", {
        disabled: newVal,
      });
      /* eslint-enable @typescript-eslint/no-explicit-any */
    } catch {
      setDisabled(!newVal); // revert on error
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-4 flex items-center justify-between">
      <div>
        <label className="block text-xs font-medium text-secondary">URL Previews</label>
        <p className="text-[10px] text-muted mt-0.5">
          {disabled ? "URL previews are disabled for this room" : "URL previews are enabled"}
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={saving}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          !disabled ? "bg-accent" : "bg-surface-3"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            !disabled ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}

// ---- Publish to Directory Toggle ------------------------------------------

function PublishToDirectoryToggle({
  roomId,
  client,
}: {
  roomId: string;
  client: MatrixClient;
}): React.JSX.Element {
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    let cancelled = false;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (client as any)
      .getRoomDirectoryVisibility(roomId)
      .then((result: { visibility?: string }) => {
        if (!cancelled) {
          setIsPublic(result?.visibility === "public");
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return () => {
      cancelled = true;
    };
  }, [client, roomId]);

  const toggle = async () => {
    const newVal = !isPublic;
    setIsPublic(newVal);
    setSaving(true);
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      await (client as any).setRoomDirectoryVisibility(roomId, newVal ? "public" : "private");
      /* eslint-enable @typescript-eslint/no-explicit-any */
    } catch {
      setIsPublic(!newVal); // revert on error
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mb-4 flex items-center justify-between">
        <div>
          <label className="block text-xs font-medium text-secondary">
            Publish to room directory
          </label>
          <p className="text-[10px] text-muted mt-0.5">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-center justify-between">
      <div>
        <label className="block text-xs font-medium text-secondary">
          Publish to room directory
        </label>
        <p className="text-[10px] text-muted mt-0.5">
          {isPublic ? "Room is listed in the public directory" : "Room is not listed"}
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={saving}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          isPublic ? "bg-accent" : "bg-surface-3"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            isPublic ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}

// ---- QR Code Share Section ------------------------------------------------

function QRCodeShareSection({ roomIdOrAlias }: { roomIdOrAlias: string }): React.JSX.Element {
  const [showQR, setShowQR] = useState(false);
  const qrData = makeMatrixRoomQRData(roomIdOrAlias);
  const svgString = showQR ? generateQRCodeSVG(qrData, 200) : "";

  return (
    <div className="pt-4 border-t border-border">
      <button
        onClick={() => setShowQR(!showQR)}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-surface-2 border border-border hover:bg-surface-3 text-secondary text-sm font-medium rounded-lg transition-colors"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75H16.5v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z"
          />
        </svg>
        {showQR ? "Hide QR Code" : "Share via QR Code"}
      </button>

      {showQR && (
        <div className="mt-3 flex flex-col items-center gap-2">
          <div
            className="bg-white rounded-lg p-3"
            dangerouslySetInnerHTML={{ __html: svgString }}
          />
          <p className="text-xs text-muted text-center">Scan to join this room</p>
          <button
            onClick={() => {
              navigator.clipboard.writeText(qrData).catch(() => {});
            }}
            className="text-xs text-accent hover:text-accent-hover transition-colors"
          >
            Copy link
          </button>
        </div>
      )}
    </div>
  );
}

// ---- General Tab ----------------------------------------------------------

function GeneralTab({
  room,
  client,
  isAdmin,
  onExportChat,
}: {
  room: Room;
  client: MatrixClient;
  isAdmin: boolean;
  onExportChat: () => void;
}): React.JSX.Element {
  const [name, setName] = useState(room.name ?? "");
  const [topic, setTopic] = useState(
    room.currentState.getStateEvents(EventType.RoomTopic, "")?.getContent()?.topic ?? "",
  );
  const [historyVisibility, setHistoryVisibility] = useState<HistoryVisibility>(() => {
    const ev = room.currentState.getStateEvents(EventType.RoomHistoryVisibility, "");
    return (ev?.getContent()?.history_visibility as HistoryVisibility) ?? HistoryVisibility.Shared;
  });

  // --- Security: join rule ---
  const [joinRule, setJoinRule] = useState<JoinRule>(() => {
    const ev = room.currentState.getStateEvents("m.room.join_rules" as EventType, "");
    return (ev?.getContent()?.join_rule as JoinRule) ?? "invite";
  });

  // --- Security: guest access ---
  const [guestAccess, setGuestAccess] = useState<GuestAccess>(() => {
    const ev = room.currentState.getStateEvents("m.room.guest_access" as EventType, "");
    return (ev?.getContent()?.guest_access as GuestAccess) ?? "forbidden";
  });

  // --- Room alias management ---
  const canonicalAliasEvent = room.currentState.getStateEvents(EventType.RoomCanonicalAlias, "");
  const canonicalAliasContent = canonicalAliasEvent?.getContent() as
    | { alias?: string; alt_aliases?: string[] }
    | undefined;
  const [canonicalAlias, setCanonicalAlias] = useState(canonicalAliasContent?.alias ?? "");
  const [altAliases, setAltAliases] = useState<string[]>(canonicalAliasContent?.alt_aliases ?? []);
  const [newAlias, setNewAlias] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const roomAlias = canonicalAliasContent?.alias ?? null;

  const avatarMxc = room.getMxcAvatarUrl();
  const avatarUrl = avatarMxc ? mxcToHttpUrl(avatarMxc, client.getHomeserverUrl(), 80, 80) : null;

  const currentJoinRule = (() => {
    const ev = room.currentState.getStateEvents("m.room.join_rules" as EventType, "");
    return (ev?.getContent()?.join_rule as JoinRule) ?? "invite";
  })();

  const currentGuestAccess = (() => {
    const ev = room.currentState.getStateEvents("m.room.guest_access" as EventType, "");
    return (ev?.getContent()?.guest_access as GuestAccess) ?? "forbidden";
  })();

  const currentCanonicalAlias = canonicalAliasContent?.alias ?? "";
  const currentAltAliases = canonicalAliasContent?.alt_aliases ?? [];

  const dirty =
    name !== (room.name ?? "") ||
    topic !==
      (room.currentState.getStateEvents(EventType.RoomTopic, "")?.getContent()?.topic ?? "") ||
    historyVisibility !==
      ((room.currentState.getStateEvents(EventType.RoomHistoryVisibility, "")?.getContent()
        ?.history_visibility as HistoryVisibility | undefined) ?? HistoryVisibility.Shared) ||
    joinRule !== currentJoinRule ||
    guestAccess !== currentGuestAccess ||
    canonicalAlias !== currentCanonicalAlias ||
    JSON.stringify(altAliases) !== JSON.stringify(currentAltAliases);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const currentName = room.name ?? "";
      const currentTopic =
        room.currentState.getStateEvents(EventType.RoomTopic, "")?.getContent()?.topic ?? "";
      const currentVis =
        (room.currentState.getStateEvents(EventType.RoomHistoryVisibility, "")?.getContent()
          ?.history_visibility as HistoryVisibility | undefined) ?? HistoryVisibility.Shared;

      if (name !== currentName) {
        await client.setRoomName(room.roomId, name);
      }
      if (topic !== currentTopic) {
        await client.setRoomTopic(room.roomId, topic);
      }
      if (historyVisibility !== currentVis) {
        await client.sendStateEvent(room.roomId, EventType.RoomHistoryVisibility, {
          history_visibility: historyVisibility,
        });
      }
      if (joinRule !== currentJoinRule) {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        await (client as any).sendStateEvent(room.roomId, "m.room.join_rules", {
          join_rule: joinRule,
        });
        /* eslint-enable @typescript-eslint/no-explicit-any */
      }
      if (guestAccess !== currentGuestAccess) {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        await (client as any).sendStateEvent(room.roomId, "m.room.guest_access", {
          guest_access: guestAccess,
        });
        /* eslint-enable @typescript-eslint/no-explicit-any */
      }
      if (
        canonicalAlias !== currentCanonicalAlias ||
        JSON.stringify(altAliases) !== JSON.stringify(currentAltAliases)
      ) {
        await client.sendStateEvent(room.roomId, EventType.RoomCanonicalAlias, {
          alias: canonicalAlias || undefined,
          alt_aliases: altAliases.length > 0 ? altAliases : undefined,
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleAddAlias = () => {
    const trimmed = newAlias.trim();
    if (trimmed && !altAliases.includes(trimmed)) {
      setAltAliases([...altAliases, trimmed]);
      setNewAlias("");
    }
  };

  const handleRemoveAlias = (alias: string) => {
    setAltAliases(altAliases.filter((a) => a !== alias));
  };

  return (
    <div className="space-y-5">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-xl bg-surface-3 flex items-center justify-center overflow-hidden flex-shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Room avatar" className="w-full h-full object-cover" />
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

      {/* Room name */}
      <div>
        <label className="block text-xs font-medium text-secondary mb-1.5">Room name</label>
        {isAdmin ? (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
          />
        ) : (
          <p className="text-sm text-secondary">{name || "—"}</p>
        )}
      </div>

      {/* Room topic */}
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

      {/* History visibility */}
      <div>
        <label className="block text-xs font-medium text-secondary mb-1.5">
          History visibility
        </label>
        {isAdmin ? (
          <select
            value={historyVisibility}
            onChange={(e) => setHistoryVisibility(e.target.value as HistoryVisibility)}
            className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary focus:outline-none focus:border-accent"
          >
            <option value={HistoryVisibility.Shared}>Shared (since joining)</option>
            <option value={HistoryVisibility.Invited}>Invited (since invitation)</option>
            <option value={HistoryVisibility.Joined}>Joined (only while joined)</option>
            <option value={HistoryVisibility.WorldReadable}>World readable (public)</option>
          </select>
        ) : (
          <p className="text-sm text-secondary capitalize">{historyVisibility.replace("_", " ")}</p>
        )}
      </div>

      {/* ---- Security Section ---- */}
      <div className="pt-4 border-t border-border">
        <h4 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">
          Security
        </h4>

        {/* Join Rule */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-secondary mb-2">Join rule</label>
          {isAdmin ? (
            <div className="space-y-1.5">
              {(
                [
                  { value: "invite" as JoinRule, label: "Private (invite only)" },
                  { value: "public" as JoinRule, label: "Public (anyone can join)" },
                  { value: "knock" as JoinRule, label: "Ask to join (knock)" },
                  { value: "restricted" as JoinRule, label: "Space members" },
                ] as const
              ).map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer group/jr">
                  <input
                    type="radio"
                    name="join-rule"
                    value={opt.value}
                    checked={joinRule === opt.value}
                    onChange={() => setJoinRule(opt.value)}
                    className="accent-accent"
                  />
                  <span className="text-xs text-secondary group-hover/jr:text-primary transition-colors">
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-secondary capitalize">{joinRule.replace("_", " ")}</p>
          )}
        </div>

        {/* Guest Access */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-secondary mb-2">Guest access</label>
          {isAdmin ? (
            <button
              onClick={() =>
                setGuestAccess((prev) => (prev === "can_join" ? "forbidden" : "can_join"))
              }
              className={`relative w-10 h-5 rounded-full transition-colors ${
                guestAccess === "can_join" ? "bg-accent" : "bg-surface-3"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  guestAccess === "can_join" ? "translate-x-5" : ""
                }`}
              />
            </button>
          ) : (
            <p className="text-sm text-secondary">
              {guestAccess === "can_join" ? "Allowed" : "Forbidden"}
            </p>
          )}
          <p className="text-[10px] text-muted mt-1">
            {guestAccess === "can_join" ? "Guests can join this room" : "Guests cannot join"}
          </p>
        </div>

        {/* Room Alias Management */}
        <div>
          <label className="block text-xs font-medium text-secondary mb-1.5">Room aliases</label>
          {roomAlias && (
            <div className="mb-2">
              <span className="text-[10px] text-muted uppercase tracking-wider">Canonical</span>
              {isAdmin ? (
                <input
                  type="text"
                  value={canonicalAlias}
                  onChange={(e) => setCanonicalAlias(e.target.value)}
                  placeholder="#alias:server.com"
                  className="w-full px-2 py-1.5 bg-surface-2 border border-border rounded text-xs text-primary font-mono placeholder-muted focus:outline-none focus:border-accent mt-0.5"
                />
              ) : (
                <p className="text-xs text-secondary font-mono">{roomAlias}</p>
              )}
            </div>
          )}
          {!roomAlias && isAdmin && (
            <div className="mb-2">
              <span className="text-[10px] text-muted uppercase tracking-wider">Canonical</span>
              <input
                type="text"
                value={canonicalAlias}
                onChange={(e) => setCanonicalAlias(e.target.value)}
                placeholder="#alias:server.com"
                className="w-full px-2 py-1.5 bg-surface-2 border border-border rounded text-xs text-primary font-mono placeholder-muted focus:outline-none focus:border-accent mt-0.5"
              />
            </div>
          )}

          {/* Alt aliases */}
          {altAliases.length > 0 && (
            <div className="space-y-1 mb-2">
              <span className="text-[10px] text-muted uppercase tracking-wider">Aliases</span>
              {altAliases.map((alias) => (
                <div key={alias} className="flex items-center gap-1">
                  <code className="text-xs text-secondary font-mono flex-1 truncate">{alias}</code>
                  {isAdmin && (
                    <button
                      onClick={() => handleRemoveAlias(alias)}
                      className="p-0.5 text-muted hover:text-status-error transition-colors"
                      title="Remove alias"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {isAdmin && (
            <div className="flex gap-1.5">
              <input
                type="text"
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                placeholder="#new-alias:server.com"
                className="flex-1 px-2 py-1 bg-surface-2 border border-border rounded text-xs text-primary font-mono placeholder-muted focus:outline-none focus:border-accent"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddAlias();
                }}
              />
              <button
                onClick={handleAddAlias}
                disabled={!newAlias.trim()}
                className="px-2 py-1 bg-surface-2 border border-border text-xs text-secondary rounded hover:bg-surface-3 transition-colors disabled:opacity-50"
              >
                Add
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ---- Preferences Section ---- */}
      <div className="pt-4 border-t border-border">
        <h4 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">
          Preferences
        </h4>

        {/* URL Previews Toggle */}
        <UrlPreviewToggle roomId={room.roomId} client={client} />

        {/* Publish to Room Directory Toggle */}
        {isAdmin && <PublishToDirectoryToggle roomId={room.roomId} client={client} />}
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

      {/* Export Chat */}
      <div className="pt-4 border-t border-border">
        <button
          onClick={onExportChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-surface-2 border border-border hover:bg-surface-3 text-secondary text-sm font-medium rounded-lg transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
          Export Chat
        </button>
      </div>

      {/* QR Code Sharing */}
      <QRCodeShareSection roomIdOrAlias={room.getCanonicalAlias() ?? room.roomId} />
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

  // Re-render when presence changes
  useSyncExternalStore(presenceTracker.subscribe, presenceTracker.getVersion);

  const plEvent = room.currentState.getStateEvents(EventType.RoomPowerLevels, "");
  const plContent = plEvent?.getContent() as
    | { kick?: number; ban?: number; state_default?: number }
    | undefined;
  const kickLevel = plContent?.kick ?? 50;
  const banLevel = plContent?.ban ?? 50;

  const getPresenceStatus = useCallback(
    (userId: string): PresenceStatus => presenceTracker.getPresence(userId).status,
    [presenceTracker],
  );

  const joinedMembers = useMemo(
    () => sortMembers(room.getJoinedMembers(), getPresenceStatus),
    [room, getPresenceStatus],
  );

  const bannedMembers = useMemo(() => room.getMembersWithMembership("ban"), [room]);

  const isAdmin = myPowerLevel >= 100;

  const handleInvite = async () => {
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

  const handleKick = async (userId: string) => {
    try {
      await client.kick(room.roomId, userId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to kick user");
    }
  };

  const handleBan = async (userId: string) => {
    try {
      await client.ban(room.roomId, userId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to ban user");
    }
  };

  const handleUnban = async (userId: string) => {
    try {
      await client.unban(room.roomId, userId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to unban user");
    }
  };

  const handlePowerLevelChange = async (userId: string, level: number) => {
    try {
      await client.setPowerLevel(room.roomId, userId, level);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to change power level");
    }
  };

  const handleMuteToggle = async (userId: string, currentlyMuted: boolean) => {
    try {
      const newLevel = currentlyMuted ? 0 : -1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (client as any).setPowerLevel(room.roomId, userId, newLevel);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to toggle mute");
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
            const avatarUrl = avatarMxc
              ? mxcToHttpUrl(avatarMxc, client.getHomeserverUrl(), 32, 32)
              : null;
            const isMe = member.userId === client.getSafeUserId();
            const canKick = canDo(myPowerLevel, kickLevel) && member.powerLevel < myPowerLevel;
            const canBan = canDo(myPowerLevel, banLevel) && member.powerLevel < myPowerLevel;
            const canMute = !isMe && myPowerLevel > member.powerLevel && myPowerLevel >= 0;
            const memberIsMuted = isMuted(member.powerLevel);
            const presence = presenceTracker.getPresence(member.userId);
            const presenceDotColor =
              presence.status === "online"
                ? "bg-status-success"
                : presence.status === "unavailable"
                  ? "bg-status-warning"
                  : "bg-surface-4";
            const presenceLabel =
              presence.status === "online"
                ? "Online"
                : presence.status === "unavailable"
                  ? "Away"
                  : "Offline";

            return (
              <div
                key={member.userId}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-2 transition-colors group"
              >
                {/* Avatar with presence dot */}
                <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-medium text-secondary">
                      {(member.name ?? member.userId).charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span
                    className={`absolute bottom-0 right-0 w-2 h-2 rounded-full ${presenceDotColor} border border-surface-1`}
                  />
                </div>

                {/* Name + user ID + presence label */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-primary truncate">{member.name ?? member.userId}</p>
                    <span
                      className={`text-[10px] ${presence.status === "online" ? "text-status-success" : presence.status === "unavailable" ? "text-status-warning" : "text-muted"}`}
                    >
                      {presenceLabel}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted truncate">{member.userId}</p>
                </div>

                {/* Power level badge */}
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    member.powerLevel >= 100
                      ? "bg-accent/20 text-accent"
                      : member.powerLevel >= 50
                        ? "bg-status-warning/20 text-status-warning"
                        : member.powerLevel < 0
                          ? "bg-status-error/20 text-status-error"
                          : "bg-surface-3 text-muted"
                  }`}
                >
                  {powerLevelLabel(member.powerLevel)}
                </span>

                {/* Admin power level dropdown */}
                {isAdmin && !isMe && (
                  <select
                    value={member.powerLevel}
                    onChange={(e) => handlePowerLevelChange(member.userId, Number(e.target.value))}
                    className="text-[10px] bg-surface-2 border border-border rounded px-1 py-0.5 text-secondary opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none"
                  >
                    <option value={-1}>Muted (-1)</option>
                    <option value={0}>Default (0)</option>
                    <option value={50}>Moderator (50)</option>
                    <option value={100}>Admin (100)</option>
                  </select>
                )}

                {/* Mute / Unmute */}
                {canMute && (
                  <button
                    onClick={() => handleMuteToggle(member.userId, memberIsMuted)}
                    title={memberIsMuted ? "Unmute" : "Mute"}
                    className={`p-1 rounded transition-colors opacity-0 group-hover:opacity-100 ${
                      memberIsMuted
                        ? "text-status-error hover:text-status-warning"
                        : "text-muted hover:text-status-error"
                    }`}
                  >
                    {memberIsMuted ? (
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
                          d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-1.536a5 5 0 010-7.072M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    ) : (
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
                          d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                        />
                      </svg>
                    )}
                  </button>
                )}

                {/* Kick / Ban */}
                {!isMe && (canKick || canBan) && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {canKick && (
                      <button
                        onClick={() => handleKick(member.userId)}
                        title="Kick"
                        className="p-1 text-muted hover:text-status-warning rounded transition-colors"
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
                    {canBan && (
                      <button
                        onClick={() => handleBan(member.userId)}
                        title="Ban"
                        className="p-1 text-muted hover:text-status-error rounded transition-colors"
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
                            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Banned members */}
      {bannedMembers.length > 0 && canDo(myPowerLevel, banLevel) && (
        <div>
          <p className="text-xs font-medium text-secondary mb-2">Banned ({bannedMembers.length})</p>
          <div className="space-y-1">
            {bannedMembers.map((member) => (
              <div
                key={member.userId}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-2 transition-colors"
              >
                <span className="text-xs text-secondary truncate flex-1">{member.userId}</span>
                <button
                  onClick={() => handleUnban(member.userId)}
                  className="text-[10px] text-status-info hover:underline"
                >
                  Unban
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Server ACL Section ---------------------------------------------------

function ServerAclSection({
  room,
  client,
}: {
  room: Room;
  client: MatrixClient;
}): React.JSX.Element {
  const aclEvent = room.currentState.getStateEvents("m.room.server_acl" as EventType, "");
  const currentAcl = parseServerAcl(aclEvent?.getContent() as Record<string, unknown> | undefined);

  const [allowText, setAllowText] = useState(() => serializeServerList(currentAcl.allow));
  const [denyText, setDenyText] = useState(() => serializeServerList(currentAcl.deny));
  const [allowIpLiterals, setAllowIpLiterals] = useState(currentAcl.allow_ip_literals);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSave = async (): Promise<void> => {
    setError("");
    setSuccess(false);

    const acl: ServerAclContent = {
      allow: parseServerList(allowText),
      deny: parseServerList(denyText),
      allow_ip_literals: allowIpLiterals,
    };

    const validation = validateServerAcl(acl);
    if (!validation.valid) {
      setError(validation.errors.join("; "));
      return;
    }

    setSaving(true);
    try {
      const content = buildServerAclContent(acl);
      /* eslint-disable @typescript-eslint/no-explicit-any -- matrix-js-sdk sendStateEvent requires `any` for custom event types */
      await client.sendStateEvent(room.roomId, "m.room.server_acl" as any, content as any, "");
      /* eslint-enable @typescript-eslint/no-explicit-any */
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save server ACLs");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pt-4 border-t border-border">
      <h4 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">
        Server ACLs
      </h4>

      {/* Allow list */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-secondary mb-1.5">
          Allow list <span className="text-muted">(one server per line)</span>
        </label>
        <textarea
          value={allowText}
          onChange={(e) => setAllowText(e.target.value)}
          className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent font-mono resize-y"
          rows={3}
          placeholder="*"
        />
      </div>

      {/* Deny list */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-secondary mb-1.5">
          Deny list <span className="text-muted">(one server per line)</span>
        </label>
        <textarea
          value={denyText}
          onChange={(e) => setDenyText(e.target.value)}
          className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent font-mono resize-y"
          rows={3}
          placeholder="evil.example.com"
        />
      </div>

      {/* Allow IP literals toggle */}
      <div className="mb-4 flex items-center justify-between">
        <label className="text-xs font-medium text-secondary">Allow IP literals</label>
        <button
          type="button"
          onClick={() => setAllowIpLiterals((prev) => !prev)}
          className={`relative w-9 h-5 rounded-full transition-colors ${
            allowIpLiterals ? "bg-accent" : "bg-surface-3"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              allowIpLiterals ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Error / success */}
      {error && <p className="text-xs text-status-error mb-2">{error}</p>}
      {success && <p className="text-xs text-status-success mb-2">Server ACLs saved.</p>}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
      >
        {saving ? "Saving..." : "Save Server ACLs"}
      </button>
    </div>
  );
}

// ---- Advanced Tab ---------------------------------------------------------

function AdvancedTab({
  room,
  client,
  isAdmin,
  onLeaveRoom,
  onNavigateRoom,
}: {
  room: Room;
  client: MatrixClient;
  isAdmin: boolean;
  onLeaveRoom: () => void;
  onNavigateRoom?: (roomId: string) => void;
}): React.JSX.Element {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmUpgrade, setConfirmUpgrade] = useState(false);
  const [upgradeVersion, setUpgradeVersion] = useState("");
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState("");

  const createEvent = room.currentState.getStateEvents(EventType.RoomCreate, "");
  const roomVersion = getCurrentRoomVersion(room);
  const roomVersionDisplay = (createEvent?.getContent()?.room_version as string | undefined) ?? "—";
  const createdBy = createEvent?.getSender() ?? "—";
  const encryptionEvent = room.currentState.getStateEvents(EventType.RoomEncryption, "");
  const isEncrypted = encryptionEvent !== null && encryptionEvent !== undefined;

  const availableVersions = getAvailableRoomVersions().filter((v) => v !== roomVersion);

  const copyRoomId = () => {
    navigator.clipboard.writeText(room.roomId).catch(() => {
      /* clipboard not available */
    });
  };

  const handleUpgrade = async () => {
    if (!upgradeVersion) return;
    setUpgrading(true);
    setUpgradeError("");
    try {
      const newRoomId = await upgradeRoom(client, room.roomId, upgradeVersion);
      setConfirmUpgrade(false);
      if (onNavigateRoom) {
        onNavigateRoom(newRoomId);
      }
    } catch (err: unknown) {
      setUpgradeError(err instanceof Error ? err.message : "Failed to upgrade room");
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Room ID */}
      <div>
        <label className="block text-xs font-medium text-secondary mb-1.5">Room ID</label>
        <div className="flex items-center gap-2">
          <code className="text-xs text-secondary font-mono bg-surface-2 px-2 py-1 rounded break-all flex-1">
            {room.roomId}
          </code>
          <button
            onClick={copyRoomId}
            title="Copy Room ID"
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
        <p className="text-sm text-secondary">{roomVersionDisplay}</p>
      </div>

      {/* Encryption */}
      <div>
        <label className="block text-xs font-medium text-secondary mb-1.5">Encryption</label>
        <p className={`text-sm ${isEncrypted ? "text-status-success" : "text-muted"}`}>
          {isEncrypted ? "Enabled" : "Not enabled"}
        </p>
      </div>

      {/* Created by */}
      <div>
        <label className="block text-xs font-medium text-secondary mb-1.5">Created by</label>
        <p className="text-sm text-secondary font-mono">{createdBy}</p>
      </div>

      {/* ---- Room Upgrade ---- */}
      {isAdmin && (
        <div className="pt-4 border-t border-border">
          <h4 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">
            Upgrade Room
          </h4>

          {!confirmUpgrade ? (
            <>
              <div className="mb-3">
                <label className="block text-xs font-medium text-secondary mb-1.5">
                  Target version
                </label>
                <select
                  value={upgradeVersion}
                  onChange={(e) => setUpgradeVersion(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary focus:outline-none focus:border-accent"
                >
                  <option value="">Select version...</option>
                  {availableVersions.map((v) => (
                    <option key={v} value={v}>
                      Version {v}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => setConfirmUpgrade(true)}
                disabled={!upgradeVersion}
                className="w-full px-4 py-2 bg-status-warning/10 hover:bg-status-warning/20 text-status-warning text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                Upgrade room
              </button>
            </>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-status-warning/10 border border-status-warning/30 rounded-lg">
                <p className="text-xs text-status-warning font-medium mb-1">Warning</p>
                <p className="text-xs text-secondary">
                  This will create a new room (version {upgradeVersion}) and archive this one. All
                  members will be invited to the new room automatically.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setConfirmUpgrade(false);
                    setUpgradeError("");
                  }}
                  disabled={upgrading}
                  className="flex-1 px-3 py-2 text-sm text-secondary hover:text-primary bg-surface-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpgrade}
                  disabled={upgrading}
                  className="flex-1 px-3 py-2 text-sm font-medium text-primary bg-status-warning hover:bg-status-warning/80 rounded-lg transition-colors disabled:opacity-50"
                >
                  {upgrading ? "Upgrading..." : "Confirm upgrade"}
                </button>
              </div>
              {upgradeError && <p className="text-xs text-status-error">{upgradeError}</p>}
            </div>
          )}
        </div>
      )}

      {/* ---- Server ACLs (admin-only) ---- */}
      {isAdmin && <ServerAclSection room={room} client={client} />}

      {/* Leave room */}
      <div className="pt-4 border-t border-border">
        {!confirmLeave ? (
          <button
            onClick={() => setConfirmLeave(true)}
            className="w-full px-4 py-2 bg-status-error/10 hover:bg-status-error/20 text-status-error text-sm font-medium rounded-lg transition-colors"
          >
            Leave room
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-secondary">Are you sure you want to leave this room?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmLeave(false)}
                className="flex-1 px-3 py-2 text-sm text-secondary hover:text-primary bg-surface-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onLeaveRoom}
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

export function RoomSettingsPanel({
  roomId,
  onClose,
  onLeaveRoom,
  onNavigateRoom,
}: RoomSettingsPanelProps): React.JSX.Element | null {
  const { client, eventStore } = useMatrix();
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [showExportModal, setShowExportModal] = useState(false);

  // Subscribe to sync updates so state changes re-render
  useSyncExternalStore(eventStore.subscribe, eventStore.getVersion);

  const room = useRoom(client, roomId);

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
      <div className="w-96 flex-shrink-0 border-l border-border flex flex-col bg-surface-0 items-center justify-center">
        <p className="text-sm text-muted">Room not found</p>
      </div>
    );
  }

  return (
    <div className="w-96 flex-shrink-0 border-l border-border flex flex-col bg-surface-0">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
        <h3 className="text-sm font-semibold text-primary">Room Settings</h3>
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
      <div className="flex gap-1 px-4 py-2 border-b border-border flex-shrink-0 overflow-x-auto">
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
        {myPowerLevel >= 100 && (
          <TabButton
            active={activeTab === "permissions"}
            label="Permissions"
            onClick={() => handleTabChange("permissions")}
          />
        )}
        <TabButton
          active={activeTab === "files"}
          label="Files"
          onClick={() => handleTabChange("files")}
        />
        <TabButton
          active={activeTab === "polls"}
          label="Polls"
          onClick={() => handleTabChange("polls")}
        />
        <TabButton
          active={activeTab === "advanced"}
          label="Advanced"
          onClick={() => handleTabChange("advanced")}
        />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {activeTab === "general" && (
          <GeneralTab
            room={room}
            client={client}
            isAdmin={isAdmin}
            onExportChat={() => setShowExportModal(true)}
          />
        )}
        {activeTab === "members" && (
          <MembersTab room={room} client={client} myPowerLevel={myPowerLevel} />
        )}
        {activeTab === "permissions" && myPowerLevel >= 100 && (
          <PowerLevelEditor room={room} client={client} />
        )}
        {activeTab === "files" && (
          <RoomFilesPanel room={room} homeserverUrl={client.getHomeserverUrl()} />
        )}
        {activeTab === "polls" && <PollHistory roomId={roomId} />}
        {activeTab === "advanced" && (
          <AdvancedTab
            room={room}
            client={client}
            isAdmin={isAdmin}
            onLeaveRoom={onLeaveRoom}
            onNavigateRoom={onNavigateRoom}
          />
        )}
      </div>

      {/* Export Chat Modal */}
      {showExportModal && (
        <ExportChatModal
          roomId={roomId}
          roomName={room.name ?? roomId}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}
