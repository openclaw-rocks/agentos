/** URL detection regex — matches http and https URLs */
export const URL_REGEX = /https?:\/\/[^\s<>)"']+/g;

/** Open Graph preview data returned by the Matrix media API */
export interface LinkPreviewData {
  url: string;
  siteName?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
}

/** Maximum number of link previews to show per message */
export const MAX_PREVIEWS_PER_MESSAGE = 3;

/** In-memory cache: url -> preview data (or null if fetch failed) */
const previewCache = new Map<string, LinkPreviewData | null>();

/**
 * Extracts URLs from a text string.
 * Returns at most MAX_PREVIEWS_PER_MESSAGE URLs.
 */
export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  if (!matches) return [];
  // Deduplicate while preserving order
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const url of matches) {
    if (!seen.has(url)) {
      seen.add(url);
      unique.push(url);
    }
    if (unique.length >= MAX_PREVIEWS_PER_MESSAGE) break;
  }
  return unique;
}

/**
 * Converts an mxc:// URL to an HTTP thumbnail URL via the Matrix content API.
 */
function mxcToHttp(mxcUrl: string, homeserverUrl: string): string {
  // mxc://server/mediaId -> /_matrix/media/v3/thumbnail/server/mediaId
  const stripped = mxcUrl.replace("mxc://", "");
  return `${homeserverUrl}/_matrix/media/v3/thumbnail/${stripped}?width=160&height=160&method=crop`;
}

/**
 * Fetches a link preview from the Matrix server's URL preview endpoint.
 * Results are cached in memory.
 */
export async function fetchLinkPreview(
  url: string,
  homeserverUrl: string,
  accessToken: string,
): Promise<LinkPreviewData | null> {
  const cached = previewCache.get(url);
  if (cached !== undefined) return cached;

  try {
    const endpoint = `${homeserverUrl}/_matrix/media/v3/preview_url?url=${encodeURIComponent(url)}&ts=${Date.now()}`;
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      previewCache.set(url, null);
      return null;
    }

    const data: Record<string, unknown> = await response.json();

    const title = data["og:title"] as string | undefined;
    const description = data["og:description"] as string | undefined;
    const siteName = data["og:site_name"] as string | undefined;
    const ogImage = data["og:image"] as string | undefined;

    // If there's no meaningful content, treat as no preview
    if (!title && !description) {
      previewCache.set(url, null);
      return null;
    }

    const imageUrl =
      ogImage && ogImage.startsWith("mxc://") ? mxcToHttp(ogImage, homeserverUrl) : ogImage;

    const preview: LinkPreviewData = {
      url,
      siteName: siteName ?? undefined,
      title: title ?? undefined,
      description: description ?? undefined,
      imageUrl: imageUrl ?? undefined,
    };

    previewCache.set(url, preview);
    return preview;
  } catch {
    previewCache.set(url, null);
    return null;
  }
}

/**
 * Clears the preview cache. Primarily useful for testing.
 */
export function clearPreviewCache(): void {
  previewCache.clear();
}
