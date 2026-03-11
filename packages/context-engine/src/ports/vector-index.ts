export interface EmbeddingVector {
  dimensions: number;
  values: Float32Array | number[];
}

export interface IndexedDocument {
  id: string;
  spaceId: string;
  roomId: string;
  eventId: string;
  text: string;
  embedding?: EmbeddingVector;
  eventType: string;
  timestamp: number;
  senderId: string;
  metadata?: Record<string, unknown>;
}

export interface SearchQuery {
  query: string;
  embedding?: EmbeddingVector;
  spaces?: string[];
  eventTypes?: string[];
  timeRange?: { start: number; end: number };
  limit?: number; // default 10
  minScore?: number; // default 0.0
}

export interface SearchResult {
  document: IndexedDocument;
  score: number; // 0-1 relevance
}

/** Port: vector index for semantic search */
export interface VectorIndex {
  index(doc: IndexedDocument): Promise<void>;
  indexBatch(docs: IndexedDocument[]): Promise<number>;
  search(query: SearchQuery): Promise<SearchResult[]>;
  remove(documentId: string): Promise<boolean>;
  count(): Promise<number>;
  clear(): Promise<void>;
}
