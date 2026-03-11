export type EntityType = "person" | "company" | "project" | "product" | "date" | "location";

export interface EntityReference {
  spaceId: string;
  roomId: string;
  eventId: string;
  timestamp: number;
  context: string; // surrounding text snippet
}

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  aliases: string[];
  references: EntityReference[];
  metadata?: Record<string, unknown>;
  firstSeen: number;
  lastSeen: number;
}

export interface EntityQuery {
  type?: EntityType;
  name?: string; // fuzzy match
  spaceId?: string;
  limit?: number; // default 20
}

/** Port: entity storage and resolution */
export interface EntityStore {
  upsert(entity: Entity): Promise<Entity>;
  get(id: string): Promise<Entity | null>;
  find(query: EntityQuery): Promise<Entity[]>;
  addReference(entityId: string, ref: EntityReference): Promise<boolean>;
  merge(sourceId: string, targetId: string): Promise<Entity>;
  remove(id: string): Promise<boolean>;
  count(): Promise<number>;
  clear(): Promise<void>;
}
