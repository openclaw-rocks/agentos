import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  captureFrameFromVideo,
  getAvailableCameras,
  buildCameraConstraints,
  isCameraAvailable,
  stopMediaStream,
} from "~/lib/camera-capture";

// ---------------------------------------------------------------------------
// Mocks — we run under vitest with environment: "node", so browser globals
// must be manually stubbed.
// ---------------------------------------------------------------------------

describe("CameraCapture helpers (component-level)", () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  // ------------------------------------------------------------------
  // captureFrameFromVideo
  // ------------------------------------------------------------------
  describe("captureFrameFromVideo", () => {
    let drawImageSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      drawImageSpy = vi.fn();

      // Stub document.createElement so it returns a fake canvas when
      // called with "canvas".
      const origDoc = globalThis.document;

      (globalThis as any).document = {
        createElement: (tag: string) => {
          if (tag === "canvas") {
            return {
              width: 0,
              height: 0,
              getContext: (_id: string) => ({
                drawImage: drawImageSpy,
              }),
              toBlob: (cb: (blob: unknown) => void, _type: string, _quality: number) => {
                cb(new Blob(["fake"], { type: "image/jpeg" }));
              },
            };
          }
          if (origDoc?.createElement) return origDoc.createElement(tag);
          return {};
        },
      };
    });

    describe("given a video element with valid dimensions", () => {
      const fakeVideo = {
        videoWidth: 1280,
        videoHeight: 720,
      } as unknown as HTMLVideoElement;

      it("should return a Blob", async () => {
        const blob = await captureFrameFromVideo(fakeVideo);
        expect(blob).toBeDefined();
        expect(blob).not.toBeNull();
      });

      it("should call drawImage with the video element", async () => {
        await captureFrameFromVideo(fakeVideo);
        expect(drawImageSpy).toHaveBeenCalledWith(fakeVideo, 0, 0, 1280, 720);
      });

      it("should set canvas dimensions to match the video", async () => {
        await captureFrameFromVideo(fakeVideo);
        expect(drawImageSpy).toHaveBeenCalledWith(fakeVideo, 0, 0, 1280, 720);
      });
    });

    describe("given a video element with zero dimensions", () => {
      it("should return null", async () => {
        const fakeVideo = { videoWidth: 0, videoHeight: 0 } as unknown as HTMLVideoElement;
        const result = await captureFrameFromVideo(fakeVideo);
        expect(result).toBeNull();
      });
    });

    describe("given the canvas 2d context is unavailable", () => {
      it("should return null", async () => {
        // Override document.createElement to return a canvas with null context

        (globalThis as any).document = {
          createElement: (tag: string) => {
            if (tag === "canvas") {
              return {
                width: 0,
                height: 0,
                getContext: () => null,
              };
            }
            return {};
          },
        };

        const fakeVideo = { videoWidth: 640, videoHeight: 480 } as unknown as HTMLVideoElement;
        const result = await captureFrameFromVideo(fakeVideo);
        expect(result).toBeNull();
      });
    });

    describe("given toBlob returns null", () => {
      it("should resolve with null", async () => {
        (globalThis as any).document = {
          createElement: (tag: string) => {
            if (tag === "canvas") {
              return {
                width: 0,
                height: 0,
                getContext: () => ({ drawImage: vi.fn() }),
                toBlob: (cb: (blob: unknown) => void) => {
                  cb(null);
                },
              };
            }
            return {};
          },
        };

        const fakeVideo = { videoWidth: 640, videoHeight: 480 } as unknown as HTMLVideoElement;
        const result = await captureFrameFromVideo(fakeVideo);
        expect(result).toBeNull();
      });
    });

    describe("given a custom quality parameter", () => {
      it("should forward quality to toBlob", async () => {
        let receivedQuality: number | undefined;

        (globalThis as any).document = {
          createElement: (tag: string) => {
            if (tag === "canvas") {
              return {
                width: 0,
                height: 0,
                getContext: () => ({ drawImage: vi.fn() }),
                toBlob: (cb: (blob: unknown) => void, _type: string, quality: number) => {
                  receivedQuality = quality;
                  cb(new Blob(["fake"], { type: "image/jpeg" }));
                },
              };
            }
            return {};
          },
        };

        const fakeVideo = { videoWidth: 640, videoHeight: 480 } as unknown as HTMLVideoElement;
        await captureFrameFromVideo(fakeVideo, "image/jpeg", 0.5);
        expect(receivedQuality).toBe(0.5);
      });
    });
  });

  // ------------------------------------------------------------------
  // getAvailableCameras
  // ------------------------------------------------------------------
  describe("getAvailableCameras", () => {
    describe("given multiple device types are present", () => {
      it("should return only videoinput devices", async () => {
        const devices = [
          { kind: "audioinput", deviceId: "mic1", label: "Mic" } as MediaDeviceInfo,
          { kind: "videoinput", deviceId: "cam1", label: "Front Camera" } as MediaDeviceInfo,
          { kind: "audiooutput", deviceId: "speaker1", label: "Speaker" } as MediaDeviceInfo,
          { kind: "videoinput", deviceId: "cam2", label: "Back Camera" } as MediaDeviceInfo,
        ];

        Object.defineProperty(globalThis, "navigator", {
          value: {
            mediaDevices: {
              getUserMedia: vi.fn(),
              enumerateDevices: vi.fn().mockResolvedValue(devices),
            },
          },
          writable: true,
          configurable: true,
        });

        const result = await getAvailableCameras();
        expect(result).toHaveLength(2);
        expect(result[0].deviceId).toBe("cam1");
        expect(result[1].deviceId).toBe("cam2");
      });
    });

    describe("given no devices are present", () => {
      it("should return an empty array", async () => {
        Object.defineProperty(globalThis, "navigator", {
          value: {
            mediaDevices: {
              getUserMedia: vi.fn(),
              enumerateDevices: vi.fn().mockResolvedValue([]),
            },
          },
          writable: true,
          configurable: true,
        });

        const result = await getAvailableCameras();
        expect(result).toEqual([]);
      });
    });

    describe("given navigator.mediaDevices is undefined", () => {
      it("should return an empty array", async () => {
        Object.defineProperty(globalThis, "navigator", {
          value: {},
          writable: true,
          configurable: true,
        });

        const result = await getAvailableCameras();
        expect(result).toEqual([]);
      });
    });
  });

  // ------------------------------------------------------------------
  // buildCameraConstraints
  // ------------------------------------------------------------------
  describe("buildCameraConstraints", () => {
    describe("given facing mode 'user'", () => {
      it("should return user-facing constraints with audio disabled", () => {
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
      it("should return environment-facing constraints with audio disabled", () => {
        const constraints = buildCameraConstraints("environment");
        expect(constraints.audio).toBe(false);
        expect(constraints.video).toEqual({
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        });
      });
    });
  });

  // ------------------------------------------------------------------
  // isCameraAvailable
  // ------------------------------------------------------------------
  describe("isCameraAvailable", () => {
    describe("given getUserMedia is available", () => {
      it("should return true", () => {
        Object.defineProperty(globalThis, "navigator", {
          value: { mediaDevices: { getUserMedia: vi.fn() } },
          writable: true,
          configurable: true,
        });
        expect(isCameraAvailable()).toBe(true);
      });
    });

    describe("given mediaDevices is undefined", () => {
      it("should return false", () => {
        Object.defineProperty(globalThis, "navigator", {
          value: {},
          writable: true,
          configurable: true,
        });
        expect(isCameraAvailable()).toBe(false);
      });
    });
  });

  // ------------------------------------------------------------------
  // stopMediaStream
  // ------------------------------------------------------------------
  describe("stopMediaStream", () => {
    describe("given a stream with tracks", () => {
      it("should stop every track", () => {
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

    describe("given null", () => {
      it("should not throw", () => {
        expect(() => stopMediaStream(null)).not.toThrow();
      });
    });
  });
});
