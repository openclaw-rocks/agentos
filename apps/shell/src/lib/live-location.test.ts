import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  startLiveLocation,
  updateLiveLocation,
  stopLiveLocation,
  formatDuration,
  LIVE_LOCATION_DURATIONS,
  type LiveLocationState,
} from "./live-location";

// Mock navigator.geolocation
const mockWatchPosition = vi.fn().mockReturnValue(42);
const mockClearWatch = vi.fn();

const mockGeolocation = {
  watchPosition: mockWatchPosition,
  clearWatch: mockClearWatch,
  getCurrentPosition: vi.fn(),
};

function createMockClient() {
  return {
    getUserId: () => "@alice:example.com",
    sendStateEvent: vi.fn().mockResolvedValue({ event_id: "$beacon-info-1" }),
    sendEvent: vi.fn().mockResolvedValue({ event_id: "$beacon-1" }),
  };
}

describe("live-location", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(globalThis, "navigator", {
      value: { geolocation: mockGeolocation },
      writable: true,
      configurable: true,
    });
    mockWatchPosition.mockClear();
    mockClearWatch.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("startLiveLocation", () => {
    describe("given a duration", () => {
      it("should set correct expiry", async () => {
        // Given
        const client = createMockClient();
        const durationMs = 15 * 60 * 1000; // 15 minutes
        const now = Date.now();

        // When

        const state = await startLiveLocation(client as any, "!room:example.com", durationMs);

        // Then
        expect(state.expiresAt).toBeGreaterThanOrEqual(now + durationMs);
        expect(state.roomId).toBe("!room:example.com");
        expect(state.beaconInfoEventId).toBe("$beacon-info-1");

        // Cleanup
        stopLiveLocation(state);
      });

      it("should send m.beacon_info state event with correct timeout", async () => {
        // Given
        const client = createMockClient();
        const durationMs = 60 * 60 * 1000; // 1 hour

        // When

        const state = await startLiveLocation(client as any, "!room:example.com", durationMs);

        // Then
        expect(client.sendStateEvent).toHaveBeenCalledWith(
          "!room:example.com",
          "org.matrix.msc3672.beacon_info",
          expect.objectContaining({
            live: true,
            timeout: durationMs,
          }),
          "@alice:example.com",
        );

        // Cleanup
        stopLiveLocation(state);
      });

      it("should start watching geolocation", async () => {
        // Given
        const client = createMockClient();

        // When

        const state = await startLiveLocation(client as any, "!room:example.com", 15 * 60 * 1000);

        // Then
        expect(mockWatchPosition).toHaveBeenCalled();
        expect(state.watchId).toBe(42);

        // Cleanup
        stopLiveLocation(state);
      });
    });
  });

  describe("updateLiveLocation", () => {
    describe("given position updates", () => {
      it("should format beacon events correctly", async () => {
        // Given
        const client = createMockClient();
        const state: LiveLocationState = {
          watchId: 1,
          roomId: "!room:example.com",
          beaconInfoEventId: "$beacon-info-1",
          expiresAt: Date.now() + 60 * 60 * 1000,
          timeoutId: null,
        };
        const coords = {
          latitude: 52.52,
          longitude: 13.405,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        } as GeolocationCoordinates;

        // When

        await updateLiveLocation(client as any, state, coords);

        // Then
        expect(client.sendEvent).toHaveBeenCalledWith(
          "!room:example.com",
          "org.matrix.msc3672.beacon",
          expect.objectContaining({
            "m.relates_to": {
              rel_type: "m.reference",
              event_id: "$beacon-info-1",
            },
            "org.matrix.msc3488.location": {
              uri: "geo:52.52,13.405",
              description: "Live location",
            },
          }),
        );
      });

      it("should stop if past expiry", async () => {
        // Given
        const client = createMockClient();
        const state: LiveLocationState = {
          watchId: 99,
          roomId: "!room:example.com",
          beaconInfoEventId: "$beacon-info-1",
          expiresAt: Date.now() - 1000, // already expired
          timeoutId: null,
        };
        const coords = {
          latitude: 52.52,
          longitude: 13.405,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        } as GeolocationCoordinates;

        // When

        await updateLiveLocation(client as any, state, coords);

        // Then
        expect(client.sendEvent).not.toHaveBeenCalled();
        expect(state.watchId).toBe(-1);
      });
    });
  });

  describe("stopLiveLocation", () => {
    describe("given stop called", () => {
      it("should clear watch", () => {
        // Given
        const state: LiveLocationState = {
          watchId: 42,
          roomId: "!room:example.com",
          beaconInfoEventId: "$beacon-info-1",
          expiresAt: Date.now() + 60_000,
          timeoutId: setTimeout(() => {}, 60_000),
        };

        // When
        stopLiveLocation(state);

        // Then
        expect(mockClearWatch).toHaveBeenCalledWith(42);
        expect(state.watchId).toBe(-1);
        expect(state.timeoutId).toBeNull();
      });

      it("should be safe to call multiple times", () => {
        // Given
        const state: LiveLocationState = {
          watchId: -1,
          roomId: "!room:example.com",
          beaconInfoEventId: "$beacon-info-1",
          expiresAt: Date.now(),
          timeoutId: null,
        };

        // When / Then
        expect(() => stopLiveLocation(state)).not.toThrow();
      });
    });
  });

  describe("formatDuration", () => {
    it("should format minutes correctly", () => {
      expect(formatDuration(15 * 60 * 1000)).toBe("15 min");
    });

    it("should format 1 hour correctly", () => {
      expect(formatDuration(60 * 60 * 1000)).toBe("1 hour");
    });

    it("should format multiple hours correctly", () => {
      expect(formatDuration(8 * 60 * 60 * 1000)).toBe("8 hours");
    });
  });

  describe("LIVE_LOCATION_DURATIONS", () => {
    it("should have three presets", () => {
      expect(LIVE_LOCATION_DURATIONS).toHaveLength(3);
    });
  });
});
