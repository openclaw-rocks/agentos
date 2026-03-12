import { describe, it, expect } from "vitest";
import { isEmojiOnlyMessage, formatEditedContent } from "./message-utils";

describe("isEmojiOnlyMessage", () => {
  describe("Given a single emoji", () => {
    describe("When called with a thumbs-up", () => {
      it("Then it should return true", () => {
        expect(isEmojiOnlyMessage("\u{1F44D}")).toBe(true);
      });
    });
  });

  describe("Given three emoji", () => {
    describe("When called with thumbs-up, thumbs-down, and party popper", () => {
      it("Then it should return true", () => {
        expect(isEmojiOnlyMessage("\u{1F44D}\u{1F44E}\u{1F389}")).toBe(true);
      });
    });
  });

  describe("Given text with an emoji", () => {
    describe("When called with 'hello' followed by thumbs-up", () => {
      it("Then it should return false", () => {
        expect(isEmojiOnlyMessage("hello \u{1F44D}")).toBe(false);
      });
    });
  });

  describe("Given four or more emoji", () => {
    describe("When called with four thumbs-up emoji", () => {
      it("Then it should return false", () => {
        expect(isEmojiOnlyMessage("\u{1F44D}\u{1F44D}\u{1F44D}\u{1F44D}")).toBe(false);
      });
    });
  });

  describe("Given an empty string", () => {
    describe("When called with empty input", () => {
      it("Then it should return false", () => {
        expect(isEmojiOnlyMessage("")).toBe(false);
      });
    });
  });

  describe("Given whitespace around emoji", () => {
    describe("When called with a padded single emoji", () => {
      it("Then it should return true (trims whitespace)", () => {
        expect(isEmojiOnlyMessage("  \u{1F680}  ")).toBe(true);
      });
    });
  });
});

describe("formatEditedContent", () => {
  describe("Given an original body and a new body", () => {
    describe("When formatting the edit", () => {
      it("Then the body should be prefixed with '* '", () => {
        const result = formatEditedContent("old text", "new text");
        expect(result.body).toBe("* new text");
      });
    });
  });

  describe("Given a simple text replacement", () => {
    describe("When no HTML formatting is needed", () => {
      it("Then formatted_body should be undefined", () => {
        const result = formatEditedContent("original", "replacement");
        expect(result.formatted_body).toBeUndefined();
      });
    });
  });
});
