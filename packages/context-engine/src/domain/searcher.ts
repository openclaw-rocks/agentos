import type { VectorIndex } from "../ports/vector-index.js";

export interface ContextQuery {
  query: string;
  spaces?: string[];
  eventTypes?: string[];
  timeRange?: { start: number; end: number };
  limit?: number;
}

export interface ContextResult {
  eventId: string;
  spaceId: string;
  roomId: string;
  text: string;
  score: number;
  timestamp: number;
  senderId: string;
}

/** Domain service: searches across the index */
export class ContextSearcher {
  constructor(private readonly index: VectorIndex) {}

  /** Search for relevant context */
  async search(query: ContextQuery): Promise<ContextResult[]> {
    const results = await this.index.search({
      query: query.query,
      spaces: query.spaces,
      eventTypes: query.eventTypes,
      timeRange: query.timeRange,
      limit: query.limit,
    });

    return results.map((r) => ({
      eventId: r.document.eventId,
      spaceId: r.document.spaceId,
      roomId: r.document.roomId,
      text: r.document.text,
      score: r.score,
      timestamp: r.document.timestamp,
      senderId: r.document.senderId,
    }));
  }

  /** Search with cross-space permission check */
  async searchWithPermissions(
    query: ContextQuery,
    allowedSpaces: string[],
  ): Promise<ContextResult[]> {
    if (allowedSpaces.length === 0) {
      return [];
    }

    // Intersect requested spaces with allowed spaces
    const effectiveSpaces =
      query.spaces && query.spaces.length > 0
        ? query.spaces.filter((s) => allowedSpaces.includes(s))
        : allowedSpaces;

    if (effectiveSpaces.length === 0) {
      return [];
    }

    return this.search({
      ...query,
      spaces: effectiveSpaces,
    });
  }
}
