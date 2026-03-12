import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EMOJI_CATEGORIES,
  getEmojiByCategory,
  loadRecentEmoji,
  saveRecentEmoji,
  searchEmoji,
  type EmojiCategory,
  type EmojiEntry,
} from "~/lib/emoji-data";

export interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const CATEGORY_ICONS: Record<EmojiCategory, string> = {
  Smileys: "\u{1F600}",
  People: "\u{1F44B}",
  Animals: "\u{1F436}",
  Food: "\u{1F354}",
  Travel: "\u{1F30D}",
  Activities: "\u{1F3C6}",
  Objects: "\u{1F4BB}",
  Symbols: "\u2764\uFE0F",
  Flags: "\u{1F3C1}",
};

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<EmojiCategory>("Smileys");
  const [recentEmoji, setRecentEmoji] = useState<string[]>(() => loadRecentEmoji());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

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

  const handleSelect = useCallback(
    (emoji: string): void => {
      const updated = saveRecentEmoji(emoji);
      setRecentEmoji(updated);
      onSelect(emoji);
    },
    [onSelect],
  );

  const isSearching = searchQuery.trim().length > 0;

  const searchResults = useMemo((): readonly EmojiEntry[] => {
    if (!isSearching) return [];
    return searchEmoji(searchQuery);
  }, [searchQuery, isSearching]);

  const categoryEmoji = useMemo((): readonly EmojiEntry[] => {
    if (isSearching) return [];
    return getEmojiByCategory(activeCategory);
  }, [activeCategory, isSearching]);

  const handleCategoryClick = (category: EmojiCategory): void => {
    setActiveCategory(category);
    setSearchQuery("");
  };

  const renderGrid = (entries: readonly EmojiEntry[]): React.ReactElement => (
    <div className="grid grid-cols-8 gap-0.5">
      {entries.map((entry, idx) => (
        <button
          key={`${entry.emoji}-${idx}`}
          type="button"
          onClick={() => handleSelect(entry.emoji)}
          className="flex items-center justify-center w-9 h-9 text-xl hover:bg-surface-3 rounded transition-colors"
          title={entry.name}
        >
          {entry.emoji}
        </button>
      ))}
    </div>
  );

  const renderEmojiList = (emojis: string[]): React.ReactElement => (
    <div className="grid grid-cols-8 gap-0.5">
      {emojis.map((emoji, idx) => (
        <button
          key={`recent-${emoji}-${idx}`}
          type="button"
          onClick={() => handleSelect(emoji)}
          className="flex items-center justify-center w-9 h-9 text-xl hover:bg-surface-3 rounded transition-colors"
        >
          {emoji}
        </button>
      ))}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="w-full max-w-sm bg-surface-2 border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search */}
        <div className="px-3 pt-3 pb-2">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search emoji..."
            className="w-full px-3 py-1.5 bg-surface-3 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
          />
        </div>

        {/* Category tabs */}
        {!isSearching && (
          <div className="flex items-center gap-0.5 px-2 pb-1 overflow-x-auto">
            {EMOJI_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => handleCategoryClick(category)}
                className={`flex-shrink-0 flex items-center justify-center w-8 h-8 text-base rounded transition-colors ${
                  activeCategory === category
                    ? "bg-surface-3 border-b-2 border-accent"
                    : "hover:bg-surface-3 opacity-60 hover:opacity-100"
                }`}
                title={category}
              >
                {CATEGORY_ICONS[category]}
              </button>
            ))}
          </div>
        )}

        {/* Emoji grid area */}
        <div className="px-3 pb-3 max-h-64 overflow-y-auto">
          {/* Search results */}
          {isSearching && (
            <>
              {searchResults.length > 0 ? (
                <>
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">
                    Results
                  </p>
                  {renderGrid(searchResults)}
                </>
              ) : (
                <p className="py-6 text-sm text-muted text-center">No emoji found</p>
              )}
            </>
          )}

          {/* Category view */}
          {!isSearching && (
            <>
              {/* Recently used */}
              {recentEmoji.length > 0 && activeCategory === "Smileys" && (
                <div className="mb-3">
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">
                    Recently Used
                  </p>
                  {renderEmojiList(recentEmoji)}
                </div>
              )}

              <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">
                {activeCategory}
              </p>
              {renderGrid(categoryEmoji)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
