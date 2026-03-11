import { describe, it, expect, beforeEach } from "vitest";
import { MemoryEntityStore } from "../adapters/memory-entity-store.js";
import type { EntityReference } from "../ports/entity-store.js";
import { EntityResolver } from "./entity-resolver.js";

function makeRef(overrides?: Partial<EntityReference>): EntityReference {
  return {
    spaceId: "space1",
    roomId: "room1",
    eventId: "evt1",
    timestamp: 1000,
    context: "some context",
    ...overrides,
  };
}

describe("EntityResolver", () => {
  let store: MemoryEntityStore;
  let resolver: EntityResolver;

  beforeEach(() => {
    store = new MemoryEntityStore();
    resolver = new EntityResolver(store);
  });

  describe("extractEntities", () => {
    describe("given text with @mentions", () => {
      describe("when extracting entities", () => {
        it("then finds person entities for each mention", () => {
          const entities = resolver.extractEntities("Hey @alice and @bob, check this out");
          const mentions = entities.filter((e) => e.type === "person");
          expect(mentions.some((e) => e.name === "alice")).toBe(true);
          expect(mentions.some((e) => e.name === "bob")).toBe(true);
        });
      });
    });

    describe("given text with #hashtags", () => {
      describe("when extracting entities", () => {
        it("then finds project entities for each hashtag", () => {
          const entities = resolver.extractEntities("Working on #apollo and #phoenix");
          const projects = entities.filter((e) => e.type === "project");
          expect(projects.some((e) => e.name === "apollo")).toBe(true);
          expect(projects.some((e) => e.name === "phoenix")).toBe(true);
        });
      });
    });

    describe("given text with date keywords", () => {
      describe("when extracting entities", () => {
        it("then finds date entities", () => {
          const entities = resolver.extractEntities("Let's meet tomorrow or next week");
          const dates = entities.filter((e) => e.type === "date");
          expect(dates.some((e) => e.name === "tomorrow")).toBe(true);
          expect(dates.some((e) => e.name === "next week")).toBe(true);
        });
      });
    });

    describe("given text with ISO dates", () => {
      describe("when extracting entities", () => {
        it("then finds date entities for ISO dates", () => {
          const entities = resolver.extractEntities("The deadline is 2024-03-15");
          const dates = entities.filter((e) => e.type === "date");
          expect(dates.some((e) => e.name === "2024-03-15")).toBe(true);
        });
      });
    });

    describe("given text with capitalized words mid-sentence", () => {
      describe("when extracting entities", () => {
        it("then finds potential person entities", () => {
          const entities = resolver.extractEntities("I spoke with Jennifer about the project");
          const persons = entities.filter((e) => e.type === "person");
          expect(persons.some((e) => e.name === "Jennifer")).toBe(true);
        });
      });
    });

    describe("given text with no entities", () => {
      describe("when extracting entities", () => {
        it("then returns an empty array", () => {
          const entities = resolver.extractEntities("just some lowercase text here");
          expect(entities).toEqual([]);
        });
      });
    });

    describe("given text with duplicate mentions", () => {
      describe("when extracting entities", () => {
        it("then deduplicates them", () => {
          const entities = resolver.extractEntities("Hey @alice and @alice again");
          const alices = entities.filter((e) => e.name === "alice" && e.type === "person");
          expect(alices.length).toBe(1);
        });
      });
    });
  });

  describe("resolve", () => {
    describe("given no existing entity", () => {
      describe("when resolving a new entity", () => {
        it("then creates a new entity", async () => {
          const ref = makeRef();
          const entity = await resolver.resolve("person", "Alice", ref);
          expect(entity.name).toBe("Alice");
          expect(entity.type).toBe("person");
          expect(entity.references.length).toBeGreaterThanOrEqual(1);
        });
      });
    });

    describe("given an existing entity with the same name", () => {
      describe("when resolving again", () => {
        it("then adds a reference to the existing entity", async () => {
          const ref1 = makeRef({ eventId: "evt1", timestamp: 1000 });
          await resolver.resolve("person", "Alice", ref1);

          const ref2 = makeRef({ eventId: "evt2", timestamp: 2000 });
          const entity = await resolver.resolve("person", "Alice", ref2);

          expect(entity.name).toBe("Alice");
          // Entity should have been found and updated
          const found = await store.find({ name: "Alice", type: "person" });
          expect(found.length).toBe(1);
          expect(found[0].references.length).toBe(2);
        });
      });
    });
  });

  describe("findByName", () => {
    beforeEach(async () => {
      await resolver.resolve("person", "Alice Johnson", makeRef());
      await resolver.resolve("person", "Bob Smith", makeRef());
      await resolver.resolve("company", "Acme Corp", makeRef());
    });

    describe("given a partial name", () => {
      describe("when searching case-insensitively", () => {
        it("then finds matching entities", async () => {
          const results = await resolver.findByName("alice");
          expect(results.length).toBeGreaterThanOrEqual(1);
          expect(results[0].name).toBe("Alice Johnson");
        });
      });
    });

    describe("given a name and type filter", () => {
      describe("when searching", () => {
        it("then filters by type", async () => {
          const results = await resolver.findByName("Acme", "company");
          expect(results.length).toBe(1);
          expect(results[0].type).toBe("company");
        });
      });
    });
  });

  describe("mergeEntities", () => {
    describe("given two entities representing the same thing", () => {
      describe("when merging them", () => {
        it("then combines references and removes the source", async () => {
          const ref1 = makeRef({ eventId: "evt1" });
          const e1 = await resolver.resolve("person", "Bob", ref1);

          const ref2 = makeRef({ eventId: "evt2" });
          const e2 = await resolver.resolve("person", "Robert", ref2);

          const merged = await resolver.mergeEntities(e2.id, e1.id);
          expect(merged.references.length).toBe(2);
          expect(merged.aliases).toContain("Robert");

          // Source should be removed
          const source = await store.get(e2.id);
          expect(source).toBeNull();
        });
      });
    });
  });

  describe("getSpaceEntities", () => {
    describe("given entities in multiple spaces", () => {
      describe("when getting entities for a specific space", () => {
        it("then returns only entities with references in that space", async () => {
          await resolver.resolve("person", "Alice", makeRef({ spaceId: "space1" }));
          await resolver.resolve("person", "Bob", makeRef({ spaceId: "space2" }));

          const entities = await resolver.getSpaceEntities("space1");
          expect(entities.length).toBe(1);
          expect(entities[0].name).toBe("Alice");
        });
      });
    });
  });
});
