import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GroupCall } from "./group-call";
import type { GroupCallState, GroupCallMember } from "./group-call";
import { clearTurnCache } from "./turn-server";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockMediaStream(): MediaStream {
  const audioTrack = {
    stop: vi.fn(),
    kind: "audio",
    id: "mock-audio-track",
    enabled: true,
    readyState: "live" as MediaStreamTrackState,
  } as unknown as MediaStreamTrack;

  const videoTrack = {
    stop: vi.fn(),
    kind: "video",
    id: "mock-video-track",
    enabled: true,
    readyState: "live" as MediaStreamTrackState,
  } as unknown as MediaStreamTrack;

  return {
    getTracks: () => [audioTrack, videoTrack],
    getAudioTracks: () => [audioTrack],
    getVideoTracks: () => [videoTrack],
    addTrack: vi.fn(),
  } as unknown as MediaStream;
}

class MockRTCPeerConnection {
  static instances: MockRTCPeerConnection[] = [];

  onicecandidate: ((event: { candidate: RTCIceCandidate | null }) => void) | null = null;
  ontrack: ((event: { track: MediaStreamTrack }) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  iceConnectionState: RTCIceConnectionState = "new";
  remoteDescription: RTCSessionDescription | null = null;
  localDescription: RTCSessionDescription | null = null;

  addTrack = vi.fn();
  close = vi.fn();
  addIceCandidate = vi.fn().mockResolvedValue(undefined);

  createOffer = vi.fn().mockResolvedValue({
    type: "offer" as RTCSdpType,
    sdp: "mock-sdp-offer",
  });

  createAnswer = vi.fn().mockResolvedValue({
    type: "answer" as RTCSdpType,
    sdp: "mock-sdp-answer",
  });

  setLocalDescription = vi.fn().mockImplementation(async (desc: RTCSessionDescription) => {
    this.localDescription = desc;
  });

  setRemoteDescription = vi.fn().mockImplementation(async (desc: RTCSessionDescription) => {
    this.remoteDescription = desc;
  });

  constructor() {
    MockRTCPeerConnection.instances.push(this);
  }
}

class MockRTCSessionDescription {
  type: RTCSdpType;
  sdp: string;

  constructor(init: { type: RTCSdpType; sdp: string }) {
    this.type = init.type;
    this.sdp = init.sdp;
  }
}

class MockRTCIceCandidate {
  candidate: string;

  constructor(init: { candidate: string }) {
    this.candidate = init.candidate ?? "";
  }
}

type ListenerMap = Map<string, ((...args: any[]) => void)[]>;

function createMockMatrixClient(): {
  client: ReturnType<typeof createMockClientShape>;
  listeners: ListenerMap;
} {
  const listeners: ListenerMap = new Map();

  const client = createMockClientShape(listeners);
  return { client, listeners };
}

function createMockClientShape(listeners: ListenerMap) {
  return {
    getUserId: vi.fn().mockReturnValue("@me:matrix.org"),
    getDeviceId: vi.fn().mockReturnValue("MYDEVICE01"),
    getRoom: vi.fn().mockReturnValue(null),
    sendStateEvent: vi.fn().mockResolvedValue({ event_id: "$state1" }),
    sendToDevice: vi.fn().mockResolvedValue({}),
    turnServer: vi.fn().mockResolvedValue({ uris: [], ttl: 60 }),
    on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      const handlers = listeners.get(event) ?? [];
      handlers.push(handler);
      listeners.set(event, handlers);
    }),
    removeListener: vi
      .fn()
      .mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
        const handlers = listeners.get(event) ?? [];
        listeners.set(
          event,
          handlers.filter((h) => h !== handler),
        );
      }),
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let originalRTCPeerConnection: typeof globalThis.RTCPeerConnection | undefined;
let originalRTCSessionDescription: typeof globalThis.RTCSessionDescription | undefined;
let originalRTCIceCandidate: typeof globalThis.RTCIceCandidate | undefined;
let originalGetUserMedia: typeof navigator.mediaDevices.getUserMedia | undefined;

