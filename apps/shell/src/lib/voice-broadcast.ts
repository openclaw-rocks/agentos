/**
 * Voice broadcast utilities for Matrix.
 *
 * Uses Element-compatible voice broadcast event types:
 * - `io.element.voice_broadcast_info`  (state event for start/pause/resume/stop)
 * - `io.element.voice_broadcast_chunk` (timeline event for audio chunks)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoiceBroadcastState {
  infoEventId: string;
  roomId: string;
  chunks: string[]; // mxc:// URLs of uploaded audio chunks
  isRecording: boolean;
  isPaused: boolean;
  startedAt: number;
}

export type BroadcastInfoState = "started" | "paused" | "resumed" | "stopped";

/** Minimal MatrixClient interface needed by voice broadcast functions. */
export interface VBMatrixClient {
  getUserId(): string | null;
  sendStateEvent(
    roomId: string,
    eventType: string,
    content: Record<string, unknown>,
    stateKey?: string,
  ): Promise<{ event_id: string }>;
  sendEvent(
    roomId: string,
    eventType: string,
    content: Record<string, unknown>,
  ): Promise<{ event_id: string }>;
  uploadContent(blob: Blob, opts?: { type?: string }): Promise<{ content_uri: string }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VOICE_BROADCAST_INFO_TYPE = "io.element.voice_broadcast_info";
export const VOICE_BROADCAST_CHUNK_TYPE = "io.element.voice_broadcast_chunk";

/** Default chunk duration in milliseconds (30 seconds). */
export const CHUNK_DURATION_MS = 30_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sendInfoEvent(
  client: VBMatrixClient,
  roomId: string,
  state: BroadcastInfoState,
  infoEventId?: string,
): Promise<string> {
  const userId = client.getUserId() ?? "";
  const content: Record<string, unknown> = {
    state,
    "io.element.voice_broadcast_info": infoEventId ?? undefined,
  };

  const result = await client.sendStateEvent(roomId, VOICE_BROADCAST_INFO_TYPE, content, userId);
  return result.event_id;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start a new voice broadcast in the given room.
 *
 * Sends a `started` state event and begins recording audio in chunks.
 */
export async function startVoiceBroadcast(
  client: VBMatrixClient,
  roomId: string,
): Promise<VoiceBroadcastState> {
  const eventId = await sendInfoEvent(client, roomId, "started");

  return {
    infoEventId: eventId,
    roomId,
    chunks: [],
    isRecording: true,
    isPaused: false,
    startedAt: Date.now(),
  };
}

/**
 * Pause an active voice broadcast.
 */
export async function pauseVoiceBroadcast(
  client: VBMatrixClient,
  state: VoiceBroadcastState,
): Promise<void> {
  await sendInfoEvent(client, state.roomId, "paused", state.infoEventId);
  state.isPaused = true;
}

/**
 * Resume a paused voice broadcast.
 */
export async function resumeVoiceBroadcast(
  client: VBMatrixClient,
  state: VoiceBroadcastState,
): Promise<void> {
  await sendInfoEvent(client, state.roomId, "resumed", state.infoEventId);
  state.isPaused = false;
}

/**
 * Stop a voice broadcast, sending the final `stopped` state event.
 */
export async function stopVoiceBroadcast(
  client: VBMatrixClient,
  state: VoiceBroadcastState,
): Promise<void> {
  await sendInfoEvent(client, state.roomId, "stopped", state.infoEventId);
  state.isRecording = false;
  state.isPaused = false;
}

/**
 * Upload an audio chunk blob and send a `voice_broadcast_chunk` event.
 */
export async function sendVoiceChunk(
  client: VBMatrixClient,
  state: VoiceBroadcastState,
  audioBlob: Blob,
  durationMs: number,
): Promise<void> {
  const uploaded = await client.uploadContent(audioBlob, { type: audioBlob.type });
  const mxcUrl = uploaded.content_uri;
  state.chunks.push(mxcUrl);

  await client.sendEvent(state.roomId, VOICE_BROADCAST_CHUNK_TYPE, {
    "io.element.voice_broadcast_info": state.infoEventId,
    url: mxcUrl,
    "org.matrix.msc3245.voice": {},
    info: {
      mimetype: audioBlob.type,
      size: audioBlob.size,
      duration: durationMs,
    },
    body: "Voice broadcast chunk",
    msgtype: "m.audio",
  });
}

/**
 * Detect whether a Matrix event is a voice broadcast info event.
 */
export function isVoiceBroadcast(event: { getType(): string }): boolean {
  return event.getType() === VOICE_BROADCAST_INFO_TYPE;
}

/**
 * Detect whether a Matrix event is a voice broadcast chunk event.
 */
export function isVoiceBroadcastChunk(event: { getType(): string }): boolean {
  return event.getType() === VOICE_BROADCAST_CHUNK_TYPE;
}
