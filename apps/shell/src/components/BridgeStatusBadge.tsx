import React, { useState, useRef, useEffect, useCallback } from "react";
import type { BridgeInfo } from "~/lib/bridge-detection";
import { getBridgeDisplayName, getBridgeIcon } from "~/lib/bridge-detection";

interface BridgeStatusBadgeProps {
  bridgeInfo: BridgeInfo;
}

/**
 * Small badge shown in the room header when a bridge is detected.
 * Shows bridge icon + protocol name, with a details popover on hover.
 */
export const BridgeStatusBadge = React.memo(function BridgeStatusBadge({
  bridgeInfo,
}: BridgeStatusBadgeProps) {
  const [showPopover, setShowPopover] = useState(false);
  const badgeRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayName = getBridgeDisplayName(bridgeInfo.protocol);
  const iconPath = getBridgeIcon(bridgeInfo.protocol);

  const handleMouseEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setShowPopover(true), 200);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setShowPopover(false), 150);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      ref={badgeRef}
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Badge */}
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-purple-500/15 text-purple-400 rounded cursor-default"
        title={`Bridged to ${displayName}`}
      >
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
        </svg>
        {displayName}
      </span>

      {/* Popover */}
      {showPopover && (
        <div className="absolute top-full left-0 mt-1 z-50 w-64 p-3 bg-surface-2 border border-border rounded-lg shadow-xl text-xs">
          <div className="flex items-center gap-2 mb-2">
            <svg
              className="w-4 h-4 text-purple-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
            </svg>
            <span className="text-primary font-semibold">{displayName} Bridge</span>
          </div>

          <div className="space-y-1.5 text-secondary">
            {bridgeInfo.network && (
              <div className="flex items-start gap-2">
                <span className="text-muted flex-shrink-0">Network:</span>
                <span className="text-secondary">{bridgeInfo.network}</span>
              </div>
            )}
            {bridgeInfo.channel && (
              <div className="flex items-start gap-2">
                <span className="text-muted flex-shrink-0">Channel:</span>
                <span className="text-secondary font-mono">{bridgeInfo.channel}</span>
              </div>
            )}
            {bridgeInfo.botUserId && (
              <div className="flex items-start gap-2">
                <span className="text-muted flex-shrink-0">Bot:</span>
                <span className="text-secondary font-mono truncate">{bridgeInfo.botUserId}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-muted flex-shrink-0">Status:</span>
              <span
                className={`inline-flex items-center gap-1 ${bridgeInfo.isConnected ? "text-status-success" : "text-status-error"}`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${bridgeInfo.isConnected ? "bg-status-success" : "bg-status-error"}`}
                />
                {bridgeInfo.isConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * Small inline bridge icon for use in channel lists and message rows.
 * Shows a compact bridge icon with a tooltip.
 */
export const BridgeIcon = React.memo(function BridgeIcon({
  protocol,
  size = "sm",
}: {
  protocol: string;
  size?: "sm" | "xs";
}) {
  const iconPath = getBridgeIcon(protocol);
  const displayName = getBridgeDisplayName(protocol);
  const sizeClass = size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3";

  return (
    <svg
      className={`${sizeClass} text-purple-400 flex-shrink-0`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      role="img"
      aria-label={`Bridged from ${displayName}`}
    >
      <title>{`Bridged from ${displayName}`}</title>
      <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
    </svg>
  );
});
