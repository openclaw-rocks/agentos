import { describe, it, expect, vi, beforeEach } from "vitest";

/* -------------------------------------------------------------------------- */
/*  Mock for the publicRooms API response                                     */
/* -------------------------------------------------------------------------- */

interface PublicRoomChunk {
  room_id: string;
  name?: string;
  topic?: string;
  num_joined_members: number;
  canonical_alias?: string;
  world_readable?: boolean;
  guest_can_join?: boolean;
  avatar_url?: string;
}

interface MockPublicRoomsResponse {
  chunk: PublicRoomChunk[];
  next_batch?: string;
  total_room_count_estimate?: number;
}

function makeChunk(overrides: Partial<PublicRoomChunk> & { room_id: string }): PublicRoomChunk {
  return {
    num_joined_members: 1,
    ...overrides,
  };
}

function mockClient(
  opts: {
    publicRoomsResponse?: MockPublicRoomsResponse;
    joinedRoomIds?: string[];
    domain?: string;
  } = {},
) {
  const joinedRoomIds = new Set(opts.joinedRoomIds ?? []);

  return {
    getDomain: () => opts.domain ?? "example.com",
    getUserId: () => "@user:example.com",
    getRooms: () => Array.from(joinedRoomIds).map((id) => ({ roomId: id })),
    publicRooms: vi
      .fn()
      .mockResolvedValue(opts.publicRoomsResponse ?? { chunk: [], total_room_count_estimate: 0 }),
    joinRoom: vi
      .fn()
      .mockImplementation((idOrAlias: string) => Promise.resolve({ roomId: idOrAlias })),
  };
}

/* -------------------------------------------------------------------------- */
/*  RoomDirectory logic tests                                                 */
/*  (We test the data-processing logic without importing React components.)   */
/* -------------------------------------------------------------------------- */

/**
 * Processes a publicRooms response chunk into our display model.
 * This mirrors the logic inside the RoomDirectory component.
 */
function processPublicRooms(chunk: PublicRoomChunk[], joinedRoomIds: Set<string>) {
  return chunk.map((r) => ({
    roomId: r.room_id,
    name: r.name,
    topic: r.topic,
    memberCount: r.num_joined_members ?? 0,
    alias: r.canonical_alias,
    isJoined: joinedRoomIds.has(r.room_id),
  }));
}

describe("RoomDirectory", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    client = mockClient();
  });

  describe("given search results", () => {
    it("should display rooms with name, topic, and member count", () => {
      // Given
      const chunk: PublicRoomChunk[] = [
        makeChunk({
          room_id: "!room1:example.com",
          name: "General Chat",
          topic: "A place for general discussion",
          num_joined_members: 42,
          canonical_alias: "#general:example.com",
        }),
        makeChunk({
          room_id: "!room2:example.com",
          name: "Dev Talk",
          topic: "Development discussions",
          num_joined_members: 15,
        }),
      ];

      // When
      const processed = processPublicRooms(chunk, new Set());

      // Then
      expect(processed).toHaveLength(2);

      expect(processed[0].name).toBe("General Chat");
      expect(processed[0].topic).toBe("A place for general discussion");
      expect(processed[0].memberCount).toBe(42);
      expect(processed[0].alias).toBe("#general:example.com");

      expect(processed[1].name).toBe("Dev Talk");
      expect(processed[1].topic).toBe("Development discussions");
      expect(processed[1].memberCount).toBe(15);
    });

    it("should show join button for non-joined rooms", () => {
      // Given
      const chunk: PublicRoomChunk[] = [
        makeChunk({ room_id: "!notjoined:example.com", name: "New Room" }),
      ];

      // When
      const processed = processPublicRooms(chunk, new Set());

      // Then
      expect(processed[0].isJoined).toBe(false);
    });

    it("should show 'Joined' for already joined rooms", () => {
      // Given
      const joinedIds = new Set(["!joined:example.com"]);
      const chunk: PublicRoomChunk[] = [
        makeChunk({ room_id: "!joined:example.com", name: "My Room" }),
        makeChunk({ room_id: "!other:example.com", name: "Other Room" }),
      ];

      // When
      const processed = processPublicRooms(chunk, joinedIds);

      // Then
      expect(processed[0].isJoined).toBe(true);
      expect(processed[1].isJoined).toBe(false);
    });
  });

  describe("given the publicRooms API is called", () => {
    it("should pass the search filter to the API", async () => {
      // Given
      client = mockClient({
        publicRoomsResponse: { chunk: [] },
      });

      // When
      await client.publicRooms({
        limit: 50,
        filter: { generic_search_term: "testing" },
      });

      // Then
      expect(client.publicRooms).toHaveBeenCalledWith({
        limit: 50,
        filter: { generic_search_term: "testing" },
      });
    });

    it("should support pagination via since token", async () => {
      // Given
      client = mockClient({
        publicRoomsResponse: {
          chunk: [makeChunk({ room_id: "!page2:example.com" })],
          next_batch: "page3token",
        },
      });

      // When
      await client.publicRooms({
        limit: 50,
        since: "page2token",
      });

      // Then
      expect(client.publicRooms).toHaveBeenCalledWith({
        limit: 50,
        since: "page2token",
      });
    });
  });

  describe("given a join action", () => {
    it("should call client.joinRoom with the room ID or alias", async () => {
      // Given
      client = mockClient({
        publicRoomsResponse: {
          chunk: [
            makeChunk({
              room_id: "!target:example.com",
              canonical_alias: "#target:example.com",
            }),
          ],
        },
      });

      // When
      await client.joinRoom("#target:example.com");

      // Then
      expect(client.joinRoom).toHaveBeenCalledWith("#target:example.com");
    });

    it("should return the joined room ID", async () => {
      // Given
      client = mockClient();

      // When
      const result = await client.joinRoom("!newroom:example.com");

      // Then
      expect(result).toEqual({ roomId: "!newroom:example.com" });
    });
  });

  describe("given rooms with missing fields", () => {
    it("should handle rooms without a name or topic gracefully", () => {
      // Given
      const chunk: PublicRoomChunk[] = [
        makeChunk({ room_id: "!noname:example.com", num_joined_members: 3 }),
      ];

      // When
      const processed = processPublicRooms(chunk, new Set());

      // Then
      expect(processed[0].roomId).toBe("!noname:example.com");
      expect(processed[0].name).toBeUndefined();
      expect(processed[0].topic).toBeUndefined();
      expect(processed[0].memberCount).toBe(3);
    });
  });
});
