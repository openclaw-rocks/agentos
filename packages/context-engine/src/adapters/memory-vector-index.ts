import type {
  IndexedDocument,
  SearchQuery,
  SearchResult,
  VectorIndex,
} from "../ports/vector-index.js";

/**
 * In-memory implementation of VectorIndex for MVP/testing.
 * Uses keyword overlap (TF-IDF-like scoring) instead of real embeddings.
 */
export class MemoryVectorIndex implements VectorIndex {
  private documents = new Map<string, IndexedDocument>();

  async index(doc: IndexedDocument): Promise<void> {
    this.documents.set(doc.id, doc);
  }

  async indexBatch(docs: IndexedDocument[]): Promise<number> {
    let count = 0;
    for (const doc of docs) {
      this.documents.set(doc.id, doc);
      count++;
    }
    return count;
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const limit = query.limit ?? 10;
    const minScore = query.minScore ?? 0.0;

    const results: SearchResult[] = [];

    for (const doc of this.documents.values()) {
      // Apply filters
      if (query.spaces && query.spaces.length > 0) {
        if (!query.spaces.includes(doc.spaceId)) continue;
      }

      if (query.eventTypes && query.eventTypes.length > 0) {
        if (!query.eventTypes.includes(doc.eventType)) continue;
      }

      if (query.timeRange) {
        if (doc.timestamp < query.timeRange.start || doc.timestamp > query.timeRange.end) {
          continue;
        }
      }

      // Compute TF-IDF-like keyword overlap score
      const score = computeKeywordScore(query.query, doc.text);

      if (score >= minScore) {
        results.push({ document: doc, score });
      }
    }

    // Sort by score descending, then by timestamp descending for ties
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.document.timestamp - a.document.timestamp;
    });

    return results.slice(0, limit);
  }

  async remove(documentId: string): Promise<boolean> {
    return this.documents.delete(documentId);
  }

  async count(): Promise<number> {
    return this.documents.size;
  }

  async clear(): Promise<void> {
    this.documents.clear();
  }
}

/** Tokenize text into normalized words */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * Compute a keyword overlap score between 0 and 1.
 * Uses the ratio of shared unique words to total unique words (Jaccard-like).
 * If query is empty, returns a small positive score (for "match all" queries).
 */
function computeKeywordScore(query: string, docText: string): number {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    // Empty query matches everything with a base score
    return 0.1;
  }

  const docTokens = new Set(tokenize(docText));
  if (docTokens.size === 0) return 0;

  const querySet = new Set(queryTokens);

  let shared = 0;
  for (const token of querySet) {
    if (docTokens.has(token)) shared++;
  }

  // Normalize by the size of the query (recall-oriented)
  return shared / querySet.size;
}
