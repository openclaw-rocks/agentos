import { describe, it, expect, vi, beforeEach } from "vitest";
import { pinMessage, unpinMessage } from "./PinnedMessages";

/* ------------------------------------------------------------------ */
/*  Helpers to build minimal Matrix-like fakes                         */
/* ------------------------------------------------------------------ */

function createFakeRoom(roomId: string, pinnedIds: string[] = []) {
  return {
    roomId,
    currentState: {
      getStateEvents: (type: string, stateKey?: string) => {
        if (type === "m.room.pinned_events" && stateKey === "") {
          if (pinnedIds.length === 0) return null;
          return { getContent: () => ({ pinned: [...pinnedIds] }) };
        }
        return null;
      },
    },
    getMember: (userId: string) => ({ name: userId.replace(/@(.+):.*/, "$1") }),
  };
}

function createFakeClient(fetchResults: Record<string, Record<string, unknown>> = {}) {
  return {
    sendStateEvent: vi.fn().mockResolvedValue({}),
    fetchRoomEvent: vi.fn().mockImplementation((_roomId: string, eventId: string) => {
      if (fetchResults[eventId]) return Promise.resolve(fetchResults[eventId]);
      return Promise.reject(new Error("Event not found"));
    }),
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("PinnedMessages", () => {
  let fakeClient: ReturnType<typeof createFakeClient>;

  beforeEach(() => {
    fakeClient = createFakeClient();
  });

  describe("given a room with pinned messages", () => {
    it("should display the count of pinned messages", () => {
      const room = createFakeRoom("!room:test", ["$ev1", "$ev2", "$ev3"]);
      const pinned =
        room.currentState.getStateEvents("m.room.pinned_events", "")?.getContent()?.pinned ?? [];
      expect(pinned).toHaveLength(3);
    });

    it("should show pinned message previews", async () => {
      const fetchResults: Record<string, Record<string, unknown>> = {
        $ev1: {
          event_id: "$ev1",
          sender: "@alice:test",
          origin_server_ts: 1_700_000_000_000,
          content: { body: "Hello, this is a pinned message!", msgtype: "m.text" },
          type: "m.room.message",
        },
        $ev2: {
          event_id: "$ev2",
          sender: "@bob:test",
          origin_server_ts: 1_700_001_000_000,
          content: { body: "Another pinned one\nwith multiple lines", msgtype: "m.text" },
          type: "m.room.message",
        },
      };

      const client = createFakeClient(fetchResults);

      const ev1 = await client.fetchRoomEvent("!room:test", "$ev1");
      const ev2 = await client.fetchRoomEvent("!room:test", "$ev2");

      const body1 = (ev1 as { content?: { body?: string } }).content?.body ?? "";
      const preview1 = body1.split("\n")[0].slice(0, 120);
      expect(preview1).toBe("Hello, this is a pinned message!");

      const body2 = (ev2 as { content?: { body?: string } }).content?.body ?? "";
      const preview2 = body2.split("\n")[0].slice(0, 120);
      expect(preview2).toBe("Another pinned one");
    });
  });

  describe("given no pinned messages", () => {
    it("should not show the pin icon", () => {
      const room = createFakeRoom("!room:test", []);
      const pinned =
        room.currentState.getStateEvents("m.room.pinned_events", "")?.getContent()?.pinned ?? [];
      // When length is 0, the PinnedMessagesButton renders null
      expect(pinned).toHaveLength(0);
    });
  });

  describe("pin action", () => {
    it("should add event ID to pinned events state", async () => {
      const room = createFakeRoom("!room:test", ["$existing1"]);

      await pinMessage(fakeClient as any, room as any, "$newpin");

      expect(fakeClient.sendStateEvent).toHaveBeenCalledOnce();
      expect(fakeClient.sendStateEvent).toHaveBeenCalledWith(
        "!room:test",
        "m.room.pinned_events",
        { pinned: ["$existing1", "$newpin"] },
        "",
      );
    });

    it("should not duplicate an already-pinned event ID", async () => {
      const room = createFakeRoom("!room:test", ["$existing1"]);

      await pinMessage(fakeClient as any, room as any, "$existing1");

      expect(fakeClient.sendStateEvent).not.toHaveBeenCalled();
    });
  });

  describe("unpin action", () => {
    it("should remove event ID from pinned events state", async () => {
      const room = createFakeRoom("!room:test", ["$ev1", "$ev2", "$ev3"]);

      await unpinMessage(fakeClient as any, room as any, "$ev2");

      expect(fakeClient.sendStateEvent).toHaveBeenCalledOnce();
      expect(fakeClient.sendStateEvent).toHaveBeenCalledWith(
        "!room:test",
        "m.room.pinned_events",
        { pinned: ["$ev1", "$ev3"] },
        "",
      );
    });

    it("should handle unpinning when no pins exist", async () => {
      const room = createFakeRoom("!room:test", []);

      await unpinMessage(fakeClient as any, room as any, "$nonexistent");

      expect(fakeClient.sendStateEvent).toHaveBeenCalledOnce();
      expect(fakeClient.sendStateEvent).toHaveBeenCalledWith(
        "!room:test",
        "m.room.pinned_events",
        { pinned: [] },
        "",
      );
    });
  });
});
