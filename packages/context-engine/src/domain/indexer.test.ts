import { describe, it, expect, beforeEach } from "vitest";
import { MemoryVectorIndex } from "../adapters/memory-vector-index.js";
import { extractText, EventIndexer } from "./indexer.js";

describe("extractText", () => {
  describe("given an m.room.message event", () => {
    describe("when the content has a body field", () => {
      it("then returns the body text", () => {
        const result = extractText("m.room.message", {
          body: "Hello, world!",
          msgtype: "m.text",
        });
        expect(result).toBe("Hello, world!");
      });
    });

    describe("when the content has no body field", () => {
      it("then returns null", () => {
        const result = extractText("m.room.message", { msgtype: "m.text" });
        expect(result).toBeNull();
      });
    });

    describe("when the body is not a string", () => {
      it("then returns null", () => {
        const result = extractText("m.room.message", { body: 42 });
        expect(result).toBeNull();
      });
    });
  });

  describe("given a rocks.openclaw.agent.ui event", () => {
    describe("when the content has label and value fields", () => {
      it("then extracts text from labels and values recursively", () => {
        const result = extractText("rocks.openclaw.agent.ui", {
          component: "card",
          label: "Status",
          value: "Active",
          children: [{ label: "Name", value: "Alice" }, { text: "Additional info" }],
        });
        expect(result).toContain("Status");
        expect(result).toContain("Active");
        expect(result).toContain("Name");
        expect(result).toContain("Alice");
        expect(result).toContain("Additional info");
      });
    });

    describe("when the content has no text fields", () => {
      it("then returns null", () => {
        const result = extractText("rocks.openclaw.agent.ui", {
          component: "divider",
          width: 100,
        });
        expect(result).toBeNull();
      });
    });
  });

  describe("given a rocks.openclaw.agent.task event", () => {
    describe("when the content has title and description", () => {
      it("then returns combined title and description", () => {
        const result = extractText("rocks.openclaw.agent.task", {
          title: "Fix bug",
          description: "The login page is broken",
        });
        expect(result).toBe("Fix bug The login page is broken");
      });
    });

    describe("when the content has only title", () => {
      it("then returns just the title", () => {
        const result = extractText("rocks.openclaw.agent.task", {
          title: "Deploy v2",
        });
        expect(result).toBe("Deploy v2");
      });
    });

    describe("when the content has neither title nor description", () => {
      it("then returns null", () => {
        const result = extractText("rocks.openclaw.agent.task", {
          status: "pending",
        });
        expect(result).toBeNull();
      });
    });
  });

  describe("given an unknown event type", () => {
    describe("when any content is provided", () => {
      it("then returns null", () => {
        const result = extractText("m.room.member", { membership: "join" });
        expect(result).toBeNull();
      });
    });
  });
});

describe("EventIndexer", () => {
  let index: MemoryVectorIndex;
  let indexer: EventIndexer;

  beforeEach(() => {
    index = new MemoryVectorIndex();
    indexer = new EventIndexer(index, { batchSize: 2, batchFlushIntervalMs: 50_000 });
  });

  describe("given a new indexer", () => {
    describe("when indexing a valid event", () => {
      it("then returns true", async () => {
        const result = await indexer.indexEvent(
          "space1",
          "room1",
          "event1",
          "m.room.message",
          { body: "Hello" },
          "@user:server",
          Date.now(),
        );
        expect(result).toBe(true);
      });
    });

    describe("when indexing an event with no extractable text", () => {
      it("then returns false", async () => {
        const result = await indexer.indexEvent(
          "space1",
          "room1",
          "event1",
          "m.room.member",
          { membership: "join" },
          "@user:server",
          Date.now(),
        );
        expect(result).toBe(false);
      });
    });

    describe("when batch size is reached", () => {
      it("then flushes documents to the index", async () => {
        await indexer.indexEvent(
          "space1",
          "room1",
          "event1",
          "m.room.message",
          { body: "First message" },
          "@user:server",
          Date.now(),
        );
        expect(await index.count()).toBe(0);

        await indexer.indexEvent(
          "space1",
          "room1",
          "event2",
          "m.room.message",
          { body: "Second message" },
          "@user:server",
          Date.now(),
        );
        // Batch size is 2, so flush should have occurred
        expect(await index.count()).toBe(2);
      });
    });

    describe("when manually flushing", () => {
      it("then persists pending documents", async () => {
        await indexer.indexEvent(
          "space1",
          "room1",
          "event1",
          "m.room.message",
          { body: "Hello" },
          "@user:server",
          Date.now(),
        );
        expect(await index.count()).toBe(0);

        await indexer.flush();
        expect(await index.count()).toBe(1);
      });
    });
  });

  describe("given an indexer with indexed events", () => {
    beforeEach(async () => {
      await indexer.indexEvent(
        "space1",
        "room1",
        "event1",
        "m.room.message",
        { body: "Hello" },
        "@user:server",
        1000,
      );
      await indexer.indexEvent(
        "space1",
        "room1",
        "event2",
        "m.room.message",
        { body: "World" },
        "@user:server",
        2000,
      );
      // Batch of 2 auto-flushes
    });

    describe("when getting document count", () => {
      it("then returns the correct count", async () => {
        const count = await indexer.getDocumentCount();
        expect(count).toBe(2);
      });
    });

    describe("when removing a space", () => {
      it("then removes all documents for that space", async () => {
        const removed = await indexer.removeSpace("space1");
        expect(removed).toBe(2);
        expect(await index.count()).toBe(0);
      });
    });

    describe("when removing a non-existent space", () => {
      it("then removes nothing", async () => {
        const removed = await indexer.removeSpace("space999");
        expect(removed).toBe(0);
        expect(await index.count()).toBe(2);
      });
    });
  });
});
