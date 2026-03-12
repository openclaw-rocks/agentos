import React, { useCallback, useEffect, useRef, useState } from "react";
import type { MediaDeviceInfo as AppMediaDeviceInfo } from "~/lib/media-devices";
import {
  getAvailableDevices,
  getSelectedAudioInput,
  getSelectedAudioOutput,
  getSelectedVideoInput,
  setSelectedAudioInput,
  setSelectedAudioOutput,
  setSelectedVideoInput,
} from "~/lib/media-devices";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PreJoinDeviceSelection {
  audioDeviceId: string | undefined;
  videoDeviceId: string | undefined;
  audioOutputDeviceId: string | undefined;
  audioMuted: boolean;
  videoMuted: boolean;
}

interface CallPreJoinScreenProps {
  callType: "voice" | "video";
  onJoin: (selection: PreJoinDeviceSelection) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function MicIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function MicOffIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .88-.16 1.73-.46 2.5" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function VideoOffIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Device select dropdown
// ---------------------------------------------------------------------------

function DeviceSelect({
  label,
  devices,
  value,
  onChange,
}: {
  label: string;
  devices: AppMediaDeviceInfo[];
  value: string;
  onChange: (deviceId: string) => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-text-secondary font-medium">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-1.5 rounded bg-surface-2 border border-border text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
      >
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CallPreJoinScreen
// ---------------------------------------------------------------------------

export function CallPreJoinScreen({
  callType,
  onJoin,
  onCancel,
}: CallPreJoinScreenProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<AppMediaDeviceInfo[]>([]);
  const [audioInputId, setAudioInputId] = useState<string>("");
  const [audioOutputId, setAudioOutputId] = useState<string>("");
  const [videoInputId, setVideoInputId] = useState<string>("");
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(callType === "voice");
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Enumerate devices on mount
  useEffect(() => {
    let cancelled = false;

    const init = async (): Promise<void> => {
      try {
        // Request permission first so labels are populated
        const tempStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callType === "video",
        });
        tempStream.getTracks().forEach((t) => t.stop());

        const available = await getAvailableDevices();
        if (cancelled) return;

        setDevices(available);

        // Restore saved selections or pick defaults
        const audioInputs = available.filter((d) => d.kind === "audioinput");
        const audioOutputs = available.filter((d) => d.kind === "audiooutput");
        const videoInputs = available.filter((d) => d.kind === "videoinput");

        const savedAudioIn = getSelectedAudioInput();
        const savedAudioOut = getSelectedAudioOutput();
        const savedVideoIn = getSelectedVideoInput();

        setAudioInputId(
          savedAudioIn && audioInputs.some((d) => d.deviceId === savedAudioIn)
            ? savedAudioIn
            : (audioInputs[0]?.deviceId ?? ""),
        );
        setAudioOutputId(
          savedAudioOut && audioOutputs.some((d) => d.deviceId === savedAudioOut)
            ? savedAudioOut
            : (audioOutputs[0]?.deviceId ?? ""),
        );
        setVideoInputId(
          savedVideoIn && videoInputs.some((d) => d.deviceId === savedVideoIn)
            ? savedVideoIn
            : (videoInputs[0]?.deviceId ?? ""),
        );
      } catch (err) {
        console.error("[CallPreJoin] Failed to enumerate devices:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [callType]);

  // Create camera preview stream
  useEffect(() => {
    if (callType !== "video" || videoMuted || !videoInputId) {
      // Stop existing preview if video is muted
      if (previewStream) {
        previewStream.getTracks().forEach((t) => t.stop());
        setPreviewStream(null);
      }
      return;
    }

    let cancelled = false;

    const startPreview = async (): Promise<void> => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: videoInputId } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setPreviewStream(stream);
      } catch (err) {
        console.error("[CallPreJoin] Failed to start camera preview:", err);
      }
    };

    startPreview();

    return () => {
      cancelled = true;
    };
    // We intentionally exclude previewStream to avoid infinite loops
  }, [callType, videoInputId, videoMuted]);

  // Attach preview stream to video element
  useEffect(() => {
    if (videoRef.current && previewStream) {
      videoRef.current.srcObject = previewStream;
    }
  }, [previewStream]);

  // Cleanup preview stream on unmount
  useEffect(() => {
    return () => {
      previewStream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleAudioInputChange = useCallback((deviceId: string) => {
    setAudioInputId(deviceId);
    setSelectedAudioInput(deviceId);
  }, []);

  const handleAudioOutputChange = useCallback((deviceId: string) => {
    setAudioOutputId(deviceId);
    setSelectedAudioOutput(deviceId);
  }, []);

  const handleVideoInputChange = useCallback(
    (deviceId: string) => {
      // Stop current preview so it restarts with new device
      if (previewStream) {
        previewStream.getTracks().forEach((t) => t.stop());
        setPreviewStream(null);
      }
      setVideoInputId(deviceId);
      setSelectedVideoInput(deviceId);
    },
    [previewStream],
  );

  const handleJoin = useCallback(() => {
    // Stop preview before joining (GroupCall will acquire its own stream)
    previewStream?.getTracks().forEach((t) => t.stop());
    setPreviewStream(null);

    onJoin({
      audioDeviceId: audioInputId || undefined,
      videoDeviceId: videoInputId || undefined,
      audioOutputDeviceId: audioOutputId || undefined,
      audioMuted,
      videoMuted,
    });
  }, [onJoin, audioInputId, videoInputId, audioOutputId, audioMuted, videoMuted, previewStream]);

  const handleCancel = useCallback(() => {
    previewStream?.getTracks().forEach((t) => t.stop());
    setPreviewStream(null);
    onCancel();
  }, [onCancel, previewStream]);

  const audioInputs = devices.filter((d) => d.kind === "audioinput");
  const audioOutputs = devices.filter((d) => d.kind === "audiooutput");
  const videoInputs = devices.filter((d) => d.kind === "videoinput");

  return (
    <div className="flex flex-col items-center justify-center h-full bg-surface-0 p-6">
      <div className="w-full max-w-md flex flex-col gap-6">
        <h2 className="text-lg font-semibold text-text-primary text-center">
          {callType === "video" ? "Join Video Call" : "Join Voice Call"}
        </h2>

        {/* Camera preview */}
        {callType === "video" && (
          <div className="relative aspect-video rounded-lg overflow-hidden bg-surface-2 flex items-center justify-center">
            {!videoMuted && previewStream ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover mirror"
                style={{ transform: "scaleX(-1)" }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 text-text-secondary">
                <VideoOffIcon className="w-12 h-12" />
                <span className="text-sm">Camera off</span>
              </div>
            )}
          </div>
        )}

        {/* Quick toggles */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setAudioMuted((prev) => !prev)}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              audioMuted
                ? "bg-status-error text-inverse"
                : "bg-surface-3 text-text-primary hover:bg-surface-4"
            }`}
            title={audioMuted ? "Unmute microphone" : "Mute microphone"}
          >
            {audioMuted ? <MicOffIcon className="w-5 h-5" /> : <MicIcon className="w-5 h-5" />}
          </button>

          {callType === "video" && (
            <button
              onClick={() => setVideoMuted((prev) => !prev)}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                videoMuted
                  ? "bg-status-error text-inverse"
                  : "bg-surface-3 text-text-primary hover:bg-surface-4"
              }`}
              title={videoMuted ? "Turn on camera" : "Turn off camera"}
            >
              {videoMuted ? (
                <VideoOffIcon className="w-5 h-5" />
              ) : (
                <VideoIcon className="w-5 h-5" />
              )}
            </button>
          )}
        </div>

        {/* Device selectors */}
        {!isLoading && (
          <div className="flex flex-col gap-3">
            {audioInputs.length > 0 && (
              <DeviceSelect
                label="Microphone"
                devices={audioInputs}
                value={audioInputId}
                onChange={handleAudioInputChange}
              />
            )}

            {audioOutputs.length > 0 && (
              <DeviceSelect
                label="Speaker"
                devices={audioOutputs}
                value={audioOutputId}
                onChange={handleAudioOutputChange}
              />
            )}

            {callType === "video" && videoInputs.length > 0 && (
              <DeviceSelect
                label="Camera"
                devices={videoInputs}
                value={videoInputId}
                onChange={handleVideoInputChange}
              />
            )}
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={handleCancel}
            className="px-6 py-2 rounded-lg bg-surface-3 text-text-primary hover:bg-surface-4 transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleJoin}
            disabled={isLoading}
            className="px-6 py-2 rounded-lg bg-accent text-inverse hover:bg-accent/90 transition-colors text-sm font-medium disabled:opacity-50"
          >
            Join Call
          </button>
        </div>
      </div>
    </div>
  );
}
