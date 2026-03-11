// Ports
export type {
  EmbeddingVector,
  IndexedDocument,
  SearchQuery,
  SearchResult,
  VectorIndex,
} from "./ports/vector-index.js";

export type {
  EntityType,
  EntityReference,
  Entity,
  EntityQuery,
  EntityStore,
} from "./ports/entity-store.js";

// Domain
export { extractText, EventIndexer } from "./domain/indexer.js";
export type { IndexerConfig } from "./domain/indexer.js";

export { ContextSearcher } from "./domain/searcher.js";
export type { ContextQuery, ContextResult } from "./domain/searcher.js";

export { EntityResolver } from "./domain/entity-resolver.js";

// Adapters
export { MemoryVectorIndex } from "./adapters/memory-vector-index.js";
export { MemoryEntityStore } from "./adapters/memory-entity-store.js";
