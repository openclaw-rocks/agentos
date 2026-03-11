import type { Entity, EntityQuery, EntityReference, EntityStore } from "../ports/entity-store.js";

/**
 * In-memory implementation of EntityStore for MVP/testing.
 * Uses case-insensitive substring matching for name queries.
 */
export class MemoryEntityStore implements EntityStore {
  private entities = new Map<string, Entity>();

  async upsert(entity: Entity): Promise<Entity> {
    this.entities.set(entity.id, { ...entity });
    return { ...entity };
  }

  async get(id: string): Promise<Entity | null> {
    const entity = this.entities.get(id);
    return entity ? { ...entity } : null;
  }

  async find(query: EntityQuery): Promise<Entity[]> {
    const limit = query.limit ?? 20;
    const results: Entity[] = [];

    for (const entity of this.entities.values()) {
      if (query.type && entity.type !== query.type) continue;

      if (query.name) {
        const queryName = query.name.toLowerCase();
        const entityName = entity.name.toLowerCase();
        const aliasMatch = entity.aliases.some((a) => a.toLowerCase().includes(queryName));
        if (!entityName.includes(queryName) && !aliasMatch) continue;
      }

      if (query.spaceId) {
        const hasSpaceRef = entity.references.some((r) => r.spaceId === query.spaceId);
        if (!hasSpaceRef) continue;
      }

      results.push({ ...entity });

      if (results.length >= limit) break;
    }

    return results;
  }

  async addReference(entityId: string, ref: EntityReference): Promise<boolean> {
    const entity = this.entities.get(entityId);
    if (!entity) return false;

    entity.references.push(ref);
    if (ref.timestamp > entity.lastSeen) {
      entity.lastSeen = ref.timestamp;
    }
    if (ref.timestamp < entity.firstSeen) {
      entity.firstSeen = ref.timestamp;
    }

    return true;
  }

  async merge(sourceId: string, targetId: string): Promise<Entity> {
    const source = this.entities.get(sourceId);
    const target = this.entities.get(targetId);

    if (!source) throw new Error(`Source entity not found: ${sourceId}`);
    if (!target) throw new Error(`Target entity not found: ${targetId}`);

    // Merge aliases (include source name if different)
    const allAliases = new Set([...target.aliases, ...source.aliases]);
    if (source.name.toLowerCase() !== target.name.toLowerCase()) {
      allAliases.add(source.name);
    }

    // Merge references
    const mergedReferences = [...target.references, ...source.references];

    const merged: Entity = {
      ...target,
      aliases: [...allAliases],
      references: mergedReferences,
      firstSeen: Math.min(target.firstSeen, source.firstSeen),
      lastSeen: Math.max(target.lastSeen, source.lastSeen),
      metadata: { ...target.metadata, ...source.metadata },
    };

    this.entities.set(targetId, merged);
    this.entities.delete(sourceId);

    return { ...merged };
  }

  async remove(id: string): Promise<boolean> {
    return this.entities.delete(id);
  }

  async count(): Promise<number> {
    return this.entities.size;
  }

  async clear(): Promise<void> {
    this.entities.clear();
  }
}
