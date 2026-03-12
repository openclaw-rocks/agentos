const MATRIX_TO_BASE = "https://matrix.to/#/";

/**
 * Create a matrix.to permalink for a specific event in a room.
 */
export function makePermalink(roomId: string, eventId: string): string {
  return `${MATRIX_TO_BASE}${encodeURIComponent(roomId)}/${encodeURIComponent(eventId)}`;
}

/**
 * Create a matrix.to link for a room (by ID or alias).
 */
export function makeRoomLink(roomIdOrAlias: string): string {
  return `${MATRIX_TO_BASE}${encodeURIComponent(roomIdOrAlias)}`;
}

/**
 * Parse a matrix.to permalink back into its components.
 * Returns null for invalid or non-matrix.to URLs.
 */
export function parsePermalink(url: string): { roomId: string; eventId?: string } | null {
  if (!url.startsWith(MATRIX_TO_BASE)) return null;

  const fragment = url.slice(MATRIX_TO_BASE.length);
  if (!fragment) return null;

  const parts = fragment.split("/").map(decodeURIComponent);

  const roomId = parts[0];
  if (!roomId || (!roomId.startsWith("!") && !roomId.startsWith("#"))) {
    return null;
  }

  const eventId = parts[1] && parts[1].startsWith("$") ? parts[1] : undefined;

  return { roomId, eventId };
}
