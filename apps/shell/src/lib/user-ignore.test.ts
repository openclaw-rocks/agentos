import type { MatrixClient } from "matrix-js-sdk";
import { describe, it, expect, vi } from "vitest";
import { getIgnoredUsers, ignoreUser, unignoreUser, isUserIgnored } from "./user-ignore";

function createMockClient(ignoredUsers: string[] = []): MatrixClient {
  let users = [...ignoredUsers];
  return {
    getIgnoredUsers: vi.fn(() => users),
    setIgnoredUsers: vi.fn(async (newList: string[]) => {
      users = newList;
    }),
  } as unknown as MatrixClient;
}

describe("user-ignore", () => {
  describe("getIgnoredUsers", () => {
    describe("given no ignored users", () => {
      it("should return an empty array", () => {
        const client = createMockClient([]);
        expect(getIgnoredUsers(client)).toEqual([]);
      });
    });

    describe("given some ignored users", () => {
      it("should return the list of ignored user IDs", () => {
        const client = createMockClient(["@troll:matrix.org", "@spam:matrix.org"]);
        expect(getIgnoredUsers(client)).toEqual(["@troll:matrix.org", "@spam:matrix.org"]);
      });
    });
  });

  describe("ignoreUser", () => {
    describe("given a user to ignore", () => {
      it("should add the user to the ignored list", async () => {
        const client = createMockClient([]);
        await ignoreUser(client, "@troll:matrix.org");
        expect(client.setIgnoredUsers).toHaveBeenCalledWith(["@troll:matrix.org"]);
      });
    });

    describe("given a user that is already ignored", () => {
      it("should not duplicate the user in the list", async () => {
        const client = createMockClient(["@troll:matrix.org"]);
        await ignoreUser(client, "@troll:matrix.org");
        expect(client.setIgnoredUsers).not.toHaveBeenCalled();
      });
    });

    describe("given existing ignored users", () => {
      it("should append the new user to the existing list", async () => {
        const client = createMockClient(["@existing:matrix.org"]);
        await ignoreUser(client, "@new:matrix.org");
        expect(client.setIgnoredUsers).toHaveBeenCalledWith([
          "@existing:matrix.org",
          "@new:matrix.org",
        ]);
      });
    });
  });

  describe("unignoreUser", () => {
    describe("given an ignored user to unignore", () => {
      it("should remove the user from the list", async () => {
        const client = createMockClient(["@troll:matrix.org", "@spam:matrix.org"]);
        await unignoreUser(client, "@troll:matrix.org");
        expect(client.setIgnoredUsers).toHaveBeenCalledWith(["@spam:matrix.org"]);
      });
    });

    describe("given a user that is not in the ignored list", () => {
      it("should call setIgnoredUsers with the unchanged list", async () => {
        const client = createMockClient(["@other:matrix.org"]);
        await unignoreUser(client, "@nonexistent:matrix.org");
        expect(client.setIgnoredUsers).toHaveBeenCalledWith(["@other:matrix.org"]);
      });
    });
  });

  describe("isUserIgnored", () => {
    describe("given an ignored user", () => {
      it("should return true", () => {
        const client = createMockClient(["@troll:matrix.org"]);
        expect(isUserIgnored(client, "@troll:matrix.org")).toBe(true);
      });
    });

    describe("given a non-ignored user", () => {
      it("should return false", () => {
        const client = createMockClient(["@troll:matrix.org"]);
        expect(isUserIgnored(client, "@friend:matrix.org")).toBe(false);
      });
    });

    describe("given an empty ignore list", () => {
      it("should return false", () => {
        const client = createMockClient([]);
        expect(isUserIgnored(client, "@anyone:matrix.org")).toBe(false);
      });
    });
  });
});
