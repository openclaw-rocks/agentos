import React, { useCallback, useEffect, useRef, useState } from "react";
import type { PreJoinDeviceSelection } from "~/components/CallPreJoinScreen";
import { CallPreJoinScreen } from "~/components/CallPreJoinScreen";
import type { GroupCall, GroupCallMember, GroupCallState, GroupCallType } from "~/lib/group-call";
import { AudioLevelMonitor } from "~/lib/group-call";
import type { PttState } from "~/lib/ptt";
import {
  initialPttState,
  togglePttMode,
  startTransmitting,
  stopTransmitting,
  isPttKey,
} from "~/lib/ptt";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GroupCallViewProps {
  roomId: string;
  groupCall: GroupCall;
  callType: GroupCallType;
  onLeave: () => void;
}

// ---------------------------------------------------------------------------
// Reaction types
// ---------------------------------------------------------------------------

interface FloatingReaction {
  id: string;
  emoji: string;
  userId: string;
  expiresAt: number;
}

const REACTION_EMOJIS = [
  "\uD83D\uDC4D",
  "\uD83D\uDC4F",
  "\u2764\uFE0F",
  "\uD83D\uDE02",
  "\uD83C\uDF89",
  "\uD83E\uDD14",
  "\uD83D\uDE4C",
  "\uD83D\uDD25",
];

const REACTION_DURATION_MS = 3000;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ParticipantTile({
  member,
  isLocal,
  localStream,
  isActiveSpeaker,
  audioLevel,
  handRaised,
  reactions,
  isFullscreen,
}: {
  member: GroupCallMember | null;
  isLocal: boolean;
  localStream: MediaStream | null;
  isActiveSpeaker: boolean;
  audioLevel: number;
  handRaised: boolean;
  reactions: FloatingReaction[];
  isFullscreen: boolean;
}): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = isLocal ? localStream : member?.stream;

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const displayName = isLocal ? "You" : (member?.userId ?? "Unknown");

  const audioMuted = isLocal ? false : (member?.audioMuted ?? false);
  const hasVideo = stream ? stream.getVideoTracks().some((t) => t.enabled) : false;

  const borderClass = isActiveSpeaker
    ? "ring-2 ring-accent ring-offset-1 ring-offset-surface-0"
    : "";

  const sizeClass = isActiveSpeaker && isFullscreen ? "col-span-2 row-span-2" : "";

  return (
    <div
      className={`relative flex items-center justify-center bg-surface-2 rounded-lg overflow-hidden aspect-video ${borderClass} ${sizeClass} transition-all duration-300`}
    >
      {hasVideo && stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2">
          <div className="w-16 h-16 rounded-full bg-surface-3 flex items-center justify-center">
            <span className="text-2xl font-bold text-text-secondary">
              {displayName.charAt(0).toUpperCase()}
            </span>
          </div>
          {stream && (
            <audio
              ref={(el) => {
                if (el && stream) el.srcObject = stream;
              }}
              autoPlay
              muted={isLocal}
            />
          )}
        </div>
      )}

      {/* Audio level indicator bar */}
      {audioLevel > 0.01 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-surface-3/50">
          <div
            className="h-full bg-accent transition-all duration-100"
            style={{ width: `${Math.min(100, Math.round(audioLevel * 100))}%` }}
          />
        </div>
      )}

      {/* Name label */}
      <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-surface-0/70 text-xs text-text-primary truncate max-w-[80%]">
        {displayName}
      </div>

      {/* Mute indicator */}
      {audioMuted && (
        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-status-error/80 flex items-center justify-center">
          <MicOffIcon className="w-3.5 h-3.5 text-primary" />
        </div>
      )}

      {/* Active speaker indicator */}
      {isActiveSpeaker && (
        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-accent/80 text-[10px] text-inverse font-medium">
          Speaking
        </div>
      )}

      {/* Hand raise overlay */}
      {handRaised && (
        <div className="absolute top-2 right-10 w-8 h-8 flex items-center justify-center animate-bounce">
          <span className="text-2xl" role="img" aria-label="hand raised">
            {"\u270B"}
          </span>
        </div>
      )}

      {/* Floating reactions */}
      {reactions.map((r) => (
        <FloatingEmoji key={r.id} emoji={r.emoji} />
      ))}
    </div>
  );
}

