import React, { useState, useRef, useCallback, useEffect } from "react";
import { VoiceRecorder } from "~/lib/voice-recorder";

export interface VoiceMessageRecorderProps {
  /** Called with the recorded blob and duration after recording completes. */
  onRecorded: (blob: Blob, durationMs: number) => void;
  /** Whether the recorder is currently disabled (e.g. during upload). */
  disabled?: boolean;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Mic button that toggles voice recording. When recording, it shows a
 * duration timer and cancel / stop controls. Designed to sit next to the
 * Send button in the chat input area.
 */
export function VoiceMessageRecorder({
  onRecorded,
  disabled,
}: VoiceMessageRecorderProps): React.ReactElement {
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      recorderRef.current?.cancel();
    };
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    const rec = new VoiceRecorder();
    recorderRef.current = rec;

    try {
      await rec.start();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not access microphone";
      setError(message);
      recorderRef.current = null;
      return;
    }

    setRecording(true);
    setElapsed(0);

    intervalRef.current = setInterval(() => {
      setElapsed(rec.getDuration());
    }, 200);
  }, []);

  const stopRecording = useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const rec = recorderRef.current;
    if (!rec) return;

    try {
      const { blob, duration } = await rec.stop();
      onRecorded(blob, duration);
    } catch {
      // Best-effort — ignore stop failures
    }

    recorderRef.current = null;
    setRecording(false);
    setElapsed(0);
  }, [onRecorded]);

  const cancelRecording = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    recorderRef.current?.cancel();
    recorderRef.current = null;
    setRecording(false);
    setElapsed(0);
  }, []);

  if (recording) {
    return (
      <div className="flex items-center gap-2">
        {/* Pulse indicator */}
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
        </span>

        {/* Duration */}
        <span className="text-xs text-red-400 font-mono tabular-nums min-w-[3ch]">
          {formatDuration(elapsed)}
        </span>

        {/* Cancel */}
        <button
          type="button"
          onClick={cancelRecording}
          className="p-1 text-secondary hover:text-primary hover:bg-surface-3 rounded transition-colors"
          title="Cancel recording"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Stop & send */}
        <button
          type="button"
          onClick={stopRecording}
          className="p-1.5 bg-red-500 hover:bg-red-600 text-inverse rounded-lg transition-colors"
          title="Stop and send"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center">
      {error && (
        <span className="text-[10px] text-red-400 mr-2 max-w-[120px] truncate" title={error}>
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={startRecording}
        disabled={disabled}
        className="p-1.5 text-secondary hover:text-primary hover:bg-surface-3 rounded-lg transition-colors disabled:opacity-30"
        title="Record voice message"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
          />
        </svg>
      </button>
    </div>
  );
}
