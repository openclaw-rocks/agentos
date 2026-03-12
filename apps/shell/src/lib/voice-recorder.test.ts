import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VoiceRecorder } from "./voice-recorder";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockMediaStream(): MediaStream {
  const track = {
    stop: vi.fn(),
    kind: "audio",
    id: "mock-track",
    enabled: true,
    readyState: "live" as MediaStreamTrackState,
  } as unknown as MediaStreamTrack;

  return {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
}

type RecorderState = "inactive" | "recording" | "paused";

/**
 * A lightweight MediaRecorder stub that exposes helpers so tests can drive
 * the onstop / ondataavailable callbacks manually.
 */
class MockMediaRecorder {
  static isTypeSupported = vi.fn().mockReturnValue(true);
  static instances: MockMediaRecorder[] = [];

  state: RecorderState = "inactive";
  mimeType: string;
  ondataavailable: ((e: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? "audio/ogg";
    MockMediaRecorder.instances.push(this);
  }

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    // Emit a data chunk so the blob can be assembled
    if (this.ondataavailable) {
      const blob = new Blob(["audio-data"], { type: this.mimeType });
      this.ondataavailable({ data: blob } as BlobEvent);
    }
    if (this.onstop) {
      this.onstop();
    }
  }
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let originalMediaRecorder: typeof globalThis.MediaRecorder | undefined;
let originalGetUserMedia: typeof navigator.mediaDevices.getUserMedia | undefined;

beforeEach(() => {
  MockMediaRecorder.instances = [];

  originalMediaRecorder = globalThis.MediaRecorder;

  globalThis.MediaRecorder = MockMediaRecorder as any;

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
  if (originalMediaRecorder) {
    globalThis.MediaRecorder = originalMediaRecorder;
  }
  if (originalGetUserMedia && navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = originalGetUserMedia;
  }
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VoiceRecorder", () => {
  describe("given microphone access is granted", () => {
    beforeEach(() => {
      const mockStream = createMockMediaStream();
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockStream);
    });

    it("should start recording", async () => {
      const recorder = new VoiceRecorder();

      await recorder.start();

      expect(recorder.isRecording()).toBe(true);
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    });

    it("should track duration while recording", async () => {
      const recorder = new VoiceRecorder();

      const before = Date.now();
      await recorder.start();

      // getDuration should return a non-negative value
      const duration = recorder.getDuration();
      const elapsed = Date.now() - before;

      expect(duration).toBeGreaterThanOrEqual(0);
      expect(duration).toBeLessThanOrEqual(elapsed + 5);
    });

    it("should return a blob when stopped", async () => {
      const recorder = new VoiceRecorder();
      await recorder.start();

      const result = await recorder.stop();

      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.blob.size).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("should not be recording after stop", async () => {
      const recorder = new VoiceRecorder();
      await recorder.start();
      await recorder.stop();

      expect(recorder.isRecording()).toBe(false);
    });

    it("should return duration 0 when not recording", () => {
      const recorder = new VoiceRecorder();

      expect(recorder.getDuration()).toBe(0);
    });
  });

  describe("given recording is cancelled", () => {
    let mockStream: MediaStream;

    beforeEach(() => {
      mockStream = createMockMediaStream();
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockStream);
    });

    it("should discard the recording", async () => {
      const recorder = new VoiceRecorder();
      await recorder.start();

      recorder.cancel();

      expect(recorder.isRecording()).toBe(false);
    });

    it("should stop the media stream", async () => {
      const recorder = new VoiceRecorder();
      await recorder.start();

      recorder.cancel();

      const tracks = mockStream.getTracks();
      for (const track of tracks) {
        expect(track.stop).toHaveBeenCalled();
      }
    });
  });

  describe("given microphone access is denied", () => {
    it("should throw an error", async () => {
      const permError = new DOMException("Permission denied", "NotAllowedError");
      navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(permError);

      const recorder = new VoiceRecorder();

      await expect(recorder.start()).rejects.toThrow("Permission denied");
      expect(recorder.isRecording()).toBe(false);
    });
  });

  describe("given stop is called without recording", () => {
    it("should reject with an error", async () => {
      const recorder = new VoiceRecorder();

      await expect(recorder.stop()).rejects.toThrow("Not recording");
    });
  });
});
