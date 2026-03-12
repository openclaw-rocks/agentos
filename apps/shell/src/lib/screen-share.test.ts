import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ScreenShareManager } from "./screen-share";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockTrack(kind: "video" | "audio"): MediaStreamTrack {
  const handlers: Record<string, ((...args: unknown[]) => void) | null> = {};
  return {
    kind,
    id: `mock-${kind}-${Math.random().toString(36).slice(2, 6)}`,
    enabled: true,
    readyState: "live" as MediaStreamTrackState,
    stop: vi.fn(),
    set onended(fn: (() => void) | null) {
      handlers["ended"] = fn;
    },
    get onended() {
      return handlers["ended"] ?? null;
    },
    /** Test helper: simulate the browser-native "Stop sharing" action. */
    _fireEnded() {
      (this as unknown as { readyState: string }).readyState = "ended";
      handlers["ended"]?.();
    },
  } as unknown as MediaStreamTrack & { _fireEnded: () => void };
}

function createMockMediaStream(kinds: ("video" | "audio")[] = ["video", "audio"]): MediaStream {
  const tracks = kinds.map((k) => createMockTrack(k));
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
  } as unknown as MediaStream;
}

function createMockSender(track: MediaStreamTrack): RTCRtpSender {
  return {
    track,
    replaceTrack: vi.fn().mockResolvedValue(undefined),
  } as unknown as RTCRtpSender;
}

function createMockPeerConnection(senders: RTCRtpSender[]): RTCPeerConnection {
  return {
    getSenders: () => senders,
  } as unknown as RTCPeerConnection;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let originalGetDisplayMedia: typeof navigator.mediaDevices.getDisplayMedia | undefined;

beforeEach(() => {
  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getDisplayMedia: vi.fn() },
      writable: true,
      configurable: true,
    });
  }
  originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia;
});

