import { describe, it, expect } from "vitest";
import {
  parseMentionQuery,
  insertMention,
  formatMentionsForMatrix,
  parseMentions,
} from "./mention-utils";

describe("mention-utils", () => {
  describe("parseMentionQuery", () => {
    describe("given text with @ali at cursor", () => {
      it("should return query 'ali'", () => {
        const result = parseMentionQuery("hello @ali", 10);
        expect(result).toEqual({ query: "ali", start: 6, end: 10 });
      });
    });

    describe("given text with @ at the very start", () => {
      it("should return query from position 0", () => {
        const result = parseMentionQuery("@bob", 4);
        expect(result).toEqual({ query: "bob", start: 0, end: 4 });
      });
    });

    describe("given text with just @", () => {
      it("should return empty query string", () => {
        const result = parseMentionQuery("hello @", 7);
        expect(result).toEqual({ query: "", start: 6, end: 7 });
      });
    });

    describe("given text with no @", () => {
      it("should return null", () => {
        const result = parseMentionQuery("hello world", 5);
        expect(result).toBeNull();
      });
    });

    describe("given cursor is before the @", () => {
      it("should return null", () => {
        const result = parseMentionQuery("hello @ali", 3);
        expect(result).toBeNull();
      });
    });

    describe("given @ is not preceded by whitespace", () => {
      it("should return null for email-like patterns", () => {
        const result = parseMentionQuery("user@example.com", 16);
        expect(result).toBeNull();
      });
    });

    describe("given multiple @ signs in text", () => {
      describe("when cursor is on the second mention", () => {
        it("should return query for the second mention", () => {
          const result = parseMentionQuery("hey @alice and @bo", 18);
          expect(result).toEqual({ query: "bo", start: 15, end: 18 });
        });
      });
    });

    describe("given @ in the middle of text with cursor right after @", () => {
      it("should return empty query", () => {
        const result = parseMentionQuery("talk to @", 9);
        expect(result).toEqual({ query: "", start: 8, end: 9 });
      });
    });

    describe("given cursor position at 0", () => {
      it("should return null", () => {
        const result = parseMentionQuery("@alice", 0);
        expect(result).toBeNull();
      });
    });

    describe("given cursor beyond text length", () => {
      it("should return null", () => {
        const result = parseMentionQuery("@alice", 20);
        expect(result).toBeNull();
      });
    });

    describe("given text with @ followed by additional text after cursor", () => {
      it("should extend end to the word boundary", () => {
        const result = parseMentionQuery("hello @alice world", 9);
        // cursor at position 9 = "hello @al|ice world", query = "al", end extends to 12
        expect(result).toEqual({ query: "al", start: 6, end: 12 });
      });
    });

    describe("given @ at start preceded by newline", () => {
      it("should detect the mention on the new line", () => {
        const result = parseMentionQuery("first line\n@char", 16);
        expect(result).toEqual({ query: "char", start: 11, end: 16 });
      });
    });
  });

  describe("insertMention", () => {
    describe("given a mention insertion at a known position", () => {
      it("should replace the @query with the mention placeholder", () => {
        const text = "hello @ali world";
        const result = insertMention(text, 6, 10, "@alice:matrix.org", "Alice");
        expect(result).toBe("hello [mention:@alice:matrix.org:Alice] world");
      });
    });

    describe("given a mention at the start of text", () => {
      it("should replace correctly from position 0", () => {
        const text = "@bo something";
        const result = insertMention(text, 0, 3, "@bob:server.com", "Bob");
        expect(result).toBe("[mention:@bob:server.com:Bob] something");
      });
    });

    describe("given a mention at the end of text with no trailing space", () => {
      it("should add a trailing space after the mention", () => {
        const text = "hey @ali";
        const result = insertMention(text, 4, 8, "@alice:matrix.org", "Alice");
        expect(result).toBe("hey [mention:@alice:matrix.org:Alice] ");
      });
    });

    describe("given a mention with existing trailing space", () => {
      it("should not double the space", () => {
        const text = "hey @ali rest";
        const result = insertMention(text, 4, 8, "@alice:matrix.org", "Alice");
        expect(result).toBe("hey [mention:@alice:matrix.org:Alice] rest");
      });
    });
  });

  describe("parseMentions", () => {
    describe("given text with no mentions", () => {
      it("should return empty array", () => {
        expect(parseMentions("hello world")).toEqual([]);
      });
    });

    describe("given text with one mention placeholder", () => {
      it("should parse userId and displayName", () => {
        const result = parseMentions("hey [mention:@alice:matrix.org:Alice] how are you");
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          userId: "@alice:matrix.org",
          displayName: "Alice",
          start: 4,
          end: 37,
        });
      });
    });

    describe("given text with multiple mention placeholders", () => {
      it("should parse all mentions in order", () => {
        const text = "[mention:@alice:matrix.org:Alice] and [mention:@bob:server.com:Bob]";
        const result = parseMentions(text);
        expect(result).toHaveLength(2);
        expect(result[0].userId).toBe("@alice:matrix.org");
        expect(result[1].userId).toBe("@bob:server.com");
      });
    });
  });

  describe("formatMentionsForMatrix", () => {
    describe("given text with no mentions", () => {
      it("should return body and formatted_body unchanged", () => {
        const result = formatMentionsForMatrix("hello world");
        expect(result).toEqual({
          body: "hello world",
          formatted_body: "hello world",
        });
      });
    });

    describe("given text with a single mention", () => {
      it("should produce correct Matrix HTML pill in formatted_body", () => {
        const text = "hey [mention:@alice:matrix.org:Alice] how are you";
        const result = formatMentionsForMatrix(text);
        expect(result.body).toBe("hey Alice how are you");
        expect(result.formatted_body).toBe(
          'hey <a href="https://matrix.to/#/@alice:matrix.org">Alice</a> how are you',
        );
      });
    });

    describe("given text with multiple mentions", () => {
      it("should produce pills for all mentions", () => {
        const text = "[mention:@alice:matrix.org:Alice] and [mention:@bob:server.com:Bob] chatting";
        const result = formatMentionsForMatrix(text);
        expect(result.body).toBe("Alice and Bob chatting");
        expect(result.formatted_body).toBe(
          '<a href="https://matrix.to/#/@alice:matrix.org">Alice</a> and <a href="https://matrix.to/#/@bob:server.com">Bob</a> chatting',
        );
      });
    });

    describe("given text containing HTML special characters", () => {
      it("should escape them in formatted_body", () => {
        const text = "is 1 < 2 & true? [mention:@alice:matrix.org:Alice]";
        const result = formatMentionsForMatrix(text);
        expect(result.body).toBe("is 1 < 2 & true? Alice");
        expect(result.formatted_body).toBe(
          'is 1 &lt; 2 &amp; true? <a href="https://matrix.to/#/@alice:matrix.org">Alice</a>',
        );
      });
    });

    describe("given a display name with special characters", () => {
      it("should escape the display name in the HTML pill", () => {
        const text = "[mention:@user:server.com:O'Brien <admin>]";
        const result = formatMentionsForMatrix(text);
        expect(result.body).toBe("O'Brien <admin>");
        expect(result.formatted_body).toBe(
          '<a href="https://matrix.to/#/@user:server.com">O\'Brien &lt;admin&gt;</a>',
        );
      });
    });
  });
});
