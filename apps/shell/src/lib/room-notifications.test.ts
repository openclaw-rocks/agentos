import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getRoomNotificationLevel,
  setRoomNotificationLevel,
  markRoomAsRead,
} from "./room-notifications";

const ROOM_ID = "!room1:example.com";

/* ----- Mock factories ----- */

interface MockPushRules {
  global: {
    override?: Array<{
      rule_id: string;
      actions: Array<string | { set_tweak: string; value?: unknown }>;
      conditions?: Array<{ kind: string; key?: string; pattern?: string }>;
    }>;
    room?: Array<{
      rule_id: string;
      actions: Array<string | { set_tweak: string; value?: unknown }>;
    }>;
  };
}

function createMockClient(pushRules?: MockPushRules) {
  return {
    pushRules: pushRules ?? { global: { override: [], room: [] } },
    addPushRule: vi.fn().mockResolvedValue(undefined),
    deletePushRule: vi.fn().mockResolvedValue(undefined),
    getRoom: vi.fn().mockReturnValue(null),
    sendReadReceipt: vi.fn().mockResolvedValue(undefined),
  };
}

/* ----- Tests ----- */

describe("Room Notifications", () => {
  describe("getRoomNotificationLevel", () => {
    describe("given no push rules exist for the room", () => {
      it("should return 'mentions' (the Matrix default)", () => {
        // Given
        const client = createMockClient();

        // When

        const level = getRoomNotificationLevel(client as any, ROOM_ID);

        // Then
        expect(level).toBe("mentions");
      });
    });

    describe("given a push rules object is missing entirely", () => {
      it("should return 'mentions'", () => {
        // Given
        const client = createMockClient();
        client.pushRules = undefined as unknown as MockPushRules;

        // When

        const level = getRoomNotificationLevel(client as any, ROOM_ID);

        // Then
        expect(level).toBe("mentions");
      });
    });

    describe("given the room has a mute override rule", () => {
      it("should return 'mute'", () => {
        // Given
        const client = createMockClient({
          global: {
            override: [
              {
                rule_id: ROOM_ID,
                actions: ["dont_notify"],
                conditions: [{ kind: "event_match", key: "room_id", pattern: ROOM_ID }],
              },
            ],
          },
        });

        // When

        const level = getRoomNotificationLevel(client as any, ROOM_ID);

        // Then
        expect(level).toBe("mute");
      });
    });

    describe("given the room has an 'all' override rule (notify, no sound)", () => {
      it("should return 'all'", () => {
        // Given
        const client = createMockClient({
          global: {
            override: [
              {
                rule_id: ROOM_ID,
                actions: ["notify"],
                conditions: [{ kind: "event_match", key: "room_id", pattern: ROOM_ID }],
              },
            ],
          },
        });

        // When

        const level = getRoomNotificationLevel(client as any, ROOM_ID);

        // Then
        expect(level).toBe("all");
      });
    });

    describe("given the room has an 'all_loud' override rule (notify + sound)", () => {
      it("should return 'all_loud'", () => {
        // Given
        const client = createMockClient({
          global: {
            override: [
              {
                rule_id: ROOM_ID,
                actions: ["notify", { set_tweak: "sound", value: "default" }],
                conditions: [{ kind: "event_match", key: "room_id", pattern: ROOM_ID }],
              },
            ],
          },
        });

        // When

        const level = getRoomNotificationLevel(client as any, ROOM_ID);

        // Then
        expect(level).toBe("all_loud");
      });
    });

    describe("given a room-level rule (not override)", () => {
      it("should read from room rules when no override exists", () => {
        // Given
        const client = createMockClient({
          global: {
            override: [],
            room: [
              {
                rule_id: ROOM_ID,
                actions: ["dont_notify"],
              },
            ],
          },
        });

        // When

        const level = getRoomNotificationLevel(client as any, ROOM_ID);

        // Then
        expect(level).toBe("mute");
      });
    });

    describe("given override rules exist but for a different room", () => {
      it("should return 'mentions'", () => {
        // Given
        const client = createMockClient({
          global: {
            override: [
              {
                rule_id: "!other:example.com",
                actions: ["dont_notify"],
                conditions: [
                  { kind: "event_match", key: "room_id", pattern: "!other:example.com" },
                ],
              },
            ],
          },
        });

        // When

        const level = getRoomNotificationLevel(client as any, ROOM_ID);

        // Then
        expect(level).toBe("mentions");
      });
    });
  });

  describe("setRoomNotificationLevel", () => {
    let client: ReturnType<typeof createMockClient>;

    beforeEach(() => {
      client = createMockClient();
    });

    describe("given level is set to 'mentions'", () => {
      it("should remove existing rules and not create a new one", async () => {
        // When

        await setRoomNotificationLevel(client as any, ROOM_ID, "mentions");

        // Then
        expect(client.addPushRule).not.toHaveBeenCalled();
      });
    });

    describe("given level is set to 'mute'", () => {
      it("should create an override rule with dont_notify action", async () => {
        // When

        await setRoomNotificationLevel(client as any, ROOM_ID, "mute");

        // Then
        expect(client.addPushRule).toHaveBeenCalledWith("global", "override", ROOM_ID, {
          conditions: [{ kind: "event_match", key: "room_id", pattern: ROOM_ID }],
          actions: ["dont_notify"],
        });
      });
    });

    describe("given level is set to 'all'", () => {
      it("should create an override rule with notify action (no sound)", async () => {
        // When

        await setRoomNotificationLevel(client as any, ROOM_ID, "all");

        // Then
        expect(client.addPushRule).toHaveBeenCalledWith("global", "override", ROOM_ID, {
          conditions: [{ kind: "event_match", key: "room_id", pattern: ROOM_ID }],
          actions: ["notify"],
        });
      });
    });

    describe("given level is set to 'all_loud'", () => {
      it("should create an override rule with notify + sound actions", async () => {
        // When

        await setRoomNotificationLevel(client as any, ROOM_ID, "all_loud");

        // Then
        expect(client.addPushRule).toHaveBeenCalledWith("global", "override", ROOM_ID, {
          conditions: [{ kind: "event_match", key: "room_id", pattern: ROOM_ID }],
          actions: ["notify", { set_tweak: "sound", value: "default" }],
        });
      });
    });

    describe("given an existing override rule for the room", () => {
      it("should remove the old rule before adding the new one", async () => {
        // Given
        client = createMockClient({
          global: {
            override: [
              {
                rule_id: ROOM_ID,
                actions: ["dont_notify"],
                conditions: [{ kind: "event_match", key: "room_id", pattern: ROOM_ID }],
              },
            ],
          },
        });

        // When

        await setRoomNotificationLevel(client as any, ROOM_ID, "all");

        // Then — deletePushRule should have been called before addPushRule
        expect(client.deletePushRule).toHaveBeenCalledWith("global", "override", ROOM_ID);
        expect(client.addPushRule).toHaveBeenCalled();
      });
    });

    describe("given an existing room-level rule", () => {
      it("should remove the room rule", async () => {
        // Given
        client = createMockClient({
          global: {
            override: [],
            room: [
              {
                rule_id: ROOM_ID,
                actions: ["dont_notify"],
              },
            ],
          },
        });

        // When

        await setRoomNotificationLevel(client as any, ROOM_ID, "mentions");

        // Then
        expect(client.deletePushRule).toHaveBeenCalledWith("global", "room", ROOM_ID);
      });
    });
  });

  describe("markRoomAsRead", () => {
    describe("given a room with events", () => {
      it("should send a read receipt for the last event", async () => {
        // Given
        const lastEvent = { getId: () => "$evt-99" };
        const client = createMockClient();
        client.getRoom.mockReturnValue({
          roomId: ROOM_ID,
          getLiveTimeline: () => ({
            getEvents: () => [{ getId: () => "$evt-1" }, lastEvent],
          }),
        });

        // When

        await markRoomAsRead(client as any, ROOM_ID);

        // Then
        expect(client.sendReadReceipt).toHaveBeenCalledWith(lastEvent);
      });
    });

    describe("given a room with no events", () => {
      it("should not send a read receipt", async () => {
        // Given
        const client = createMockClient();
        client.getRoom.mockReturnValue({
          roomId: ROOM_ID,
          getLiveTimeline: () => ({
            getEvents: () => [],
          }),
        });

        // When

        await markRoomAsRead(client as any, ROOM_ID);

        // Then
        expect(client.sendReadReceipt).not.toHaveBeenCalled();
      });
    });

    describe("given the room does not exist", () => {
      it("should not throw", async () => {
        // Given
        const client = createMockClient();
        client.getRoom.mockReturnValue(null);

        // When / Then

        await expect(markRoomAsRead(client as any, ROOM_ID)).resolves.toBeUndefined();
      });
    });
  });
});
