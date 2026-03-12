import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  startVoiceBroadcast,
  pauseVoiceBroadcast,
  resumeVoiceBroadcast,
  stopVoiceBroadcast,
  sendVoiceChunk,
  isVoiceBroadcast,
  isVoiceBroadcastChunk,
  VOICE_BROADCAST_INFO_TYPE,
  VOICE_BROADCAST_CHUNK_TYPE,
  type VBMatrixClient,
} from "./voice-broadcast";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockClient(): VBMatrixClient {
  return {
    getUserId: vi.fn().mockReturnValue("@user:matrix.org"),
    sendStateEvent: vi.fn().mockResolvedValue({ event_id: "$info1" }),
    sendEvent: vi.fn().mockResolvedValue({ event_id: "$chunk1" }),
    uploadContent: vi.fn().mockResolvedValue({ content_uri: "mxc://matrix.org/audio1" }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("voice-broadcast", () => {
  let client: VBMatrixClient;

  beforeEach(() => {
    client = createMockClient();
  });

  // -----------------------------------------------------------------------
  // startVoiceBroadcast
  // -----------------------------------------------------------------------
  describe("startVoiceBroadcast", () => {
    describe("given a valid client and room", () => {
      it("should send a started state event", async () => {
        await startVoiceBroadcast(client, "!room:matrix.org");

        expect(client.sendStateEvent).toHaveBeenCalledWith(
          "!room:matrix.org",
          VOICE_BROADCAST_INFO_TYPE,
          expect.objectContaining({ state: "started" }),
          "@user:matrix.org",
        );
      });

      it("should return a VoiceBroadcastState with isRecording true", async () => {
        const state = await startVoiceBroadcast(client, "!room:matrix.org");

        expect(state.isRecording).toBe(true);
        expect(state.isPaused).toBe(false);
        expect(state.roomId).toBe("!room:matrix.org");
        expect(state.infoEventId).toBe("$info1");
        expect(state.chunks).toEqual([]);
        expect(state.startedAt).toBeGreaterThan(0);
      });
    });
  });

  // -----------------------------------------------------------------------
  // pauseVoiceBroadcast
  // -----------------------------------------------------------------------
  describe("pauseVoiceBroadcast", () => {
    describe("given an active broadcast", () => {
      it("should send a paused state event", async () => {
        const state = await startVoiceBroadcast(client, "!room:matrix.org");
        (client.sendStateEvent as ReturnType<typeof vi.fn>).mockClear();

        await pauseVoiceBroadcast(client, state);

        expect(client.sendStateEvent).toHaveBeenCalledWith(
          "!room:matrix.org",
          VOICE_BROADCAST_INFO_TYPE,
          expect.objectContaining({ state: "paused" }),
          "@user:matrix.org",
        );
      });

      it("should set isPaused to true", async () => {
        const state = await startVoiceBroadcast(client, "!room:matrix.org");

        await pauseVoiceBroadcast(client, state);

        expect(state.isPaused).toBe(true);
      });
    });
  });

  // -----------------------------------------------------------------------
  // resumeVoiceBroadcast
  // -----------------------------------------------------------------------
  describe("resumeVoiceBroadcast", () => {
    describe("given a paused broadcast", () => {
      it("should send a resumed state event", async () => {
        const state = await startVoiceBroadcast(client, "!room:matrix.org");
        await pauseVoiceBroadcast(client, state);
        (client.sendStateEvent as ReturnType<typeof vi.fn>).mockClear();

        await resumeVoiceBroadcast(client, state);

        expect(client.sendStateEvent).toHaveBeenCalledWith(
          "!room:matrix.org",
          VOICE_BROADCAST_INFO_TYPE,
          expect.objectContaining({ state: "resumed" }),
          "@user:matrix.org",
        );
      });

      it("should set isPaused to false", async () => {
        const state = await startVoiceBroadcast(client, "!room:matrix.org");
        await pauseVoiceBroadcast(client, state);

        await resumeVoiceBroadcast(client, state);

        expect(state.isPaused).toBe(false);
      });
    });
  });

  // -----------------------------------------------------------------------
  // stopVoiceBroadcast
  // -----------------------------------------------------------------------
  describe("stopVoiceBroadcast", () => {
    describe("given an active broadcast", () => {
      it("should send a stopped state event", async () => {
        const state = await startVoiceBroadcast(client, "!room:matrix.org");
        (client.sendStateEvent as ReturnType<typeof vi.fn>).mockClear();

        await stopVoiceBroadcast(client, state);

        expect(client.sendStateEvent).toHaveBeenCalledWith(
          "!room:matrix.org",
          VOICE_BROADCAST_INFO_TYPE,
          expect.objectContaining({ state: "stopped" }),
          "@user:matrix.org",
        );
      });

      it("should set isRecording to false and isPaused to false", async () => {
        const state = await startVoiceBroadcast(client, "!room:matrix.org");

        await stopVoiceBroadcast(client, state);

        expect(state.isRecording).toBe(false);
        expect(state.isPaused).toBe(false);
      });
    });
  });

  // -----------------------------------------------------------------------
  // sendVoiceChunk
  // -----------------------------------------------------------------------
  describe("sendVoiceChunk", () => {
    describe("given an active broadcast and audio blob", () => {
      it("should upload the blob and send a chunk event", async () => {
        const state = await startVoiceBroadcast(client, "!room:matrix.org");
        const blob = new Blob(["audio-data"], { type: "audio/ogg" });

        await sendVoiceChunk(client, state, blob, 30000);

        expect(client.uploadContent).toHaveBeenCalledWith(blob, { type: "audio/ogg" });
        expect(client.sendEvent).toHaveBeenCalledWith(
          "!room:matrix.org",
          VOICE_BROADCAST_CHUNK_TYPE,
          expect.objectContaining({
            "io.element.voice_broadcast_info": "$info1",
            url: "mxc://matrix.org/audio1",
            msgtype: "m.audio",
          }),
        );
      });

      it("should append the mxc URL to the chunks array", async () => {
        const state = await startVoiceBroadcast(client, "!room:matrix.org");
        const blob = new Blob(["audio-data"], { type: "audio/ogg" });

        await sendVoiceChunk(client, state, blob, 30000);

        expect(state.chunks).toEqual(["mxc://matrix.org/audio1"]);
      });
    });
  });

  // -----------------------------------------------------------------------
  // isVoiceBroadcast
  // -----------------------------------------------------------------------
  describe("isVoiceBroadcast", () => {
    describe("given an event with voice broadcast info type", () => {
      it("should return true", () => {
        const event = { getType: () => VOICE_BROADCAST_INFO_TYPE };
        expect(isVoiceBroadcast(event)).toBe(true);
      });
    });

    describe("given a regular message event", () => {
      it("should return false", () => {
        const event = { getType: () => "m.room.message" };
        expect(isVoiceBroadcast(event)).toBe(false);
      });
    });
  });

  // -----------------------------------------------------------------------
  // isVoiceBroadcastChunk
  // -----------------------------------------------------------------------
  describe("isVoiceBroadcastChunk", () => {
    describe("given an event with voice broadcast chunk type", () => {
      it("should return true", () => {
        const event = { getType: () => VOICE_BROADCAST_CHUNK_TYPE };
        expect(isVoiceBroadcastChunk(event)).toBe(true);
      });
    });

    describe("given a regular event", () => {
      it("should return false", () => {
        const event = { getType: () => "m.room.message" };
        expect(isVoiceBroadcastChunk(event)).toBe(false);
      });
    });
  });
});
