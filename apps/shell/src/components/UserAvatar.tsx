import React from "react";
import { mxcToHttpUrl } from "~/lib/media";

type PresenceStatus = "online" | "unavailable" | "offline";

interface UserAvatarProps {
  displayName: string;
  avatarMxcUrl?: string;
  homeserverUrl: string;
  isAgent?: boolean;
  /** Size in pixels (rendered as a Tailwind w/h class) */
  size?: "sm" | "md" | "lg";
  /** Presence status for the colored dot indicator */
  presence?: PresenceStatus;
  /** Agent status (overrides presence for agents) */
  agentStatus?: "starting" | "online" | "busy" | "offline" | "error";
  /** Whether to show the status dot */
  showStatusDot?: boolean;
}

const SIZE_CLASSES: Record<string, { container: string; text: string; img: string; dot: string }> =
  {
    sm: {
      container: "w-7 h-7",
      text: "text-[10px]",
      img: "w-7 h-7",
      dot: "w-2 h-2 -bottom-0.5 -right-0.5 border-[1.5px]",
    },
    md: {
      container: "w-8 h-8",
      text: "text-xs",
      img: "w-8 h-8",
      dot: "w-2.5 h-2.5 -bottom-0.5 -right-0.5 border-2",
    },
    lg: {
      container: "w-16 h-16",
      text: "text-xl",
      img: "w-16 h-16",
      dot: "w-3.5 h-3.5 -bottom-0.5 -right-0.5 border-2",
    },
  };

const THUMBNAIL_SIZES: Record<string, number> = {
  sm: 28,
  md: 32,
  lg: 64,
};

const PRESENCE_DOT_COLORS: Record<string, string> = {
  online: "bg-status-success",
  unavailable: "bg-status-warning",
  offline: "bg-surface-4",
};

const AGENT_STATUS_DOT_COLORS: Record<string, string> = {
  online: "bg-status-success",
  busy: "bg-status-warning",
  starting: "bg-status-warning",
  error: "bg-status-error",
  offline: "bg-surface-4",
};

export function UserAvatar({
  displayName,
  avatarMxcUrl,
  homeserverUrl,
  isAgent = false,
  size = "md",
  presence,
  agentStatus,
  showStatusDot = false,
}: UserAvatarProps): React.ReactElement {
  const sizeConfig = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;
  const thumbSize = THUMBNAIL_SIZES[size] ?? 32;
  const avatarUrl = mxcToHttpUrl(avatarMxcUrl, homeserverUrl, thumbSize, thumbSize);
  const initial = displayName.charAt(0).toUpperCase();

  // Determine dot color: agent status takes priority over presence
  let dotColor: string | undefined;
  if (showStatusDot) {
    if (isAgent && agentStatus) {
      dotColor = AGENT_STATUS_DOT_COLORS[agentStatus] ?? "bg-surface-4";
    } else if (presence) {
      dotColor = PRESENCE_DOT_COLORS[presence] ?? "bg-surface-4";
    }
  }

  return (
    <div className="relative flex-shrink-0">
      <div
        className={`${sizeConfig.container} rounded-lg flex items-center justify-center overflow-hidden ${
          isAgent ? "bg-accent/20" : "bg-surface-3"
        }`}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className={`${sizeConfig.img} rounded-lg object-cover`}
            loading="lazy"
          />
        ) : (
          <span
            className={`${sizeConfig.text} font-bold ${isAgent ? "text-accent" : "text-secondary"}`}
          >
            {initial}
          </span>
        )}
      </div>
      {dotColor && (
        <div className={`absolute ${sizeConfig.dot} rounded-full border-surface-0 ${dotColor}`} />
      )}
    </div>
  );
}
