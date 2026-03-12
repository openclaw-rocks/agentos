import React from "react";
import type { RoomEncryptionStatus } from "~/lib/encryption";

interface EncryptionIndicatorProps {
  status: RoomEncryptionStatus;
  allDevicesVerified?: boolean;
  className?: string;
}

/**
 * Small lock icon shown in room headers and message rows.
 *
 * - Green lock: encrypted room, all devices verified
 * - Gray lock: encrypted room, some unverified devices
 * - No lock: unencrypted room
 */
export function EncryptionIndicator({
  status,
  allDevicesVerified = false,
  className = "",
}: EncryptionIndicatorProps): React.ReactElement | null {
  if (status === "unencrypted") return null;

  const color = allDevicesVerified ? "text-status-success" : "text-muted";
  const title = allDevicesVerified
    ? "Encrypted (all devices verified)"
    : "Encrypted (some devices unverified)";

  return (
    <span
      className={`inline-flex items-center ${className}`}
      title={title}
      data-testid="encryption-indicator"
    >
      <svg
        className={`w-3.5 h-3.5 ${color}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
        />
      </svg>
    </span>
  );
}

/**
 * Shield indicator for individual messages in encrypted rooms.
 *
 * - Green shield: verified sender
 * - Gray shield: unverified sender
 * - Red shield: decryption failed / authenticity warning
 * - Hidden: not encrypted
 */
export function MessageShieldIndicator({
  status,
  className = "",
}: {
  status: "verified" | "unverified" | "warning" | "none";
  className?: string;
}): React.ReactElement | null {
  if (status === "none") return null;

  const colorMap = {
    verified: "text-status-success",
    unverified: "text-muted",
    warning: "text-status-error",
  };

  const titleMap = {
    verified: "Verified sender",
    unverified: "Unverified sender",
    warning: "Decryption issue - authenticity cannot be guaranteed",
  };

  return (
    <span
      className={`inline-flex items-center ${className}`}
      title={titleMap[status]}
      data-testid="message-shield"
    >
      <svg className={`w-3 h-3 ${colorMap[status]}`} fill="currentColor" viewBox="0 0 24 24">
        <path
          fillRule="evenodd"
          d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08zm3.094 8.016a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
          clipRule="evenodd"
        />
      </svg>
    </span>
  );
}
