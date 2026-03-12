import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  EMOJI_CATEGORIES,
  EMOJI_DATA,
  getEmojiByCategory,
  loadRecentEmoji,
  saveRecentEmoji,
  searchEmoji,
  type EmojiCategory,
} from "~/lib/emoji-data";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string): string | null => store[key] ?? null),
    setItem: vi.fn((key: string, value: string): void => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string): void => {
      delete store[key];
    }),
    clear: vi.fn((): void => {
      store = {};
    }),
    get length(): number {
      return Object.keys(store).length;
    },
    key: vi.fn((_index: number): string | null => null),
  };
})();

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

describe("EmojiPicker", () => {
  describe("emoji data", () => {
    describe("given the full emoji dataset", () => {
      it("should have emoji organized by category", () => {
        const categoriesInData = new Set(EMOJI_DATA.map((e) => e.category));
        for (const category of EMOJI_CATEGORIES) {
          expect(categoriesInData.has(category)).toBe(true);
        }
      });

      it("should have at least 400 emoji", () => {
        expect(EMOJI_DATA.length).toBeGreaterThanOrEqual(400);
      });

      it("should have all 9 categories defined", () => {
        expect(EMOJI_CATEGORIES).toHaveLength(9);
        expect(EMOJI_CATEGORIES).toContain("Smileys");
        expect(EMOJI_CATEGORIES).toContain("People");
        expect(EMOJI_CATEGORIES).toContain("Animals");
        expect(EMOJI_CATEGORIES).toContain("Food");
        expect(EMOJI_CATEGORIES).toContain("Travel");
        expect(EMOJI_CATEGORIES).toContain("Activities");
        expect(EMOJI_CATEGORIES).toContain("Objects");
        expect(EMOJI_CATEGORIES).toContain("Symbols");
        expect(EMOJI_CATEGORIES).toContain("Flags");
      });

      it("should return emoji for each category via getEmojiByCategory", () => {
        for (const category of EMOJI_CATEGORIES) {
          const entries = getEmojiByCategory(category as EmojiCategory);
          expect(entries.length).toBeGreaterThan(0);
          for (const entry of entries) {
            expect(entry.category).toBe(category);
          }
        }
      });

      it("should have non-empty emoji and name for every entry", () => {
        for (const entry of EMOJI_DATA) {
          expect(entry.emoji.length).toBeGreaterThan(0);
          expect(entry.name.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe("search", () => {
    describe("given a search query that matches emoji names", () => {
      it("should filter emoji by name", () => {
        const results = searchEmoji("heart");
        expect(results.length).toBeGreaterThan(0);
        for (const entry of results) {
          expect(entry.name.toLowerCase()).toContain("heart");
        }
      });

      it("should be case insensitive", () => {
        const lower = searchEmoji("fire");
        const upper = searchEmoji("FIRE");
        const mixed = searchEmoji("FiRe");
        expect(lower.length).toBe(upper.length);
        expect(lower.length).toBe(mixed.length);
      });
    });

    describe("given a search query with no matches", () => {
      it("should return empty for no matches", () => {
        const results = searchEmoji("zzzzxyznonexistent");
        expect(results).toHaveLength(0);
      });
    });

    describe("given an empty search query", () => {
      it("should return all emoji", () => {
        const results = searchEmoji("");
        expect(results.length).toBe(EMOJI_DATA.length);
      });

      it("should return all emoji for whitespace-only query", () => {
        const results = searchEmoji("   ");
        expect(results.length).toBe(EMOJI_DATA.length);
      });
    });
  });

  describe("recent emoji", () => {
    beforeEach(() => {
      localStorageMock.clear();
    });

    describe("given no prior usage", () => {
      it("should return empty array when no recents stored", () => {
        const recents = loadRecentEmoji();
        expect(recents).toEqual([]);
      });
    });

    describe("given a selected emoji", () => {
      it("should store selected emoji in recents", () => {
        saveRecentEmoji("\u{1F600}");
        const recents = loadRecentEmoji();
        expect(recents).toContain("\u{1F600}");
      });

      it("should place most recently used emoji first", () => {
        saveRecentEmoji("\u{1F600}");
        saveRecentEmoji("\u{1F602}");
        const recents = loadRecentEmoji();
        expect(recents[0]).toBe("\u{1F602}");
        expect(recents[1]).toBe("\u{1F600}");
      });

      it("should not duplicate emoji in recents", () => {
        saveRecentEmoji("\u{1F600}");
        saveRecentEmoji("\u{1F602}");
        saveRecentEmoji("\u{1F600}");
        const recents = loadRecentEmoji();
        const occurrences = recents.filter((e) => e === "\u{1F600}");
        expect(occurrences).toHaveLength(1);
        expect(recents[0]).toBe("\u{1F600}");
      });
    });

    describe("given more than 24 emoji selected", () => {
      it("should limit recents to 24", () => {
        const emojiList = EMOJI_DATA.slice(0, 30);
        for (const entry of emojiList) {
          saveRecentEmoji(entry.emoji);
        }
        const recents = loadRecentEmoji();
        expect(recents).toHaveLength(24);
      });
    });

    describe("given corrupted localStorage data", () => {
      it("should return empty array for invalid JSON", () => {
        localStorageMock.setItem("openclaw:recent-emoji", "not-valid-json");
        const recents = loadRecentEmoji();
        expect(recents).toEqual([]);
      });

      it("should return empty array for non-array JSON", () => {
        localStorageMock.setItem("openclaw:recent-emoji", '{"key":"value"}');
        const recents = loadRecentEmoji();
        expect(recents).toEqual([]);
      });
    });
  });
});
