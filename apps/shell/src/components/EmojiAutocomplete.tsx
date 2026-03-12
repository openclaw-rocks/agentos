import React, {
  useMemo,
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import { searchEmoji } from "~/lib/emoji-autocomplete";

const MAX_SUGGESTIONS = 6;

interface EmojiAutocompleteProps {
  query: string;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export const EmojiAutocomplete = forwardRef<HTMLDivElement, EmojiAutocompleteProps>(
  function EmojiAutocomplete(
    { query, onSelect, onClose },
    forwardedRef,
  ): React.ReactElement | null {
    const internalRef = useRef<HTMLDivElement>(null);
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Merge the forwarded ref with our internal ref
    useImperativeHandle(forwardedRef, () => internalRef.current as HTMLDivElement);

    const suggestions = useMemo(() => {
      return searchEmoji(query, MAX_SUGGESTIONS);
    }, [query]);

    // Reset selection when suggestions change
    useEffect(() => {
      setSelectedIndex(0);
    }, [suggestions]);

    // Close on outside click
    useEffect(() => {
      const handler = (e: MouseEvent): void => {
        if (internalRef.current && !internalRef.current.contains(e.target as Node)) {
          onClose();
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [onClose]);

    // Keyboard navigation handler -- called from parent via getEmojiKeyHandler
    const handleKeyDown = useCallback(
      (e: KeyboardEvent | React.KeyboardEvent): boolean => {
        if (suggestions.length === 0) return false;

        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % suggestions.length);
          return true;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
          return true;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const selected = suggestions[selectedIndex];
          if (selected) {
            onSelect(selected.emoji);
          }
          return true;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
          return true;
        }
        return false;
      },
      [suggestions, selectedIndex, onSelect, onClose],
    );

    // Expose keyboard handler on the DOM element so the parent can access it
    useEffect(() => {
      const panel = internalRef.current;
      if (!panel) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (panel as any).__emojiKeyDown = handleKeyDown;
      return () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (panel as any).__emojiKeyDown;
      };
    }, [handleKeyDown]);

    if (suggestions.length === 0) return null;

    return (
      <div
        ref={internalRef}
        data-testid="emoji-autocomplete"
        className="absolute bottom-full left-0 mb-2 w-72 max-h-64 overflow-y-auto bg-surface-2 border border-border rounded-lg shadow-lg z-50"
      >
        <div className="p-1">
          {suggestions.map((suggestion, idx) => (
            <button
              key={`${suggestion.emoji}-${suggestion.name}`}
              onClick={() => onSelect(suggestion.emoji)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`w-full text-left px-3 py-2 rounded-md transition-colors flex items-center gap-3 ${
                idx === selectedIndex ? "bg-surface-3" : "hover:bg-surface-3"
              }`}
            >
              {/* Emoji */}
              <span className="text-xl flex-shrink-0 w-7 text-center">{suggestion.emoji}</span>

              {/* Shortcode name */}
              <span className="text-sm text-secondary truncate">:{suggestion.shortcode}:</span>
            </button>
          ))}
        </div>
      </div>
    );
  },
);

/**
 * Returns the keyboard handler from an EmojiAutocomplete panel ref, if one is mounted.
 * Call this from the parent's onKeyDown to let the emoji popup intercept arrow/enter/escape/tab keys.
 */
export function getEmojiKeyHandler(
  panelRef: React.RefObject<HTMLDivElement | null>,
): ((e: React.KeyboardEvent) => boolean) | null {
  const panel = panelRef.current;
  if (!panel) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = (panel as any).__emojiKeyDown;
  return typeof handler === "function" ? handler : null;
}
