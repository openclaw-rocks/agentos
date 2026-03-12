/**
 * Video room utilities for Matrix.
 *
 * A "video room" is a Matrix room created with `{ type: "m.video_room" }` in
 * its creation content. When a user opens a video room it automatically enters
 * a group call (via `m.call.member` state events).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VideoRoomCallState = "active" | "empty";

/** Minimal Room interface needed by video room utilities. */
export interface VRRoom {
  roomId: string;
  name?: string;
  currentState: {
    getStateEvents(eventType: string, stateKey?: string): VRStateEvent | VRStateEvent[] | null;
  };
}

export interface VRStateEvent {
  getContent(): Record<string, unknown>;
  getStateKey?(): string;
}

/** Minimal MatrixClient interface needed by video room utilities. */
export interface VRMatrixClient {
  createRoom(opts: Record<string, unknown>): Promise<{ room_id: string }>;
  sendStateEvent(
    roomId: string,
    eventType: string,
    content: Record<string, unknown>,
    stateKey?: string,
  ): Promise<{ event_id: string }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VIDEO_ROOM_TYPE = "m.video_room";
export const CALL_MEMBER_EVENT_TYPE = "m.call.member";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a room is a video room.
 *
 * A room is considered a video room if its `m.room.create` event has
 * `type: "m.video_room"` in its content.
 */
export function isVideoRoom(room: VRRoom): boolean {
  const createEvent = room.currentState.getStateEvents("m.room.create", "");
  if (!createEvent || Array.isArray(createEvent)) return false;
  const content = createEvent.getContent();
  return content.type === VIDEO_ROOM_TYPE;
}

/**
 * Create a new video room.
 *
 * @returns The room ID of the newly created video room.
 */
export async function createVideoRoom(
  client: VRMatrixClient,
  name: string,
  spaceId?: string,
): Promise<string> {
  const opts: Record<string, unknown> = {
    name,
    creation_content: { type: VIDEO_ROOM_TYPE },
    preset: "private_chat",
    initial_state: [
      {
        type: "m.room.history_visibility",
        content: { history_visibility: "shared" },
      },
    ],
  };

  const result = await client.createRoom(opts);

  // If inside a space, link as child
  if (spaceId) {
    await client.sendStateEvent(spaceId, "m.space.child", { via: [] }, result.room_id);
    await client.sendStateEvent(
      result.room_id,
      "m.space.parent",
      { canonical: true, via: [] },
      spaceId,
    );
  }

  return result.room_id;
}

/**
 * Get the current call state of a video room.
 *
 * Returns `"active"` if any user has a non-empty `m.call.member` state event,
 * `"empty"` otherwise.
 */
export function getVideoRoomCallState(room: VRRoom): VideoRoomCallState {
  const events = room.currentState.getStateEvents(CALL_MEMBER_EVENT_TYPE);

  if (!events) return "empty";

  const eventList = Array.isArray(events) ? events : [events];

  for (const event of eventList) {
    const content = event.getContent();
    const calls = content["m.calls"] as Array<Record<string, unknown>> | undefined;
    if (calls && calls.length > 0) {
      // Check that at least one call has at least one device
      for (const call of calls) {
        const devices = call["m.devices"] as Array<Record<string, unknown>> | undefined;
        if (devices && devices.length > 0) {
          return "active";
        }
      }
    }
  }

  return "empty";
}
