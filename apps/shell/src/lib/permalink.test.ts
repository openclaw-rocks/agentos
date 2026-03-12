import { describe, it, expect } from "vitest";
import { makePermalink, makeRoomLink, parsePermalink } from "./permalink";

describe("permalink", () => {
  describe("makePermalink", () => {
    describe("given a roomId and eventId", () => {
      it("should produce a correct matrix.to URL", () => {
        const url = makePermalink("!room123:example.com", "$event456");
        expect(url).toBe("https://matrix.to/#/!room123%3Aexample.com/%24event456");
      });

      it("should encode special characters in roomId and eventId", () => {
        const url = makePermalink("!room:server.org", "$ev/special");
        expect(url).toContain("https://matrix.to/#/");
        // Should be parseable back
        const parsed = parsePermalink(url);
        expect(parsed).toEqual({
          roomId: "!room:server.org",
          eventId: "$ev/special",
        });
      });
    });
  });

  describe("makeRoomLink", () => {
    describe("given a room ID", () => {
      it("should produce a correct matrix.to room URL", () => {
        const url = makeRoomLink("!abc:example.com");
        expect(url).toBe("https://matrix.to/#/!abc%3Aexample.com");
      });
    });

    describe("given a room alias", () => {
      it("should produce a correct matrix.to alias URL", () => {
        const url = makeRoomLink("#general:example.com");
        expect(url).toBe("https://matrix.to/#/%23general%3Aexample.com");
      });
    });
  });

  describe("parsePermalink", () => {
    describe("given a valid matrix.to URL with roomId and eventId", () => {
      it("should parse back to roomId and eventId", () => {
        const url = "https://matrix.to/#/!room123%3Aexample.com/%24event456";
        const result = parsePermalink(url);
        expect(result).toEqual({
          roomId: "!room123:example.com",
          eventId: "$event456",
        });
      });
    });

    describe("given a valid matrix.to URL with only a roomId", () => {
      it("should parse with roomId and no eventId", () => {
        const url = "https://matrix.to/#/!room123%3Aexample.com";
        const result = parsePermalink(url);
        expect(result).toEqual({ roomId: "!room123:example.com" });
      });
    });

    describe("given a valid matrix.to URL with a room alias", () => {
      it("should parse the alias as roomId", () => {
        const url = "https://matrix.to/#/%23general%3Aexample.com";
        const result = parsePermalink(url);
        expect(result).toEqual({ roomId: "#general:example.com" });
      });
    });

    describe("given an invalid URL", () => {
      it("should return null for non-matrix.to URLs", () => {
        expect(parsePermalink("https://example.com/foo")).toBeNull();
      });

      it("should return null for empty fragment", () => {
        expect(parsePermalink("https://matrix.to/#/")).toBeNull();
      });

      it("should return null for URLs without a valid room identifier", () => {
        expect(parsePermalink("https://matrix.to/#/invalid")).toBeNull();
      });

      it("should return null for completely empty string", () => {
        expect(parsePermalink("")).toBeNull();
      });
    });

    describe("given a round-trip through makePermalink and parsePermalink", () => {
      it("should produce the original roomId and eventId", () => {
        const roomId = "!myRoom:matrix.openclaw.rocks";
        const eventId = "$abc123XYZ";
        const url = makePermalink(roomId, eventId);
        const parsed = parsePermalink(url);
        expect(parsed).toEqual({ roomId, eventId });
      });
    });
  });
});
