import { describe, it, expect } from "vitest";
import {
  buildStickerEventContent,
  getUserStickerPacks,
  getCustomEmoji,
  type Sticker,
  type StickerPack,
} from "./sticker-utils";

describe("Sticker utilities", () => {
  describe("buildStickerEventContent", () => {
    describe("given a valid sticker", () => {
      it("should build content with body, url, and info", () => {
        const sticker: Sticker = {
          name: "happy-cat",
          url: "mxc://example.com/abc123",
          info: { w: 256, h: 256, mimetype: "image/png", size: 12345 },
        };

        const result = buildStickerEventContent(sticker);

        expect(result).toEqual({
          body: "happy-cat",
          url: "mxc://example.com/abc123",
          info: { w: 256, h: 256, mimetype: "image/png", size: 12345 },
        });
      });

      it("should use the sticker name as the body", () => {
        const sticker: Sticker = {
          name: "thumbs-up",
          url: "mxc://server.org/media1",
          info: { w: 128, h: 128, mimetype: "image/webp", size: 5000 },
        };

        const result = buildStickerEventContent(sticker);

        expect(result.body).toBe("thumbs-up");
      });

      it("should preserve the original info dimensions and metadata", () => {
        const sticker: Sticker = {
          name: "wide-image",
          url: "mxc://server.org/wide",
          info: { w: 512, h: 128, mimetype: "image/gif", size: 98765 },
        };

        const result = buildStickerEventContent(sticker);
        const info = result.info as { w: number; h: number; mimetype: string; size: number };

        expect(info.w).toBe(512);
        expect(info.h).toBe(128);
        expect(info.mimetype).toBe("image/gif");
        expect(info.size).toBe(98765);
      });
    });
  });

  describe("getUserStickerPacks", () => {
    describe("given no account data", () => {
      it("should return an empty array", () => {
        const client = {
          getAccountData: () => undefined,
        };

        const packs = getUserStickerPacks(client);

        expect(packs).toEqual([]);
      });
    });

    describe("given account data with no packs field", () => {
      it("should return an empty array", () => {
        const client = {
          getAccountData: (type: string) => {
            if (type === "im.ponies.user_emotes") {
              return { getContent: () => ({}) };
            }
            return undefined;
          },
        };

        const packs = getUserStickerPacks(client);

        expect(packs).toEqual([]);
      });
    });

    describe("given account data with sticker packs", () => {
      it("should extract packs with their stickers", () => {
        const client = {
          getAccountData: (type: string) => {
            if (type === "im.ponies.user_emotes") {
              return {
                getContent: () => ({
                  packs: {
                    "My Stickers": {
                      avatar_url: "mxc://example.com/avatar",
                      images: {
                        smile: {
                          url: "mxc://example.com/smile",
                          info: { w: 64, h: 64, mimetype: "image/png", size: 1000 },
                        },
                        wave: {
                          url: "mxc://example.com/wave",
                          info: { w: 128, h: 128, mimetype: "image/webp", size: 2000 },
                        },
                      },
                    },
                  },
                }),
              };
            }
            return undefined;
          },
        };

        const packs = getUserStickerPacks(client);

        expect(packs).toHaveLength(1);
        expect(packs[0].name).toBe("My Stickers");
        expect(packs[0].avatarUrl).toBe("mxc://example.com/avatar");
        expect(packs[0].stickers).toHaveLength(2);
        expect(packs[0].stickers[0].name).toBe("smile");
        expect(packs[0].stickers[1].name).toBe("wave");
      });
    });

    describe("given account data with empty images", () => {
      it("should skip packs with no valid stickers", () => {
        const client = {
          getAccountData: (type: string) => {
            if (type === "im.ponies.user_emotes") {
              return {
                getContent: () => ({
                  packs: {
                    "Empty Pack": {
                      images: {},
                    },
                  },
                }),
              };
            }
            return undefined;
          },
        };

        const packs = getUserStickerPacks(client);

        expect(packs).toEqual([]);
      });
    });
  });

  describe("getCustomEmoji", () => {
    describe("given no account data", () => {
      it("should return an empty array", () => {
        const client = {
          getAccountData: () => undefined,
        };

        const emojis = getCustomEmoji(client);

        expect(emojis).toEqual([]);
      });
    });

    describe("given account data with no images field", () => {
      it("should return an empty array", () => {
        const client = {
          getAccountData: (type: string) => {
            if (type === "im.ponies.user_emotes") {
              return { getContent: () => ({}) };
            }
            return undefined;
          },
        };

        const emojis = getCustomEmoji(client);

        expect(emojis).toEqual([]);
      });
    });

    describe("given account data with custom emoji", () => {
      it("should extract shortcode and URL pairs", () => {
        const client = {
          getAccountData: (type: string) => {
            if (type === "im.ponies.user_emotes") {
              return {
                getContent: () => ({
                  images: {
                    party_parrot: { url: "mxc://example.com/parrot" },
                    blobcat: { url: "mxc://example.com/blobcat" },
                  },
                }),
              };
            }
            return undefined;
          },
        };

        const emojis = getCustomEmoji(client);

        expect(emojis).toHaveLength(2);
        expect(emojis[0]).toEqual({ shortcode: "party_parrot", url: "mxc://example.com/parrot" });
        expect(emojis[1]).toEqual({ shortcode: "blobcat", url: "mxc://example.com/blobcat" });
      });
    });

    describe("given account data with entries missing url", () => {
      it("should skip entries without a url field", () => {
        const client = {
          getAccountData: (type: string) => {
            if (type === "im.ponies.user_emotes") {
              return {
                getContent: () => ({
                  images: {
                    valid: { url: "mxc://example.com/valid" },
                    invalid: { name: "no-url" },
                  },
                }),
              };
            }
            return undefined;
          },
        };

        const emojis = getCustomEmoji(client);

        expect(emojis).toHaveLength(1);
        expect(emojis[0].shortcode).toBe("valid");
      });
    });
  });

  describe("StickerPack structure", () => {
    describe("given a well-formed sticker pack", () => {
      it("should have a name and stickers array", () => {
        const pack: StickerPack = {
          name: "Fun Pack",
          stickers: [
            {
              name: "laugh",
              url: "mxc://example.com/laugh",
              info: { w: 64, h: 64, mimetype: "image/png", size: 500 },
            },
          ],
        };

        expect(pack.name).toBe("Fun Pack");
        expect(pack.stickers).toHaveLength(1);
        expect(pack.avatarUrl).toBeUndefined();
      });

      it("should support an optional avatarUrl", () => {
        const pack: StickerPack = {
          name: "Branded Pack",
          avatarUrl: "mxc://example.com/brand-avatar",
          stickers: [],
        };

        expect(pack.avatarUrl).toBe("mxc://example.com/brand-avatar");
      });
    });
  });
});
