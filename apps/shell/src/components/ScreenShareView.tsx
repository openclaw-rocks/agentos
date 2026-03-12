/**
 * Screen share display component.
 *
 * Renders a shared screen as a full-size video element with contextual
 * overlays depending on whether the local or remote user is sharing.
 */
import React, { useEffect, useRef } from "react";

export interface ScreenShareViewProps {
  /** The screen share MediaStream to render. */
  stream: MediaStream;
  /** Whether the local user is the one sharing. */
  isLocal: boolean;
  /** Callback when the local user clicks "Stop Sharing". */
  onStopSharing?: () => void;
}

export function ScreenShareView({
  stream,
  isLocal,
  onStopSharing,
}: ScreenShareViewProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (el) {
      el.srcObject = stream;
    }
    return () => {
      if (el) {
        el.srcObject = null;
      }
    };
  }, [stream]);

  return (
    <div className="relative w-full h-full bg-black rounded-xl overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="w-full h-full object-contain"
      />

      {isLocal && (
        <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-3 pt-4">
          <div className="px-4 py-2 bg-surface-2/80 backdrop-blur rounded-lg border border-border">
            <span className="text-sm font-medium text-primary">You are sharing your screen</span>
          </div>

          {onStopSharing && (
            <button
              type="button"
              onClick={onStopSharing}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-inverse text-sm font-medium rounded-lg transition-colors"
            >
              Stop Sharing
            </button>
          )}
        </div>
      )}
    </div>
  );
}
