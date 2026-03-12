import { describe, it, expect } from "vitest";
import { mxcToHttpUrl } from "./media";

describe("Media utilities", () => {
  describe("mxcToHttpUrl", () => {
    describe("given a valid mxc:// URL", () => {
      it("should convert to a download URL", () => {
        const result = mxcToHttpUrl("mxc://matrix.org/abc123", "https://matrix.example.com");

        expect(result).toBe(
          "https://matrix.example.com/_matrix/media/v3/download/matrix.org/abc123",
        );
      });
    });

    describe("given a valid mxc:// URL with dimensions", () => {
      it("should convert to a thumbnail URL with width and height", () => {
        const result = mxcToHttpUrl(
          "mxc://matrix.org/abc123",
          "https://matrix.example.com",
          48,
          48,
        );

        expect(result).toBe(
          "https://matrix.example.com/_matrix/media/v3/thumbnail/matrix.org/abc123?width=48&height=48&method=crop",
        );
      });
    });

    describe("given a non-mxc URL", () => {
      it("should return null for https URLs", () => {
        const result = mxcToHttpUrl("https://example.com/avatar.png", "https://matrix.example.com");

        expect(result).toBeNull();
      });

      it("should return null for empty strings", () => {
        const result = mxcToHttpUrl("", "https://matrix.example.com");

        expect(result).toBeNull();
      });
    });

    describe("given undefined or null input", () => {
      it("should return null for undefined", () => {
        const result = mxcToHttpUrl(undefined, "https://matrix.example.com");

        expect(result).toBeNull();
      });

      it("should return null for null", () => {
        const result = mxcToHttpUrl(null, "https://matrix.example.com");

        expect(result).toBeNull();
      });
    });
  });
});
