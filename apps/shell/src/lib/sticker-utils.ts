/**
 * Sticker and custom emoji utilities for Matrix protocol.
 *
 * Matrix stickers are sent as `m.sticker` events (not `m.room.message`).
 * Custom emoji follow MSC2545 (`im.ponies.user_emotes` account data).
 */

export interface StickerInfo {
  w: number;
  h: number;
  mimetype: string;
  size: number;
}

export interface Sticker {
  name: string;
  url: string;
  info: StickerInfo;
}

export interface StickerPack {
  name: string;
  avatarUrl?: string;
  stickers: Sticker[];
}

/** Shortcode -> mxc:// URL mapping for custom emoji */
export interface CustomEmoji {
  shortcode: string;
  url: string;
}

/**
 * Minimal interface for the subset of MatrixClient methods we use,
 * so callers can pass any compatible client without importing the full SDK.
 */
export interface StickerClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAccountData: (eventType: any) => { getContent: () => Record<string, unknown> } | undefined;
}

/**
 * Reads sticker packs from user account data.
 *
 * Looks for `im.ponies.user_emotes` (MSC2545) and `m.widgets` with type
 * `m.stickerpicker` to discover installed sticker packs.
 */
export function getUserStickerPacks(client: StickerClient): StickerPack[] {
  const packs: StickerPack[] = [];

  // Try im.ponies.user_emotes (MSC2545 sticker packs)
  const emotesEvent = client.getAccountData("im.ponies.user_emotes");
  if (emotesEvent) {
    const content = emotesEvent.getContent();
    const packData = content.packs as Record<string, unknown> | undefined;
    if (packData && typeof packData === "object") {
      for (const [packName, packValue] of Object.entries(packData)) {
        const pack = packValue as Record<string, unknown>;
        const images = pack.images as Record<string, unknown> | undefined;
        if (images && typeof images === "object") {
          const stickers: Sticker[] = [];
          for (const [stickerName, stickerValue] of Object.entries(images)) {
            const sticker = stickerValue as Record<string, unknown>;
            const url = sticker.url as string | undefined;
            const info = sticker.info as StickerInfo | undefined;
            if (url && info) {
              stickers.push({ name: stickerName, url, info });
            }
          }
          if (stickers.length > 0) {
            packs.push({
              name: packName,
              avatarUrl: pack.avatar_url as string | undefined,
              stickers,
            });
          }
        }
      }
    }
  }

  return packs;
}

/**
 * Builds the content object for sending an `m.sticker` event.
 *
 * The resulting content has `body`, `url`, and `info` fields as required
 * by the Matrix spec for sticker events.
 */
export function buildStickerEventContent(sticker: Sticker): Record<string, unknown> {
  return {
    body: sticker.name,
    url: sticker.url,
    info: {
      w: sticker.info.w,
      h: sticker.info.h,
      mimetype: sticker.info.mimetype,
      size: sticker.info.size,
    },
  };
}

/**
 * Reads custom emoji from user account data (MSC2545 `im.ponies.user_emotes`).
 *
 * Custom emoji are stored as shortcode -> mxc:// URL mappings in the
 * `images` field of the account data event.
 */
export function getCustomEmoji(client: StickerClient): CustomEmoji[] {
  const emotes: CustomEmoji[] = [];

  const emotesEvent = client.getAccountData("im.ponies.user_emotes");
  if (!emotesEvent) return emotes;

  const content = emotesEvent.getContent();
  const images = content.images as Record<string, unknown> | undefined;
  if (!images || typeof images !== "object") return emotes;

  for (const [shortcode, value] of Object.entries(images)) {
    const entry = value as Record<string, unknown>;
    const url = entry.url as string | undefined;
    if (url) {
      emotes.push({ shortcode, url });
    }
  }

  return emotes;
}
