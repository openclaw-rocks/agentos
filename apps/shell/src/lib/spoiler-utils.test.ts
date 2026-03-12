import { describe, it, expect } from "vitest";
import { parseSpoilers, containsSpoiler, buildSpoilerContent } from "./spoiler-utils";

describe("SpoilerUtils", () => {
  describe("parseSpoilers", () => {
    describe("Given a formatted body with a single spoiler", () => {
      it("should extract the spoiler segment", () => {
        // Given
        const html = "Hello <span data-mx-spoiler>secret</span> world";

        // When
        const segments = parseSpoilers(html);

        // Then
        expect(segments).toEqual([
          { type: "text", content: "Hello " },
          { type: "spoiler", content: "secret", reason: undefined },
          { type: "text", content: " world" },
        ]);
      });
    });

    describe("Given a spoiler with a reason", () => {
      it("should include the reason in the segment", () => {
        // Given
        const html = '<span data-mx-spoiler="movie ending">the hero dies</span>';

        // When
        const segments = parseSpoilers(html);

        // Then
        expect(segments).toEqual([
          { type: "spoiler", content: "the hero dies", reason: "movie ending" },
        ]);
      });
    });

    describe("Given a formatted body with multiple spoilers", () => {
      it("should extract all spoiler segments in order", () => {
        // Given
        const html =
          'Start <span data-mx-spoiler="reason1">first</span> middle <span data-mx-spoiler>second</span> end';

        // When
        const segments = parseSpoilers(html);

        // Then
        expect(segments).toEqual([
          { type: "text", content: "Start " },
          { type: "spoiler", content: "first", reason: "reason1" },
          { type: "text", content: " middle " },
          { type: "spoiler", content: "second", reason: undefined },
          { type: "text", content: " end" },
        ]);
      });
    });

    describe("Given a formatted body with no spoilers", () => {
      it("should return a single text segment", () => {
        // Given
        const html = "Just a normal message with <b>bold</b> text";

        // When
        const segments = parseSpoilers(html);

        // Then
        expect(segments).toEqual([
          { type: "text", content: "Just a normal message with <b>bold</b> text" },
        ]);
      });
    });

    describe("Given an empty formatted body", () => {
      it("should return an empty array", () => {
        // Given / When
        const segments = parseSpoilers("");

        // Then
        expect(segments).toEqual([]);
      });
    });

    describe("Given a spoiler with an empty reason attribute", () => {
      it("should treat an empty reason as undefined", () => {
        // Given
        const html = '<span data-mx-spoiler="">hidden text</span>';

        // When
        const segments = parseSpoilers(html);

        // Then
        expect(segments).toEqual([{ type: "spoiler", content: "hidden text", reason: undefined }]);
      });
    });

    describe("Given a spoiler containing HTML entities", () => {
      it("should preserve the inner HTML content", () => {
        // Given
        const html = "<span data-mx-spoiler>text with <em>emphasis</em> inside</span>";

        // When
        const segments = parseSpoilers(html);

        // Then
        expect(segments).toEqual([
          { type: "spoiler", content: "text with <em>emphasis</em> inside", reason: undefined },
        ]);
      });
    });
  });

  describe("containsSpoiler", () => {
    describe("Given message content with a spoiler in formatted_body", () => {
      it("should return true", () => {
        // Given
        const content = {
          body: "[Spoiler] secret",
          format: "org.matrix.custom.html",
          formatted_body: "<span data-mx-spoiler>secret</span>",
          msgtype: "m.text",
        };

        // When
        const result = containsSpoiler(content);

        // Then
        expect(result).toBe(true);
      });
    });

    describe("Given message content with a spoiler with reason", () => {
      it("should return true", () => {
        // Given
        const content = {
          body: "[Spoiler] (plot twist) it was a dream",
          format: "org.matrix.custom.html",
          formatted_body: '<span data-mx-spoiler="plot twist">it was a dream</span>',
          msgtype: "m.text",
        };

        // When
        const result = containsSpoiler(content);

        // Then
        expect(result).toBe(true);
      });
    });

    describe("Given message content without spoilers", () => {
      it("should return false for plain HTML", () => {
        // Given
        const content = {
          body: "Hello world",
          format: "org.matrix.custom.html",
          formatted_body: "<b>Hello</b> world",
          msgtype: "m.text",
        };

        // When
        const result = containsSpoiler(content);

        // Then
        expect(result).toBe(false);
      });
    });

    describe("Given message content without formatted_body", () => {
      it("should return false for plain text messages", () => {
        // Given
        const content = {
          body: "Just text",
          msgtype: "m.text",
        };

        // When
        const result = containsSpoiler(content);

        // Then
        expect(result).toBe(false);
      });
    });

    describe("Given message content with wrong format", () => {
      it("should return false when format is not org.matrix.custom.html", () => {
        // Given
        const content = {
          body: "text",
          format: "some.other.format",
          formatted_body: "<span data-mx-spoiler>hidden</span>",
          msgtype: "m.text",
        };

        // When
        const result = containsSpoiler(content);

        // Then
        expect(result).toBe(false);
      });
    });
  });

  describe("buildSpoilerContent", () => {
    describe("Given text without a reason", () => {
      it("should build content with spoiler HTML and plain-text fallback", () => {
        // Given
        const text = "the butler did it";

        // When
        const content = buildSpoilerContent(text);

        // Then
        expect(content.format).toBe("org.matrix.custom.html");
        expect(content.formatted_body).toBe("<span data-mx-spoiler>the butler did it</span>");
        expect(content.body).toBe("[Spoiler] the butler did it");
        expect(content.msgtype).toBe("m.text");
      });
    });

    describe("Given text with a reason", () => {
      it("should include the reason in the HTML attribute and plain-text", () => {
        // Given
        const text = "Darth Vader is Luke's father";
        const reason = "Star Wars spoiler";

        // When
        const content = buildSpoilerContent(text, reason);

        // Then
        expect(content.formatted_body).toBe(
          '<span data-mx-spoiler="Star Wars spoiler">Darth Vader is Luke\'s father</span>',
        );
        expect(content.body).toBe("[Spoiler] (Star Wars spoiler) Darth Vader is Luke's father");
      });
    });

    describe("Given the output of buildSpoilerContent", () => {
      it("should be detectable by containsSpoiler", () => {
        // Given
        const content = buildSpoilerContent("hidden info", "reason here");

        // When
        const detected = containsSpoiler(content);

        // Then
        expect(detected).toBe(true);
      });
    });

    describe("Given the output of buildSpoilerContent", () => {
      it("should be parseable by parseSpoilers", () => {
        // Given
        const content = buildSpoilerContent("secret text", "why");

        // When
        const segments = parseSpoilers(content.formatted_body);

        // Then
        expect(segments).toEqual([{ type: "spoiler", content: "secret text", reason: "why" }]);
      });
    });
  });
});
