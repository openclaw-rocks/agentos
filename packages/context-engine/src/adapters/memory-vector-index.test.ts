import { describe, it, expect, beforeEach } from "vitest";
import type { IndexedDocument } from "../ports/vector-index.js";
import { MemoryVectorIndex } from "./memory-vector-index.js";

function makeDoc(overrides?: Partial<IndexedDocument>): IndexedDocument {
  return {
    id: "doc1",
    spaceId: "space1",
    roomId: "room1",
    eventId: "evt1",
    text: "default text",
    eventType: "m.room.message",
    timestamp: 1000,
    senderId: "@user:server",
    ...overrides,
  };
}

describe("MemoryVectorIndex", () => {
  let index: MemoryVectorIndex;

  beforeEach(() => {
    index = new MemoryVectorIndex();
  });

  describe("given an empty index", () => {
    describe("when counting documents", () => {
      it("then returns 0", async () => {
        expect(await index.count()).toBe(0);
      });
    });

    describe("when searching", () => {
      it("then returns no results", async () => {
        const results = await index.search({ query: "hello" });
        expect(results).toEqual([]);
      });
    });
  });

  describe("given a single indexed document", () => {
    beforeEach(async () => {
      await index.index(makeDoc({ id: "d1", text: "hello world" }));
    });

    describe("when counting", () => {
      it("then returns 1", async () => {
        expect(await index.count()).toBe(1);
      });
    });

    describe("when searching with a matching query", () => {
      it("then returns the document with a score", async () => {
        const results = await index.search({ query: "hello" });
        expect(results.length).toBe(1);
        expect(results[0].document.id).toBe("d1");
        expect(results[0].score).toBeGreaterThan(0);
      });
    });

    describe("when removing the document", () => {
      it("then returns true and decrements count", async () => {
        const removed = await index.remove("d1");
        expect(removed).toBe(true);
        expect(await index.count()).toBe(0);
      });
    });

    describe("when removing a non-existent document", () => {
      it("then returns false", async () => {
        const removed = await index.remove("nonexistent");
        expect(removed).toBe(false);
      });
    });
  });

  describe("given batch indexing", () => {
    describe("when indexing multiple documents", () => {
      it("then indexes all documents and returns count", async () => {
        const count = await index.indexBatch([
          makeDoc({ id: "d1", text: "first" }),
          makeDoc({ id: "d2", text: "second" }),
          makeDoc({ id: "d3", text: "third" }),
        ]);
        expect(count).toBe(3);
        expect(await index.count()).toBe(3);
      });
    });
  });

  describe("given multiple indexed documents", () => {
    beforeEach(async () => {
      await index.indexBatch([
        makeDoc({
          id: "d1",
          spaceId: "space1",
          text: "project planning meeting",
          eventType: "m.room.message",
          timestamp: 1000,
        }),
        makeDoc({
          id: "d2",
          spaceId: "space1",
          text: "budget report quarterly",
          eventType: "m.room.message",
          timestamp: 2000,
        }),
        makeDoc({
          id: "d3",
          spaceId: "space2",
          text: "project review design",
          eventType: "rocks.openclaw.agent.task",
          timestamp: 3000,
        }),
        makeDoc({
          id: "d4",
          spaceId: "space2",
          text: "meeting notes summary",
          eventType: "m.room.message",
          timestamp: 4000,
        }),
      ]);
    });

    describe("when filtering by space", () => {
      it("then returns only documents from that space", async () => {
        const results = await index.search({
          query: "project",
          spaces: ["space1"],
        });
        for (const r of results) {
          expect(r.document.spaceId).toBe("space1");
        }
      });
    });

    describe("when filtering by event type", () => {
      it("then returns only documents of that type", async () => {
        const results = await index.search({
          query: "project",
          eventTypes: ["rocks.openclaw.agent.task"],
        });
        for (const r of results) {
          expect(r.document.eventType).toBe("rocks.openclaw.agent.task");
        }
      });
    });

    describe("when filtering by time range", () => {
      it("then returns only documents in that range", async () => {
        const results = await index.search({
          query: "meeting",
          timeRange: { start: 0, end: 1500 },
        });
        for (const r of results) {
          expect(r.document.timestamp).toBeLessThanOrEqual(1500);
        }
      });
    });

    describe("when applying a limit", () => {
      it("then returns at most that many results", async () => {
        const results = await index.search({
          query: "meeting project",
          limit: 2,
        });
        expect(results.length).toBeLessThanOrEqual(2);
      });
    });

    describe("when applying a minScore", () => {
      it("then returns only results meeting the threshold", async () => {
        const results = await index.search({
          query: "project",
          minScore: 0.5,
        });
        for (const r of results) {
          expect(r.score).toBeGreaterThanOrEqual(0.5);
        }
      });
    });

    describe("when clearing the index", () => {
      it("then removes all documents", async () => {
        await index.clear();
        expect(await index.count()).toBe(0);
      });
    });
  });
});
