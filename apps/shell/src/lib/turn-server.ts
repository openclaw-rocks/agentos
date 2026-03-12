/**
 * TURN server fetching with cache and fallback.
 *
 * Calls the Matrix `/_matrix/client/v3/voip/turnServer` endpoint via
 * `client.turnServer()` and converts the response into `RTCIceServer[]`.
 * Falls back to hardcoded STUN servers when the endpoint fails or returns
 * empty data.
 */
import type { MatrixClient } from "matrix-js-sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The shape returned by the Matrix turnServer endpoint. */
export interface TurnServerResponse {
  username?: string;
  password?: string;
  uris?: string[];
  ttl?: number;
}

/** Cached TURN credentials. */
interface CachedTurnServers {
  servers: RTCIceServer[];
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/** Minimum TTL in seconds to avoid hammering the server. */
const MIN_TTL_SECONDS = 60;

// ---------------------------------------------------------------------------
// Module-level cache
// ---------------------------------------------------------------------------

let cachedTurn: CachedTurnServers | null = null;

/** Clear the cached TURN servers (useful for testing). */
export function clearTurnCache(): void {
  cachedTurn = null;
}

// ---------------------------------------------------------------------------
// Pure conversion helper (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Convert a Matrix TURN server response into an array of RTCIceServer objects.
 * Returns an empty array if the response is missing URIs.
 */
export function parseTurnResponse(response: TurnServerResponse): RTCIceServer[] {
  if (!response.uris || response.uris.length === 0) {
    return [];
  }

  return [
    {
      urls: response.uris,
      username: response.username,
      credential: response.password,
    },
  ];
}

/**
 * Compute the TTL (in milliseconds) from the response, with a minimum floor.
 */
export function computeTtlMs(response: TurnServerResponse): number {
  const ttlSec = Math.max(response.ttl ?? MIN_TTL_SECONDS, MIN_TTL_SECONDS);
  return ttlSec * 1000;
}

// ---------------------------------------------------------------------------
// Main fetch function
// ---------------------------------------------------------------------------

/**
 * Fetch TURN servers from the homeserver, using a cached result when available.
 * Falls back to the default STUN servers on failure.
 */
export async function fetchTurnServers(client: MatrixClient): Promise<RTCIceServer[]> {
  // Return cached servers if still valid
  if (cachedTurn && Date.now() < cachedTurn.expiresAt) {
    return cachedTurn.servers;
  }

  try {
    // client.turnServer() is the matrix-js-sdk method for the TURN endpoint.
    // In v36 the typing may not be perfect, so we cast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: TurnServerResponse = await (client as any).turnServer();

    const servers = parseTurnResponse(response);

    if (servers.length === 0) {
      return DEFAULT_STUN_SERVERS;
    }

    const ttlMs = computeTtlMs(response);
    cachedTurn = {
      servers: [...DEFAULT_STUN_SERVERS, ...servers],
      expiresAt: Date.now() + ttlMs,
    };

    return cachedTurn.servers;
  } catch {
    // Endpoint not available or returned an error — fall back to STUN
    return DEFAULT_STUN_SERVERS;
  }
}
