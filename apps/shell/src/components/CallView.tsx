/**
 * Floating call overlay for active voice/video calls.
 *
 * Renders a draggable overlay that shows:
 * - Video call: remote video (full), local video (picture-in-picture corner)
 * - Voice call: caller info, duration timer
 * - Control bar: mute, video toggle, hang up
 * - Incoming call: notification banner with Accept / Decline
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import type { WebRTCCall, CallState, CallType } from "~/lib/webrtc-call";

interface CallViewProps {
  roomId: string;
  callManager: WebRTCCall;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function CallView({ roomId, callManager, onClose }: CallViewProps): React.ReactElement {
  const [callState, setCallState] = useState<CallState>(callManager.getState());
  const [callType, setCallType] = useState<CallType>(callManager.getCallType());
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [duration, setDuration] = useState(0);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync call state
  useEffect(() => {
    const handler = (state: CallState) => {
      setCallState(state);
      setCallType(callManager.getCallType());
    };
    callManager.onStateChange = handler;
    return () => {
      if (callManager.onStateChange === handler) {
        callManager.onStateChange = null;
      }
    };
  }, [callManager]);

  // Attach remote stream to video element
  useEffect(() => {
    const remote = callManager.getRemoteStream();
    if (remoteVideoRef.current && remote) {
      remoteVideoRef.current.srcObject = remote;
    }
  }, [callState, callManager]);

  // Attach local stream to video element
  useEffect(() => {
    const local = callManager.getLocalStream();
    if (localVideoRef.current && local) {
      localVideoRef.current.srcObject = local;
    }
  }, [callState, callManager]);

  // Duration timer
  useEffect(() => {
    if (callState === "connected") {
      setDuration(0);
      durationRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } else {
      if (durationRef.current) {
        clearInterval(durationRef.current);
        durationRef.current = null;
      }
    }
    return () => {
      if (durationRef.current) {
        clearInterval(durationRef.current);
        durationRef.current = null;
      }
    };
  }, [callState]);

  const handleToggleMute = useCallback(() => {
    callManager.toggleMute();
    setMuted(callManager.isMuted());
  }, [callManager]);

  const handleToggleVideo = useCallback(() => {
    callManager.toggleVideo();
    setVideoOff(!callManager.isVideoEnabled());
  }, [callManager]);

  const handleHangup = useCallback(async () => {
    await callManager.hangup();
    onClose();
  }, [callManager, onClose]);

  const handleAccept = useCallback(async () => {
    await callManager.answerCall(callManager.getCallId());
  }, [callManager]);

  const handleDecline = useCallback(async () => {
    await callManager.rejectCall();
    onClose();
  }, [callManager, onClose]);

  // Incoming call banner
  if (callState === "ringing") {
    return (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-80 bg-surface-2 border border-border rounded-xl shadow-2xl p-4 animate-in slide-in-from-top">
        <div className="flex items-center gap-3 mb-4">
          {/* Ringing icon */}
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-5 h-5 text-green-400 animate-pulse"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              {callType === "video" ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
                />
              )}
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-primary truncate">Incoming {callType} call</p>
            <p className="text-xs text-secondary truncate">Room: {roomId.split(":")[0]}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleDecline}
            className="flex-1 px-3 py-2 text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="flex-1 px-3 py-2 text-sm font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    );
  }

  // No overlay when idle or ended
  if (callState === "idle" || callState === "ended") {
    return <></>;
  }

  // Active / calling overlay
  const isVideo = callType === "video";

  return (
    <div className="fixed bottom-20 right-4 z-[100] w-80 bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden">
      {/* Video area */}
      {isVideo ? (
        <div className="relative w-full aspect-video bg-black">
          {/* Remote video */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* Local video PiP */}
          <div className="absolute top-2 right-2 w-20 h-14 bg-surface-2 rounded-lg overflow-hidden border border-border shadow-lg">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>

          {/* Calling spinner overlay */}
          {callState === "calling" && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <div className="text-center">
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-secondary">Calling...</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Voice call display */
        <div className="p-4 text-center">
          <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-6 h-6 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
              />
            </svg>
          </div>

          {callState === "calling" ? (
            <p className="text-sm text-secondary">Calling...</p>
          ) : (
            <>
              <p className="text-sm text-primary font-medium">Voice Call</p>
              <p className="text-xs text-secondary font-mono tabular-nums mt-1">
                {formatDuration(duration)}
              </p>
            </>
          )}

          {/* Audio waveform placeholder */}
          {callState === "connected" && (
            <div className="flex items-center justify-center gap-0.5 mt-3 h-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-accent/60 rounded-full animate-pulse"
                  style={{
                    height: `${8 + Math.sin(i * 0.8) * 12}px`,
                    animationDelay: `${i * 80}ms`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Control bar */}
      <div className="flex items-center justify-center gap-3 p-3 border-t border-border">
        {/* Mute */}
        <button
          onClick={handleToggleMute}
          className={`p-2.5 rounded-full transition-colors ${
            muted
              ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
              : "bg-surface-2 text-secondary hover:text-primary hover:bg-surface-3"
          }`}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? (
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 19 17.591 17.591 5.409 5.409 4 4"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 0 0 5.936-5.106M12 18.75v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 0 1 6 0v1.297"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
              />
            </svg>
          )}
        </button>

        {/* Video toggle (only for video calls) */}
        {isVideo && (
          <button
            onClick={handleToggleVideo}
            className={`p-2.5 rounded-full transition-colors ${
              videoOff
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "bg-surface-2 text-secondary hover:text-primary hover:bg-surface-3"
            }`}
            title={videoOff ? "Turn on camera" : "Turn off camera"}
          >
            {videoOff ? (
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 10.5l4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M12 18.75H4.5a2.25 2.25 0 0 1-2.25-2.25V9m12.841 9.091L16.5 19.5m-1.409-1.409c.546-.546.41-8.591.41-8.591m-9.75 0h5.25"
                />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
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
            )}
          </button>
        )}

        {/* Screen share toggle */}
        <button
          onClick={() => setScreenSharing((prev) => !prev)}
          className={`p-2.5 rounded-full transition-colors ${
            screenSharing
              ? "bg-accent/20 text-accent hover:bg-accent/30"
              : "bg-surface-2 text-secondary hover:text-primary hover:bg-surface-3"
          }`}
          title={screenSharing ? "Stop sharing" : "Share screen"}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </button>

        {/* Hang up */}
        <button
          onClick={handleHangup}
          className="p-2.5 bg-red-500 hover:bg-red-600 text-inverse rounded-full transition-colors"
          title="Hang up"
        >
          <svg
            className="w-5 h-5"
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
      </div>

      {/* Duration bar for video */}
      {isVideo && callState === "connected" && (
        <div className="text-center pb-2">
          <span className="text-[10px] text-secondary font-mono tabular-nums">
            {formatDuration(duration)}
          </span>
        </div>
      )}
    </div>
  );
}
