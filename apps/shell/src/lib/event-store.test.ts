import { describe, it, expect, beforeEach } from "vitest";
import { EventStore } from "./event-store";

/**
 * Minimal stub for sdk.MatrixEvent that satisfies EventStore.processEvent.
 */
function createMatrixEvent(opts: {
  id: string;
  type: string;
  sender: string;
  content: Record<string, unknown>;
  ts?: number;
}) {
  return {
    getId: () => opts.id,
    getType: () => opts.type,
    getSender: () => opts.sender,
    getContent: () => opts.content,
    getTs: () => opts.ts ?? Date.now(),
  } as Parameters<EventStore["processEvent"]>[0];
}

/**
 * Minimal stub for sdk.Room.
 */
function createRoom(roomId: string) {
  return {
    roomId,
    getMember: (userId: string) => ({ name: userId }),
    getLiveTimeline: () => ({ getEvents: () => [] }),
  } as unknown as Parameters<EventStore["processEvent"]>[1] & { roomId: string };
}

describe("EventStore", () => {
  describe("reactions", () => {
    let store: EventStore;
    const roomId = "!room:test";
    let room: ReturnType<typeof createRoom>;

    beforeEach(() => {
      store = new EventStore();
      room = createRoom(roomId);

      // Add a message to react to
      const msgEvent = createMatrixEvent({
        id: "$msg1",
        type: "m.room.message",
        sender: "@alice:test",
        content: { body: "Hello", msgtype: "m.text" },
      });
      store.processEvent(msgEvent, room);
    });

    describe("given a message exists", () => {
      describe("when a reaction event arrives", () => {
        it("should track the reaction by emoji key and sender", () => {
          const reactionEvent = createMatrixEvent({
            id: "$reaction1",
            type: "m.reaction",
            sender: "@bob:test",
            content: {
              "m.relates_to": {
                rel_type: "m.annotation",
                event_id: "$msg1",
                key: "\u{1F44D}",
              },
            },
          });

          store.processEvent(reactionEvent, room);

          const reactions = store.getReactionsForEvent("$msg1");
          expect(reactions.size).toBe(1);
          expect(reactions.has("\u{1F44D}")).toBe(true);
          expect(reactions.get("\u{1F44D}")?.has("@bob:test")).toBe(true);
        });

        it("should increment the count for duplicate emoji from different senders", () => {
          const reaction1 = createMatrixEvent({
            id: "$reaction1",
            type: "m.reaction",
            sender: "@bob:test",
            content: {
              "m.relates_to": {
                rel_type: "m.annotation",
                event_id: "$msg1",
                key: "\u{1F44D}",
              },
            },
          });

          const reaction2 = createMatrixEvent({
            id: "$reaction2",
            type: "m.reaction",
            sender: "@charlie:test",
            content: {
              "m.relates_to": {
                rel_type: "m.annotation",
                event_id: "$msg1",
                key: "\u{1F44D}",
              },
            },
          });

          store.processEvent(reaction1, room);
          store.processEvent(reaction2, room);

          const reactions = store.getReactionsForEvent("$msg1");
          const thumbsUp = reactions.get("\u{1F44D}");
          expect(thumbsUp?.size).toBe(2);
          expect(thumbsUp?.has("@bob:test")).toBe(true);
          expect(thumbsUp?.has("@charlie:test")).toBe(true);
        });

        it("should not duplicate reactions from the same sender for the same emoji", () => {
          const reaction1 = createMatrixEvent({
            id: "$reaction1",
            type: "m.reaction",
            sender: "@bob:test",
            content: {
              "m.relates_to": {
                rel_type: "m.annotation",
                event_id: "$msg1",
                key: "\u{1F44D}",
              },
            },
          });

          const reaction2 = createMatrixEvent({
            id: "$reaction2",
            type: "m.reaction",
            sender: "@bob:test",
            content: {
              "m.relates_to": {
                rel_type: "m.annotation",
                event_id: "$msg1",
                key: "\u{1F44D}",
              },
            },
          });

          store.processEvent(reaction1, room);
          store.processEvent(reaction2, room);

          const reactions = store.getReactionsForEvent("$msg1");
          const thumbsUp = reactions.get("\u{1F44D}");
          expect(thumbsUp?.size).toBe(1);
        });
      });

      describe("when multiple different reactions arrive for the same message", () => {
        it("should track each emoji separately", () => {
          const reaction1 = createMatrixEvent({
            id: "$reaction1",
            type: "m.reaction",
            sender: "@bob:test",
            content: {
              "m.relates_to": {
                rel_type: "m.annotation",
                event_id: "$msg1",
                key: "\u{1F44D}",
              },
            },
          });

          const reaction2 = createMatrixEvent({
            id: "$reaction2",
            type: "m.reaction",
            sender: "@charlie:test",
            content: {
              "m.relates_to": {
                rel_type: "m.annotation",
                event_id: "$msg1",
                key: "\u{2764}\u{FE0F}",
              },
            },
          });

          const reaction3 = createMatrixEvent({
            id: "$reaction3",
            type: "m.reaction",
            sender: "@dave:test",
            content: {
              "m.relates_to": {
                rel_type: "m.annotation",
                event_id: "$msg1",
                key: "\u{1F680}",
              },
            },
          });

          store.processEvent(reaction1, room);
          store.processEvent(reaction2, room);
          store.processEvent(reaction3, room);

          const reactions = store.getReactionsForEvent("$msg1");
          expect(reactions.size).toBe(3);
          expect(reactions.get("\u{1F44D}")?.size).toBe(1);
          expect(reactions.get("\u{2764}\u{FE0F}")?.size).toBe(1);
          expect(reactions.get("\u{1F680}")?.size).toBe(1);
        });
      });
    });

    describe("given no reactions exist for an event", () => {
      it("should return an empty map", () => {
        const reactions = store.getReactionsForEvent("$msg1");
        expect(reactions.size).toBe(0);
      });
    });

    describe("given a reaction event with missing relation fields", () => {
      it("should not track the reaction", () => {
        const badReaction = createMatrixEvent({
          id: "$bad-reaction",
          type: "m.reaction",
          sender: "@bob:test",
          content: {},
        });

        store.processEvent(badReaction, room);

        const reactions = store.getReactionsForEvent("$msg1");
        expect(reactions.size).toBe(0);
      });
    });

    describe("given a reaction arrives", () => {
      it("should notify subscribers", () => {
        let notified = false;
        store.subscribe(() => {
          notified = true;
        });

        const reactionEvent = createMatrixEvent({
          id: "$reaction1",
          type: "m.reaction",
          sender: "@bob:test",
          content: {
            "m.relates_to": {
              rel_type: "m.annotation",
              event_id: "$msg1",
              key: "\u{1F44D}",
            },
          },
        });

        store.processEvent(reactionEvent, room);
        expect(notified).toBe(true);
      });
    });
  });

  describe("message editing", () => {
    let store: EventStore;
    const roomId = "!room:test";
    let room: ReturnType<typeof createRoom>;

    beforeEach(() => {
      store = new EventStore();
      room = createRoom(roomId);
    });

    describe("given a message exists in the main timeline", () => {
      beforeEach(() => {
        const original = createMatrixEvent({
          id: "$msg1",
          type: "m.room.message",
          sender: "@alice:test",
          content: { body: "original text", msgtype: "m.text" },
          ts: 1000,
        });
        store.processEvent(original, room);
      });

      describe("when a replacement event arrives", () => {
        beforeEach(() => {
          const edit = createMatrixEvent({
            id: "$edit1",
            type: "m.room.message",
            sender: "@alice:test",
            content: {
              "m.new_content": {
                msgtype: "m.text",
                body: "edited text",
              },
              "m.relates_to": {
                rel_type: "m.replace",
                event_id: "$msg1",
              },
              msgtype: "m.text",
              body: "* edited text",
            },
            ts: 2000,
          });
          store.processEvent(edit, room);
        });

        it("should update the original message content", () => {
          const messages = store.getMessagesForRoom(roomId);
          const msg = messages.find((m) => m.id === "$msg1");
          expect(msg).toBeDefined();
          expect(msg?.content.body).toBe("edited text");
          expect(msg?.content.msgtype).toBe("m.text");
        });

        it("should mark the message as edited", () => {
          const messages = store.getMessagesForRoom(roomId);
          const msg = messages.find((m) => m.id === "$msg1");
          expect(msg?.edited).toBe(true);
        });

        it("should not add the edit event as a separate message", () => {
          const messages = store.getMessagesForRoom(roomId);
          expect(messages.length).toBe(1);
        });
      });
    });

    describe("given a message exists in a thread", () => {
      beforeEach(() => {
        const root = createMatrixEvent({
          id: "$root1",
          type: "m.room.message",
          sender: "@alice:test",
          content: { body: "root message", msgtype: "m.text" },
          ts: 1000,
        });
        store.processEvent(root, room);

        const reply = createMatrixEvent({
          id: "$reply1",
          type: "m.room.message",
          sender: "@bob:test",
          content: {
            body: "thread reply",
            msgtype: "m.text",
            "m.relates_to": {
              rel_type: "m.thread",
              event_id: "$root1",
            },
          },
          ts: 2000,
        });
        store.processEvent(reply, room);
      });

      describe("when the thread reply is edited", () => {
        beforeEach(() => {
          const edit = createMatrixEvent({
            id: "$edit2",
            type: "m.room.message",
            sender: "@bob:test",
            content: {
              "m.new_content": {
                msgtype: "m.text",
                body: "edited thread reply",
              },
              "m.relates_to": {
                rel_type: "m.replace",
                event_id: "$reply1",
              },
              msgtype: "m.text",
              body: "* edited thread reply",
            },
            ts: 3000,
          });
          store.processEvent(edit, room);
        });

        it("should update the thread reply content", () => {
          const threadMessages = store.getThreadMessages(roomId, "$root1");
          const reply = threadMessages.find((m) => m.id === "$reply1");
          expect(reply).toBeDefined();
          expect(reply?.content.body).toBe("edited thread reply");
        });

        it("should mark the thread reply as edited", () => {
          const threadMessages = store.getThreadMessages(roomId, "$root1");
          const reply = threadMessages.find((m) => m.id === "$reply1");
          expect(reply?.edited).toBe(true);
        });
      });
    });
  });

  describe("message deletion", () => {
    let store: EventStore;
    const roomId = "!room:test";
    let room: ReturnType<typeof createRoom>;

    beforeEach(() => {
      store = new EventStore();
      room = createRoom(roomId);
    });

    describe("given a message exists in the main timeline", () => {
      beforeEach(() => {
        const original = createMatrixEvent({
          id: "$msg2",
          type: "m.room.message",
          sender: "@alice:test",
          content: { body: "to be deleted", msgtype: "m.text" },
          ts: 1000,
        });
        store.processEvent(original, room);
      });

      describe("when it is redacted", () => {
        beforeEach(() => {
          store.redactMessage("$msg2");
        });

        it("should mark the message as redacted", () => {
          const messages = store.getMessagesForRoom(roomId);
          const msg = messages.find((m) => m.id === "$msg2");
          expect(msg?.redacted).toBe(true);
        });

        it("should clear the message content", () => {
          const messages = store.getMessagesForRoom(roomId);
          const msg = messages.find((m) => m.id === "$msg2");
          expect(msg?.content).toEqual({});
        });
      });
    });

    describe("given a message exists in a thread", () => {
      beforeEach(() => {
        const root = createMatrixEvent({
          id: "$root2",
          type: "m.room.message",
          sender: "@alice:test",
          content: { body: "root message", msgtype: "m.text" },
          ts: 1000,
        });
        store.processEvent(root, room);

        const reply = createMatrixEvent({
          id: "$reply2",
          type: "m.room.message",
          sender: "@bob:test",
          content: {
            body: "thread reply to delete",
            msgtype: "m.text",
            "m.relates_to": {
              rel_type: "m.thread",
              event_id: "$root2",
            },
          },
          ts: 2000,
        });
        store.processEvent(reply, room);
      });

      describe("when the thread reply is redacted", () => {
        beforeEach(() => {
          store.redactMessage("$reply2");
        });

        it("should mark the thread reply as redacted", () => {
          const threadMessages = store.getThreadMessages(roomId, "$root2");
          const reply = threadMessages.find((m) => m.id === "$reply2");
          expect(reply?.redacted).toBe(true);
        });

        it("should clear the thread reply content", () => {
          const threadMessages = store.getThreadMessages(roomId, "$root2");
          const reply = threadMessages.find((m) => m.id === "$reply2");
          expect(reply?.content).toEqual({});
        });
      });
    });
  });

  describe("getMessageById", () => {
    let store: EventStore;
    const roomId = "!room:test";
    let room: ReturnType<typeof createRoom>;

    beforeEach(() => {
      store = new EventStore();
      room = createRoom(roomId);
    });

    it("should return the message for a known event ID", () => {
      const event = createMatrixEvent({
        id: "$lookup1",
        type: "m.room.message",
        sender: "@alice:test",
        content: { body: "lookup test", msgtype: "m.text" },
      });
      store.processEvent(event, room);

      const msg = store.getMessageById("$lookup1");
      expect(msg).toBeDefined();
      expect(msg?.content.body).toBe("lookup test");
    });

    it("should return undefined for an unknown event ID", () => {
      expect(store.getMessageById("$unknown")).toBeUndefined();
    });
  });
});
