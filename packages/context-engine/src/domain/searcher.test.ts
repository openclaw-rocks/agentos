import { describe, it, expect, beforeEach } from "vitest";
import { MemoryVectorIndex } from "../adapters/memory-vector-index.js";
import type { IndexedDocument } from "../ports/vector-index.js";
import { ContextSearcher } from "./searcher.js";

function makeDoc(overrides: Partial<IndexedDocument>): IndexedDocument {
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

describe("ContextSearcher", () => {
  let index: MemoryVectorIndex;
  let searcher: ContextSearcher;

  beforeEach(async () => {
    index = new MemoryVectorIndex();
    searcher = new ContextSearcher(index);

    await index.indexBatch([
      makeDoc({
        id: "d1",
        eventId: "e1",
        spaceId: "space1",
        text: "project planning meeting notes",
        timestamp: 1000,
      }),
      makeDoc({
        id: "d2",
        eventId: "e2",
        spaceId: "space1",
        text: "budget report for Q4",
        timestamp: 2000,
      }),
      makeDoc({
        id: "d3",
        eventId: "e3",
        spaceId: "space2",
        text: "project kickoff presentation",
        timestamp: 3000,
      }),
      makeDoc({
        id: "d4",
        eventId: "e4",
        spaceId: "space2",
        text: "design review feedback",
        eventType: "rocks.openclaw.agent.task",
        timestamp: 4000,
      }),
      makeDoc({
        id: "d5",
        eventId: "e5",
        spaceId: "space3",
        text: "confidential financial data",
        timestamp: 5000,
      }),
    ]);
  });

  describe("search", () => {
    describe("given a query matching multiple documents", () => {
      describe("when searching without filters", () => {
        it("then returns ranked results", async () => {
          const results = await searcher.search({ query: "project" });
          expect(results.length).toBeGreaterThanOrEqual(2);
          expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
          expect(results.some((r) => r.text.includes("project"))).toBe(true);
        });
      });
    });

    describe("given a space filter", () => {
      describe("when searching for a specific space", () => {
        it("then returns only results from that space", async () => {
          const results = await searcher.search({
            query: "project",
            spaces: ["space1"],
          });
          expect(results.length).toBeGreaterThanOrEqual(1);
          for (const r of results) {
            expect(r.spaceId).toBe("space1");
          }
        });
      });
    });

    describe("given an event type filter", () => {
      describe("when searching for a specific type", () => {
        it("then returns only results of that type", async () => {
          const results = await searcher.search({
            query: "review",
            eventTypes: ["rocks.openclaw.agent.task"],
          });
          expect(results.length).toBeGreaterThanOrEqual(1);
          for (const r of results) {
            expect(r.eventId).toBe("e4");
          }
        });
      });
    });

    describe("given a time range filter", () => {
      describe("when searching within a time window", () => {
        it("then returns only results in that range", async () => {
          const results = await searcher.search({
            query: "project",
            timeRange: { start: 0, end: 2500 },
          });
          for (const r of results) {
            expect(r.timestamp).toBeLessThanOrEqual(2500);
          }
        });
      });
    });

    describe("given a limit", () => {
      describe("when searching with limit 1", () => {
        it("then returns at most 1 result", async () => {
          const results = await searcher.search({
            query: "project",
            limit: 1,
          });
          expect(results.length).toBeLessThanOrEqual(1);
        });
      });
    });

    describe("given results", () => {
      describe("when checking result shape", () => {
        it("then each result has all expected fields", async () => {
          const results = await searcher.search({ query: "project" });
          expect(results.length).toBeGreaterThan(0);
          const result = results[0];
          expect(result).toHaveProperty("eventId");
          expect(result).toHaveProperty("spaceId");
          expect(result).toHaveProperty("roomId");
          expect(result).toHaveProperty("text");
          expect(result).toHaveProperty("score");
          expect(result).toHaveProperty("timestamp");
          expect(result).toHaveProperty("senderId");
        });
      });
    });
  });

  describe("searchWithPermissions", () => {
    describe("given allowed spaces", () => {
      describe("when searching with permission check", () => {
        it("then only returns results from allowed spaces", async () => {
          const results = await searcher.searchWithPermissions({ query: "project" }, ["space1"]);
          for (const r of results) {
            expect(r.spaceId).toBe("space1");
          }
        });
      });
    });

    describe("given empty allowed spaces", () => {
      describe("when searching", () => {
        it("then returns nothing", async () => {
          const results = await searcher.searchWithPermissions({ query: "project" }, []);
          expect(results).toEqual([]);
        });
      });
    });

    describe("given a query requesting spaces not in allowed list", () => {
      describe("when searching", () => {
        it("then returns nothing for disallowed spaces", async () => {
          const results = await searcher.searchWithPermissions(
            { query: "confidential", spaces: ["space3"] },
            ["space1", "space2"],
          );
          expect(results).toEqual([]);
        });
      });
    });

    describe("given a query requesting a subset of allowed spaces", () => {
      describe("when searching", () => {
        it("then only searches the intersection", async () => {
          const results = await searcher.searchWithPermissions(
            { query: "project", spaces: ["space1"] },
            ["space1", "space2"],
          );
          for (const r of results) {
            expect(r.spaceId).toBe("space1");
          }
        });
      });
    });

    describe("given multiple allowed spaces", () => {
      describe("when searching without space filter", () => {
        it("then searches across all allowed spaces", async () => {
          const results = await searcher.searchWithPermissions({ query: "project" }, [
            "space1",
            "space2",
          ]);
          const spaceIds = new Set(results.map((r) => r.spaceId));
          for (const id of spaceIds) {
            expect(["space1", "space2"]).toContain(id);
          }
        });
      });
    });
  });
});
