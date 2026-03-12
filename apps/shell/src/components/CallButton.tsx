/**
 * Call initiation buttons for voice and video calls.
 *
 * Renders a pair of icon buttons (phone + camera) designed to sit in
 * the ChatView header bar.
 */
import React from "react";
import type { CallType } from "~/lib/webrtc-call";

interface CallButtonProps {
  roomId: string;
  onStartCall: (type: CallType) => void;
}

export function CallButton({ roomId, onStartCall }: CallButtonProps): React.ReactElement {
  // roomId is available for future per-room logic (e.g. disabling calls in channels)
  void roomId;

  return (
    <div className="flex items-center gap-1">
      {/* Voice call */}
      <button
        onClick={() => onStartCall("voice")}
        className="p-1.5 text-secondary hover:text-primary hover:bg-surface-3 rounded-lg transition-colors"
        title="Voice call"
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
            d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
          />
        </svg>
      </button>

      {/* Video call */}
      <button
        onClick={() => onStartCall("video")}
        className="p-1.5 text-secondary hover:text-primary hover:bg-surface-3 rounded-lg transition-colors"
        title="Video call"
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
            d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
          />
        </svg>
      </button>
    </div>
  );
}
