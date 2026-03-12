import { describe, it, expect } from "vitest";
import {
  exportRoomAsText,
  exportRoomAsHtml,
  exportRoomAsJson,
  filterByDateRange,
} from "./chat-export";
import type { ExportedEvent } from "./chat-export";
import type { TimelineMessage } from "./event-store";

function makeMessage(overrides: Partial<TimelineMessage> = {}): TimelineMessage {
  return {
    id: overrides.id ?? "evt1",
    sender: overrides.sender ?? "@alice:example.com",
    senderName: overrides.senderName ?? "Alice",
    type: overrides.type ?? "m.room.message",
    content: overrides.content ?? { body: "Hello world", msgtype: "m.text" },
    timestamp: overrides.timestamp ?? 1710000000000,
    isAgent: overrides.isAgent ?? false,
    replyCount: overrides.replyCount ?? 0,
  };
}

describe("ChatExport", () => {
  describe("exportRoomAsText", () => {
    describe("given a list of events", () => {
      it("should format as [time] sender: body", () => {
        const events = [
          makeMessage({ senderName: "Alice", content: { body: "Hello", msgtype: "m.text" } }),
          makeMessage({
            id: "evt2",
            senderName: "Bob",
            content: { body: "Hi there", msgtype: "m.text" },
            timestamp: 1710000060000,
          }),
        ];

        const result = exportRoomAsText(events, "general");

        expect(result).toContain("Chat export: general");
        expect(result).toContain("Messages: 2");
        expect(result).toMatch(/\[.*\] Alice: Hello/);
        expect(result).toMatch(/\[.*\] Bob: Hi there/);
      });

      it("should include the room name in the header", () => {
        const events = [makeMessage()];
        const result = exportRoomAsText(events, "test-room");
        expect(result).toContain("Chat export: test-room");
      });
    });

    describe("given empty events", () => {
      it("should still produce valid output with zero message count", () => {
        const result = exportRoomAsText([], "empty-room");

        expect(result).toContain("Chat export: empty-room");
        expect(result).toContain("Messages: 0");
        expect(result).toContain("---");
      });
    });

    describe("given events with non-text msgtypes", () => {
      it("should show the msgtype label for media messages", () => {
        const events = [
          makeMessage({ content: { msgtype: "m.image", url: "mxc://example.com/img" } }),
        ];
        const result = exportRoomAsText(events, "media-room");
        expect(result).toMatch(/\[.*\] Alice: \[m\.image\]/);
      });
    });
  });

  describe("exportRoomAsHtml", () => {
    describe("given a list of events", () => {
      it("should produce valid HTML with messages", () => {
        const events = [
          makeMessage({ senderName: "Alice", content: { body: "Hello", msgtype: "m.text" } }),
          makeMessage({
            id: "evt2",
            senderName: "Bob",
            content: { body: "World", msgtype: "m.text" },
          }),
        ];

        const result = exportRoomAsHtml(events, "general");

        expect(result).toContain("<!DOCTYPE html>");
        expect(result).toContain("<html");
        expect(result).toContain("</html>");
        expect(result).toContain("Chat Export: general");
        expect(result).toContain("2 messages");
        expect(result).toContain("Alice");
        expect(result).toContain("Hello");
        expect(result).toContain("Bob");
        expect(result).toContain("World");
      });

      it("should escape HTML entities in message content", () => {
        const events = [
          makeMessage({
            senderName: "Eve",
            content: { body: "<script>alert('xss')</script>", msgtype: "m.text" },
          }),
        ];

        const result = exportRoomAsHtml(events, "security-test");

        expect(result).not.toContain("<script>");
        expect(result).toContain("&lt;script&gt;");
      });
    });

    describe("given empty events", () => {
      it("should still produce valid HTML", () => {
        const result = exportRoomAsHtml([], "empty-room");

        expect(result).toContain("<!DOCTYPE html>");
        expect(result).toContain("0 messages");
        expect(result).toContain("</html>");
      });
    });
  });

  describe("exportRoomAsJson", () => {
    describe("given a list of events", () => {
      it("should produce parseable JSON array", () => {
        const events = [
          makeMessage({
            sender: "@alice:example.com",
            senderName: "Alice",
            content: { body: "Hello", msgtype: "m.text" },
            timestamp: 1710000000000,
          }),
        ];

        const result = exportRoomAsJson(events, "general");
        const parsed = JSON.parse(result) as {
          roomName: string;
          messageCount: number;
          messages: ExportedEvent[];
        };

        expect(parsed.roomName).toBe("general");
        expect(parsed.messageCount).toBe(1);
        expect(parsed.messages).toHaveLength(1);
        expect(parsed.messages[0].sender).toBe("@alice:example.com");
        expect(parsed.messages[0].senderName).toBe("Alice");
        expect(parsed.messages[0].content).toEqual({ body: "Hello", msgtype: "m.text" });
        expect(parsed.messages[0].type).toBe("m.room.message");
        expect(parsed.messages[0].timestamp).toBeDefined();
      });

      it("should include ISO timestamp strings", () => {
        const events = [makeMessage({ timestamp: 1710000000000 })];
        const result = exportRoomAsJson(events, "room");
        const parsed = JSON.parse(result) as { messages: ExportedEvent[] };
        const ts = parsed.messages[0].timestamp;
        // Should be a valid ISO string
        expect(new Date(ts).getTime()).toBe(1710000000000);
      });
    });

    describe("given empty events", () => {
      it("should produce valid JSON with empty messages array", () => {
        const result = exportRoomAsJson([], "empty-room");
        const parsed = JSON.parse(result) as {
          roomName: string;
          messageCount: number;
          messages: ExportedEvent[];
        };

        expect(parsed.roomName).toBe("empty-room");
        expect(parsed.messageCount).toBe(0);
        expect(parsed.messages).toEqual([]);
      });
    });
  });

  describe("filterByDateRange", () => {
    const events = [
      makeMessage({ id: "e1", timestamp: new Date("2026-03-01").getTime() }),
      makeMessage({ id: "e2", timestamp: new Date("2026-03-05").getTime() }),
      makeMessage({ id: "e3", timestamp: new Date("2026-03-10").getTime() }),
    ];

    describe("given a fromDate filter", () => {
      it("should exclude events before the fromDate", () => {
        const result = filterByDateRange(events, new Date("2026-03-04"));
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe("e2");
        expect(result[1].id).toBe("e3");
      });
    });

    describe("given a toDate filter", () => {
      it("should exclude events after the toDate", () => {
        const result = filterByDateRange(events, undefined, new Date("2026-03-06"));
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe("e1");
        expect(result[1].id).toBe("e2");
      });
    });

    describe("given both fromDate and toDate", () => {
      it("should return events within the range", () => {
        const result = filterByDateRange(events, new Date("2026-03-04"), new Date("2026-03-06"));
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("e2");
      });
    });

    describe("given no date filters", () => {
      it("should return all events", () => {
        const result = filterByDateRange(events);
        expect(result).toHaveLength(3);
      });
    });
  });
});
