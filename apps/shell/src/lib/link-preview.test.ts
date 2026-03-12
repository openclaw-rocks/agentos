import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractUrls,
  fetchLinkPreview,
  clearPreviewCache,
  MAX_PREVIEWS_PER_MESSAGE,
} from "./link-preview";

describe("LinkPreview", () => {
  describe("URL detection", () => {
    describe("Given a text with an HTTP URL", () => {
      it("should detect HTTP URLs in text", () => {
        const urls = extractUrls("Check out http://example.com for details");
        expect(urls).toEqual(["http://example.com"]);
      });
    });

    describe("Given a text with an HTTPS URL", () => {
      it("should detect HTTPS URLs in text", () => {
        const urls = extractUrls("Visit https://secure.example.com/page");
        expect(urls).toEqual(["https://secure.example.com/page"]);
      });
    });

    describe("Given a text with multiple URLs", () => {
      it("should handle multiple URLs", () => {
        const urls = extractUrls("See https://one.com and https://two.com and https://three.com");
        expect(urls).toEqual(["https://one.com", "https://two.com", "https://three.com"]);
      });
    });

    describe("Given a text with duplicate URLs", () => {
      it("should deduplicate URLs", () => {
        const urls = extractUrls("See https://one.com and https://one.com again");
        expect(urls).toEqual(["https://one.com"]);
      });
    });

    describe("Given a text with no URLs", () => {
      it("should not detect non-URLs", () => {
        const urls = extractUrls("Hello world, no links here!");
        expect(urls).toEqual([]);
      });
    });

    describe("Given empty text", () => {
      it("should return an empty array", () => {
        const urls = extractUrls("");
        expect(urls).toEqual([]);
      });
    });
  });

  describe("preview caching", () => {
    beforeEach(() => {
      clearPreviewCache();
      vi.restoreAllMocks();
    });

    describe("Given a successful preview fetch", () => {
      it("should cache preview results", async () => {
        const mockResponse = {
          ok: true,
          json: () =>
            Promise.resolve({
              "og:title": "Example",
              "og:description": "An example site",
              "og:site_name": "Example.com",
            }),
        };
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as Response);

        const result = await fetchLinkPreview(
          "https://example.com",
          "https://matrix.example.com",
          "test-token",
        );

        expect(result).toEqual({
          url: "https://example.com",
          title: "Example",
          description: "An example site",
          siteName: "Example.com",
          imageUrl: undefined,
        });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      });

      it("should return cached result on subsequent calls", async () => {
        const mockResponse = {
          ok: true,
          json: () =>
            Promise.resolve({
              "og:title": "Cached",
              "og:description": "Cached description",
            }),
        };
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as Response);

        // First call — fetches from server
        await fetchLinkPreview(
          "https://cached.example.com",
          "https://matrix.example.com",
          "test-token",
        );

        // Second call — should use cache
        const result = await fetchLinkPreview(
          "https://cached.example.com",
          "https://matrix.example.com",
          "test-token",
        );

        expect(result).toEqual({
          url: "https://cached.example.com",
          title: "Cached",
          description: "Cached description",
          siteName: undefined,
          imageUrl: undefined,
        });
        // fetch should only be called once because the second call uses the cache
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe("Given a failed fetch", () => {
      it("should cache null for failed requests", async () => {
        const mockResponse = { ok: false, status: 404 };
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as Response);

        const result = await fetchLinkPreview(
          "https://broken.example.com",
          "https://matrix.example.com",
          "test-token",
        );

        expect(result).toBeNull();

        // Second call — should return cached null without fetching again
        const result2 = await fetchLinkPreview(
          "https://broken.example.com",
          "https://matrix.example.com",
          "test-token",
        );

        expect(result2).toBeNull();
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe("Given a response with no title or description", () => {
      it("should return null for empty preview data", async () => {
        const mockResponse = {
          ok: true,
          json: () => Promise.resolve({ "og:site_name": "SomeApp" }),
        };
        vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as Response);

        const result = await fetchLinkPreview(
          "https://empty.example.com",
          "https://matrix.example.com",
          "test-token",
        );

        expect(result).toBeNull();
      });
    });

    describe("Given a response with an mxc:// image URL", () => {
      it("should convert mxc URL to HTTP thumbnail URL", async () => {
        const mockResponse = {
          ok: true,
          json: () =>
            Promise.resolve({
              "og:title": "Image Test",
              "og:description": "Has image",
              "og:image": "mxc://matrix.org/abc123",
            }),
        };
        vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as Response);

        const result = await fetchLinkPreview(
          "https://img.example.com",
          "https://matrix.example.com",
          "test-token",
        );

        expect(result?.imageUrl).toBe(
          "https://matrix.example.com/_matrix/media/v3/thumbnail/matrix.org/abc123?width=160&height=160&method=crop",
        );
      });
    });
  });

  describe("preview limiting", () => {
    describe("Given a text with more than 3 URLs", () => {
      it("should limit previews to 3 per message", () => {
        const text = "https://a.com https://b.com https://c.com https://d.com https://e.com";
        const urls = extractUrls(text);
        expect(urls).toHaveLength(MAX_PREVIEWS_PER_MESSAGE);
        expect(urls).toEqual(["https://a.com", "https://b.com", "https://c.com"]);
      });
    });
  });
});
