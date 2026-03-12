import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clearTurnCache } from "./turn-server";
import { WebRTCCall } from "./webrtc-call";
import type { CallState } from "./webrtc-call";

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

function createVoiceOnlyStream(): MediaStream {
  const audioTrack = {
    stop: vi.fn(),
    kind: "audio",
    id: "mock-audio-track",
    enabled: true,
    readyState: "live" as MediaStreamTrackState,
  } as unknown as MediaStreamTrack;

  return {
    getTracks: () => [audioTrack],
    getAudioTracks: () => [audioTrack],
    getVideoTracks: () => [],
    addTrack: vi.fn(),
  } as unknown as MediaStream;
}

/** Captures the onicecandidate / ontrack / oniceconnectionstatechange callbacks. */
class MockRTCPeerConnection {
  static instances: MockRTCPeerConnection[] = [];

  onicecandidate: ((e: { candidate: unknown }) => void) | null = null;
  ontrack: ((e: { track: unknown }) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  iceConnectionState = "new";
  remoteDescription: unknown = null;

  localDescription: unknown = null;
  private tracks: unknown[] = [];

  constructor(_config?: RTCConfiguration) {
    MockRTCPeerConnection.instances.push(this);
  }

  createOffer = vi.fn().mockResolvedValue({
    type: "offer",
    sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
  });

  createAnswer = vi.fn().mockResolvedValue({
    type: "answer",
    sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
  });

  setLocalDescription = vi.fn().mockImplementation(async (desc: unknown) => {
    this.localDescription = desc;
  });

  setRemoteDescription = vi.fn().mockImplementation(async (desc: unknown) => {
    this.remoteDescription = desc;
  });

  addIceCandidate = vi.fn().mockResolvedValue(undefined);
  addTrack = vi.fn().mockImplementation((track: unknown) => {
    this.tracks.push(track);
  });

  close = vi.fn();

  // Simulate firing an ICE candidate
  simulateIceCandidate(candidate: unknown): void {
    this.onicecandidate?.({ candidate });
  }

  // Simulate a remote track arriving
  simulateTrack(track: unknown): void {
    this.ontrack?.({ track });
  }

  // Simulate ICE disconnection
  simulateIceDisconnect(): void {
    this.iceConnectionState = "disconnected";
    this.oniceconnectionstatechange?.();
  }
}

class MockRTCSessionDescription {
  type: string;
  sdp: string;
  constructor(init: { type: string; sdp: string }) {
    this.type = init.type;
    this.sdp = init.sdp;
  }
}

class MockRTCIceCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  constructor(init: RTCIceCandidateInit) {
    this.candidate = init.candidate ?? "";
    this.sdpMid = init.sdpMid ?? null;
    this.sdpMLineIndex = init.sdpMLineIndex ?? null;
  }
  toJSON(): RTCIceCandidateInit {
    return { candidate: this.candidate, sdpMid: this.sdpMid, sdpMLineIndex: this.sdpMLineIndex };
  }
}

function createMockClient(): MatrixClient {
  return {
    getUserId: vi.fn().mockReturnValue("@me:example.com"),
    sendEvent: vi.fn().mockResolvedValue({ event_id: "$sent-event" }),
    on: vi.fn(),
    removeListener: vi.fn(),
    turnServer: vi.fn().mockResolvedValue({ uris: [], ttl: 60 }),
  } as unknown as MatrixClient;
}

function createMockMatrixEvent(
  type: string,
  content: Record<string, unknown>,
  sender = "@other:example.com",
): MatrixEvent {
  return {
    getType: () => type,
    getSender: () => sender,
    getContent: () => content,
    getId: () => "$event-" + Math.random().toString(36).slice(2),
  } as unknown as MatrixEvent;
}

function createMockRoom(roomId = "!room:example.com"): Room {
  return {
    roomId,
  } as unknown as Room;
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

  globalThis.RTCPeerConnection = MockRTCPeerConnection as any;

  originalRTCSessionDescription = globalThis.RTCSessionDescription;

  globalThis.RTCSessionDescription = MockRTCSessionDescription as any;

  originalRTCIceCandidate = globalThis.RTCIceCandidate;

  globalThis.RTCIceCandidate = MockRTCIceCandidate as any;

  originalGetUserMedia = navigator?.mediaDevices?.getUserMedia;

  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn() },
      writable: true,
      configurable: true,
    });
  }
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

