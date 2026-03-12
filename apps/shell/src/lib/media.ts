/**
 * Utility functions for Matrix media (mxc://) URL handling.
 */

/**
 * Converts an mxc:// URL to an HTTPS download or thumbnail URL.
 *
 * @param mxcUrl - The mxc:// URL (e.g. "mxc://server.com/mediaId")
 * @param homeserverUrl - The homeserver base URL (e.g. "https://matrix.example.com")
 * @param width - Optional thumbnail width (requires height)
 * @param height - Optional thumbnail height (requires width)
 * @returns The HTTPS URL, or null if the input is not a valid mxc:// URL
 */
export function mxcToHttpUrl(
  mxcUrl: string | undefined | null,
  homeserverUrl: string,
  width?: number,
  height?: number,
): string | null {
  if (!mxcUrl?.startsWith("mxc://")) return null;

  const parts = mxcUrl.slice(6).split("/");
  if (parts.length < 2) return null;

  const serverName = parts[0];
  const mediaId = parts[1];

  if (!serverName || !mediaId) return null;

  if (width && height) {
    return `${homeserverUrl}/_matrix/media/v3/thumbnail/${serverName}/${mediaId}?width=${width}&height=${height}&method=crop`;
  }

  return `${homeserverUrl}/_matrix/media/v3/download/${serverName}/${mediaId}`;
}
