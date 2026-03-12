import React, { useState } from "react";

const DEFAULT_JITSI_DOMAIN = "meet.jit.si";

/**
 * Build a Jitsi Meet URL for the given parameters.
 */
export function buildJitsiUrl(domain: string, roomName: string, displayName: string): string {
  // Sanitise the room name: replace non-alphanumeric characters with dashes
  const conferenceId = roomName
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const encodedDisplayName = encodeURIComponent(displayName);
  return `https://${domain}/${conferenceId}#config.startWithAudioMuted=true&userInfo.displayName=${encodedDisplayName}`;
}

interface JitsiWidgetProps {
  roomName: string;
  displayName: string;
  domain?: string;
}

export function JitsiWidget({
  roomName,
  displayName,
  domain = DEFAULT_JITSI_DOMAIN,
}: JitsiWidgetProps): React.ReactElement {
  const [joined, setJoined] = useState(false);

  const jitsiUrl = buildJitsiUrl(domain, roomName, displayName);

  return (
    <div className="flex flex-col bg-surface-1 border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
        <span className="text-xs font-medium text-primary">Jitsi Meet</span>
        <button
          onClick={() => setJoined(!joined)}
          className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
            joined
              ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
              : "bg-accent/20 text-accent hover:bg-accent/30"
          }`}
          aria-label={joined ? "Leave Jitsi call" : "Join Jitsi call"}
        >
          {joined ? "Leave" : "Join"}
        </button>
      </div>

      {/* Iframe (shown when joined) */}
      {joined && (
        <iframe
          src={jitsiUrl}
          title="Jitsi Meet"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          allow="camera; microphone; display-capture"
          className="w-full h-96 border-0"
        />
      )}

      {/* Placeholder when not joined */}
      {!joined && (
        <div className="flex items-center justify-center h-24">
          <p className="text-sm text-muted">Click Join to start a video call</p>
        </div>
      )}
    </div>
  );
}