describe("WebRTCCall", () => {
  describe("given a new call manager", () => {
    it("should start in idle state", () => {
      const client = createMockClient();
      const call = new WebRTCCall(client);

      expect(call.getState()).toBe("idle");
      expect(call.getLocalStream()).toBeNull();
      expect(call.getRemoteStream()).toBeNull();

      call.destroy();
    });

    it("should attach Matrix event listeners on construction", () => {
      const client = createMockClient();
      const call = new WebRTCCall(client);

      expect(client.on).toHaveBeenCalled();

      call.destroy();
    });

    it("should detach Matrix event listeners on destroy", () => {
      const client = createMockClient();
      const call = new WebRTCCall(client);

      call.destroy();

      expect(client.removeListener).toHaveBeenCalled();
    });
  });

  describe("given an outgoing call is started", () => {
    let client: MatrixClient;
    let call: WebRTCCall;
    const stateChanges: CallState[] = [];

    beforeEach(async () => {
      stateChanges.length = 0;
      client = createMockClient();
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(createMockMediaStream());

      call = new WebRTCCall(client);
      call.onStateChange = (state) => stateChanges.push(state);

      await call.startCall("!room:example.com", "video");
    });

    afterEach(() => {
      call.destroy();
    });

    it("should transition to calling state", () => {
      expect(call.getState()).toBe("calling");
      expect(stateChanges).toContain("calling");
    });

    it("should send m.call.invite event with SDP offer", () => {
      expect(client.sendEvent).toHaveBeenCalledWith(
        "!room:example.com",
        "m.call.invite",
        expect.objectContaining({
          call_id: expect.any(String),
          version: 0,
          lifetime: 60000,
          offer: expect.objectContaining({
            type: "offer",
            sdp: expect.any(String),
          }),
        }),
      );
    });

    it("should request video media for a video call", () => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: true,
        video: true,
      });
    });

    it("should have a local media stream", () => {
      expect(call.getLocalStream()).not.toBeNull();
    });

    it("should create an RTCPeerConnection", () => {
      expect(MockRTCPeerConnection.instances.length).toBeGreaterThanOrEqual(1);
    });

    it("should set the call type and room ID correctly", () => {
      expect(call.getCallType()).toBe("video");
      expect(call.getRoomId()).toBe("!room:example.com");
      expect(call.getDirection()).toBe("outbound");
    });

    it("should transition to connected when answer is received", async () => {
      const answerEvent = createMockMatrixEvent("m.call.answer", {
        call_id: call.getCallId(),
        version: 0,
        answer: {
          type: "answer",
          sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
        },
      });

      call.handleCallEvent(answerEvent, createMockRoom());

      // Allow async setRemoteDescription to complete
      await vi.waitFor(() => {
        expect(call.getState()).toBe("connected");
      });
    });
  });

  describe("given a voice call is started", () => {
    it("should only request audio media", async () => {
      const client = createMockClient();
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(createVoiceOnlyStream());

      const call = new WebRTCCall(client);
      await call.startCall("!room:example.com", "voice");

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: true,
        video: false,
      });

      call.destroy();
    });
  });

  describe("given hangup is called", () => {
    it("should transition to ended state and send m.call.hangup", async () => {
      const client = createMockClient();
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(createMockMediaStream());

      const call = new WebRTCCall(client);
      const stateChanges: CallState[] = [];
      call.onStateChange = (state) => stateChanges.push(state);

      await call.startCall("!room:example.com", "voice");

      await call.hangup();

      expect(call.getState()).toBe("ended");
      expect(stateChanges).toContain("ended");
      expect(client.sendEvent).toHaveBeenCalledWith(
        "!room:example.com",
        "m.call.hangup",
        expect.objectContaining({
          call_id: expect.any(String),
          version: 0,
          reason: "user_hangup",
        }),
      );

      call.destroy();
    });

    it("should stop local media tracks", async () => {
      const client = createMockClient();
      const mockStream = createMockMediaStream();
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockStream);

      const call = new WebRTCCall(client);
      await call.startCall("!room:example.com", "video");

      await call.hangup();

      for (const track of mockStream.getTracks()) {
        expect(track.stop).toHaveBeenCalled();
      }

      expect(call.getLocalStream()).toBeNull();
      expect(call.getRemoteStream()).toBeNull();

      call.destroy();
    });
  });

  describe("given mute and video toggles", () => {
    it("should toggle audio track enabled state", async () => {
      const client = createMockClient();
      const mockStream = createMockMediaStream();
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockStream);

      const call = new WebRTCCall(client);
      await call.startCall("!room:example.com", "video");

      expect(call.isMuted()).toBe(false);

      call.toggleMute();
      expect(call.isMuted()).toBe(true);

      call.toggleMute();
      expect(call.isMuted()).toBe(false);

      call.destroy();
    });

    it("should toggle video track enabled state", async () => {
      const client = createMockClient();
      const mockStream = createMockMediaStream();
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockStream);

      const call = new WebRTCCall(client);
      await call.startCall("!room:example.com", "video");

      expect(call.isVideoEnabled()).toBe(true);

      call.toggleVideo();
      expect(call.isVideoEnabled()).toBe(false);

      call.toggleVideo();
      expect(call.isVideoEnabled()).toBe(true);

      call.destroy();
    });

    it("should return false when toggling mute with no stream", () => {
      const client = createMockClient();
      const call = new WebRTCCall(client);

      const result = call.toggleMute();
      expect(result).toBe(false);

      call.destroy();
    });
  });

  describe("given ICE candidates arrive", () => {
    it("should add ICE candidates to the peer connection when remote description is set", async () => {
      const client = createMockClient();
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(createMockMediaStream());

      const call = new WebRTCCall(client);
      await call.startCall("!room:example.com", "video");

      // Simulate answer (sets remote description)
      const answerEvent = createMockMatrixEvent("m.call.answer", {
        call_id: call.getCallId(),
        version: 0,
        answer: { type: "answer", sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n" },
      });
      call.handleCallEvent(answerEvent, createMockRoom());

      await vi.waitFor(() => {
        expect(call.getState()).toBe("connected");
      });

      // Now send ICE candidates
      const candidatesEvent = createMockMatrixEvent("m.call.candidates", {
        call_id: call.getCallId(),
        version: 0,
        candidates: [
          {
            candidate: "candidate:1 1 udp 2113937151 192.168.1.1 5000 typ host",
            sdpMid: "0",
            sdpMLineIndex: 0,
          },
        ],
      });
      call.handleCallEvent(candidatesEvent, createMockRoom());

      const pc = MockRTCPeerConnection.instances[0];
      // Wait for async addIceCandidate
      await vi.waitFor(() => {
        expect(pc.addIceCandidate).toHaveBeenCalled();
      });

      call.destroy();
    });

    it("should queue ICE candidates that arrive before remote description", async () => {
      const client = createMockClient();
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(createMockMediaStream());

      const call = new WebRTCCall(client);
      await call.startCall("!room:example.com", "video");

      // Send candidates BEFORE answer
      const candidatesEvent = createMockMatrixEvent("m.call.candidates", {
        call_id: call.getCallId(),
        version: 0,
        candidates: [
          {
            candidate: "candidate:1 1 udp 2113937151 192.168.1.1 5000 typ host",
            sdpMid: "0",
            sdpMLineIndex: 0,
          },
        ],
      });
      call.handleCallEvent(candidatesEvent, createMockRoom());

      const pc = MockRTCPeerConnection.instances[0];
      // Should not be added yet because remote description is null
      expect(pc.addIceCandidate).not.toHaveBeenCalled();

      // Now send answer
      const answerEvent = createMockMatrixEvent("m.call.answer", {
        call_id: call.getCallId(),
        version: 0,
        answer: { type: "answer", sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n" },
      });
      call.handleCallEvent(answerEvent, createMockRoom());

      // After answer, queued candidates should be flushed
      await vi.waitFor(() => {
        expect(pc.addIceCandidate).toHaveBeenCalled();
      });

      call.destroy();
    });

    it("should send local ICE candidates via m.call.candidates event", async () => {
      const client = createMockClient();
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(createMockMediaStream());

      const call = new WebRTCCall(client);
      await call.startCall("!room:example.com", "video");

      const pc = MockRTCPeerConnection.instances[0];
      const mockCandidate = {
        candidate: "candidate:1 1 udp 2113937151 192.168.1.1 5000 typ host",
        sdpMid: "0",
        sdpMLineIndex: 0,
        toJSON: () => ({
          candidate: "candidate:1 1 udp 2113937151 192.168.1.1 5000 typ host",
          sdpMid: "0",
          sdpMLineIndex: 0,
        }),
      };

      pc.simulateIceCandidate(mockCandidate);

      // sendEvent is called for both the invite and the candidate
      const candidateCalls = (client.sendEvent as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => c[1] === "m.call.candidates",
      );
      expect(candidateCalls.length).toBe(1);
      expect(candidateCalls[0][2]).toEqual(
        expect.objectContaining({
          call_id: call.getCallId(),
          version: 0,
          candidates: expect.any(Array),
        }),
      );

      call.destroy();
    });
  });

  describe("given an incoming call is detected", () => {
    it("should transition to ringing state", async () => {
      const client = createMockClient();
      const call = new WebRTCCall(client);
      const stateChanges: CallState[] = [];
      call.onStateChange = (state) => stateChanges.push(state);

      const inviteEvent = createMockMatrixEvent("m.call.invite", {
        call_id: "incoming-call-123",
        version: 0,
        lifetime: 60000,
        offer: {
          type: "offer",
          sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
        },
      });

      call.handleCallEvent(inviteEvent, createMockRoom());

      // The invite handler is now async (fetches TURN servers), so wait for the state change
      await vi.waitFor(() => {
        expect(call.getState()).toBe("ringing");
      });
      expect(call.getCallId()).toBe("incoming-call-123");
      expect(call.getCallType()).toBe("voice");
      expect(call.getDirection()).toBe("inbound");
      expect(stateChanges).toContain("ringing");

      call.destroy();
    });

    it("should detect video call type from SDP", async () => {
      const client = createMockClient();
      const call = new WebRTCCall(client);

      const inviteEvent = createMockMatrixEvent("m.call.invite", {
        call_id: "video-call-456",
        version: 0,
        lifetime: 60000,
        offer: {
          type: "offer",
          sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n",
        },
      });

      call.handleCallEvent(inviteEvent, createMockRoom());

      await vi.waitFor(() => {
        expect(call.getCallType()).toBe("video");
      });

      call.destroy();
    });

    it("should ignore invite events from ourselves", () => {
      const client = createMockClient();
      const call = new WebRTCCall(client);

      const inviteEvent = createMockMatrixEvent(
        "m.call.invite",
        {
          call_id: "self-call-789",
          version: 0,
          lifetime: 60000,
          offer: { type: "offer", sdp: "v=0\r\nm=audio 9\r\n" },
        },
        "@me:example.com", // same as our user ID
      );

      call.handleCallEvent(inviteEvent, createMockRoom());

      expect(call.getState()).toBe("idle");

      call.destroy();
    });
  });

  describe("given an incoming call is answered", () => {
    it("should transition from ringing to connected", async () => {
      const client = createMockClient();
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(createMockMediaStream());

      const call = new WebRTCCall(client);
      const stateChanges: CallState[] = [];
      call.onStateChange = (state) => stateChanges.push(state);

      // Simulate incoming invite
      const inviteEvent = createMockMatrixEvent("m.call.invite", {
        call_id: "answer-test-123",
        version: 0,
        lifetime: 60000,
        offer: { type: "offer", sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n" },
      });
      call.handleCallEvent(inviteEvent, createMockRoom());

      // Wait for async TURN fetch + peer connection setup
      await vi.waitFor(() => {
        expect(call.getState()).toBe("ringing");
      });

      // Answer it
      await call.answerCall("answer-test-123");

      expect(call.getState()).toBe("connected");
      expect(stateChanges).toEqual(["ringing", "connected"]);

      // Should have sent m.call.answer
      expect(client.sendEvent).toHaveBeenCalledWith(
        "!room:example.com",
        "m.call.answer",
        expect.objectContaining({
          call_id: "answer-test-123",
          version: 0,
          answer: expect.objectContaining({ type: "answer" }),
        }),
      );

      call.destroy();
    });
  });

  describe("given the remote party hangs up", () => {
    it("should transition to ended when m.call.hangup is received", async () => {
      const client = createMockClient();
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(createMockMediaStream());

      const call = new WebRTCCall(client);
      await call.startCall("!room:example.com", "voice");

      const hangupEvent = createMockMatrixEvent("m.call.hangup", {
        call_id: call.getCallId(),
        version: 0,
        reason: "user_hangup",
      });

      call.handleCallEvent(hangupEvent, createMockRoom());

      expect(call.getState()).toBe("ended");

      call.destroy();
    });

    it("should transition to ended when m.call.reject is received", async () => {
      const client = createMockClient();
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(createMockMediaStream());

      const call = new WebRTCCall(client);
      await call.startCall("!room:example.com", "voice");

      const rejectEvent = createMockMatrixEvent("m.call.reject", {
        call_id: call.getCallId(),
        version: 0,
      });

      call.handleCallEvent(rejectEvent, createMockRoom());

      expect(call.getState()).toBe("ended");

      call.destroy();
    });
  });

  describe("given ICE connection fails", () => {
    it("should transition to ended when ICE disconnects", async () => {
      const client = createMockClient();
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(createMockMediaStream());

      const call = new WebRTCCall(client);
      await call.startCall("!room:example.com", "voice");

      const pc = MockRTCPeerConnection.instances[0];
      pc.simulateIceDisconnect();

      expect(call.getState()).toBe("ended");

      call.destroy();
    });
  });

  describe("given the full call lifecycle", () => {
    it("should go through idle -> calling -> connected -> ended", async () => {
      const client = createMockClient();
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(createMockMediaStream());

      const call = new WebRTCCall(client);
      const stateChanges: CallState[] = [];
      call.onStateChange = (state) => stateChanges.push(state);

      // idle
      expect(call.getState()).toBe("idle");

      // -> calling
      await call.startCall("!room:example.com", "voice");
      expect(call.getState()).toBe("calling");

      // -> connected (answer received)
      const answerEvent = createMockMatrixEvent("m.call.answer", {
        call_id: call.getCallId(),
        version: 0,
        answer: { type: "answer", sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n" },
      });
      call.handleCallEvent(answerEvent, createMockRoom());

      await vi.waitFor(() => {
        expect(call.getState()).toBe("connected");
      });

      // -> ended
      await call.hangup();
      expect(call.getState()).toBe("ended");

      expect(stateChanges).toEqual(["calling", "connected", "ended"]);

      call.destroy();
    });
  });

  describe("given a call cannot be started in a non-idle state", () => {
    it("should throw when trying to start a call while already calling", async () => {
      const client = createMockClient();
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(createMockMediaStream());

      const call = new WebRTCCall(client);
      await call.startCall("!room:example.com", "voice");

      await expect(call.startCall("!room:example.com", "voice")).rejects.toThrow(
        'Cannot start call in state "calling"',
      );

      call.destroy();
    });
  });

  describe("given reject call is used for an incoming call", () => {
    it("should send m.call.reject and transition to ended", async () => {
      const client = createMockClient();
      const call = new WebRTCCall(client);

      const inviteEvent = createMockMatrixEvent("m.call.invite", {
        call_id: "reject-test",
        version: 0,
        lifetime: 60000,
        offer: { type: "offer", sdp: "v=0\r\nm=audio 9\r\n" },
      });
      call.handleCallEvent(inviteEvent, createMockRoom());

      // Wait for async TURN fetch to complete
      await vi.waitFor(() => {
        expect(call.getState()).toBe("ringing");
      });

      await call.rejectCall();

      expect(call.getState()).toBe("ended");
      expect(client.sendEvent).toHaveBeenCalledWith(
        "!room:example.com",
        "m.call.reject",
        expect.objectContaining({
          call_id: "reject-test",
          version: 0,
        }),
      );

      call.destroy();
    });
  });
});
