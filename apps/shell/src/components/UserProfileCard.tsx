import React, { useEffect, useRef, useState, useCallback } from "react";
import type { AgentInfo } from "~/lib/agent-registry";
import { useMatrix } from "~/lib/matrix-context";
import { mxcToHttpUrl } from "~/lib/media";
import { isUserIgnored, ignoreUser, unignoreUser } from "~/lib/user-ignore";

interface UserProfileCardProps {
  userId: string;
  displayName: string;
  avatarMxcUrl?: string;
  homeserverUrl: string;
  agentInfo?: AgentInfo;
  anchorRect: DOMRect;
  onClose: () => void;
  onSendMessage: (userId: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  online: "bg-status-success",
  busy: "bg-status-warning",
  starting: "bg-status-warning",
  error: "bg-status-error",
  offline: "bg-surface-4",
};

const STATUS_LABELS: Record<string, string> = {
  online: "Online",
  busy: "Busy",
  starting: "Starting",
  error: "Error",
  offline: "Offline",
};

export function UserProfileCard({
  userId,
  displayName,
  avatarMxcUrl,
  homeserverUrl,
  agentInfo,
  anchorRect,
  onClose,
  onSendMessage,
}: UserProfileCardProps): React.ReactElement {
  const { client } = useMatrix();
  const cardRef = useRef<HTMLDivElement>(null);
  const [blocked, setBlocked] = useState(() => isUserIgnored(client, userId));
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [blockPending, setBlockPending] = useState(false);
  const myUserId = client.getUserId();
  const isMe = myUserId === userId;

  const handleToggleBlock = useCallback(async () => {
    if (blocked) {
      // Unblock directly, no confirmation needed
      setBlockPending(true);
      try {
        await unignoreUser(client, userId);
        setBlocked(false);
      } catch {
        /* best-effort */
      } finally {
        setBlockPending(false);
      }
    } else {
      // Show confirmation before blocking
      setShowBlockConfirm(true);
    }
  }, [client, userId, blocked]);

  const handleConfirmBlock = useCallback(async () => {
    setBlockPending(true);
    setShowBlockConfirm(false);
    try {
      await ignoreUser(client, userId);
      setBlocked(true);
    } catch {
      /* best-effort */
    } finally {
      setBlockPending(false);
    }
  }, [client, userId]);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };

    const handleClickOutside = (e: MouseEvent): void => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  const avatarUrl = mxcToHttpUrl(avatarMxcUrl, homeserverUrl, 96, 96);
  const initial = displayName.charAt(0).toUpperCase();
  const isAgent = !!agentInfo;

  // Position the popover near the anchor element
  const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 320);
  const left = Math.min(anchorRect.left, window.innerWidth - 300);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label="User profile">
      <div
        ref={cardRef}
        className="absolute w-72 bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden"
        style={{ top, left }}
      >
        {/* Banner area */}
        <div className={`h-16 ${isAgent ? "bg-accent/20" : "bg-surface-3"}`} />

        {/* Avatar (overlapping banner) */}
        <div className="px-4 -mt-8">
          <div
            className={`w-16 h-16 rounded-xl flex items-center justify-center border-4 border-surface-1 ${
              isAgent ? "bg-accent/20" : "bg-surface-3"
            }`}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-full h-full rounded-lg object-cover"
              />
            ) : (
              <span className={`text-xl font-bold ${isAgent ? "text-accent" : "text-secondary"}`}>
                {initial}
              </span>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="px-4 pt-2 pb-4">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className={`text-sm font-semibold ${isAgent ? "text-accent" : "text-primary"}`}>
              {displayName}
            </h3>
            {isAgent && (
              <span className="text-[10px] px-1.5 py-0.5 bg-accent/10 text-accent rounded font-medium uppercase tracking-wider">
                Agent
              </span>
            )}
          </div>

          <p className="text-xs text-muted mb-1">{userId}</p>

          {/* User status message */}
          {!isAgent &&
            (() => {
              const user = client.getUser(userId);
              const statusMsg = user?.presenceStatusMsg;
              if (!statusMsg) return null;
              return <p className="text-xs text-secondary italic mb-3">{statusMsg}</p>;
            })()}

          {/* Agent-specific info */}
          {agentInfo && (
            <div className="mb-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${STATUS_COLORS[agentInfo.status] ?? "bg-surface-4"}`}
                />
                <span className="text-xs text-secondary">
                  {STATUS_LABELS[agentInfo.status] ?? agentInfo.status}
                </span>
              </div>

              {agentInfo.description && (
                <p className="text-xs text-secondary">{agentInfo.description}</p>
              )}

              {agentInfo.capabilities.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {agentInfo.capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="text-[10px] px-1.5 py-0.5 bg-surface-3 text-secondary rounded"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Send Message button */}
          <button
            onClick={() => onSendMessage(userId)}
            className="w-full py-2 text-xs font-medium text-primary bg-accent hover:bg-accent-hover rounded-lg transition-colors"
          >
            Send Message
          </button>

          {/* Block/Unblock button — not shown for self */}
          {!isMe && (
            <div className="mt-2">
              {showBlockConfirm ? (
                <div className="bg-surface-2 border border-border rounded-lg p-3 space-y-2">
                  <p className="text-xs text-secondary">
                    Block <strong className="text-primary">{displayName}</strong>? Their messages
                    will be hidden.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleConfirmBlock}
                      disabled={blockPending}
                      className="flex-1 py-1.5 text-xs font-medium text-primary bg-status-error hover:bg-status-error/80 disabled:opacity-50 rounded-lg transition-colors"
                    >
                      {blockPending ? "Blocking..." : "Confirm Block"}
                    </button>
                    <button
                      onClick={() => setShowBlockConfirm(false)}
                      className="flex-1 py-1.5 text-xs text-secondary hover:text-secondary bg-surface-3 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleToggleBlock}
                  disabled={blockPending}
                  className={`w-full py-2 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                    blocked
                      ? "text-secondary bg-surface-2 hover:bg-surface-3 border border-border"
                      : "text-status-error bg-status-error/10 hover:bg-status-error/20 border border-status-error/30"
                  }`}
                >
                  {blockPending ? "..." : blocked ? "Unblock User" : "Block User"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