beforeEach(() => {
  MockRTCPeerConnection.instances = [];
  clearTurnCache();

  originalRTCPeerConnection = globalThis.RTCPeerConnection;
  originalRTCSessionDescription = globalThis.RTCSessionDescription;
  originalRTCIceCandidate = globalThis.RTCIceCandidate;

  globalThis.RTCPeerConnection = MockRTCPeerConnection as any;

  globalThis.RTCSessionDescription = MockRTCSessionDescription as any;

  globalThis.RTCIceCandidate = MockRTCIceCandidate as any;

  originalGetUserMedia = navigator?.mediaDevices?.getUserMedia;

  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn() },
      writable: true,
      configurable: true,
    });
  }

  const mockStream = createMockMediaStream();
  navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockStream);
});

afterEach(() => {
  if (originalRTCPeerConnection) {
    globalThis.RTCPeerConnection = originalRTCPeerConnection;
  }
  if (originalRTCSessionDescription) {
    globalThis.RTCSessionDescription = originalRTCSessionDescription;
  }
  if (originalRTCIceCandidate) {
    globalThis.RTCIceCandidate = originalRTCIceCandidate;
  }
  if (originalGetUserMedia && navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = originalGetUserMedia;
  }
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GroupCall", () => {
  describe("given an idle group call", () => {
    it("should start in idle state", () => {
      const { client } = createMockMatrixClient();

      const gc = new GroupCall(client as any);

      expect(gc.getState()).toBe("idle");
      expect(gc.getMembers()).toEqual([]);
    });
  });

  describe("given join is called", () => {
    describe("when joining a voice call", () => {
      it("should send m.call.member state event", async () => {
        const { client } = createMockMatrixClient();

        const gc = new GroupCall(client as any);

        await gc.join("!room1:matrix.org", "voice");

        expect(client.sendStateEvent).toHaveBeenCalledWith(
          "!room1:matrix.org",
          "m.call.member",
          expect.objectContaining({
            "m.calls": expect.arrayContaining([
              expect.objectContaining({
                "m.call_id": expect.any(String),
                "m.devices": expect.arrayContaining([
                  expect.objectContaining({
                    device_id: "MYDEVICE01",
                    session_id: expect.any(String),
                    feeds: [{ purpose: "m.usermedia" }],
                  }),
                ]),
              }),
            ]),
          }),
          "@me:matrix.org",
        );
      });

      it("should transition to connected state", async () => {
        const { client } = createMockMatrixClient();

        const gc = new GroupCall(client as any);
        const stateChanges: GroupCallState[] = [];
        gc.onStateChange = (s) => stateChanges.push(s);

        await gc.join("!room1:matrix.org", "voice");

        expect(gc.getState()).toBe("connected");
        expect(stateChanges).toEqual(["joining", "connected"]);
      });

      it("should acquire audio-only media", async () => {
        const { client } = createMockMatrixClient();

        const gc = new GroupCall(client as any);

        await gc.join("!room1:matrix.org", "voice");

        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
          audio: true,
          video: false,
        });
        expect(gc.getLocalStream()).not.toBeNull();
      });
    });

    describe("when joining a video call", () => {
      it("should acquire audio and video media", async () => {
        const { client } = createMockMatrixClient();

        const gc = new GroupCall(client as any);

        await gc.join("!room1:matrix.org", "video");

        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
          audio: true,
          video: true,
        });
      });
    });

    describe("when already in a call", () => {
      it("should throw an error", async () => {
        const { client } = createMockMatrixClient();

        const gc = new GroupCall(client as any);

        await gc.join("!room1:matrix.org", "voice");

        await expect(gc.join("!room2:matrix.org", "voice")).rejects.toThrow(
          'Cannot join call in state "connected"',
        );
      });
    });
  });

  describe("given leave is called", () => {
    it("should remove the m.call.member state event", async () => {
      const { client } = createMockMatrixClient();

      const gc = new GroupCall(client as any);

      await gc.join("!room1:matrix.org", "voice");
      client.sendStateEvent.mockClear();

      await gc.leave();

      expect(client.sendStateEvent).toHaveBeenCalledWith(
        "!room1:matrix.org",
        "m.call.member",
        { "m.calls": [] },
        "@me:matrix.org",
      );
    });

    it("should transition to ended state", async () => {
      const { client } = createMockMatrixClient();

      const gc = new GroupCall(client as any);

      await gc.join("!room1:matrix.org", "voice");
      await gc.leave();

      expect(gc.getState()).toBe("ended");
    });

    it("should stop local media tracks", async () => {
      const { client } = createMockMatrixClient();

      const gc = new GroupCall(client as any);

      await gc.join("!room1:matrix.org", "voice");
      const stream = gc.getLocalStream()!;
      const tracks = stream.getTracks();

      await gc.leave();

      for (const track of tracks) {
        expect(track.stop).toHaveBeenCalled();
      }
      expect(gc.getLocalStream()).toBeNull();
    });
  });

  describe("given member tracking", () => {
    describe("when a new member joins via state event", () => {
      it("should invoke onMemberJoined callback", async () => {
        const { client, listeners } = createMockMatrixClient();

        const gc = new GroupCall(client as any);
        const joined: GroupCallMember[] = [];
        gc.onMemberJoined = (m) => joined.push(m);

        await gc.join("!room1:matrix.org", "voice");
        const callId = gc.getCallId();

        // Simulate a state event from another user
        const stateHandlers = listeners.get("RoomState.events") ?? [];
        const mockEvent = {
          getType: () => "m.call.member",
          getStateKey: () => "@alice:matrix.org",
          getSender: () => "@alice:matrix.org",
          getContent: () => ({
            "m.calls": [
              {
                "m.call_id": callId,
                "m.devices": [
                  {
                    device_id: "ALICEDEV",
                    session_id: "alice-session-1",
                    feeds: [{ purpose: "m.usermedia" }],
                  },
                ],
              },
            ],
          }),
        };

        for (const handler of stateHandlers) {
          handler(mockEvent);
        }

        // Wait for the async connectToPeer to complete
        await new Promise((r) => setTimeout(r, 10));

        expect(joined).toHaveLength(1);
        expect(joined[0].userId).toBe("@alice:matrix.org");
        expect(joined[0].deviceId).toBe("ALICEDEV");
      });
    });

    describe("when a member leaves via empty state event", () => {
      it("should invoke onMemberLeft callback and remove the member", async () => {
        const { client, listeners } = createMockMatrixClient();

        const gc = new GroupCall(client as any);
        const left: GroupCallMember[] = [];
        gc.onMemberLeft = (m) => left.push(m);

        await gc.join("!room1:matrix.org", "voice");
        const callId = gc.getCallId();

        // First: member joins
        const stateHandlers = listeners.get("RoomState.events") ?? [];
        const joinEvent = {
          getType: () => "m.call.member",
          getStateKey: () => "@bob:matrix.org",
          getSender: () => "@bob:matrix.org",
          getContent: () => ({
            "m.calls": [
              {
                "m.call_id": callId,
                "m.devices": [
                  {
                    device_id: "BOBDEV",
                    session_id: "bob-session-1",
                    feeds: [{ purpose: "m.usermedia" }],
                  },
                ],
              },
            ],
          }),
        };

        for (const handler of stateHandlers) {
          handler(joinEvent);
        }
        await new Promise((r) => setTimeout(r, 10));

        expect(gc.getMembers()).toHaveLength(1);

        // Then: member leaves (empty m.calls)
        const leaveEvent = {
          getType: () => "m.call.member",
          getStateKey: () => "@bob:matrix.org",
          getSender: () => "@bob:matrix.org",
          getContent: () => ({ "m.calls": [] }),
        };

        for (const handler of stateHandlers) {
          handler(leaveEvent);
        }

        expect(left).toHaveLength(1);
        expect(left[0].userId).toBe("@bob:matrix.org");
        expect(gc.getMembers()).toHaveLength(0);
      });
    });
  });

  describe("given mute/unmute controls", () => {
    describe("when toggling audio mute", () => {
      it("should toggle the audio muted state", async () => {
        const { client } = createMockMatrixClient();

        const gc = new GroupCall(client as any);

        await gc.join("!room1:matrix.org", "voice");

        expect(gc.isAudioMuted()).toBe(false);

        const muted = gc.toggleMute();
        expect(muted).toBe(true);
        expect(gc.isAudioMuted()).toBe(true);

        const unmuted = gc.toggleMute();
        expect(unmuted).toBe(false);
        expect(gc.isAudioMuted()).toBe(false);
      });

      it("should disable audio tracks on the local stream", async () => {
        const { client } = createMockMatrixClient();

        const gc = new GroupCall(client as any);

        await gc.join("!room1:matrix.org", "voice");
        const stream = gc.getLocalStream()!;

        gc.toggleMute();

        const audioTracks = stream.getAudioTracks();
        expect(audioTracks[0].enabled).toBe(false);
      });
    });

    describe("when toggling video", () => {
      it("should toggle the video muted state", async () => {
        const { client } = createMockMatrixClient();

        const gc = new GroupCall(client as any);

        await gc.join("!room1:matrix.org", "video");

        expect(gc.isVideoMuted()).toBe(false);

        const muted = gc.toggleVideo();
        expect(muted).toBe(true);
        expect(gc.isVideoMuted()).toBe(true);

        const unmuted = gc.toggleVideo();
        expect(unmuted).toBe(false);
        expect(gc.isVideoMuted()).toBe(false);
      });
    });
  });

  describe("given state transitions", () => {
    it("should follow idle -> joining -> connected -> ended lifecycle", async () => {
      const { client } = createMockMatrixClient();

      const gc = new GroupCall(client as any);
      const states: GroupCallState[] = [];
      gc.onStateChange = (s) => states.push(s);

      expect(gc.getState()).toBe("idle");

      await gc.join("!room1:matrix.org", "voice");
      expect(gc.getState()).toBe("connected");

      await gc.leave();
      expect(gc.getState()).toBe("ended");

      expect(states).toEqual(["joining", "connected", "ended"]);
    });
  });

  describe("given destroy is called", () => {
    it("should clean up all resources and nullify callbacks", async () => {
      const { client } = createMockMatrixClient();

      const gc = new GroupCall(client as any);

      gc.onMemberJoined = vi.fn();
      gc.onMemberLeft = vi.fn();
      gc.onStateChange = vi.fn();

      await gc.join("!room1:matrix.org", "voice");

      gc.destroy();

      expect(gc.onMemberJoined).toBeNull();
      expect(gc.onMemberLeft).toBeNull();
      expect(gc.onStateChange).toBeNull();
      expect(gc.getLocalStream()).toBeNull();
      expect(gc.getMembers()).toEqual([]);
    });
  });

  describe("given existing members in a room", () => {
    it("should create peer connections to existing members on join", async () => {
      const { client } = createMockMatrixClient();

      // Mock room with existing m.call.member state events
      const mockRoom = {
        currentState: {
          getStateEvents: vi.fn().mockReturnValue([
            {
              getStateKey: () => "@alice:matrix.org",
              getSender: () => "@alice:matrix.org",
              getContent: () => ({
                "m.calls": [
                  {
                    "m.call_id": "existing-call",
                    "m.devices": [
                      {
                        device_id: "ALICEDEV",
                        session_id: "alice-session",
                        feeds: [{ purpose: "m.usermedia" }],
                      },
                    ],
                  },
                ],
              }),
            },
          ]),
        },
      };
      client.getRoom.mockReturnValue(mockRoom);

      const gc = new GroupCall(client as any);
      const joined: GroupCallMember[] = [];
      gc.onMemberJoined = (m) => joined.push(m);

      await gc.join("!room1:matrix.org", "voice");

      expect(joined).toHaveLength(1);
      expect(joined[0].userId).toBe("@alice:matrix.org");
      expect(MockRTCPeerConnection.instances.length).toBeGreaterThanOrEqual(1);
    });
  });
});
