import { describe, it, expect, beforeEach } from "vitest";
import type { Entity, EntityReference } from "../ports/entity-store.js";
import { MemoryEntityStore } from "./memory-entity-store.js";

function makeEntity(overrides?: Partial<Entity>): Entity {
  return {
    id: "entity1",
    type: "person",
    name: "Alice",
    aliases: [],
    references: [],
    firstSeen: 1000,
    lastSeen: 1000,
    ...overrides,
  };
}

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

describe("MemoryEntityStore", () => {
  let store: MemoryEntityStore;

  beforeEach(() => {
    store = new MemoryEntityStore();
  });

  describe("given an empty store", () => {
    describe("when counting entities", () => {
      it("then returns 0", async () => {
        expect(await store.count()).toBe(0);
      });
    });

    describe("when getting a non-existent entity", () => {
      it("then returns null", async () => {
        expect(await store.get("nonexistent")).toBeNull();
      });
    });
  });

  describe("given an upserted entity", () => {
    let _entity: Entity;

    beforeEach(async () => {
      _entity = await store.upsert(makeEntity({ id: "e1", name: "Alice" }));
    });

    describe("when getting it by id", () => {
      it("then returns the entity", async () => {
        const found = await store.get("e1");
        expect(found).not.toBeNull();
        expect(found!.name).toBe("Alice");
      });
    });

    describe("when upserting with the same id", () => {
      it("then overwrites the entity", async () => {
        await store.upsert(makeEntity({ id: "e1", name: "Alice Updated" }));
        const found = await store.get("e1");
        expect(found!.name).toBe("Alice Updated");
        expect(await store.count()).toBe(1);
      });
    });

    describe("when removing it", () => {
      it("then returns true and decrements count", async () => {
        const removed = await store.remove("e1");
        expect(removed).toBe(true);
        expect(await store.count()).toBe(0);
      });
    });

    describe("when removing a non-existent entity", () => {
      it("then returns false", async () => {
        const removed = await store.remove("nonexistent");
        expect(removed).toBe(false);
      });
    });
  });

  describe("given multiple entities", () => {
    beforeEach(async () => {
      await store.upsert(
        makeEntity({
          id: "e1",
          name: "Alice Johnson",
          type: "person",
          references: [makeRef({ spaceId: "space1" })],
        }),
      );
      await store.upsert(
        makeEntity({
          id: "e2",
          name: "Bob Smith",
          type: "person",
          references: [makeRef({ spaceId: "space2" })],
        }),
      );
      await store.upsert(
        makeEntity({
          id: "e3",
          name: "Acme Corp",
          type: "company",
          references: [makeRef({ spaceId: "space1" })],
        }),
      );
    });

    describe("when finding by type", () => {
      it("then returns entities of that type", async () => {
        const results = await store.find({ type: "person" });
        expect(results.length).toBe(2);
        for (const r of results) {
          expect(r.type).toBe("person");
        }
      });
    });

    describe("when finding by name (case-insensitive substring)", () => {
      it("then returns matching entities", async () => {
        const results = await store.find({ name: "alice" });
        expect(results.length).toBe(1);
        expect(results[0].name).toBe("Alice Johnson");
      });
    });

    describe("when finding by spaceId", () => {
      it("then returns entities with references in that space", async () => {
        const results = await store.find({ spaceId: "space1" });
        expect(results.length).toBe(2);
      });
    });

    describe("when clearing the store", () => {
      it("then removes all entities", async () => {
        await store.clear();
        expect(await store.count()).toBe(0);
      });
    });
  });

  describe("addReference", () => {
    describe("given an existing entity", () => {
      describe("when adding a reference", () => {
        it("then returns true and adds the reference", async () => {
          await store.upsert(makeEntity({ id: "e1" }));
          const ref = makeRef({ eventId: "evt2", timestamp: 2000 });
          const result = await store.addReference("e1", ref);
          expect(result).toBe(true);

          const entity = await store.get("e1");
          expect(entity!.references.length).toBe(1);
          expect(entity!.lastSeen).toBe(2000);
        });
      });
    });

    describe("given a non-existent entity", () => {
      describe("when adding a reference", () => {
        it("then returns false", async () => {
          const ref = makeRef();
          const result = await store.addReference("nonexistent", ref);
          expect(result).toBe(false);
        });
      });
    });
  });

  describe("merge", () => {
    describe("given two entities", () => {
      describe("when merging source into target", () => {
        it("then combines aliases and references, removes source", async () => {
          await store.upsert(
            makeEntity({
              id: "e1",
              name: "Robert",
              type: "person",
              references: [makeRef({ eventId: "evt1" })],
              firstSeen: 500,
              lastSeen: 1000,
            }),
          );
          await store.upsert(
            makeEntity({
              id: "e2",
              name: "Bob",
              type: "person",
              references: [makeRef({ eventId: "evt2" })],
              firstSeen: 1000,
              lastSeen: 2000,
            }),
          );

          const merged = await store.merge("e2", "e1");
          expect(merged.name).toBe("Robert");
          expect(merged.aliases).toContain("Bob");
          expect(merged.references.length).toBe(2);
          expect(merged.firstSeen).toBe(500);
          expect(merged.lastSeen).toBe(2000);

          // Source should be gone
          expect(await store.get("e2")).toBeNull();
          expect(await store.count()).toBe(1);
        });
      });
    });

    describe("given a non-existent source", () => {
      describe("when merging", () => {
        it("then throws an error", async () => {
          await store.upsert(makeEntity({ id: "e1" }));
          await expect(store.merge("nonexistent", "e1")).rejects.toThrow();
        });
      });
    });
  });
});
