import React, { useState, useEffect, useCallback, useRef } from "react";

export interface GifPickerProps {
  onSelectGif: (gifUrl: string, previewUrl: string, width: number, height: number) => void;
  onClose: () => void;
}

interface TenorGif {
  id: string;
  title: string;
  media_formats: {
    gif?: { url: string; dims: [number, number] };
    tinygif?: { url: string; dims: [number, number] };
    nanogif?: { url: string; dims: [number, number] };
  };
}

const TENOR_API_KEY_STORAGE = "openclaw:tenor_api_key";

function loadTenorApiKey(): string {
  try {
    return localStorage.getItem(TENOR_API_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

/**
 * GIF search picker using the Tenor API v2.
 *
 * Shows a search input and a grid of GIF thumbnails. If no Tenor API key is
 * configured, displays a placeholder message instead.
 */
export function GifPicker({ onSelectGif, onClose }: GifPickerProps): React.ReactElement {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TenorGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apiKey = useRef(loadTenorApiKey());
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasApiKey = apiKey.current.length > 0;

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Auto-focus search input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const searchGifs = useCallback(
    async (searchQuery: string) => {
      if (!hasApiKey || !searchQuery.trim()) {
        setResults([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(searchQuery)}&key=${apiKey.current}&limit=20&media_filter=gif,tinygif,nanogif`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Tenor API error: ${response.status}`);
        }

        const data = (await response.json()) as { results?: TenorGif[] };
        setResults(data.results ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to search GIFs");
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [hasApiKey],
  );

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchGifs(query);
    }, 400);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, searchGifs]);

  const handleSelectGif = useCallback(
    (gif: TenorGif) => {
      const fullGif = gif.media_formats.gif;
      const preview = gif.media_formats.tinygif ?? gif.media_formats.nanogif ?? fullGif;

      if (!fullGif) return;

      onSelectGif(fullGif.url, preview?.url ?? fullGif.url, fullGif.dims[0], fullGif.dims[1]);
    },
    [onSelectGif],
  );

  return (
    <div className="bg-surface-2 border border-border rounded-xl shadow-xl w-80 max-h-96 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-secondary">GIF Search</span>
        <button
          onClick={onClose}
          className="p-0.5 text-muted hover:text-secondary transition-colors"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Search input */}
      <div className="px-3 py-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for GIFs..."
          className="w-full bg-surface-3 border border-border rounded-lg px-3 py-1.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-accent/50"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {!hasApiKey && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <svg
              className="w-8 h-8 text-faint mb-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <p className="text-xs text-muted px-4">
              GIF search requires a Tenor API key. Configure in settings.
            </p>
          </div>
        )}

        {hasApiKey && !query.trim() && results.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <svg
              className="w-8 h-8 text-faint mb-2"
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
            <p className="text-xs text-muted">Type to search for GIFs</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="py-4 text-center">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5">
            {results.map((gif) => {
              const preview =
                gif.media_formats.nanogif ?? gif.media_formats.tinygif ?? gif.media_formats.gif;
              if (!preview) return null;

              return (
                <button
                  key={gif.id}
                  onClick={() => handleSelectGif(gif)}
                  className="rounded-lg overflow-hidden border border-border hover:border-accent/50 transition-colors cursor-pointer"
                  title={gif.title || "GIF"}
                >
                  <img
                    src={preview.url}
                    alt={gif.title || "GIF"}
                    className="w-full h-24 object-cover"
                    loading="lazy"
                  />
                </button>
              );
            })}
          </div>
        )}

        {hasApiKey && !loading && query.trim() && results.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-xs text-muted">No GIFs found for "{query}"</p>
          </div>
        )}
      </div>

      {/* Tenor attribution */}
      {hasApiKey && (
        <div className="px-3 py-1.5 border-t border-border text-center">
          <span className="text-[10px] text-faint">Powered by Tenor</span>
        </div>
      )}
    </div>
  );
}
