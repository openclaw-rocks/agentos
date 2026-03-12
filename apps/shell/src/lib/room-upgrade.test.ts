import { describe, it, expect, vi } from "vitest";
import { getAvailableRoomVersions, getCurrentRoomVersion, upgradeRoom } from "./room-upgrade";

describe("RoomUpgrade", () => {
  describe("getAvailableRoomVersions", () => {
    it("should return versions 1 through 11", () => {
      const versions = getAvailableRoomVersions();
      expect(versions).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
    });

    it("should return a new array each time (no shared mutation)", () => {
      const a = getAvailableRoomVersions();
      const b = getAvailableRoomVersions();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe("getCurrentRoomVersion", () => {
    describe("Given a room with version 6", () => {
      it("should return '6'", () => {
        const room = {
          currentState: {
            getStateEvents: (type: string, key: string) => {
              if (type === "m.room.create" && key === "") {
                return {
                  getContent: () => ({ room_version: "6" }),
                };
              }
              return null;
            },
          },
        } as unknown as Parameters<typeof getCurrentRoomVersion>[0];

        expect(getCurrentRoomVersion(room)).toBe("6");
      });
    });

    describe("Given a room with version 10", () => {
      it("should return '10'", () => {
        const room = {
          currentState: {
            getStateEvents: (type: string, key: string) => {
              if (type === "m.room.create" && key === "") {
                return {
                  getContent: () => ({ room_version: "10" }),
                };
              }
              return null;
            },
          },
        } as unknown as Parameters<typeof getCurrentRoomVersion>[0];

        expect(getCurrentRoomVersion(room)).toBe("10");
      });
    });

    describe("Given a room with no version field in the create event", () => {
      it("should default to '1'", () => {
        const room = {
          currentState: {
            getStateEvents: (type: string, key: string) => {
              if (type === "m.room.create" && key === "") {
                return {
                  getContent: () => ({}),
                };
              }
              return null;
            },
          },
        } as unknown as Parameters<typeof getCurrentRoomVersion>[0];

        expect(getCurrentRoomVersion(room)).toBe("1");
      });
    });

    describe("Given a room with no create event at all", () => {
      it("should default to '1'", () => {
        const room = {
          currentState: {
            getStateEvents: () => null,
          },
        } as unknown as Parameters<typeof getCurrentRoomVersion>[0];

        expect(getCurrentRoomVersion(room)).toBe("1");
      });
    });
  });

  describe("upgradeRoom", () => {
    describe("Given an upgrade request", () => {
      it("should call client.upgradeRoom with correct params and return the new room ID", async () => {
        const upgradeRoomMock = vi
          .fn()
          .mockResolvedValue({ replacement_room: "!newRoom:matrix.org" });
        const mockClient = {
          upgradeRoom: upgradeRoomMock,
        } as unknown as Parameters<typeof upgradeRoom>[0];

        const result = await upgradeRoom(mockClient, "!oldRoom:matrix.org", "10");

        expect(upgradeRoomMock).toHaveBeenCalledTimes(1);
        expect(upgradeRoomMock).toHaveBeenCalledWith("!oldRoom:matrix.org", { version: "10" });
        expect(result).toBe("!newRoom:matrix.org");
      });
    });

    describe("Given an upgrade failure", () => {
      it("should propagate the error", async () => {
        const upgradeRoomMock = vi.fn().mockRejectedValue(new Error("Insufficient power level"));
        const mockClient = {
          upgradeRoom: upgradeRoomMock,
        } as unknown as Parameters<typeof upgradeRoom>[0];

        await expect(upgradeRoom(mockClient, "!room:matrix.org", "11")).rejects.toThrow(
          "Insufficient power level",
        );
      });
    });
  });
});
