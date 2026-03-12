import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getAvailableDevices,
  getSelectedAudioInput,
  getSelectedAudioOutput,
  getSelectedVideoInput,
  setSelectedAudioInput,
  setSelectedAudioOutput,
  setSelectedVideoInput,
} from "./media-devices";

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
}

describe("media-devices", () => {
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = createMockStorage();
    Object.defineProperty(globalThis, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
  });

  describe("getAvailableDevices", () => {
    describe("given available devices from the browser", () => {
      it("should categorize devices by kind", async () => {
        const mockDevices = [
          {
            deviceId: "mic-1",
            label: "Built-in Mic",
            kind: "audioinput",
            groupId: "g1",
            toJSON: vi.fn(),
          },
          {
            deviceId: "speaker-1",
            label: "Built-in Speaker",
            kind: "audiooutput",
            groupId: "g2",
            toJSON: vi.fn(),
          },
          {
            deviceId: "cam-1",
            label: "FaceTime Camera",
            kind: "videoinput",
            groupId: "g3",
            toJSON: vi.fn(),
          },
        ];

        Object.defineProperty(globalThis, "navigator", {
          value: {
            mediaDevices: {
              enumerateDevices: vi.fn().mockResolvedValue(mockDevices),
            },
          },
          writable: true,
          configurable: true,
        });

        const devices = await getAvailableDevices();
        expect(devices).toHaveLength(3);

        const audioInputs = devices.filter((d) => d.kind === "audioinput");
        const audioOutputs = devices.filter((d) => d.kind === "audiooutput");
        const videoInputs = devices.filter((d) => d.kind === "videoinput");

        expect(audioInputs).toHaveLength(1);
        expect(audioInputs[0].deviceId).toBe("mic-1");
        expect(audioOutputs).toHaveLength(1);
        expect(audioOutputs[0].deviceId).toBe("speaker-1");
        expect(videoInputs).toHaveLength(1);
        expect(videoInputs[0].deviceId).toBe("cam-1");
      });

      it("should provide fallback labels for unlabeled devices", async () => {
        const mockDevices = [
          { deviceId: "mic-1", label: "", kind: "audioinput", groupId: "g1", toJSON: vi.fn() },
        ];

        Object.defineProperty(globalThis, "navigator", {
          value: {
            mediaDevices: {
              enumerateDevices: vi.fn().mockResolvedValue(mockDevices),
            },
          },
          writable: true,
          configurable: true,
        });

        const devices = await getAvailableDevices();
        expect(devices[0].label).toBe("audioinput 1");
      });
    });
  });

  describe("getSelectedAudioInput", () => {
    describe("given a selected device ID stored", () => {
      it("should return the stored device ID", () => {
        mockStorage.setItem("agentOs.audioInput", "mic-123");
        expect(getSelectedAudioInput()).toBe("mic-123");
      });
    });

    describe("given no selection stored", () => {
      it("should return null", () => {
        expect(getSelectedAudioInput()).toBeNull();
      });
    });
  });

  describe("getSelectedAudioOutput", () => {
    describe("given a selected device ID stored", () => {
      it("should return the stored device ID", () => {
        mockStorage.setItem("agentOs.audioOutput", "speaker-456");
        expect(getSelectedAudioOutput()).toBe("speaker-456");
      });
    });

    describe("given no selection stored", () => {
      it("should return null", () => {
        expect(getSelectedAudioOutput()).toBeNull();
      });
    });
  });

  describe("getSelectedVideoInput", () => {
    describe("given a selected device ID stored", () => {
      it("should return the stored device ID", () => {
        mockStorage.setItem("agentOs.videoInput", "cam-789");
        expect(getSelectedVideoInput()).toBe("cam-789");
      });
    });

    describe("given no selection stored", () => {
      it("should return null", () => {
        expect(getSelectedVideoInput()).toBeNull();
      });
    });
  });

  describe("setSelectedAudioInput", () => {
    describe("given setting a device", () => {
      it("should persist to localStorage", () => {
        setSelectedAudioInput("mic-new");
        expect(mockStorage.getItem("agentOs.audioInput")).toBe("mic-new");
      });
    });
  });

  describe("setSelectedAudioOutput", () => {
    describe("given setting a device", () => {
      it("should persist to localStorage", () => {
        setSelectedAudioOutput("speaker-new");
        expect(mockStorage.getItem("agentOs.audioOutput")).toBe("speaker-new");
      });
    });
  });

  describe("setSelectedVideoInput", () => {
    describe("given setting a device", () => {
      it("should persist to localStorage", () => {
        setSelectedVideoInput("cam-new");
        expect(mockStorage.getItem("agentOs.videoInput")).toBe("cam-new");
      });
    });
  });
});
