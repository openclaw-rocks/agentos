import * as sdk from "matrix-js-sdk";
import React, { useState } from "react";
import { useMatrix } from "~/lib/matrix-context";

interface CreateChannelModalProps {
  spaceId: string | null;
  onClose: () => void;
  onCreated: (roomId: string) => void;
}

export function CreateChannelModal({ spaceId, onClose, onCreated }: CreateChannelModalProps) {
  const { client } = useMatrix();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");

    try {
      const result = await client.createRoom({
        name: trimmed,
        visibility: sdk.Visibility.Private,
        preset: sdk.Preset.PrivateChat,
        initial_state: [
          {
            type: "m.room.history_visibility",
            content: { history_visibility: "shared" },
          },
        ],
      });

      // If inside a space, add the room as a Space child
      if (spaceId) {
        await client.sendStateEvent(
          spaceId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "m.space.child" as any,
          { via: [client.getDomain()!] },
          result.room_id,
        );
        // Also set the parent on the room
        await client.sendStateEvent(
          result.room_id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "m.space.parent" as any,
          { canonical: true, via: [client.getDomain()!] },
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
        <h2 className="text-lg font-bold text-white mb-1">Create a channel</h2>
        <p className="text-sm text-gray-400 mb-5">
          {spaceName ? `Add a new channel to ${spaceName}.` : "Create a new channel."}
        </p>

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Channel name</label>
            <div className="flex items-center gap-1 px-3 py-2 bg-surface-2 border border-border rounded-lg focus-within:border-accent">
              <span className="text-gray-500 text-sm">#</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
                placeholder="general"
                autoFocus
                required
              />
            </div>
          </div>

          {error && <p className="text-sm text-status-error">{error}</p>}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? "Creating..." : "Create Channel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