afterEach(() => {
  if (originalGetDisplayMedia && navigator.mediaDevices) {
    navigator.mediaDevices.getDisplayMedia = originalGetDisplayMedia;
  }
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ScreenShareManager", () => {
  describe("given screen share is started successfully", () => {
    let mockStream: MediaStream;

    beforeEach(() => {
      mockStream = createMockMediaStream(["video", "audio"]);
      navigator.mediaDevices.getDisplayMedia = vi.fn().mockResolvedValue(mockStream);
    });

    it("should call getDisplayMedia with video and audio", async () => {
      const manager = new ScreenShareManager();

      await manager.startScreenShare();

      expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({
        video: true,
        audio: true,
      });
    });

    it("should return the display media stream", async () => {
      const manager = new ScreenShareManager();

      const stream = await manager.startScreenShare();

      expect(stream).toBe(mockStream);
    });

    it("should report isSharing as true after starting", async () => {
      const manager = new ScreenShareManager();

      expect(manager.isSharing()).toBe(false);
      await manager.startScreenShare();
      expect(manager.isSharing()).toBe(true);
    });

    it("should expose the stream via getStream", async () => {
      const manager = new ScreenShareManager();

      expect(manager.getStream()).toBeNull();
      await manager.startScreenShare();
      expect(manager.getStream()).toBe(mockStream);
    });
  });

  describe("given screen share is stopped", () => {
    let mockStream: MediaStream;

    beforeEach(() => {
      mockStream = createMockMediaStream(["video", "audio"]);
      navigator.mediaDevices.getDisplayMedia = vi.fn().mockResolvedValue(mockStream);
    });

    it("should stop all tracks and reset state", async () => {
      const manager = new ScreenShareManager();
      await manager.startScreenShare();

      manager.stopScreenShare();

      expect(manager.isSharing()).toBe(false);
      expect(manager.getStream()).toBeNull();
      for (const track of mockStream.getTracks()) {
        expect(track.stop).toHaveBeenCalled();
      }
    });

    it("should transition isSharing from true to false", async () => {
      const manager = new ScreenShareManager();
      await manager.startScreenShare();
      expect(manager.isSharing()).toBe(true);

      manager.stopScreenShare();
      expect(manager.isSharing()).toBe(false);
    });
  });

  describe("given the user stops sharing via the browser UI", () => {
    it("should fire onShareEnded callback", async () => {
      const mockStream = createMockMediaStream(["video"]);
      navigator.mediaDevices.getDisplayMedia = vi.fn().mockResolvedValue(mockStream);

      const manager = new ScreenShareManager();
      const callback = vi.fn();
      manager.onShareEnded = callback;

      await manager.startScreenShare();

      // Simulate the browser-level "Stop sharing" event
      const videoTrack = mockStream.getVideoTracks()[0] as unknown as {
        _fireEnded: () => void;
      };
      videoTrack._fireEnded();

      expect(callback).toHaveBeenCalledOnce();
      expect(manager.isSharing()).toBe(false);
      expect(manager.getStream()).toBeNull();
    });
  });

  describe("given replaceTrackInPeerConnection is called", () => {
    it("should replace the video sender track with the screen share track", async () => {
      const cameraTrack = createMockTrack("video");
      const audioTrack = createMockTrack("audio");
      const videoSender = createMockSender(cameraTrack);
      const audioSender = createMockSender(audioTrack);
      const pc = createMockPeerConnection([videoSender, audioSender]);

      const screenStream = createMockMediaStream(["video"]);
      const screenTrack = screenStream.getVideoTracks()[0];

      const manager = new ScreenShareManager();
      await manager.replaceTrackInPeerConnection(pc, screenStream);

      expect(videoSender.replaceTrack).toHaveBeenCalledWith(screenTrack);
      expect(audioSender.replaceTrack).not.toHaveBeenCalled();
    });
  });

  describe("given restoreCamera is called", () => {
    it("should replace the screen share track with the camera track", async () => {
      const screenTrack = createMockTrack("video");
      const videoSender = createMockSender(screenTrack);
      const pc = createMockPeerConnection([videoSender]);

      const cameraStream = createMockMediaStream(["video"]);
      const cameraTrack = cameraStream.getVideoTracks()[0];

      const mockScreenStream = createMockMediaStream(["video"]);
      navigator.mediaDevices.getDisplayMedia = vi.fn().mockResolvedValue(mockScreenStream);

      const manager = new ScreenShareManager();
      await manager.startScreenShare();
      expect(manager.isSharing()).toBe(true);

      await manager.restoreCamera(pc, cameraStream);

      expect(videoSender.replaceTrack).toHaveBeenCalledWith(cameraTrack);
      expect(manager.isSharing()).toBe(false);
    });

    it("should stop the screen share stream tracks", async () => {
      const screenTrack = createMockTrack("video");
      const videoSender = createMockSender(screenTrack);
      const pc = createMockPeerConnection([videoSender]);

      const cameraStream = createMockMediaStream(["video"]);

      const mockScreenStream = createMockMediaStream(["video", "audio"]);
      navigator.mediaDevices.getDisplayMedia = vi.fn().mockResolvedValue(mockScreenStream);

      const manager = new ScreenShareManager();
      await manager.startScreenShare();

      await manager.restoreCamera(pc, cameraStream);

      for (const track of mockScreenStream.getTracks()) {
        expect(track.stop).toHaveBeenCalled();
      }
    });
  });

  describe("given getDisplayMedia is denied", () => {
    it("should propagate the error and remain not sharing", async () => {
      const permError = new DOMException("Permission denied", "NotAllowedError");
      navigator.mediaDevices.getDisplayMedia = vi.fn().mockRejectedValue(permError);

      const manager = new ScreenShareManager();

      await expect(manager.startScreenShare()).rejects.toThrow("Permission denied");
      expect(manager.isSharing()).toBe(false);
      expect(manager.getStream()).toBeNull();
    });
  });
});
