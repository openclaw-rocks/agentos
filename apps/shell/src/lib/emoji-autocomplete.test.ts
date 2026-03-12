import { describe, it, expect } from "vitest";
import { parseEmojiQuery, insertEmoji, searchEmoji } from "./emoji-autocomplete";

describe("emoji-autocomplete", () => {
  describe("parseEmojiQuery", () => {
    describe("given :smi at cursor", () => {
      it("should return query 'smi'", () => {
        const result = parseEmojiQuery("hello :smi", 10);
        expect(result).toEqual({ query: "smi", start: 6, end: 10 });
      });
    });

    describe("given : at position 0 with 2+ chars", () => {
      it("should return the query from position 0", () => {
        const result = parseEmojiQuery(":smile", 6);
        expect(result).toEqual({ query: "smile", start: 0, end: 6 });
      });
    });

    describe("given : with only 1 char after it", () => {
      it("should return null (need 2+ chars)", () => {
        const result = parseEmojiQuery("hello :s", 8);
        expect(result).toBeNull();
      });
    });

    describe("given : with no chars after it", () => {
      it("should return null", () => {
        const result = parseEmojiQuery("hello :", 7);
        expect(result).toBeNull();
      });
    });

    describe("given text with no :", () => {
      it("should return null", () => {
        const result = parseEmojiQuery("hello world", 5);
        expect(result).toBeNull();
      });
    });

    describe("given : not preceded by whitespace", () => {
      it("should return null for mid-word colons", () => {
        const result = parseEmojiQuery("time:smile", 10);
        expect(result).toBeNull();
      });
    });

    describe("given cursor inside a fenced code block", () => {
      it("should return null", () => {
        const result = parseEmojiQuery("```\n:smile\n```", 10);
        expect(result).toBeNull();
      });
    });

    describe("given cursor inside inline code", () => {
      it("should return null", () => {
        const result = parseEmojiQuery("use `:smile` here", 11);
        expect(result).toBeNull();
      });
    });

    describe("given cursor too short for minimum (cursorPos < 3)", () => {
      it("should return null", () => {
        const result = parseEmojiQuery(":ab", 2);
        expect(result).toBeNull();
      });
    });

    describe("given : preceded by a newline", () => {
      it("should detect the emoji query on the new line", () => {
        const result = parseEmojiQuery("first line\n:heart", 17);
        expect(result).toEqual({ query: "heart", start: 11, end: 17 });
      });
    });

    describe("given text with additional text after the emoji query", () => {
      it("should extend end to the word boundary", () => {
        const result = parseEmojiQuery("hello :smile world", 9);
        // cursor at position 9 = "hello :sm|ile world", query = "sm", end extends to 12
        expect(result).toEqual({ query: "sm", start: 6, end: 12 });
      });
    });

    describe("given cursor beyond text length", () => {
      it("should return null", () => {
        const result = parseEmojiQuery(":smile", 20);
        expect(result).toBeNull();
      });
    });
  });

  describe("insertEmoji", () => {
    describe("given an emoji insertion replacing a shortcode query", () => {
      it("should replace the :query with the emoji character", () => {
        const text = "hello :smi world";
        const result = insertEmoji(text, 6, 10, "\u{1F604}");
        expect(result).toBe("hello \u{1F604} world");
      });
    });

    describe("given an emoji insertion at the start of text", () => {
      it("should replace correctly from position 0", () => {
        const text = ":smile something";
        const result = insertEmoji(text, 0, 6, "\u{1F604}");
        expect(result).toBe("\u{1F604} something");
      });
    });

    describe("given an emoji insertion at the end of text with no trailing space", () => {
      it("should add a trailing space after the emoji", () => {
        const text = "hey :smi";
        const result = insertEmoji(text, 4, 8, "\u{1F604}");
        expect(result).toBe("hey \u{1F604} ");
      });
    });

    describe("given an emoji insertion with existing trailing space", () => {
      it("should not double the space", () => {
        const text = "hey :smi rest";
        const result = insertEmoji(text, 4, 8, "\u{1F604}");
        expect(result).toBe("hey \u{1F604} rest");
      });
    });
  });

  describe("searchEmoji", () => {
    describe("given search 'smiling'", () => {
      it("should return matching emoji containing 'smiling' in name", () => {
        const results = searchEmoji("smiling");
        expect(results.length).toBeGreaterThan(0);
        expect(results.every((r) => r.name.toLowerCase().includes("smiling"))).toBe(true);
      });
    });

    describe("given search 'smiling'", () => {
      it("should return matching emoji with shortcode field", () => {
        const results = searchEmoji("smiling");
        expect(results.length).toBeGreaterThan(0);
        // Every result should have emoji, shortcode, and name
        for (const r of results) {
          expect(r).toHaveProperty("emoji");
          expect(r).toHaveProperty("shortcode");
          expect(r).toHaveProperty("name");
          // shortcode should be the name with spaces replaced by underscores
          expect(r.shortcode).toBe(r.name.replace(/\s+/g, "_"));
        }
      });
    });

    describe("given search 'grinning'", () => {
      it("should return grinning face emoji", () => {
        const results = searchEmoji("grinning");
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].name.toLowerCase()).toContain("grinning");
      });
    });

    describe("given a limit of 3", () => {
      it("should return at most 3 results", () => {
        const results = searchEmoji("face", 3);
        expect(results.length).toBeLessThanOrEqual(3);
      });
    });

    describe("given an empty query", () => {
      it("should return empty array", () => {
        const results = searchEmoji("");
        expect(results).toEqual([]);
      });
    });

    describe("given a query that matches nothing", () => {
      it("should return empty array", () => {
        const results = searchEmoji("zzzznotanemoji");
        expect(results).toEqual([]);
      });
    });

    describe("given a multi-word query", () => {
      it("should match emoji where all words appear in the name", () => {
        const results = searchEmoji("smiling eyes");
        expect(results.length).toBeGreaterThan(0);
        expect(
          results.every(
            (r) =>
              r.name.toLowerCase().includes("smiling") && r.name.toLowerCase().includes("eyes"),
          ),
        ).toBe(true);
      });
    });

    describe("given underscores in query (shortcode style)", () => {
      it("should treat them as spaces for matching", () => {
        const results = searchEmoji("smiling_eyes");
        expect(results.length).toBeGreaterThan(0);
        expect(
          results.every(
            (r) =>
              r.name.toLowerCase().includes("smiling") && r.name.toLowerCase().includes("eyes"),
          ),
        ).toBe(true);
      });
    });
  });
});
