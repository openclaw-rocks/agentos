import type { IndexedDocument, VectorIndex } from "../ports/vector-index.js";

export interface IndexerConfig {
  /** Max number of documents to batch before flushing */
  batchSize?: number; // default 50
  /** Max age of a batch before auto-flush (ms) */
  batchFlushIntervalMs?: number; // default 1000
}

/** Extracts indexable text from different event types */
export function extractText(eventType: string, content: Record<string, unknown>): string | null {
  switch (eventType) {
    case "m.room.message": {
      const body = content["body"];
      return typeof body === "string" ? body : null;
    }
    case "rocks.openclaw.agent.ui": {
      return extractUIText(content);
    }
    case "rocks.openclaw.agent.task": {
      const parts: string[] = [];
      if (typeof content["title"] === "string") {
        parts.push(content["title"]);
      }
      if (typeof content["description"] === "string") {
        parts.push(content["description"]);
      }
      return parts.length > 0 ? parts.join(" ") : null;
    }
    default:
      return null;
  }
}

/** Recursively extract text from UI component tree */
function extractUIText(obj: unknown): string | null {
  if (obj == null || typeof obj !== "object") {
    return null;
  }

  const parts: string[] = [];

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const text = extractUIText(item);
      if (text) parts.push(text);
    }
  } else {
    const record = obj as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const value = record[key];
      if ((key === "label" || key === "value" || key === "text") && typeof value === "string") {
        parts.push(value);
      } else if (typeof value === "object" && value !== null) {
        const text = extractUIText(value);
        if (text) parts.push(text);
      }
    }
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare function setTimeout(cb: () => void, ms: number): any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare function clearTimeout(id: any): void;

/** Domain service: indexes events into the vector index */
export class EventIndexer {
  private readonly batchSize: number;
  private readonly flushInterval: number;
  private batch: IndexedDocument[] = [];
  private flushTimer: unknown = null;

  constructor(
    private readonly index: VectorIndex,
    config?: IndexerConfig,
  ) {
    this.batchSize = config?.batchSize ?? 50;
    this.flushInterval = config?.batchFlushIntervalMs ?? 1000;
  }

  /** Index a single event */
  async indexEvent(
    spaceId: string,
    roomId: string,
    eventId: string,
    eventType: string,
    content: Record<string, unknown>,
    senderId: string,
    timestamp: number,
  ): Promise<boolean> {
    const text = extractText(eventType, content);
    if (text === null) {
      return false;
    }

    const doc: IndexedDocument = {
      id: eventId,
      spaceId,
      roomId,
      eventId,
      text,
      eventType,
      timestamp,
      senderId,
    };

    this.batch.push(doc);

    if (this.batch.length >= this.batchSize) {
      await this.flush();
    } else {
      this.scheduleFlush();
    }

    return true;
  }

  /** Flush any pending batched documents */
  async flush(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.batch.length === 0) return;

    const docs = this.batch;
    this.batch = [];
    await this.index.indexBatch(docs);
  }

  /** Get number of indexed documents */
  async getDocumentCount(): Promise<number> {
    return this.index.count();
  }

  /** Remove all documents for a space */
  async removeSpace(spaceId: string): Promise<number> {
    // Search for all documents in the space, then remove them
    const results = await this.index.search({
      query: "",
      spaces: [spaceId],
      limit: 10_000,
      minScore: 0,
    });

    let removed = 0;
    for (const result of results) {
      const success = await this.index.remove(result.document.id);
      if (success) removed++;
    }
    return removed;
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      void this.flush();
    }, this.flushInterval);
  }
}
