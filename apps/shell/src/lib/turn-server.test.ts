import type { MatrixClient } from "matrix-js-sdk";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseTurnResponse,
  computeTtlMs,
  fetchTurnServers,
  clearTurnCache,
  DEFAULT_STUN_SERVERS,
} from "./turn-server";
import type { TurnServerResponse } from "./turn-server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockClient(turnResponse?: TurnServerResponse | Error): MatrixClient {
  const turnServer =
    turnResponse instanceof Error
      ? vi.fn().mockRejectedValue(turnResponse)
      : vi.fn().mockResolvedValue(turnResponse ?? {});

  return { turnServer } as unknown as MatrixClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TURN server support", () => {
  beforeEach(() => {
    clearTurnCache();
  });

  afterEach(() => {
    clearTurnCache();
  });

  // -------------------------------------------------------------------------
  // parseTurnResponse
  // -------------------------------------------------------------------------

  describe("parseTurnResponse", () => {
    describe("given a valid TURN response with URIs", () => {
      it("should return an RTCIceServer with the URIs and credentials", () => {
        const response: TurnServerResponse = {
          uris: ["turn:turn.example.com:3478?transport=udp"],
          username: "user123",
          password: "pass456",
          ttl: 3600,
        };

        const servers = parseTurnResponse(response);

        expect(servers).toHaveLength(1);
        expect(servers[0].urls).toEqual(["turn:turn.example.com:3478?transport=udp"]);
        expect(servers[0].username).toBe("user123");
        expect(servers[0].credential).toBe("pass456");
      });
    });

    describe("given a response with multiple URIs", () => {
      it("should include all URIs in a single RTCIceServer entry", () => {
        const response: TurnServerResponse = {
          uris: [
            "turn:turn1.example.com:3478?transport=udp",
            "turn:turn2.example.com:3478?transport=tcp",
            "turns:turn1.example.com:5349?transport=tcp",
          ],
          username: "u",
          password: "p",
          ttl: 300,
        };

        const servers = parseTurnResponse(response);

        expect(servers).toHaveLength(1);
        expect(servers[0].urls).toHaveLength(3);
      });
    });

    describe("given a response with empty URIs array", () => {
      it("should return an empty array", () => {
        const response: TurnServerResponse = { uris: [], ttl: 300 };
        const servers = parseTurnResponse(response);
        expect(servers).toEqual([]);
      });
    });

    describe("given a response with no URIs field", () => {
      it("should return an empty array", () => {
        const response: TurnServerResponse = { ttl: 300 };
        const servers = parseTurnResponse(response);
        expect(servers).toEqual([]);
      });
    });

    describe("given an empty response object", () => {
      it("should return an empty array", () => {
        const servers = parseTurnResponse({});
        expect(servers).toEqual([]);
      });
    });
  });

  // -------------------------------------------------------------------------
  // computeTtlMs
  // -------------------------------------------------------------------------

  describe("computeTtlMs", () => {
    describe("given a TTL of 3600 seconds", () => {
      it("should return 3600000 milliseconds", () => {
        expect(computeTtlMs({ ttl: 3600 })).toBe(3_600_000);
      });
    });

    describe("given a TTL of 10 seconds (below minimum)", () => {
      it("should clamp to the minimum TTL (60 seconds = 60000ms)", () => {
        expect(computeTtlMs({ ttl: 10 })).toBe(60_000);
      });
    });

    describe("given no TTL in the response", () => {
      it("should use the minimum TTL (60 seconds)", () => {
        expect(computeTtlMs({})).toBe(60_000);
      });
    });

    describe("given a TTL of 0", () => {
      it("should clamp to the minimum TTL", () => {
        expect(computeTtlMs({ ttl: 0 })).toBe(60_000);
      });
    });
  });

  // -------------------------------------------------------------------------
  // fetchTurnServers
  // -------------------------------------------------------------------------

  describe("fetchTurnServers", () => {
    describe("given the endpoint returns valid TURN credentials", () => {
      it("should return STUN + TURN servers combined", async () => {
        const client = createMockClient({
          uris: ["turn:turn.example.com:3478"],
          username: "u",
          password: "p",
          ttl: 300,
        });

        const servers = await fetchTurnServers(client);

        expect(servers.length).toBeGreaterThan(DEFAULT_STUN_SERVERS.length);

        // The first entries should be the default STUN servers
        expect(servers[0]).toEqual(DEFAULT_STUN_SERVERS[0]);
        expect(servers[1]).toEqual(DEFAULT_STUN_SERVERS[1]);

        // The last entry should be the TURN server
        const turnEntry = servers[servers.length - 1];
        expect(turnEntry.urls).toEqual(["turn:turn.example.com:3478"]);
        expect(turnEntry.username).toBe("u");
        expect(turnEntry.credential).toBe("p");
      });
    });

    describe("given the endpoint returns empty URIs", () => {
      it("should fall back to default STUN servers", async () => {
        const client = createMockClient({ uris: [], ttl: 60 });

        const servers = await fetchTurnServers(client);

        expect(servers).toEqual(DEFAULT_STUN_SERVERS);
      });
    });

    describe("given the endpoint throws an error", () => {
      it("should fall back to default STUN servers", async () => {
        const client = createMockClient(new Error("Not found"));

        const servers = await fetchTurnServers(client);

        expect(servers).toEqual(DEFAULT_STUN_SERVERS);
      });
    });

    describe("given a cached result that has not expired", () => {
      it("should return the cached servers without calling the endpoint again", async () => {
        const client = createMockClient({
          uris: ["turn:turn.example.com:3478"],
          username: "u",
          password: "p",
          ttl: 3600,
        });

        // First call populates cache
        const first = await fetchTurnServers(client);

        // Second call should use cache
        const second = await fetchTurnServers(client);

        expect(second).toEqual(first);

        expect((client as any).turnServer).toHaveBeenCalledTimes(1);
      });
    });

    describe("given the cache has expired", () => {
      it("should fetch fresh credentials", async () => {
        const client = createMockClient({
          uris: ["turn:turn.example.com:3478"],
          username: "u",
          password: "p",
          ttl: 0, // will be clamped to minimum 60s
        });

        // First call
        await fetchTurnServers(client);

        // Manually expire the cache by clearing it
        clearTurnCache();

        // Second call should hit the endpoint again
        await fetchTurnServers(client);

        expect((client as any).turnServer).toHaveBeenCalledTimes(2);
      });
    });
  });
});
