import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NotificationManager } from "./notifications";

// Track constructor calls manually since we need a real constructor
const notifCalls: Array<[string, { body?: string; tag?: string; silent?: boolean }]> = [];
const mockNotificationInstance = {
  close: vi.fn(),
  onclick: null as (() => void) | null,
};

// Real constructor function (vi.fn won't work with `new`)
function FakeNotification(this: unknown, title: string, opts: Record<string, unknown>) {
  notifCalls.push([title, opts as { body?: string; tag?: string; silent?: boolean }]);
  Object.assign(this as Record<string, unknown>, mockNotificationInstance);
}
FakeNotification.permission = "granted" as NotificationPermission;
FakeNotification.requestPermission = vi.fn().mockResolvedValue("granted" as NotificationPermission);

function createMockEvent(opts: {
  type?: string;
  sender?: string;
  body?: string;
  eventId?: string;
}) {
  const {
    type = "m.room.message",
    sender = "@other:example.com",
    body = "Hello world",
    eventId = "$evt1",
  } = opts;
  return {
    getType: () => type,
    getSender: () => sender,
    getId: () => eventId,
    getContent: () => ({ body, msgtype: "m.text" }),
  };
}

function createMockRoom(roomId: string, name?: string) {
  return {
    roomId,
    name: name ?? "General",
    getMember: (userId: string) => ({ name: userId.split(":")[0].slice(1) }),
  };
}

function createMockClient(userId: string) {
  return {
    getUserId: () => userId,
  };
}

// Provide a minimal document mock if not in a DOM environment
const mockDocument = {
  hasFocus: () => false,
};

describe("NotificationManager", () => {
  let manager: NotificationManager;
  let originalNotification: typeof globalThis.Notification | undefined;
  let originalDocument: typeof globalThis.document | undefined;

  beforeEach(() => {
    manager = new NotificationManager();

    manager.setClient(createMockClient("@me:example.com") as any);

    // Save originals
    originalNotification = globalThis.Notification;
    originalDocument = globalThis.document;

    // Install mocks

    globalThis.Notification = FakeNotification as any;

    if (!globalThis.document) (globalThis as any).document = mockDocument;
    FakeNotification.permission = "granted";
    notifCalls.length = 0;
    mockNotificationInstance.close.mockClear();
    mockNotificationInstance.onclick = null;
  });

  afterEach(() => {
    if (originalNotification) globalThis.Notification = originalNotification;
    if (originalDocument) {
      (globalThis as any).document = originalDocument;
    }
  });

  describe("given the app is not focused", () => {
    beforeEach(() => {
      document.hasFocus = () => false;
    });

    describe("when a new message arrives", () => {
      it("should show a desktop notification", () => {
        // Given
        const event = createMockEvent({ sender: "@alice:example.com", body: "Hey there!" });
        const room = createMockRoom("!room1:example.com", "General");

        // When

        manager.handleTimelineEvent(event as any, room as any);

        // Then
        expect(notifCalls).toHaveLength(1);
        expect(notifCalls[0][0]).toBe("alice");
        expect(notifCalls[0][1].body).toBe("[General] Hey there!");
      });

      it("should not notify for own messages", () => {
        // Given
        const event = createMockEvent({ sender: "@me:example.com", body: "My own message" });
        const room = createMockRoom("!room1:example.com");

        // When

        manager.handleTimelineEvent(event as any, room as any);

        // Then
        expect(notifCalls).toHaveLength(0);
      });

      it("should truncate long message bodies to 100 characters", () => {
        // Given
        const longBody = "A".repeat(150);
        const event = createMockEvent({ sender: "@alice:example.com", body: longBody });
        const room = createMockRoom("!room1:example.com", "General");

        // When

        manager.handleTimelineEvent(event as any, room as any);

        // Then
        expect(notifCalls).toHaveLength(1);
        const callBody = notifCalls[0][1].body!;
        expect(callBody).toContain("...");
        expect(callBody.length).toBeLessThanOrEqual("[General] ".length + 100 + 3);
      });

      it("should not notify for non-message events", () => {
        // Given
        const event = createMockEvent({ type: "m.reaction", sender: "@alice:example.com" });
        const room = createMockRoom("!room1:example.com");

        // When

        manager.handleTimelineEvent(event as any, room as any);

        // Then
        expect(notifCalls).toHaveLength(0);
      });
    });
  });

  describe("given the app is focused and room is selected", () => {
    it("should not show a notification", () => {
      // Given
      document.hasFocus = () => true;
      manager.setSelectedRoom("!room1:example.com");

      const event = createMockEvent({ sender: "@alice:example.com" });
      const room = createMockRoom("!room1:example.com");

      // When

      manager.handleTimelineEvent(event as any, room as any);

      // Then
      expect(notifCalls).toHaveLength(0);
    });

    it("should show a notification for a different room even when app is focused", () => {
      // Given
      document.hasFocus = () => true;
      manager.setSelectedRoom("!room1:example.com");

      const event = createMockEvent({ sender: "@alice:example.com" });
      const room = createMockRoom("!room2:example.com", "Other Room");

      // When

      manager.handleTimelineEvent(event as any, room as any);

      // Then
      expect(notifCalls).toHaveLength(1);
    });
  });

  describe("given a message containing @room mention", () => {
    beforeEach(() => {
      document.hasFocus = () => false;
    });

    it("should always notify for @room mentions even when app is not focused", () => {
      // Given
      const event = createMockEvent({
        sender: "@alice:example.com",
        body: "Hey @room check this out!",
      });
      const room = createMockRoom("!room1:example.com", "General");

      // When

      manager.handleTimelineEvent(event as any, room as any);

      // Then
      expect(notifCalls).toHaveLength(1);
      expect(notifCalls[0][1].body).toContain("@room");
    });

    it("should not notify for @room mentions when room is muted", () => {
      // Given — create a manager with a client whose push rules indicate mute
      const mutedClient = {
        getUserId: () => "@me:example.com",
        pushRules: {
          global: {
            override: [
              {
                rule_id: "!room1:example.com",
                actions: ["dont_notify"],
                conditions: [
                  { kind: "event_match", key: "room_id", pattern: "!room1:example.com" },
                ],
              },
            ],
            room: [],
          },
        },
      };
      const mutedManager = new NotificationManager();

      mutedManager.setClient(mutedClient as any);

      const event = createMockEvent({ sender: "@alice:example.com", body: "Hey @room everyone!" });
      const room = createMockRoom("!room1:example.com", "General");

      // When

      mutedManager.handleTimelineEvent(event as any, room as any);

      // Then
      expect(notifCalls).toHaveLength(0);
    });
  });

  describe("given notification permission is denied", () => {
    it("should not show a notification", () => {
      // Given
      FakeNotification.permission = "denied";
      document.hasFocus = () => false;

      const event = createMockEvent({ sender: "@alice:example.com" });
      const room = createMockRoom("!room1:example.com");

      // When

      manager.handleTimelineEvent(event as any, room as any);

      // Then
      expect(notifCalls).toHaveLength(0);
    });
  });
});
