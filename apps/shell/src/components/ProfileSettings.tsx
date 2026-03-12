import React, { useState, useRef, useCallback } from "react";
import { useMatrix } from "~/lib/matrix-context";
import { mxcToHttpUrl } from "~/lib/media";

interface ProfileSettingsProps {
  onClose: () => void;
}

export function ProfileSettings({ onClose }: ProfileSettingsProps): React.ReactElement {
  const { client } = useMatrix();
  const userId = client.getUserId() ?? "";
  const homeserverUrl = client.getHomeserverUrl();

  const currentDisplayName = client.getUser(userId)?.displayName ?? userId;
  const currentAvatarMxc = client.getUser(userId)?.avatarUrl;
  const currentStatusMsg = client.getUser(userId)?.presenceStatusMsg ?? "";

  const [displayName, setDisplayName] = useState(currentDisplayName);
  const [statusMsg, setStatusMsg] = useState(currentStatusMsg);
  const [avatarMxc, setAvatarMxc] = useState<string | undefined>(currentAvatarMxc);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const avatarUrl = mxcToHttpUrl(avatarMxc, homeserverUrl, 96, 96);
  const initial = displayName.charAt(0).toUpperCase();

  const handleAvatarUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);
      setError(null);

      try {
        const response = await client.uploadContent(file, { type: file.type });
        const mxcUrl = typeof response === "string" ? response : response.content_uri;
        await client.setAvatarUrl(mxcUrl);
        setAvatarMxc(mxcUrl);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to upload avatar";
        setError(message);
      } finally {
        setUploading(false);
      }
    },
    [client],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      if (displayName !== currentDisplayName) {
        await client.setDisplayName(displayName);
      }
      if (statusMsg !== currentStatusMsg) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (client as any).setPresence({ presence: "online", status_msg: statusMsg });
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save profile";
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [client, displayName, currentDisplayName, statusMsg, currentStatusMsg]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-label="Profile settings"
    >
      <div className="w-96 bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-primary">Profile Settings</h2>
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

        {/* Content */}
        <div className="px-5 py-5 space-y-5">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-xl bg-surface-3 flex items-center justify-center overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl font-bold text-secondary">{initial}</span>
                )}
              </div>
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-3 py-1.5 text-xs font-medium text-primary bg-surface-3 hover:bg-surface-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {uploading ? "Uploading..." : "Upload Avatar"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
              <p className="mt-1 text-[10px] text-muted">JPG, PNG, or GIF. Max 5 MB.</p>
            </div>
          </div>

          {/* Display Name */}
          <div>
            <label
              htmlFor="profile-display-name"
              className="block text-xs font-medium text-secondary mb-1.5"
            >
              Display Name
            </label>
            <input
              id="profile-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
              placeholder="Your display name"
            />
          </div>

          {/* Status Message */}
          <div>
            <label
              htmlFor="profile-status"
              className="block text-xs font-medium text-secondary mb-1.5"
            >
              Status
            </label>
            <input
              id="profile-status"
              type="text"
              value={statusMsg}
              onChange={(e) => setStatusMsg(e.target.value)}
              className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
              placeholder="Set a status message..."
              maxLength={100}
            />
            <p className="mt-1 text-[10px] text-muted">Visible to other users via presence.</p>
          </div>

          {/* User ID (read-only) */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">User ID</label>
            <p className="text-sm text-muted font-mono">{userId}</p>
          </div>

          {/* Error / Success */}
          {error && <p className="text-xs text-status-error">{error}</p>}
          {success && <p className="text-xs text-status-success">Profile saved successfully.</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-secondary hover:text-primary bg-surface-3 hover:bg-surface-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={
              saving || (displayName === currentDisplayName && statusMsg === currentStatusMsg)
            }
            className="px-4 py-2 text-xs font-medium text-primary bg-accent hover:bg-accent-hover disabled:opacity-40 rounded-lg transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
