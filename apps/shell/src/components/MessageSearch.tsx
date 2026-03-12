import type { ISearchResults } from "matrix-js-sdk/lib/@types/search";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMatrix } from "~/lib/matrix-context";
import {
  debounce,
  formatSearchResults,
  formatTimestamp,
  highlightMatches,
  searchMessages,
  searchMessagesNextPage,
  truncatePreview,
  type FormattedSearchResult,
} from "~/lib/message-search";

interface MessageSearchProps {
  roomId?: string;
  onClose: () => void;
  onNavigateToMessage?: (roomId: string, eventId: string) => void;
}

function HighlightedText({ text, term }: { text: string; term: string }): React.ReactElement {
  const segments = highlightMatches(text, term);
  return (
    <>
      {segments.map((seg, i) =>
        seg.isMatch ? (
          <mark key={i} className="bg-accent/30 text-inverse rounded-sm px-0.5">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

function SearchResultItem({
  result,
  term,
  showRoomName,
  onClick,
}: {
  result: FormattedSearchResult;
  term: string;
  showRoomName: boolean;
  onClick: () => void;
}): React.ReactElement {
  const preview = truncatePreview(result.body);

  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-surface-2 transition-colors border-b border-border/50 last:border-b-0"
    >
      {/* Avatar */}
      <div className="w-8 h-8 rounded-lg bg-surface-3 text-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-xs font-medium">{result.senderName.charAt(0).toUpperCase()}</span>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-sm font-medium text-primary truncate">{result.senderName}</span>
          {showRoomName && (
            <span className="text-[10px] text-muted truncate flex-shrink-0">
              in {result.roomName}
            </span>
          )}
          <span className="text-xs text-faint flex-shrink-0 ml-auto">
            {formatTimestamp(result.timestamp)}
          </span>
        </div>
        <p className="text-sm text-secondary line-clamp-2">
          <HighlightedText text={preview} term={term} />
        </p>
      </div>
    </button>
  );
}

export function MessageSearch({
  roomId,
  onClose,
  onNavigateToMessage,
}: MessageSearchProps): React.ReactElement {
  const { client } = useMatrix();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FormattedSearchResult[]>([]);
  const [searchResults, setSearchResults] = useState<ISearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [searchedTerm, setSearchedTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const scopeLabel = useMemo(() => {
    if (!roomId) return "all rooms";
    const room = client.getRoom(roomId);
    return room?.name ?? roomId;
  }, [client, roomId]);

  const executeSearch = useCallback(
    async (term: string) => {
      if (!term.trim()) {
        setResults([]);
        setSearchResults(null);
        setHasMore(false);
        setSearchedTerm("");
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const sr = await searchMessages(client, term, roomId);
        const formatted = formatSearchResults(sr, client);
        setResults(formatted);
        setSearchResults(sr);
        setSearchedTerm(term);
        setHasMore(sr.next_batch !== undefined);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Search failed";
        setError(message);
        setResults([]);
        setSearchResults(null);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [client, roomId],
  );

  const debouncedSearch = useMemo(
    () =>
      debounce((term: string) => {
        executeSearch(term);
      }, 500),
    [executeSearch],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      debouncedSearch(value);
    },
    [debouncedSearch],
  );

  const handleLoadMore = useCallback(async () => {
    if (!searchResults || loadingMore) return;

    setLoadingMore(true);
    try {
      const sr = await searchMessagesNextPage(client, searchResults);
      const formatted = formatSearchResults(sr, client);
      setResults((prev) => [...prev, ...formatted]);
      setSearchResults(sr);
      setHasMore(sr.next_batch !== undefined);
    } catch {
      // Silently handle pagination errors
    } finally {
      setLoadingMore(false);
    }
  }, [client, searchResults, loadingMore]);

  const handleResultClick = useCallback(
    (result: FormattedSearchResult) => {
      onNavigateToMessage?.(result.roomId, result.eventId);
      onClose();
    },
    [onNavigateToMessage, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  // Group results by room for global search
  const isGlobalSearch = !roomId;
  const groupedResults = useMemo(() => {
    if (!isGlobalSearch) return null;

    const groups = new Map<string, FormattedSearchResult[]>();
    for (const result of results) {
      const existing = groups.get(result.roomId);
      if (existing) {
        existing.push(result);
      } else {
        groups.set(result.roomId, [result]);
      }
    }
    return groups;
  }, [results, isGlobalSearch]);

  const hasResults = results.length > 0;
  const hasSearched = searchedTerm.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: "70vh" }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header / Search input */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-muted flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={`Search messages in ${scopeLabel}...`}
              className="w-full bg-transparent text-sm text-primary placeholder-muted focus:outline-none"
            />
            {loading && (
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
          </div>
          {roomId && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="text-[10px] px-1.5 py-0.5 bg-surface-3 text-secondary rounded font-medium">
                # {scopeLabel}
              </span>
              <span className="text-[10px] text-faint">Room search</span>
            </div>
          )}
        </div>

        {/* Results */}
        <div ref={resultsRef} className="flex-1 overflow-y-auto">
          {/* Error state */}
          {error && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-status-error">{error}</p>
            </div>
          )}

          {/* Empty state: no query yet */}
          {!hasSearched && !loading && !error && (
            <div className="px-4 py-10 text-center">
              <svg
                className="w-8 h-8 text-faint mx-auto mb-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
              <p className="text-sm text-muted">Type to search messages</p>
            </div>
          )}

          {/* No results */}
          {hasSearched && !hasResults && !loading && !error && (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-muted">No results for &ldquo;{searchedTerm}&rdquo;</p>
            </div>
          )}

          {/* Results count */}
          {hasSearched && hasResults && (
            <div className="px-4 pt-2 pb-1">
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                {searchResults?.count !== undefined
                  ? `${searchResults.count} result${searchResults.count === 1 ? "" : "s"}`
                  : `${results.length} result${results.length === 1 ? "" : "s"}`}
              </p>
            </div>
          )}

          {/* Per-room search results (flat list) */}
          {hasResults && !isGlobalSearch && (
            <div>
              {results.map((result) => (
                <SearchResultItem
                  key={result.eventId}
                  result={result}
                  term={searchedTerm}
                  showRoomName={false}
                  onClick={() => handleResultClick(result)}
                />
              ))}
            </div>
          )}

          {/* Global search results (grouped by room) */}
          {hasResults && isGlobalSearch && groupedResults && (
            <div>
              {Array.from(groupedResults.entries()).map(([groupRoomId, groupResults]) => (
                <div key={groupRoomId}>
                  <div className="px-4 pt-3 pb-1">
                    <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                      # {groupResults[0].roomName}
                    </p>
                  </div>
                  {groupResults.map((result) => (
                    <SearchResultItem
                      key={result.eventId}
                      result={result}
                      term={searchedTerm}
                      showRoomName={false}
                      onClick={() => handleResultClick(result)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Load more button */}
          {hasMore && (
            <div className="px-4 py-3 text-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-4 py-1.5 text-xs text-accent hover:text-accent-hover bg-surface-2 hover:bg-surface-3 rounded-lg transition-colors disabled:opacity-50"
              >
                {loadingMore ? "Loading..." : "Load more results"}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex gap-3 text-[10px] text-faint">
          <span>
            <kbd className="px-1 py-0.5 bg-surface-3 rounded text-muted">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