function FloatingEmoji({ emoji }: { emoji: string }): React.ReactElement {
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-float-up pointer-events-none">
      <span className="text-3xl">{emoji}</span>
    </div>
  );
}

function ParticipantCount({ count }: { count: number }): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-2 text-xs text-text-secondary">
      <PersonIcon className="w-3.5 h-3.5" />
      <span>{count}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons (inline SVG to avoid external dependencies)
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

function ScreenShareIcon({ className }: { className?: string }): React.ReactElement {
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
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <polyline points="9 10 12 7 15 10" />
      <line x1="12" y1="7" x2="12" y2="14" />
    </svg>
  );
}

function PhoneOffIcon({ className }: { className?: string }): React.ReactElement {
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
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  );
}

function PersonIcon({ className }: { className?: string }): React.ReactElement {
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
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function HandIcon({ className }: { className?: string }): React.ReactElement {
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
      <path d="M18 11V6a2 2 0 0 0-4 0v1" />
      <path d="M14 10V4a2 2 0 0 0-4 0v2" />
      <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-5.9-2.4L2.5 15.7a2 2 0 0 1 2.7-2.8L8 15" />
    </svg>
  );
}

function FullscreenIcon({ className }: { className?: string }): React.ReactElement {
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
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function ExitFullscreenIcon({ className }: { className?: string }): React.ReactElement {
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
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function SmileIcon({ className }: { className?: string }): React.ReactElement {
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
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}

function WalkieTalkieIcon({ className }: { className?: string }): React.ReactElement {
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
      <rect x="6" y="4" width="12" height="18" rx="2" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <circle cx="12" cy="13" r="3" />
      <line x1="12" y1="8" x2="12" y2="8.01" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Grid layout helper
// ---------------------------------------------------------------------------

function getGridCols(count: number, isFullscreen: boolean): string {
  if (isFullscreen) {
    if (count <= 1) return "grid-cols-1";
    if (count <= 2) return "grid-cols-2";
    if (count <= 4) return "grid-cols-2";
    if (count <= 9) return "grid-cols-3";
    return "grid-cols-4";
  }
  if (count <= 1) return "grid-cols-1";
  if (count <= 4) return "grid-cols-2";
  if (count <= 9) return "grid-cols-3";
  return "grid-cols-4";
}

// ---------------------------------------------------------------------------
// Emoji reaction picker popover
// ---------------------------------------------------------------------------

function ReactionPicker({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-14 left-1/2 -translate-x-1/2 flex gap-1 px-3 py-2 rounded-lg bg-surface-2 border border-border shadow-lg z-50"
    >
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => {
            onSelect(emoji);
            onClose();
          }}
          className="w-9 h-9 flex items-center justify-center rounded hover:bg-surface-3 transition-colors text-xl"
          title={emoji}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InCallView — the actual call UI (extracted for pre-join flow)
// ---------------------------------------------------------------------------

function InCallView({
  groupCall,
  onLeave,
}: {
  groupCall: GroupCall;
  onLeave: () => void;
}): React.ReactElement {
  const [members, setMembers] = useState<GroupCallMember[]>([]);
  const [callState, setCallState] = useState<GroupCallState>(groupCall.getState());
  const [audioMuted, setAudioMuted] = useState(groupCall.isAudioMuted());
  const [videoMuted, setVideoMuted] = useState(groupCall.isVideoMuted());
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const [handRaised, setHandRaised] = useState(false);
  const [remoteHandRaises, setRemoteHandRaises] = useState<Set<string>>(new Set());
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pttState, setPttState] = useState<PttState>(initialPttState());
  const containerRef = useRef<HTMLDivElement>(null);
  const audioMonitorRef = useRef<AudioLevelMonitor | null>(null);

  // Initialize audio level monitor
  useEffect(() => {
    const monitor = new AudioLevelMonitor();
    audioMonitorRef.current = monitor;

    monitor.onActiveSpeakerChange = (userId) => {
      setActiveSpeaker(userId);
    };

    return () => {
      monitor.destroy();
      audioMonitorRef.current = null;
    };
  }, []);

  // Sync members, audio monitor, hand raises, and reactions
  useEffect(() => {
    const refreshMembers = (): void => {
      const currentMembers = [...groupCall.getMembers()];
      setMembers(currentMembers);

      // Update audio level monitor with current streams
      const monitor = audioMonitorRef.current;
      if (monitor) {
        const peers = groupCall.getPeers();
        for (const [, peer] of peers) {
          if (peer.stream) {
            monitor.addStream(peer.userId, peer.stream);
          }
        }
      }

      // Sync hand raise state from members
      const raised = new Set<string>();
      for (const m of currentMembers) {
        if (m.handRaised) {
          raised.add(m.userId);
        }
      }
      setRemoteHandRaises(raised);
    };

    groupCall.onStateChange = (state) => {
      setCallState(state);
      refreshMembers();
    };

    groupCall.onMemberJoined = () => {
      refreshMembers();
    };

    groupCall.onMemberLeft = (member) => {
      refreshMembers();
      // Clean up audio monitor for departed member
      audioMonitorRef.current?.removeStream(member.userId);
    };

    groupCall.onHandRaiseChange = (userId, raised) => {
      setRemoteHandRaises((prev) => {
        const next = new Set(prev);
        if (raised) {
          next.add(userId);
        } else {
          next.delete(userId);
        }
        return next;
      });
    };

    groupCall.onReaction = (userId, emoji) => {
      const reaction: FloatingReaction = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        emoji,
        userId,
        expiresAt: Date.now() + REACTION_DURATION_MS,
      };
      setReactions((prev) => [...prev, reaction]);
    };

    // Initial population
    refreshMembers();

    return () => {
      groupCall.onStateChange = null;
      groupCall.onMemberJoined = null;
      groupCall.onMemberLeft = null;
      groupCall.onHandRaiseChange = null;
      groupCall.onReaction = null;
    };
  }, [groupCall]);

  // Fullscreen change listener
  useEffect(() => {
    const handler = (): void => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Clean up expired reactions
  useEffect(() => {
    if (reactions.length === 0) return;

    const timer = setInterval(() => {
      const now = Date.now();
      setReactions((prev) => prev.filter((r) => r.expiresAt > now));
    }, 500);

    return () => clearInterval(timer);
  }, [reactions.length]);

  const handleToggleMute = useCallback(() => {
    const muted = groupCall.toggleMute();
    setAudioMuted(muted);
  }, [groupCall]);

  // ---- PTT handlers ----

  const handleTogglePtt = useCallback(() => {
    setPttState((prev) => {
      const next = togglePttMode(prev);
      // When entering PTT mode, mute the mic immediately
      if (next.enabled) {
        const stream = groupCall.getLocalStream();
        if (stream) {
          for (const track of stream.getAudioTracks()) {
            track.enabled = false;
          }
        }
        setAudioMuted(true);
      }
      return next;
    });
  }, [groupCall]);

  const handlePttDown = useCallback(() => {
    setPttState((prev) => {
      const next = startTransmitting(prev);
      if (next !== prev) {
        // Unmute mic while holding
        const stream = groupCall.getLocalStream();
        if (stream) {
          for (const track of stream.getAudioTracks()) {
            track.enabled = true;
          }
        }
        setAudioMuted(false);
      }
      return next;
    });
  }, [groupCall]);

  const handlePttUp = useCallback(() => {
    setPttState((prev) => {
      const next = stopTransmitting(prev);
      if (next !== prev) {
        // Re-mute mic when released
        const stream = groupCall.getLocalStream();
        if (stream) {
          for (const track of stream.getAudioTracks()) {
            track.enabled = false;
          }
        }
        setAudioMuted(true);
      }
      return next;
    });
  }, [groupCall]);

  // Keyboard handler for spacebar PTT
  useEffect(() => {
    if (!pttState.enabled) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement;
      if (isPttKey(e.key, target.tagName, target.isContentEditable)) {
        e.preventDefault();
        handlePttDown();
      }
    };

    const handleKeyUp = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement;
      if (isPttKey(e.key, target.tagName, target.isContentEditable)) {
        e.preventDefault();
        handlePttUp();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, [pttState.enabled, handlePttDown, handlePttUp]);

  const handleToggleVideo = useCallback(() => {
    const muted = groupCall.toggleVideo();
    setVideoMuted(muted);
  }, [groupCall]);

  const handleToggleScreenShare = useCallback(() => {
    setIsScreenSharing((prev) => !prev);
  }, []);

  const handleHangUp = useCallback(() => {
    groupCall.leave();
    onLeave();
  }, [groupCall, onLeave]);

  const handleToggleHandRaise = useCallback(() => {
    const newState = !handRaised;
    setHandRaised(newState);
    if (newState) {
      groupCall.raiseHand().catch((err) => {
        console.error("[GroupCallView] Failed to raise hand:", err);
      });
    } else {
      groupCall.lowerHand().catch((err) => {
        console.error("[GroupCallView] Failed to lower hand:", err);
      });
    }
  }, [groupCall, handRaised]);

  const handleReaction = useCallback(
    (emoji: string) => {
      const myUserId = "local";
      const reaction: FloatingReaction = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        emoji,
        userId: myUserId,
        expiresAt: Date.now() + REACTION_DURATION_MS,
      };
      setReactions((prev) => [...prev, reaction]);

      // Broadcast reaction to other participants via Matrix room event
      groupCall.sendReaction(emoji).catch((err) => {
        console.error("[GroupCallView] Failed to send reaction:", err);
      });
    },
    [groupCall],
  );

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch((err) => {
        console.error("[GroupCallView] Failed to enter fullscreen:", err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.error("[GroupCallView] Failed to exit fullscreen:", err);
      });
    }
  }, []);

  // Compute reactions per participant
  const localReactions = reactions.filter((r) => r.userId === "local");
  const getReactionsForMember = (userId: string): FloatingReaction[] =>
    reactions.filter((r) => r.userId === userId);

  // Total tiles = self + remote members
  const totalParticipants = 1 + members.length;
  const gridCols = getGridCols(totalParticipants, isFullscreen);

  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full bg-surface-0 ${isFullscreen ? "fixed inset-0 z-[9999]" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">
            {callState === "joining" ? "Joining call..." : "In call"}
          </span>
          {callState === "joining" && (
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        <ParticipantCount count={totalParticipants} />
      </div>

      {/* Participant grid */}
      <div className={`flex-1 grid ${gridCols} gap-2 p-2 auto-rows-fr`}>
        {/* Local participant */}
        <ParticipantTile
          member={null}
          isLocal={true}
          localStream={groupCall.getLocalStream()}
          isActiveSpeaker={false}
          audioLevel={0}
          handRaised={handRaised}
          reactions={localReactions}
          isFullscreen={isFullscreen}
        />

        {/* Remote participants */}
        {members.map((member) => (
          <ParticipantTile
            key={`${member.userId}:${member.deviceId}`}
            member={member}
            isLocal={false}
            localStream={null}
            isActiveSpeaker={activeSpeaker === member.userId}
            audioLevel={0}
            handRaised={remoteHandRaises.has(member.userId)}
            reactions={getReactionsForMember(member.userId)}
            isFullscreen={isFullscreen}
          />
        ))}
      </div>

      {/* Control bar */}
      <div
        className={`flex items-center justify-center gap-3 px-4 py-3 border-t border-border bg-surface-1 ${isFullscreen ? "pb-6" : ""}`}
      >
        {/* Mute button */}
        <button
          onClick={handleToggleMute}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
            audioMuted
              ? "bg-status-error text-inverse"
              : "bg-surface-3 text-text-primary hover:bg-surface-4"
          }`}
          title={audioMuted ? "Unmute microphone" : "Mute microphone"}
        >
          {audioMuted ? <MicOffIcon className="w-5 h-5" /> : <MicIcon className="w-5 h-5" />}
        </button>

        {/* PTT mode toggle */}
        <button
          onClick={handleTogglePtt}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
            pttState.enabled
              ? "bg-accent text-inverse"
              : "bg-surface-3 text-text-primary hover:bg-surface-4"
          }`}
          title={pttState.enabled ? "Disable push-to-talk" : "Enable push-to-talk"}
        >
          <WalkieTalkieIcon className="w-5 h-5" />
        </button>

        {/* PTT talk button (only visible when PTT is enabled) */}
        {pttState.enabled && (
          <button
            onMouseDown={handlePttDown}
            onMouseUp={handlePttUp}
            onMouseLeave={handlePttUp}
            onTouchStart={handlePttDown}
            onTouchEnd={handlePttUp}
            className={`px-4 h-10 rounded-full flex items-center justify-center gap-1.5 font-medium text-sm transition-colors select-none ${
              pttState.transmitting
                ? "bg-status-success text-inverse ring-2 ring-status-success/50 animate-pulse"
                : "bg-surface-3 text-text-primary hover:bg-surface-4"
            }`}
            title="Hold to talk (or hold spacebar)"
          >
            <MicIcon className="w-4 h-4" />
            {pttState.transmitting ? "Talking..." : "Hold to talk"}
          </button>
        )}

        {/* Camera toggle */}
        <button
          onClick={handleToggleVideo}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
            videoMuted
              ? "bg-status-error text-inverse"
              : "bg-surface-3 text-text-primary hover:bg-surface-4"
          }`}
          title={videoMuted ? "Turn on camera" : "Turn off camera"}
        >
          {videoMuted ? <VideoOffIcon className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
        </button>

        {/* Screen share toggle */}
        <button
          onClick={handleToggleScreenShare}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
            isScreenSharing
              ? "bg-accent text-inverse"
              : "bg-surface-3 text-text-primary hover:bg-surface-4"
          }`}
          title={isScreenSharing ? "Stop screen share" : "Share screen"}
        >
          <ScreenShareIcon className="w-5 h-5" />
        </button>

        {/* Hand raise */}
        <button
          onClick={handleToggleHandRaise}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
            handRaised
              ? "bg-amber-500 text-primary"
              : "bg-surface-3 text-text-primary hover:bg-surface-4"
          }`}
          title={handRaised ? "Lower hand" : "Raise hand"}
        >
          <HandIcon className="w-5 h-5" />
        </button>

        {/* Emoji reaction */}
        <div className="relative">
          <button
            onClick={() => setShowReactionPicker((prev) => !prev)}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              showReactionPicker
                ? "bg-accent text-inverse"
                : "bg-surface-3 text-text-primary hover:bg-surface-4"
            }`}
            title="Send reaction"
          >
            <SmileIcon className="w-5 h-5" />
          </button>
          {showReactionPicker && (
            <ReactionPicker
              onSelect={handleReaction}
              onClose={() => setShowReactionPicker(false)}
            />
          )}
        </div>

        {/* Fullscreen toggle */}
        <button
          onClick={handleToggleFullscreen}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-surface-3 text-text-primary hover:bg-surface-4 transition-colors"
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? (
            <ExitFullscreenIcon className="w-5 h-5" />
          ) : (
            <FullscreenIcon className="w-5 h-5" />
          )}
        </button>

        {/* Hang up */}
        <button
          onClick={handleHangUp}
          className="w-12 h-10 rounded-full bg-status-error text-inverse flex items-center justify-center hover:bg-red-600 transition-colors"
          title="Leave call"
        >
          <PhoneOffIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupCallView — wraps pre-join + in-call
// ---------------------------------------------------------------------------

export function GroupCallView({
  roomId,
  groupCall,
  callType,
  onLeave,
}: GroupCallViewProps): React.ReactElement {
  const [phase, setPhase] = useState<"pre-join" | "in-call">("pre-join");

  const handleJoin = useCallback(
    async (selection: PreJoinDeviceSelection) => {
      try {
        await groupCall.joinWithDevices(roomId, callType, {
          audioDeviceId: selection.audioDeviceId,
          videoDeviceId: selection.videoDeviceId,
          audioMuted: selection.audioMuted,
          videoMuted: selection.videoMuted,
        });
        setPhase("in-call");
      } catch (err) {
        console.error("[GroupCallView] Failed to join call:", err);
      }
    },
    [groupCall, roomId, callType],
  );

  const handleCancel = useCallback(() => {
    onLeave();
  }, [onLeave]);

  if (phase === "pre-join") {
    return <CallPreJoinScreen callType={callType} onJoin={handleJoin} onCancel={handleCancel} />;
  }

  return <InCallView groupCall={groupCall} onLeave={onLeave} />;
}
