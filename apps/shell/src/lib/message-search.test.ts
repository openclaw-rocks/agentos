import type { ISearchResults } from "matrix-js-sdk/lib/@types/search";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  highlightMatches,
  truncatePreview,
  formatTimestamp,
  formatSearchResults,
  debounce,
} from "./message-search";

describe("MessageSearch", () => {
  describe("highlightMatches", () => {
    describe("given a text and a matching term", () => {
      it("should find and mark matching segments", () => {
        // Given
        const text = "Hello world";
        const term = "world";

        // When
        const segments = highlightMatches(text, term);

        // Then
        expect(segments).toEqual([
          { text: "Hello ", isMatch: false },
          { text: "world", isMatch: true },
        ]);
      });
    });

    describe("given a term with different casing", () => {
      it("should be case-insensitive", () => {
        // Given
        const text = "Hello World";
        const term = "hello";

        // When
        const segments = highlightMatches(text, term);

        // Then
        expect(segments).toEqual([
          { text: "Hello", isMatch: true },
          { text: " World", isMatch: false },
        ]);
      });
    });

    describe("given a term that appears multiple times", () => {
      it("should handle multiple matches", () => {
        // Given
        const text = "foo bar foo baz foo";
        const term = "foo";

        // When
        const segments = highlightMatches(text, term);

        // Then
        expect(segments).toEqual([
          { text: "foo", isMatch: true },
          { text: " bar ", isMatch: false },
          { text: "foo", isMatch: true },
          { text: " baz ", isMatch: false },
          { text: "foo", isMatch: true },
        ]);
      });
    });

    describe("given a term that does not match", () => {
      it("should return original text when no match", () => {
        // Given
        const text = "Hello world";
        const term = "xyz";

        // When
        const segments = highlightMatches(text, term);

        // Then
        expect(segments).toEqual([{ text: "Hello world", isMatch: false }]);
      });
    });

    describe("given an empty search term", () => {
      it("should return the full text as a single non-matching segment", () => {
        // Given
        const text = "Hello world";
        const term = "";

        // When
        const segments = highlightMatches(text, term);

        // Then
        expect(segments).toEqual([{ text: "Hello world", isMatch: false }]);
      });
    });

    describe("given adjacent matches", () => {
      it("should produce consecutive match segments", () => {
        // Given
        const text = "aaaa";
        const term = "aa";

        // When
        const segments = highlightMatches(text, term);

        // Then
        expect(segments).toEqual([
          { text: "aa", isMatch: true },
          { text: "aa", isMatch: true },
        ]);
      });
    });
  });

  describe("search result formatting", () => {
    describe("given a long message body", () => {
      it("should truncate long message previews", () => {
        // Given
        const longText = "A".repeat(250);

        // When
        const preview = truncatePreview(longText);

        // Then
        expect(preview.length).toBe(201); // 200 chars + ellipsis
        expect(preview.endsWith("\u2026")).toBe(true);
      });
    });

    describe("given a short message body", () => {
      it("should not truncate short messages", () => {
        // Given
        const shortText = "Hello world";

        // When
        const preview = truncatePreview(shortText);

        // Then
        expect(preview).toBe("Hello world");
      });
    });

    describe("given search results from the Matrix API", () => {
      it("should show sender and timestamp", () => {
        // Given
        const mockEvent = {
          getRoomId: () => "!room1:example.com",
          getSender: () => "@alice:example.com",
          getId: () => "$event1",
          getContent: () => ({ body: "Hello world" }),
          getTs: () => 1710000000000,
        };

        const mockMember = { name: "Alice" };
        const mockRoom = {
          name: "General",
          getMember: (userId: string) => (userId === "@alice:example.com" ? mockMember : null),
        };

        const mockClient = {
          getRoom: (id: string) => (id === "!room1:example.com" ? mockRoom : null),
        };

        const mockSearchResults: ISearchResults = {
          results: [
            {
              rank: 1,
              context: {
                ourEvent: mockEvent,
              },
            },
          ],
          highlights: ["world"],
          count: 1,
        } as any;

        // When

        const formatted = formatSearchResults(mockSearchResults, mockClient as any);

        // Then
        expect(formatted).toHaveLength(1);
        expect(formatted[0].senderName).toBe("Alice");
        expect(formatted[0].sender).toBe("@alice:example.com");
        expect(formatted[0].timestamp).toBe(1710000000000);
        expect(formatted[0].body).toBe("Hello world");
        expect(formatted[0].roomName).toBe("General");
        expect(formatted[0].eventId).toBe("$event1");
        expect(formatted[0].roomId).toBe("!room1:example.com");
      });
    });

    describe("given a result with no room membership info", () => {
      it("should fall back to a display name derived from the user ID", () => {
        // Given
        const mockEvent = {
          getRoomId: () => "!unknown:example.com",
          getSender: () => "@bob:example.com",
          getId: () => "$event2",
          getContent: () => ({ body: "test" }),
          getTs: () => 1710000000000,
        };

        const mockClient = {
          getRoom: () => null,
        };

        const mockSearchResults: ISearchResults = {
          results: [
            {
              rank: 1,
              context: { ourEvent: mockEvent },
            },
          ],
          highlights: [],
          count: 1,
        } as any;

        // When

        const formatted = formatSearchResults(mockSearchResults, mockClient as any);

        // Then
        expect(formatted[0].senderName).toBe("bob");
      });
    });
  });

  describe("formatTimestamp", () => {
    describe("given a timestamp from today", () => {
      it("should return only the time", () => {
        // Given
        const now = new Date();
        now.setHours(14, 30, 0, 0);
        const ts = now.getTime();

        // When
        const result = formatTimestamp(ts);

        // Then — should contain the time but not a date
        expect(result).toMatch(/\d{1,2}:\d{2}/);
        // Should not contain a month abbreviation
        expect(result.length).toBeLessThan(15);
      });
    });

    describe("given a timestamp from another day", () => {
      it("should include the date and time", () => {
        // Given — a date clearly in the past
        const oldDate = new Date(2024, 0, 15, 10, 30, 0);
        const ts = oldDate.getTime();

        // When
        const result = formatTimestamp(ts);

        // Then — should contain a month and time
        expect(result).toMatch(/Jan/);
        expect(result).toMatch(/\d{1,2}:\d{2}/);
      });
    });
  });

  describe("debounce", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    describe("given rapid successive calls", () => {
      it("should only invoke the function once after the delay", () => {
        // Given
        const fn = vi.fn();
        const debounced = debounce(fn, 500);

        // When
        debounced("a");
        debounced("b");
        debounced("c");

        // Then — not yet called
        expect(fn).not.toHaveBeenCalled();

        // When — advance past the delay
        vi.advanceTimersByTime(500);

        // Then — called once with the last arguments
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith("c");
      });
    });

    describe("given calls spaced apart", () => {
      it("should invoke the function for each call that has elapsed", () => {
        // Given
        const fn = vi.fn();
        const debounced = debounce(fn, 300);

        // When — first call
        debounced("first");
        vi.advanceTimersByTime(300);

        // Then
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith("first");

        // When — second call after first has fired
        debounced("second");
        vi.advanceTimersByTime(300);

        // Then
        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenCalledWith("second");
      });
    });
  });
});
