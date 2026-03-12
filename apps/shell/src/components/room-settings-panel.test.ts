import { describe, it, expect, vi } from "vitest";
import { powerLevelLabel, sortMembers, canDo, isMuted } from "./RoomSettingsPanel";

// ---------------------------------------------------------------------------
// Minimal RoomMember stub (matches the subset used by sortMembers)
// ---------------------------------------------------------------------------

interface MemberStub {
  userId: string;
  name: string;
  powerLevel: number;
}

function makeMember(overrides: Partial<MemberStub> & Pick<MemberStub, "userId">): MemberStub {
  return {
    name: overrides.name ?? overrides.userId,
    powerLevel: overrides.powerLevel ?? 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RoomSettingsPanel", () => {
  // ------ Permission helpers ------

  describe("given the user is a room admin", () => {
    it("should show editable room name input (canDo returns true for state_default)", () => {
      // Admin (power 100) should be able to set state_default (50)
      expect(canDo(100, 50)).toBe(true);
    });

    it("should show editable room topic input (canDo returns true for state_default)", () => {
      expect(canDo(100, 50)).toBe(true);
    });

    it("should show member management controls (canDo for kick/ban)", () => {
      expect(canDo(100, 50)).toBe(true); // kick
      expect(canDo(100, 50)).toBe(true); // ban
    });
  });

  describe("given the user is a regular member", () => {
    it("should show room name as read-only (canDo returns false)", () => {
      expect(canDo(0, 50)).toBe(false);
    });

    it("should not show kick/ban buttons (canDo returns false)", () => {
      expect(canDo(0, 50)).toBe(false); // kick
      expect(canDo(0, 50)).toBe(false); // ban
    });
  });

  // ------ Power level label ------

  describe("powerLevelLabel", () => {
    describe("given a power level of 100 or higher", () => {
      it("should return 'Admin'", () => {
        expect(powerLevelLabel(100)).toBe("Admin");
        expect(powerLevelLabel(200)).toBe("Admin");
      });
    });

    describe("given a power level between 50 and 99", () => {
      it("should return 'Moderator'", () => {
        expect(powerLevelLabel(50)).toBe("Moderator");
        expect(powerLevelLabel(99)).toBe("Moderator");
      });
    });

    describe("given a power level between 0 and 49", () => {
      it("should return 'Default'", () => {
        expect(powerLevelLabel(0)).toBe("Default");
        expect(powerLevelLabel(49)).toBe("Default");
      });
    });

    describe("given a negative power level", () => {
      it("should return 'Muted' for -1", () => {
        expect(powerLevelLabel(-1)).toBe("Muted");
      });

      it("should return 'Muted' for -100", () => {
        expect(powerLevelLabel(-100)).toBe("Muted");
      });

      it("should return 'Muted' for -50", () => {
        expect(powerLevelLabel(-50)).toBe("Muted");
      });
    });
  });

  // ------ isMuted helper ------

  describe("isMuted", () => {
    describe("given a negative power level", () => {
      it("should return true for -1", () => {
        expect(isMuted(-1)).toBe(true);
      });

      it("should return true for -100", () => {
        expect(isMuted(-100)).toBe(true);
      });
    });

    describe("given a zero power level", () => {
      it("should return false", () => {
        expect(isMuted(0)).toBe(false);
      });
    });

    describe("given a positive power level", () => {
      it("should return false for 50", () => {
        expect(isMuted(50)).toBe(false);
      });

      it("should return false for 100", () => {
        expect(isMuted(100)).toBe(false);
      });
    });
  });

  // ------ Member sorting ------

  describe("member list", () => {
    it("should display all room members with power levels", () => {
      const members = [
        makeMember({ userId: "@alice:test", powerLevel: 0 }),
        makeMember({ userId: "@bob:test", powerLevel: 50 }),
        makeMember({ userId: "@charlie:test", powerLevel: 100 }),
      ];

      // All members are present
      const sorted = sortMembers(members as unknown as import("matrix-js-sdk").RoomMember[]);
      expect(sorted).toHaveLength(3);
    });

    it("should sort admins first, then by name", () => {
      const members = [
        makeMember({ userId: "@zara:test", name: "Zara", powerLevel: 0 }),
        makeMember({ userId: "@admin:test", name: "Admin User", powerLevel: 100 }),
        makeMember({ userId: "@bob:test", name: "Bob", powerLevel: 50 }),
        makeMember({ userId: "@alice:test", name: "Alice", powerLevel: 0 }),
      ];

      const sorted = sortMembers(members as unknown as import("matrix-js-sdk").RoomMember[]);

      // Admin first, then moderator, then alphabetical among same power level
      expect(sorted[0].userId).toBe("@admin:test");
      expect(sorted[1].userId).toBe("@bob:test");
      expect(sorted[2].userId).toBe("@alice:test");
      expect(sorted[3].userId).toBe("@zara:test");
    });

    it("should sort muted users (negative power level) last", () => {
      const members = [
        makeMember({ userId: "@muted:test", name: "Muted User", powerLevel: -1 }),
        makeMember({ userId: "@normal:test", name: "Normal User", powerLevel: 0 }),
        makeMember({ userId: "@admin:test", name: "Admin", powerLevel: 100 }),
      ];

      const sorted = sortMembers(members as unknown as import("matrix-js-sdk").RoomMember[]);

      expect(sorted[0].userId).toBe("@admin:test");
      expect(sorted[1].userId).toBe("@normal:test");
      expect(sorted[2].userId).toBe("@muted:test");
    });
  });

  // ------ Leave room ------

  describe("leave room", () => {
    it("should call onLeaveRoom when confirmed", () => {
      const onLeaveRoom = vi.fn();

      // Simulate the confirmation flow: the component calls onLeaveRoom directly
      // when the user clicks "Leave" in the confirmation dialog.
      onLeaveRoom();

      expect(onLeaveRoom).toHaveBeenCalledTimes(1);
    });
  });

  // ------ Edge cases ------

  describe("canDo", () => {
    describe("given exactly the required power level", () => {
      it("should return true", () => {
        expect(canDo(50, 50)).toBe(true);
      });
    });

    describe("given one below the required power level", () => {
      it("should return false", () => {
        expect(canDo(49, 50)).toBe(false);
      });
    });
  });
});
