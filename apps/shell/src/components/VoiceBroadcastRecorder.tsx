import React, { useState, useEffect, useRef, useCallback } from "react";
import type { VoiceBroadcastState, VBMatrixClient } from "~/lib/voice-broadcast";
import {
  pauseVoiceBroadcast,
  resumeVoiceBroadcast,
  stopVoiceBroadcast,
  sendVoiceChunk,
  CHUNK_DURATION_MS,
} from "~/lib/voice-broadcast";

interface VoiceBroadcastRecorderProps {
  client: VBMatrixClient;
  broadcastState: VoiceBroadcastState;
  onStopped: () => void;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function VoiceBroadcastRecorder({
  client,
  broadcastState,
  onStopped,
}: VoiceBroadcastRecorderProps): React.ReactElement {
  const [elapsed, setElapsed] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Update elapsed timer
  useEffect(() => {
    if (!broadcastState.isRecording) return;
    const timer = setInterval(() => {
      if (!broadcastState.isPaused) {
        setElapsed(Date.now() - broadcastState.startedAt);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [broadcastState.isRecording, broadcastState.isPaused, broadcastState.startedAt]);

  // Start recording and chunk upload
  useEffect(() => {
    let cancelled = false;

    async function startRecording(): Promise<void> {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        // Audio level analysis
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        function updateLevel(): void {
          if (cancelled) return;
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((s, v) => s + v, 0) / dataArray.length;
          setAudioLevel(avg / 255);
          animFrameRef.current = requestAnimationFrame(updateLevel);
        }
        updateLevel();

        // Chunk recording: record CHUNK_DURATION_MS segments
        function recordChunk(): void {
          if (cancelled || !streamRef.current) return;
          const mimeType = MediaRecorder.isTypeSupported("audio/ogg; codecs=opus")
            ? "audio/ogg; codecs=opus"
            : "audio/webm";
          const recorder = new MediaRecorder(stream, { mimeType });
          const chunks: Blob[] = [];

          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };

          recorder.onstop = () => {
            if (chunks.length > 0 && !cancelled) {
              const blob = new Blob(chunks, { type: mimeType });
              sendVoiceChunk(client, broadcastState, blob, CHUNK_DURATION_MS).catch(() => {
                // Silently ignore upload failures during broadcast
              });
            }
          };

          recorder.start();
          mediaRecorderRef.current = recorder;

          // Stop this chunk after CHUNK_DURATION_MS and start a new one
          chunkTimerRef.current = setTimeout(() => {
            if (recorder.state === "recording") {
              recorder.stop();
            }
            if (!cancelled && broadcastState.isRecording) {
              recordChunk();
            }
          }, CHUNK_DURATION_MS);
        }

        recordChunk();
      } catch {
        // Microphone access denied or not available
      }
    }

    startRecording();

    return () => {
      cancelled = true;
      if (animFrameRef.current != null) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (chunkTimerRef.current != null) {
        clearTimeout(chunkTimerRef.current);
      }
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handlePause = useCallback(async () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
    }
    await pauseVoiceBroadcast(client, broadcastState);
  }, [client, broadcastState]);

  const handleResume = useCallback(async () => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
    }
    await resumeVoiceBroadcast(client, broadcastState);
  }, [client, broadcastState]);

  const handleStop = useCallback(async () => {
    if (chunkTimerRef.current != null) {
      clearTimeout(chunkTimerRef.current);
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    await stopVoiceBroadcast(client, broadcastState);
    onStopped();
  }, [client, broadcastState, onStopped]);

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
      {/* Live indicator */}
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">
          {broadcastState.isPaused ? "Paused" : "Live"}
        </span>
      </div>

      {/* Audio level bars */}
      <div className="flex items-end gap-0.5 h-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="w-0.5 rounded-full bg-red-400 transition-all duration-100"
            style={{
              height: broadcastState.isPaused
                ? "4px"
                : `${Math.max(4, audioLevel * (16 + i * 4))}px`,
            }}
          />
        ))}
      </div>

      {/* Duration */}
      <span className="text-xs text-secondary font-mono tabular-nums min-w-[3rem]">
        {formatDuration(elapsed)}
      </span>

      {/* Controls */}
      <div className="flex items-center gap-1 ml-auto">
        {broadcastState.isPaused ? (
          <button
            onClick={handleResume}
            className="p-1.5 text-secondary hover:text-primary hover:bg-surface-3 rounded-lg transition-colors"
            title="Resume broadcast"
            aria-label="Resume broadcast"
          >
            {/* Play icon */}
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handlePause}
            className="p-1.5 text-secondary hover:text-primary hover:bg-surface-3 rounded-lg transition-colors"
            title="Pause broadcast"
            aria-label="Pause broadcast"
          >
            {/* Pause icon */}
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
            </svg>
          </button>
        )}
        <button
          onClick={handleStop}
          className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors"
          title="Stop broadcast"
          aria-label="Stop broadcast"
        >
          {/* Stop icon */}
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <rect x="4" y="4" width="12" height="12" rx="1.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
