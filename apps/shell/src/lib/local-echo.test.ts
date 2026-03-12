import { describe, it, expect, beforeEach } from "vitest";
import { EventStore } from "./event-store";

describe("Local Echo", () => {
  let store: EventStore;
  const roomId = "!test-room:example.com";

  beforeEach(() => {
    store = new EventStore();
  });

  describe("given a message is sent", () => {
    describe("when addLocalEcho is called", () => {
      it("should add a pending message to the room", () => {
        store.addLocalEcho(
          roomId,
          "~local-1",
          "@user:example.com",
          "Alice",
          { body: "hello", msgtype: "m.text" },
          1000,
        );

        const messages = store.getMessagesForRoom(roomId);
        expect(messages).toHaveLength(1);
        expect(messages[0].id).toBe("~local-1");
        expect(messages[0].sender).toBe("@user:example.com");
        expect(messages[0].senderName).toBe("Alice");
        expect(messages[0].content.body).toBe("hello");
        expect(messages[0].type).toBe("m.room.message");
        expect(messages[0].timestamp).toBe(1000);
      });

      it("should mark it as pending", () => {
        store.addLocalEcho(
          roomId,
          "~local-2",
          "@user:example.com",
          "Alice",
          { body: "hi", msgtype: "m.text" },
          2000,
        );

        const messages = store.getMessagesForRoom(roomId);
        expect(messages[0].pending).toBe(true);
        expect(messages[0].failed).toBeUndefined();
      });
    });

    describe("when resolveLocalEcho is called", () => {
      it("should replace the temp message with the real one", () => {
        store.addLocalEcho(
          roomId,
          "~local-3",
          "@user:example.com",
          "Alice",
          { body: "test", msgtype: "m.text" },
          3000,
        );

        store.resolveLocalEcho("~local-3", "$real-event-id");

        const messages = store.getMessagesForRoom(roomId);
        expect(messages).toHaveLength(1);
        expect(messages[0].id).toBe("$real-event-id");
        expect(messages[0].pending).toBe(false);
        expect(messages[0].content.body).toBe("test");
      });
    });

    describe("when failLocalEcho is called", () => {
      it("should mark the message as failed", () => {
        store.addLocalEcho(
          roomId,
          "~local-4",
          "@user:example.com",
          "Alice",
          { body: "oops", msgtype: "m.text" },
          4000,
        );

        store.failLocalEcho("~local-4");

        const messages = store.getMessagesForRoom(roomId);
        expect(messages).toHaveLength(1);
        expect(messages[0].id).toBe("~local-4");
        expect(messages[0].failed).toBe(true);
        expect(messages[0].pending).toBe(false);
      });
    });
  });
});
