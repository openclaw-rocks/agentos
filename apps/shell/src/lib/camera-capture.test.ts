import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isCameraAvailable,
  buildCameraConstraints,
  captureFrameFromVideo,
  getAvailableCameras,
  stopMediaStream,
} from "./camera-capture";

describe("camera-capture", () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  describe("isCameraAvailable", () => {
    describe("given navigator.mediaDevices.getUserMedia exists", () => {
      beforeEach(() => {
        Object.defineProperty(globalThis, "navigator", {
          value: {
            mediaDevices: {
              getUserMedia: vi.fn(),
            },
          },
          writable: true,
          configurable: true,
        });
      });

      it("should return true", () => {
        expect(isCameraAvailable()).toBe(true);
      });
    });

    describe("given navigator.mediaDevices is undefined", () => {
      beforeEach(() => {
        Object.defineProperty(globalThis, "navigator", {
          value: {},
          writable: true,
          configurable: true,
        });
      });

      it("should return false", () => {
        expect(isCameraAvailable()).toBe(false);
      });
    });

    describe("given navigator is undefined", () => {
      beforeEach(() => {
        Object.defineProperty(globalThis, "navigator", {
          value: undefined,
          writable: true,
          configurable: true,
        });
      });

      it("should return false", () => {
        expect(isCameraAvailable()).toBe(false);
      });
    });

    describe("given getUserMedia is not a function", () => {
      beforeEach(() => {
        Object.defineProperty(globalThis, "navigator", {
          value: {
            mediaDevices: {
              getUserMedia: "not-a-function",
            },
          },
          writable: true,
          configurable: true,
        });
      });

      it("should return false", () => {
        expect(isCameraAvailable()).toBe(false);
      });
    });
  });

  describe("buildCameraConstraints", () => {
    describe("given facing mode 'user'", () => {
      it("should return constraints with facingMode user (front camera)", () => {
        const constraints = buildCameraConstraints("user");

        expect(constraints.audio).toBe(false);
        expect(constraints.video).toEqual({
          facingMode: "user",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        });
      });
    });

    describe("given facing mode 'environment'", () => {
      it("should return constraints with facingMode environment (back camera)", () => {
        const constraints = buildCameraConstraints("environment");

        expect(constraints.audio).toBe(false);
        expect(constraints.video).toEqual({
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        });
      });
    });

    describe("given any facing mode", () => {
      it("should always disable audio", () => {
        expect(buildCameraConstraints("user").audio).toBe(false);
        expect(buildCameraConstraints("environment").audio).toBe(false);
      });

      it("should request ideal 1920x1080 resolution", () => {
        const constraints = buildCameraConstraints("user");
        const video = constraints.video as MediaTrackConstraints;

        expect(video.width).toEqual({ ideal: 1920 });
        expect(video.height).toEqual({ ideal: 1080 });
      });
    });
  });

  describe("captureFrameFromVideo", () => {
    describe("given a video element with zero dimensions", () => {
      it("should return null", async () => {
        const video = {
          videoWidth: 0,
          videoHeight: 0,
        } as HTMLVideoElement;

        const result = await captureFrameFromVideo(video);
        expect(result).toBeNull();
      });
    });

    describe("given a video element with valid dimensions", () => {
      it("should create a canvas and capture the frame", async () => {
        const mockBlob = new Blob(["fake-image-data"], { type: "image/jpeg" });
        const mockCtx = {
          drawImage: vi.fn(),
        };
        const mockCanvas = {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue(mockCtx),
          toBlob: vi.fn().mockImplementation((cb: (blob: Blob | null) => void) => {
            cb(mockBlob);
          }),
        };

        // Mock document.createElement since we run in node (no jsdom)
        const origDoc = globalThis.document;

        (globalThis as any).document = {
          createElement: (tag: string) => {
            if (tag === "canvas") {
              return mockCanvas;
            }
            return {};
          },
        };

        const video = {
          videoWidth: 1280,
          videoHeight: 720,
        } as HTMLVideoElement;

        const result = await captureFrameFromVideo(video, "image/jpeg", 0.9);

        expect(mockCanvas.width).toBe(1280);
        expect(mockCanvas.height).toBe(720);
        expect(mockCanvas.getContext).toHaveBeenCalledWith("2d");
        expect(mockCtx.drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720);
        expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.9);
        expect(result).toBe(mockBlob);

        (globalThis as any).document = origDoc;
      });
    });

    describe("given canvas getContext returns null", () => {
      it("should return null", async () => {
        const mockCanvas = {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue(null),
          toBlob: vi.fn(),
        };

        const origDoc = globalThis.document;

        (globalThis as any).document = {
          createElement: (tag: string) => {
            if (tag === "canvas") {
              return mockCanvas;
            }
            return {};
          },
        };

        const video = {
          videoWidth: 640,
          videoHeight: 480,
        } as HTMLVideoElement;

        const result = await captureFrameFromVideo(video);
        expect(result).toBeNull();

        (globalThis as any).document = origDoc;
      });
    });

    describe("given default parameters", () => {
      it("should use image/jpeg and quality 0.92", async () => {
        const mockCtx = { drawImage: vi.fn() };
        const mockCanvas = {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue(mockCtx),
          toBlob: vi.fn().mockImplementation((cb: (blob: Blob | null) => void) => {
            cb(new Blob([]));
          }),
        };

        const origDoc = globalThis.document;

        (globalThis as any).document = {
          createElement: (tag: string) => {
            if (tag === "canvas") {
              return mockCanvas;
            }
            return {};
          },
        };

        const video = { videoWidth: 100, videoHeight: 100 } as HTMLVideoElement;
        await captureFrameFromVideo(video);

        expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.92);

        (globalThis as any).document = origDoc;
      });
    });
  });

  describe("getAvailableCameras", () => {
    describe("given camera is not available", () => {
      beforeEach(() => {
        Object.defineProperty(globalThis, "navigator", {
          value: {},
          writable: true,
          configurable: true,
        });
      });

      it("should return an empty array", async () => {
        const cameras = await getAvailableCameras();
        expect(cameras).toEqual([]);
      });
    });

    describe("given multiple devices including cameras", () => {
      beforeEach(() => {
        const mockDevices = [
          {
            deviceId: "cam-1",
            label: "Front Camera",
            kind: "videoinput",
            groupId: "g1",
            toJSON: vi.fn(),
          },
          {
            deviceId: "cam-2",
            label: "Back Camera",
            kind: "videoinput",
            groupId: "g2",
            toJSON: vi.fn(),
          },
          {
            deviceId: "mic-1",
            label: "Microphone",
            kind: "audioinput",
            groupId: "g3",
            toJSON: vi.fn(),
          },
          {
            deviceId: "speaker-1",
            label: "Speaker",
            kind: "audiooutput",
            groupId: "g4",
            toJSON: vi.fn(),
          },
        ];

        Object.defineProperty(globalThis, "navigator", {
          value: {
            mediaDevices: {
              getUserMedia: vi.fn(),
              enumerateDevices: vi.fn().mockResolvedValue(mockDevices),
            },
          },
          writable: true,
          configurable: true,
        });
      });

      it("should return only video input devices", async () => {
        const cameras = await getAvailableCameras();
        expect(cameras).toHaveLength(2);
        expect(cameras[0]).toEqual({ deviceId: "cam-1", label: "Front Camera" });
        expect(cameras[1]).toEqual({ deviceId: "cam-2", label: "Back Camera" });
      });
    });

    describe("given devices without labels", () => {
      beforeEach(() => {
        const mockDevices = [
          { deviceId: "cam-1", label: "", kind: "videoinput", groupId: "g1", toJSON: vi.fn() },
          { deviceId: "cam-2", label: "", kind: "videoinput", groupId: "g2", toJSON: vi.fn() },
        ];

        Object.defineProperty(globalThis, "navigator", {
          value: {
            mediaDevices: {
              getUserMedia: vi.fn(),
              enumerateDevices: vi.fn().mockResolvedValue(mockDevices),
            },
          },
          writable: true,
          configurable: true,
        });
      });

      it("should provide fallback labels with index", async () => {
        const cameras = await getAvailableCameras();
        expect(cameras[0].label).toBe("Camera 1");
        expect(cameras[1].label).toBe("Camera 2");
      });
    });
  });

  describe("stopMediaStream", () => {
    describe("given a stream with multiple tracks", () => {
      it("should stop all tracks", () => {
        const track1 = { stop: vi.fn() } as unknown as MediaStreamTrack;
        const track2 = { stop: vi.fn() } as unknown as MediaStreamTrack;
        const stream = {
          getTracks: vi.fn().mockReturnValue([track1, track2]),
        } as unknown as MediaStream;

        stopMediaStream(stream);

        expect(track1.stop).toHaveBeenCalledOnce();
        expect(track2.stop).toHaveBeenCalledOnce();
      });
    });

    describe("given null stream", () => {
      it("should not throw", () => {
        expect(() => stopMediaStream(null)).not.toThrow();
      });
    });
  });
});
