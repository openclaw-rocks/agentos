import React, { useState, useRef, useCallback, useEffect } from "react";

/** Ordered list of playback speeds to cycle through. */
const PLAYBACK_SPEEDS = [1, 1.5, 2, 0.5] as const;

export interface VoiceMessagePlayerProps {
  /** HTTPS URL for the audio source. */
  src: string;
  /** Duration in milliseconds (from the Matrix event info). */
  durationMs: number;
  /** Optional file size in bytes, displayed as a secondary label. */
  size?: number;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Number of bars in the waveform visualisation. */
const BAR_COUNT = 24;

/**
 * Deterministic pseudo-random bar heights seeded from the source URL so
 * the pattern is stable across re-renders but varies per message.
 */
function generateBarHeights(seed: string): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }

  const heights: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    hash = (hash * 16807 + 1) | 0;
    const normalised = ((hash >>> 0) % 100) / 100;
    // Ensure a minimum bar height of 20%
    heights.push(0.2 + normalised * 0.8);
  }
  return heights;
}

/**
 * A compact voice-message player with waveform-style bars, play/pause,
 * progress, and duration. Uses a hidden `<audio>` element under the hood.
 */
export function VoiceMessagePlayer({
  src,
  durationMs,
  size,
}: VoiceMessagePlayerProps): React.ReactElement {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(durationMs / 1000);
  const [speedIndex, setSpeedIndex] = useState(0);
  const playbackSpeed = PLAYBACK_SPEEDS[speedIndex];
  const barHeights = useRef(generateBarHeights(src)).current;

  // Keep totalDuration in sync when the audio element reports its actual duration
  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration)) {
      setTotalDuration(audio.duration);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      setCurrentTime(audio.currentTime);
    }
  }, []);

  const handleEnded = useCallback(() => {
    setPlaying(false);
    setCurrentTime(0);
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().catch(() => {
        /* autoplay policy — ignore */
      });
      setPlaying(true);
    }
  }, [playing]);

  // Cycle playback speed: 1x -> 1.5x -> 2x -> 0.5x -> 1x
  const cycleSpeed = useCallback(() => {
    setSpeedIndex((prev) => {
      const nextIndex = (prev + 1) % PLAYBACK_SPEEDS.length;
      const audio = audioRef.current;
      if (audio) {
        audio.playbackRate = PLAYBACK_SPEEDS[nextIndex];
      }
      return nextIndex;
    });
  }, []);

  // Keep playbackRate in sync when audio element is first loaded
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Seek by clicking on the waveform area
  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || !Number.isFinite(totalDuration) || totalDuration === 0) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = ratio * totalDuration;
      setCurrentTime(audio.currentTime);
    },
    [totalDuration],
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const progress = totalDuration > 0 ? currentTime / totalDuration : 0;
  const displayTime = playing || currentTime > 0 ? currentTime * 1000 : durationMs;

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 bg-surface-2 border border-border rounded-xl max-w-xs">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      />

      {/* Play / Pause button */}
      <button
        type="button"
        onClick={togglePlay}
        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-accent hover:bg-accent-hover text-inverse transition-colors"
        title={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Playback speed button */}
      <button
        type="button"
        onClick={cycleSpeed}
        className="flex-shrink-0 min-w-[2rem] h-6 flex items-center justify-center rounded-md bg-surface-3 text-[10px] font-mono font-medium text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
        title="Change playback speed"
      >
        {playbackSpeed}x
      </button>

      {/* Waveform bars + duration */}
      <div className="flex-1 min-w-0">
        {/* Bars */}
        <div
          className="flex items-end gap-px h-6 cursor-pointer"
          onClick={handleSeek}
          role="slider"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Audio playback progress"
          tabIndex={0}
        >
          {barHeights.map((h, i) => {
            const barProgress = (i + 1) / BAR_COUNT;
            const isActive = barProgress <= progress;
            return (
              <div
                key={i}
                className={`flex-1 rounded-sm transition-colors duration-100 ${
                  isActive ? "bg-accent" : "bg-surface-4"
                }`}
                style={{ height: `${h * 100}%` }}
              />
            );
          })}
        </div>

        {/* Duration / current time */}
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[10px] text-muted font-mono tabular-nums">
            {formatDuration(displayTime)}
          </span>
          {size != null && (
            <span className="text-[10px] text-faint">
              {size < 1024 ? `${size} B` : `${(size / 1024).toFixed(0)} KB`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
