import type { Entity, EntityReference, EntityStore, EntityType } from "../ports/entity-store.js";

/** Domain service: resolves and manages entities */
export class EntityResolver {
  constructor(private readonly store: EntityStore) {}

  /** Extract entity mentions from text (basic NER) */
  extractEntities(text: string): Array<{ type: EntityType; name: string }> {
    const entities: Array<{ type: EntityType; name: string }> = [];
    const seen = new Set<string>();

    // @mentions → person
    const mentionRegex = /@(\w+)/g;
    let match: RegExpExecArray | null;
    match = mentionRegex.exec(text);
    while (match !== null) {
      const name = match[1];
      const key = `person:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        entities.push({ type: "person", name });
      }
      match = mentionRegex.exec(text);
    }

    // #hashtags → project
    const hashtagRegex = /#(\w+)/g;
    match = hashtagRegex.exec(text);
    while (match !== null) {
      const name = match[1];
      const key = `project:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        entities.push({ type: "project", name });
      }
      match = hashtagRegex.exec(text);
    }

    // Dates: ISO format (YYYY-MM-DD), "today", "tomorrow", "next week"
    const dateKeywords = ["today", "tomorrow", "next week"];
    for (const keyword of dateKeywords) {
      if (text.toLowerCase().includes(keyword)) {
        const key = `date:${keyword}`;
        if (!seen.has(key)) {
          seen.add(key);
          entities.push({ type: "date", name: keyword });
        }
      }
    }

    const isoDateRegex = /\b(\d{4}-\d{2}-\d{2})\b/g;
    match = isoDateRegex.exec(text);
    while (match !== null) {
      const name = match[1];
      const key = `date:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        entities.push({ type: "date", name });
      }
      match = isoDateRegex.exec(text);
    }

    // Capitalized words that aren't at start of sentence → potential person/company
    // Split text into sentences, then look for capitalized words mid-sentence
    const sentences = text.split(/[.!?]+/);
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;

      const words = trimmed.split(/\s+/);
      for (let i = 1; i < words.length; i++) {
        const word = words[i];
        // Skip @mentions and #hashtags (already handled)
        if (word.startsWith("@") || word.startsWith("#")) continue;
        // Skip short words
        if (word.length < 2) continue;
        // Check if word is capitalized (first letter upper, rest has at least one lower)
        if (/^[A-Z][a-z]/.test(word)) {
          // Strip trailing punctuation
          const cleaned = word.replace(/[^a-zA-Z]/g, "");
          if (cleaned.length >= 2) {
            const key = `person:${cleaned}`;
            if (!seen.has(key)) {
              seen.add(key);
              entities.push({ type: "person", name: cleaned });
            }
          }
        }
      }
    }

    return entities;
  }

  /** Upsert an entity, creating or merging with existing */
  async resolve(type: EntityType, name: string, reference: EntityReference): Promise<Entity> {
    // Try to find existing entity with this name and type
    const existing = await this.store.find({ type, name, limit: 1 });

    if (existing.length > 0) {
      // Add reference to existing entity
      const entity = existing[0];
      await this.store.addReference(entity.id, reference);

      // Update lastSeen if needed
      if (reference.timestamp > entity.lastSeen) {
        return this.store.upsert({
          ...entity,
          lastSeen: reference.timestamp,
        });
      }

      return { ...entity, references: [...entity.references, reference] };
    }

    // Create new entity
    const newEntity: Entity = {
      id: generateEntityId(type, name),
      type,
      name,
      aliases: [],
      references: [reference],
      firstSeen: reference.timestamp,
      lastSeen: reference.timestamp,
    };

    return this.store.upsert(newEntity);
  }

  /** Find entities by name (fuzzy) */
  async findByName(name: string, type?: EntityType): Promise<Entity[]> {
    return this.store.find({ name, type });
  }

  /** Merge two entities that refer to the same thing */
  async mergeEntities(sourceId: string, targetId: string): Promise<Entity> {
    return this.store.merge(sourceId, targetId);
  }

  /** Get all entities for a space */
  async getSpaceEntities(spaceId: string): Promise<Entity[]> {
    return this.store.find({ spaceId });
  }
}

function generateEntityId(type: EntityType, name: string): string {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "-");
  return `${type}:${normalized}:${Date.now()}`;
}
