import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildPusherData,
  registerPusher,
  unregisterPusher,
  getPushers,
  isPushSupported,
  PUSH_APP_ID,
  DEFAULT_PUSH_GATEWAY,
  type Pusher,
} from "./push-gateway";

describe("push-gateway", () => {
  /* ---------------------------------------------------------------- */
  /* buildPusherData                                                    */
  /* ---------------------------------------------------------------- */
  describe("buildPusherData", () => {
    describe("given valid registration parameters", () => {
      it("should return a pusher object with correct field mapping", () => {
        // Given
        const appId = "rocks.openclaw.app";
        const pushKey = "https://push.example.com/sub/abc123";
        const appDisplayName = "AgentOS";
        const deviceDisplayName = "DEVICE_XYZ";
        const profileTag = "profile_DEVICE_XYZ";

        // When
        const result = buildPusherData(
          appId,
          pushKey,
          appDisplayName,
          deviceDisplayName,
          profileTag,
        );

        // Then
        expect(result.pushkey).toBe(pushKey);
        expect(result.kind).toBe("http");
        expect(result.app_id).toBe(appId);
        expect(result.app_display_name).toBe(appDisplayName);
        expect(result.device_display_name).toBe(deviceDisplayName);
        expect(result.profile_tag).toBe(profileTag);
        expect(result.lang).toBeDefined();
        expect(typeof result.lang).toBe("string");
      });

      it("should use the default push gateway URL when none is provided", () => {
        // When
        const result = buildPusherData(
          PUSH_APP_ID,
          "https://push.example.com/sub/abc",
          "AgentOS",
          "DEVICE_1",
          "profile_1",
        );

        // Then
        expect(result.data.url).toBe(DEFAULT_PUSH_GATEWAY);
      });

      it("should use a custom gateway URL when provided", () => {
        // Given
        const customGateway = "https://custom-gateway.example.com/_matrix/push/v1/notify";

        // When
        const result = buildPusherData(
          PUSH_APP_ID,
          "https://push.example.com/sub/abc",
          "AgentOS",
          "DEVICE_1",
          "profile_1",
          customGateway,
        );

        // Then
        expect(result.data.url).toBe(customGateway);
      });

      it("should always set kind to 'http'", () => {
        // When
        const result = buildPusherData(
          PUSH_APP_ID,
          "https://push.example.com/sub/abc",
          "AgentOS",
          "DEVICE_1",
          "profile_1",
        );

        // Then
        expect(result.kind).toBe("http");
      });
    });

    describe("given the pusher data structure (Matrix spec compliance)", () => {
      it("should contain all required fields per the Matrix spec", () => {
        // When
        const result = buildPusherData(
          PUSH_APP_ID,
          "https://endpoint.example.com/push",
          "AgentOS",
          "My Phone",
          "tag_phone",
        );

        // Then — all fields required by POST /_matrix/client/v3/pushers/set
        expect(result).toHaveProperty("pushkey");
        expect(result).toHaveProperty("kind");
        expect(result).toHaveProperty("app_id");
        expect(result).toHaveProperty("app_display_name");
        expect(result).toHaveProperty("device_display_name");
        expect(result).toHaveProperty("profile_tag");
        expect(result).toHaveProperty("lang");
        expect(result).toHaveProperty("data");
        expect(result.data).toHaveProperty("url");
      });

      it("should set lang to a non-empty string", () => {
        // When
        const result = buildPusherData(
          PUSH_APP_ID,
          "https://endpoint.example.com/push",
          "AgentOS",
          "My Phone",
          "tag_phone",
        );

        // Then
        expect(result.lang.length).toBeGreaterThan(0);
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* registerPusher                                                     */
  /* ---------------------------------------------------------------- */
  describe("registerPusher", () => {
    describe("given a matrix client and pusher data", () => {
      it("should call client.setPusher with the pusher data", async () => {
        // Given
        const mockSetPusher = vi.fn().mockResolvedValue(undefined);
        const mockClient = { setPusher: mockSetPusher } as unknown;
        const pusherData = buildPusherData(
          PUSH_APP_ID,
          "https://push.example.com/sub/abc",
          "AgentOS",
          "DEVICE_1",
          "profile_1",
        );

        // When
        await registerPusher(mockClient as Parameters<typeof registerPusher>[0], pusherData);

        // Then
        expect(mockSetPusher).toHaveBeenCalledTimes(1);
        expect(mockSetPusher).toHaveBeenCalledWith(pusherData);
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* unregisterPusher                                                   */
  /* ---------------------------------------------------------------- */
  describe("unregisterPusher", () => {
    describe("given a pusher to remove", () => {
      it("should call client.setPusher with kind set to null", async () => {
        // Given
        const mockSetPusher = vi.fn().mockResolvedValue(undefined);
        const mockClient = { setPusher: mockSetPusher } as unknown;
        const pusherData = buildPusherData(
          PUSH_APP_ID,
          "https://push.example.com/sub/abc",
          "AgentOS",
          "DEVICE_1",
          "profile_1",
        );

        // When
        await unregisterPusher(mockClient as Parameters<typeof unregisterPusher>[0], pusherData);

        // Then
        expect(mockSetPusher).toHaveBeenCalledTimes(1);
        const calledWith = mockSetPusher.mock.calls[0][0] as Pusher;
        expect(calledWith.kind).toBeNull();
      });

      it("should preserve all other fields from the original pusher data", async () => {
        // Given
        const mockSetPusher = vi.fn().mockResolvedValue(undefined);
        const mockClient = { setPusher: mockSetPusher } as unknown;
        const pusherData = buildPusherData(
          PUSH_APP_ID,
          "https://push.example.com/sub/xyz",
          "AgentOS",
          "DEVICE_2",
          "profile_2",
        );

        // When
        await unregisterPusher(mockClient as Parameters<typeof unregisterPusher>[0], pusherData);

        // Then
        const calledWith = mockSetPusher.mock.calls[0][0] as Pusher;
        expect(calledWith.pushkey).toBe(pusherData.pushkey);
        expect(calledWith.app_id).toBe(pusherData.app_id);
        expect(calledWith.app_display_name).toBe(pusherData.app_display_name);
        expect(calledWith.device_display_name).toBe(pusherData.device_display_name);
        expect(calledWith.profile_tag).toBe(pusherData.profile_tag);
        expect(calledWith.data.url).toBe(pusherData.data.url);
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* getPushers                                                         */
  /* ---------------------------------------------------------------- */
  describe("getPushers", () => {
    describe("given the homeserver returns a pushers list", () => {
      it("should return the array of pushers", async () => {
        // Given
        const mockPushers: Pusher[] = [
          buildPusherData(PUSH_APP_ID, "https://ep1.example.com", "AgentOS", "D1", "p1"),
          buildPusherData(PUSH_APP_ID, "https://ep2.example.com", "AgentOS", "D2", "p2"),
        ];
        const mockGetPushers = vi.fn().mockResolvedValue({ pushers: mockPushers });
        const mockClient = { getPushers: mockGetPushers } as unknown;

        // When
        const result = await getPushers(mockClient as Parameters<typeof getPushers>[0]);

        // Then
        expect(result).toHaveLength(2);
        expect(result[0].pushkey).toBe("https://ep1.example.com");
        expect(result[1].pushkey).toBe("https://ep2.example.com");
      });
    });

    describe("given the homeserver returns an empty response", () => {
      it("should return an empty array", async () => {
        // Given
        const mockGetPushers = vi.fn().mockResolvedValue({ pushers: undefined });
        const mockClient = { getPushers: mockGetPushers } as unknown;

        // When
        const result = await getPushers(mockClient as Parameters<typeof getPushers>[0]);

        // Then
        expect(result).toEqual([]);
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* isPushSupported                                                    */
  /* ---------------------------------------------------------------- */
  describe("isPushSupported", () => {
    let originalNavigator: typeof globalThis.navigator | undefined;
    let originalWindow: typeof globalThis.window | undefined;

    beforeEach(() => {
      originalNavigator = globalThis.navigator;
      originalWindow = globalThis.window;
    });

    afterEach(() => {
      if (originalNavigator !== undefined) {
        Object.defineProperty(globalThis, "navigator", {
          value: originalNavigator,
          writable: true,
          configurable: true,
        });
      }
      if (originalWindow !== undefined) {
        Object.defineProperty(globalThis, "window", {
          value: originalWindow,
          writable: true,
          configurable: true,
        });
      }
    });

    describe("given no PushManager and no Tauri", () => {
      it("should return false", () => {
        // Given — ensure window exists but no PushManager and no Tauri
        const fakeWindow = {} as Record<string, unknown>;
        Object.defineProperty(globalThis, "window", {
          value: fakeWindow,
          writable: true,
          configurable: true,
        });
        Object.defineProperty(globalThis, "navigator", {
          value: {},
          writable: true,
          configurable: true,
        });

        // When
        const result = isPushSupported();

        // Then
        expect(result).toBe(false);
      });
    });

    describe("given the app is running in Tauri", () => {
      it("should return true", () => {
        // Given
        const fakeWindow = { __TAURI_INTERNALS__: {} } as Record<string, unknown>;
        Object.defineProperty(globalThis, "window", {
          value: fakeWindow,
          writable: true,
          configurable: true,
        });

        // When
        const result = isPushSupported();

        // Then
        expect(result).toBe(true);
      });
    });

    describe("given the browser supports PushManager and ServiceWorker", () => {
      it("should return true", () => {
        // Given
        const fakeWindow = { PushManager: function PushManager() {} } as Record<string, unknown>;
        Object.defineProperty(globalThis, "window", {
          value: fakeWindow,
          writable: true,
          configurable: true,
        });
        Object.defineProperty(globalThis, "navigator", {
          value: { serviceWorker: {} },
          writable: true,
          configurable: true,
        });

        // When
        const result = isPushSupported();

        // Then
        expect(result).toBe(true);
      });
    });

    describe("given ServiceWorker is available but PushManager is not", () => {
      it("should return false", () => {
        // Given
        const fakeWindow = {} as Record<string, unknown>;
        Object.defineProperty(globalThis, "window", {
          value: fakeWindow,
          writable: true,
          configurable: true,
        });
        Object.defineProperty(globalThis, "navigator", {
          value: { serviceWorker: {} },
          writable: true,
          configurable: true,
        });

        // When
        const result = isPushSupported();

        // Then
        expect(result).toBe(false);
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* Constants                                                          */
  /* ---------------------------------------------------------------- */
  describe("constants", () => {
    it("should export the correct PUSH_APP_ID", () => {
      expect(PUSH_APP_ID).toBe("rocks.openclaw.app");
    });

    it("should export the correct DEFAULT_PUSH_GATEWAY", () => {
      expect(DEFAULT_PUSH_GATEWAY).toBe("https://matrix.openclaw.rocks/_matrix/push/v1/notify");
    });
  });
});
