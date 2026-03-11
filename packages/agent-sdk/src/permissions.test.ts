import { describe, it, expect, beforeEach } from "vitest";
import { PermissionManager, DEFAULT_ROLE_PERMISSIONS } from "./permissions.js";

describe("PermissionManager", () => {
  let manager: PermissionManager;

  beforeEach(() => {
    manager = new PermissionManager();
  });

  // ── setPermissions and hasPermission ─────────────────────────────

  describe("given permissions are set for an agent in a space", () => {
    beforeEach(() => {
      manager.setPermissions("agent-a", "space-1", ["read_messages", "send_messages"]);
    });

    it("then hasPermission should return true for a granted permission", () => {
      expect(manager.hasPermission("agent-a", "space-1", "read_messages")).toBe(true);
    });

    it("then hasPermission should return true for another granted permission", () => {
      expect(manager.hasPermission("agent-a", "space-1", "send_messages")).toBe(true);
    });

    it("then hasPermission should return false for a non-granted permission", () => {
      expect(manager.hasPermission("agent-a", "space-1", "write_state")).toBe(false);
    });

    it("then hasPermission should return false for an unknown agent", () => {
      expect(manager.hasPermission("agent-z", "space-1", "read_messages")).toBe(false);
    });

    it("then hasPermission should return false for an unknown space", () => {
      expect(manager.hasPermission("agent-a", "space-999", "read_messages")).toBe(false);
    });
  });

  // ── grant ────────────────────────────────────────────────────────

  describe("given an individual permission is granted", () => {
    it("then the agent should have that permission", () => {
      manager.setPermissions("agent-a", "space-1", ["read_messages"]);
      manager.grant("agent-a", "space-1", "write_state");

      expect(manager.hasPermission("agent-a", "space-1", "write_state")).toBe(true);
      expect(manager.hasPermission("agent-a", "space-1", "read_messages")).toBe(true);
    });

    it("then granting the same permission twice should not duplicate it", () => {
      manager.setPermissions("agent-a", "space-1", ["read_messages"]);
      manager.grant("agent-a", "space-1", "read_messages");

      const perms = manager.getPermissions("agent-a", "space-1");
      const count = perms!.granted.filter((s) => s === "read_messages").length;
      expect(count).toBe(1);
    });

    it("then granting to a new agent should create permissions", () => {
      manager.grant("agent-new", "space-1", "read_messages");

      expect(manager.hasPermission("agent-new", "space-1", "read_messages")).toBe(true);
    });
  });

  // ── revoke ───────────────────────────────────────────────────────

  describe("given a permission is revoked", () => {
    it("then the agent should no longer have that permission", () => {
      manager.setPermissions("agent-a", "space-1", ["read_messages", "send_messages"]);
      manager.revoke("agent-a", "space-1", "send_messages");

      expect(manager.hasPermission("agent-a", "space-1", "send_messages")).toBe(false);
      expect(manager.hasPermission("agent-a", "space-1", "read_messages")).toBe(true);
    });

    it("then revoking adds to denied list", () => {
      manager.setPermissions("agent-a", "space-1", ["read_messages"]);
      manager.revoke("agent-a", "space-1", "read_messages");

      const perms = manager.getPermissions("agent-a", "space-1");
      expect(perms!.denied).toContain("read_messages");
    });

    it("then revoking for unknown agent creates denied entry", () => {
      manager.revoke("agent-new", "space-1", "send_messages");

      expect(manager.hasPermission("agent-new", "space-1", "send_messages")).toBe(false);
      const perms = manager.getPermissions("agent-new", "space-1");
      expect(perms!.denied).toContain("send_messages");
    });
  });

  // ── enforce ──────────────────────────────────────────────────────

  describe("given enforce is called", () => {
    it("then it should throw when the permission is denied", () => {
      manager.setPermissions("agent-a", "space-1", ["read_messages"]);

      expect(() => manager.enforce("agent-a", "space-1", "write_state")).toThrow(
        'Permission denied: agent "agent-a" does not have "write_state" permission in space "space-1"',
      );
    });

    it("then it should not throw when the permission is granted", () => {
      manager.setPermissions("agent-a", "space-1", ["read_messages"]);

      expect(() => manager.enforce("agent-a", "space-1", "read_messages")).not.toThrow();
    });

    it("then it should throw for unknown agents", () => {
      expect(() => manager.enforce("unknown", "space-1", "read_messages")).toThrow(
        /Permission denied/,
      );
    });
  });

  // ── getPermissions ───────────────────────────────────────────────

  describe("given getPermissions is called", () => {
    it("then it should return null for an unknown agent", () => {
      expect(manager.getPermissions("unknown", "space-1")).toBeNull();
    });

    it("then it should return the permissions object for a known agent", () => {
      manager.setPermissions("agent-a", "space-1", ["read_messages"]);

      const perms = manager.getPermissions("agent-a", "space-1");
      expect(perms).not.toBeNull();
      expect(perms!.agentId).toBe("agent-a");
      expect(perms!.spaceId).toBe("space-1");
      expect(perms!.granted).toEqual(["read_messages"]);
    });
  });

  // ── default role permissions ─────────────────────────────────────

  describe("given default role permissions are requested", () => {
    it("then primary role should have read_messages, send_messages, read_state, write_state", () => {
      const perms = PermissionManager.getDefaultsForRole("primary");
      expect(perms).toEqual(["read_messages", "send_messages", "read_state", "write_state"]);
    });

    it("then specialist role should have read_messages, send_messages, read_state", () => {
      const perms = PermissionManager.getDefaultsForRole("specialist");
      expect(perms).toEqual(["read_messages", "send_messages", "read_state"]);
    });

    it("then background role should have read_state, proactive", () => {
      const perms = PermissionManager.getDefaultsForRole("background");
      expect(perms).toEqual(["read_state", "proactive"]);
    });

    it("then an unknown role should return an empty array", () => {
      const perms = PermissionManager.getDefaultsForRole("nonexistent");
      expect(perms).toEqual([]);
    });
  });

  // ── recordConsent ────────────────────────────────────────────────

  describe("given consent is recorded", () => {
    it("then consentedAt and consentedBy should be set", () => {
      manager.setPermissions("agent-a", "space-1", ["read_messages"]);
      const before = Date.now();
      manager.recordConsent("agent-a", "space-1", "user-1");

      const perms = manager.getPermissions("agent-a", "space-1");
      expect(perms!.consentedBy).toBe("user-1");
      expect(perms!.consentedAt).toBeGreaterThanOrEqual(before);
      expect(perms!.consentedAt).toBeLessThanOrEqual(Date.now());
    });

    it("then recording consent for unknown agent creates entry", () => {
      manager.recordConsent("agent-new", "space-1", "user-1");

      const perms = manager.getPermissions("agent-new", "space-1");
      expect(perms).not.toBeNull();
      expect(perms!.consentedBy).toBe("user-1");
    });
  });

  // ── multiple spaces per agent ────────────────────────────────────

  describe("given an agent has permissions in multiple spaces", () => {
    beforeEach(() => {
      manager.setPermissions("agent-a", "space-1", ["read_messages"]);
      manager.setPermissions("agent-a", "space-2", ["send_messages"]);
    });

    it("then permissions should be independent per space", () => {
      expect(manager.hasPermission("agent-a", "space-1", "read_messages")).toBe(true);
      expect(manager.hasPermission("agent-a", "space-1", "send_messages")).toBe(false);

      expect(manager.hasPermission("agent-a", "space-2", "send_messages")).toBe(true);
      expect(manager.hasPermission("agent-a", "space-2", "read_messages")).toBe(false);
    });

    it("then revoking in one space should not affect the other", () => {
      manager.revoke("agent-a", "space-1", "read_messages");

      expect(manager.hasPermission("agent-a", "space-1", "read_messages")).toBe(false);
      expect(manager.hasPermission("agent-a", "space-2", "send_messages")).toBe(true);
    });
  });

  // ── DEFAULT_ROLE_PERMISSIONS constant ────────────────────────────

  describe("given the DEFAULT_ROLE_PERMISSIONS constant", () => {
    it("then it should contain expected roles", () => {
      expect(Object.keys(DEFAULT_ROLE_PERMISSIONS)).toEqual(
        expect.arrayContaining(["primary", "specialist", "background"]),
      );
    });
  });
});
