import * as sdk from "matrix-js-sdk";
import React, { useState } from "react";
import { useMatrix } from "~/lib/matrix-context";
import { createVideoRoom } from "~/lib/video-room";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateChannelModalProps {
  spaceId: string | null;
  onClose: () => void;
  onCreated: (roomId: string) => void;
}

export type RoomType = "normal" | "video";

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Build the creation_content object for createRoom. */
export function buildCreationContent(
  federate: boolean,
  roomType: RoomType,
): Record<string, unknown> | undefined {
  const content: Record<string, unknown> = {};

  if (!federate) {
    content["m.federate"] = false;
  }

  if (roomType === "video") {
    content.type = "m.video_room";
  }

  return Object.keys(content).length > 0 ? content : undefined;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateChannelModal({
  spaceId,
  onClose,
  onCreated,
}: CreateChannelModalProps): React.ReactElement {
  const { client } = useMatrix();
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [enableEncryption, setEnableEncryption] = useState(true);
  const [aliasName, setAliasName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [federate, setFederate] = useState(true);
  const [roomType, setRoomType] = useState<RoomType>("normal");

  const domain = client.getDomain() ?? "matrix.org";

  const handleVisibilityChange = (pub: boolean): void => {
    setIsPublic(pub);
    // Default encryption: on for private, off for public
    setEnableEncryption(!pub);
  };

  const handleCreate = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");

    try {
      // Video room: use dedicated helper
      if (roomType === "video") {
        const roomId = await createVideoRoom(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          client as any,
          trimmed,
          spaceId ?? undefined,
        );
        onCreated(roomId);
        return;
      }

      // Normal room creation
      const initialState: Array<{ type: string; content: Record<string, unknown> }> = [
        {
          type: "m.room.history_visibility",
          content: { history_visibility: isPublic ? "world_readable" : "shared" },
        },
      ];

      if (enableEncryption) {
        initialState.push({
          type: "m.room.encryption",
          content: { algorithm: "m.megolm.v1.aes-sha2" },
        });
      }

      const creationContent = buildCreationContent(federate, roomType);

      const roomOptions: sdk.ICreateRoomOpts = {
        name: trimmed,
        visibility: isPublic ? sdk.Visibility.Public : sdk.Visibility.Private,
        preset: isPublic ? sdk.Preset.PublicChat : sdk.Preset.PrivateChat,
        topic: topic.trim() || undefined,
        room_alias_name: isPublic ? aliasName.trim() || undefined : undefined,
        initial_state: initialState,
        creation_content: creationContent,
      };

      const result = await client.createRoom(roomOptions);

      // If inside a space, add the room as a Space child
      if (spaceId) {
        await client.sendStateEvent(
          spaceId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "m.space.child" as any,
          { via: [domain] },
          result.room_id,
        );
        // Also set the parent on the room
        await client.sendStateEvent(
          result.room_id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "m.space.parent" as any,
          { canonical: true, via: [domain] },
          spaceId,
        );
      }

      onCreated(result.room_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create channel");
    } finally {
      setLoading(false);
    }
  };

  const spaceName = spaceId ? client.getRoom(spaceId)?.name : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-surface-1 border border-border rounded-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-primary mb-1">Create a channel</h2>
        <p className="text-sm text-secondary mb-5">
          {spaceName ? `Add a new channel to ${spaceName}.` : "Create a new channel."}
        </p>

        <form onSubmit={handleCreate} className="space-y-4">
          {/* Channel name */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Channel name</label>
            <div className="flex items-center gap-1 px-3 py-2 bg-surface-2 border border-border rounded-lg focus-within:border-accent">
              <span className="text-muted text-sm">#</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                className="flex-1 bg-transparent text-sm text-primary placeholder-muted focus:outline-none"
                placeholder="general"
                autoFocus
                required
              />
            </div>
          </div>

          {/* Topic */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">
              Topic <span className="text-faint">(optional)</span>
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent resize-none"
              placeholder="What is this channel about?"
            />
          </div>

          {/* Room type selector */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Room type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRoomType("normal")}
                className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                  roomType === "normal"
                    ? "bg-accent/10 border-accent text-inverse"
                    : "bg-surface-2 border-border text-secondary hover:border-surface-4"
                }`}
              >
                <svg
                  className="w-4 h-4 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                  />
                </svg>
                <div className="text-left">
                  <div className="font-medium">Normal</div>
                  <div className="text-[10px] text-muted">Text channel</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setRoomType("video")}
                className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                  roomType === "video"
                    ? "bg-accent/10 border-accent text-inverse"
                    : "bg-surface-2 border-border text-secondary hover:border-surface-4"
                }`}
              >
                <svg
                  className="w-4 h-4 flex-shrink-0"
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
                <div className="text-left">
                  <div className="font-medium">Video Room</div>
                  <div className="text-[10px] text-muted">Persistent call</div>
                </div>
              </button>
            </div>
          </div>

          {/* Visibility (hidden for video rooms — they are always private) */}
          {roomType === "normal" && (
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">Visibility</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleVisibilityChange(false)}
                  className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                    !isPublic
                      ? "bg-accent/10 border-accent text-inverse"
                      : "bg-surface-2 border-border text-secondary hover:border-surface-4"
                  }`}
                >
                  <svg
                    className="w-4 h-4 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  <div className="text-left">
                    <div className="font-medium">Private</div>
                    <div className="text-[10px] text-muted">Invite only</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleVisibilityChange(true)}
                  className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                    isPublic
                      ? "bg-accent/10 border-accent text-inverse"
                      : "bg-surface-2 border-border text-secondary hover:border-surface-4"
                  }`}
                >
                  <svg
                    className="w-4 h-4 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div className="text-left">
                    <div className="font-medium">Public</div>
                    <div className="text-[10px] text-muted">Anyone can join</div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Encryption checkbox (shown for private normal rooms) */}
          {roomType === "normal" && !isPublic && (
            <div>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={enableEncryption}
                  onChange={(e) => setEnableEncryption(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-4 h-4 rounded border border-border bg-surface-2 flex items-center justify-center peer-checked:bg-accent peer-checked:border-accent transition-colors">
                  {enableEncryption && (
                    <svg
                      className="w-3 h-3 text-primary"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <svg
                  className="w-4 h-4 text-muted group-hover:text-secondary transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                <span className="text-sm text-secondary group-hover:text-primary transition-colors">
                  Enable encryption
                </span>
              </label>
              <p className="text-[10px] text-faint mt-1 ml-6">
                Once enabled, encryption cannot be disabled.
              </p>
            </div>
          )}

          {/* Federation toggle */}
          {roomType === "normal" && (
            <div>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={federate}
                  onChange={(e) => setFederate(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-4 h-4 rounded border border-border bg-surface-2 flex items-center justify-center peer-checked:bg-accent peer-checked:border-accent transition-colors">
                  {federate && (
                    <svg
                      className="w-3 h-3 text-primary"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <svg
                  className="w-4 h-4 text-muted group-hover:text-secondary transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-sm text-secondary group-hover:text-primary transition-colors">
                  Allow room to federate
                </span>
              </label>
              <p className="text-[10px] text-faint mt-1 ml-6">
                When disabled, the room will only be accessible on this homeserver.
              </p>
            </div>
          )}

          {/* Room alias (shown for public normal rooms) */}
          {roomType === "normal" && isPublic && (
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">
                Room address <span className="text-faint">(optional)</span>
              </label>
              <div className="flex items-center gap-1 px-3 py-2 bg-surface-2 border border-border rounded-lg focus-within:border-accent">
                <span className="text-muted text-sm">#</span>
                <input
                  type="text"
                  value={aliasName}
                  onChange={(e) =>
                    setAliasName(e.target.value.toLowerCase().replace(/[^a-z0-9._=-]/g, ""))
                  }
                  className="flex-1 bg-transparent text-sm text-primary placeholder-muted focus:outline-none"
                  placeholder="my-room"
                />
                <span className="text-muted text-sm">:{domain}</span>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-status-error">{error}</p>}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-secondary hover:text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
            >
              {loading
                ? "Creating..."
                : roomType === "video"
                  ? "Create Video Room"
                  : "Create Channel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
