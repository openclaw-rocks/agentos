import { describe, it, expect, vi } from "vitest";
import {
  isVideoRoom,
  createVideoRoom,
  getVideoRoomCallState,
  VIDEO_ROOM_TYPE,
  type VRRoom,
  type VRMatrixClient,
} from "./video-room";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockRoom(
  createContent: Record<string, unknown>,
  callMemberEvents?: Array<Record<string, unknown>>,
): VRRoom {
  return {
    roomId: "!room:matrix.org",
    name: "Test Room",
    currentState: {
      getStateEvents(eventType: string, stateKey?: string) {
        if (eventType === "m.room.create" && stateKey === "") {
          return { getContent: () => createContent };
        }
        if (eventType === "m.call.member" && stateKey === undefined) {
          if (!callMemberEvents || callMemberEvents.length === 0) return null;
          return callMemberEvents.map((content) => ({
            getContent: () => content,
            getStateKey: () => "@someone:matrix.org",
          }));
        }
        return null;
      },
    },
  };
}

function createMockClient(): VRMatrixClient {
  return {
    createRoom: vi.fn().mockResolvedValue({ room_id: "!video1:matrix.org" }),
    sendStateEvent: vi.fn().mockResolvedValue({ event_id: "$ev1" }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("video-room", () => {
  // -----------------------------------------------------------------------
  // isVideoRoom
  // -----------------------------------------------------------------------
  describe("isVideoRoom", () => {
    describe("given a room with video room type in creation content", () => {
      it("should return true", () => {
        const room = createMockRoom({ type: VIDEO_ROOM_TYPE });

        expect(isVideoRoom(room)).toBe(true);
      });
    });

    describe("given a normal room without video room type", () => {
      it("should return false", () => {
        const room = createMockRoom({});

        expect(isVideoRoom(room)).toBe(false);
      });
    });

    describe("given a room with a different type", () => {
      it("should return false", () => {
        const room = createMockRoom({ type: "m.space" });

        expect(isVideoRoom(room)).toBe(false);
      });
    });

    describe("given a room with no create event", () => {
      it("should return false", () => {
        const room: VRRoom = {
          roomId: "!room:matrix.org",
          currentState: {
            getStateEvents: () => null,
          },
        };

        expect(isVideoRoom(room)).toBe(false);
      });
    });
  });

  // -----------------------------------------------------------------------
  // createVideoRoom
  // -----------------------------------------------------------------------
  describe("createVideoRoom", () => {
    describe("given a name and no space", () => {
      it("should create a room with video room creation content", async () => {
        const client = createMockClient();

        const roomId = await createVideoRoom(client, "My Video Room");

        expect(roomId).toBe("!video1:matrix.org");
        expect(client.createRoom).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "My Video Room",
            creation_content: { type: VIDEO_ROOM_TYPE },
          }),
        );
      });

      it("should not send space child/parent events", async () => {
        const client = createMockClient();

        await createVideoRoom(client, "My Video Room");

        expect(client.sendStateEvent).not.toHaveBeenCalled();
      });
    });

    describe("given a name and a space ID", () => {
      it("should create the room and link it to the space", async () => {
        const client = createMockClient();

        const roomId = await createVideoRoom(client, "Video Meeting", "!space:matrix.org");

        expect(roomId).toBe("!video1:matrix.org");

        // Should send m.space.child on the space
        expect(client.sendStateEvent).toHaveBeenCalledWith(
          "!space:matrix.org",
          "m.space.child",
          expect.any(Object),
          "!video1:matrix.org",
        );

        // Should send m.space.parent on the new room
        expect(client.sendStateEvent).toHaveBeenCalledWith(
          "!video1:matrix.org",
          "m.space.parent",
          expect.objectContaining({ canonical: true }),
          "!space:matrix.org",
        );
      });
    });
  });

  // -----------------------------------------------------------------------
  // getVideoRoomCallState
  // -----------------------------------------------------------------------
  describe("getVideoRoomCallState", () => {
    describe("given a room with active call members", () => {
      it("should return 'active'", () => {
        const room = createMockRoom({ type: VIDEO_ROOM_TYPE }, [
          {
            "m.calls": [
              {
                "m.call_id": "call1",
                "m.devices": [{ device_id: "DEV1", session_id: "s1", feeds: [] }],
              },
            ],
          },
        ]);

        expect(getVideoRoomCallState(room)).toBe("active");
      });
    });

    describe("given a room with empty call member events", () => {
      it("should return 'empty'", () => {
        const room = createMockRoom({ type: VIDEO_ROOM_TYPE }, [{ "m.calls": [] }]);

        expect(getVideoRoomCallState(room)).toBe("empty");
      });
    });

    describe("given a room with no call member events", () => {
      it("should return 'empty'", () => {
        const room = createMockRoom({ type: VIDEO_ROOM_TYPE });

        expect(getVideoRoomCallState(room)).toBe("empty");
      });
    });

    describe("given a room where call has members with no devices", () => {
      it("should return 'empty'", () => {
        const room = createMockRoom({ type: VIDEO_ROOM_TYPE }, [
          {
            "m.calls": [
              {
                "m.call_id": "call1",
                "m.devices": [],
              },
            ],
          },
        ]);

        expect(getVideoRoomCallState(room)).toBe("empty");
      });
    });

    describe("given multiple call members with mixed state", () => {
      it("should return 'active' if at least one has devices", () => {
        const room = createMockRoom({ type: VIDEO_ROOM_TYPE }, [
          { "m.calls": [] },
          {
            "m.calls": [
              {
                "m.call_id": "call1",
                "m.devices": [{ device_id: "DEV1" }],
              },
            ],
          },
        ]);

        expect(getVideoRoomCallState(room)).toBe("active");
      });
    });
  });
});
