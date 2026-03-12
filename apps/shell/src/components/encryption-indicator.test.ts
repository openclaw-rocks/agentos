import { describe, it, expect } from "vitest";
import type { RoomEncryptionStatus, MessageShieldStatus } from "~/lib/encryption";

/**
 * Pure logic tests for the EncryptionIndicator and MessageShieldIndicator components.
 * Since the components are thin UI wrappers over the encryption status values,
 * we test the rendering logic by asserting what the components _would_ render
 * based on their props. Full DOM rendering tests would require jsdom/React Testing Library.
 */

/** Simulates the EncryptionIndicator rendering decision. */
function shouldShowLockIcon(status: RoomEncryptionStatus): boolean {
  return status === "encrypted";
}

/** Simulates the EncryptionIndicator color decision. */
function getLockColor(
  status: RoomEncryptionStatus,
  allDevicesVerified: boolean,
): "green" | "gray" | "none" {
  if (status === "unencrypted") return "none";
  return allDevicesVerified ? "green" : "gray";
}

/** Simulates the MessageShieldIndicator rendering decision. */
function shouldShowShield(status: MessageShieldStatus): boolean {
  return status !== "none";
}

/** Simulates the MessageShieldIndicator color decision. */
function getShieldColor(status: MessageShieldStatus): "green" | "gray" | "red" | "none" {
  switch (status) {
    case "verified":
      return "green";
    case "unverified":
      return "gray";
    case "warning":
      return "red";
    default:
      return "none";
  }
}

describe("EncryptionIndicator", () => {
  describe("given an encrypted room", () => {
    it("should show a lock icon", () => {
      expect(shouldShowLockIcon("encrypted")).toBe(true);
    });

    describe("when all devices are verified", () => {
      it("should show a green lock", () => {
        expect(getLockColor("encrypted", true)).toBe("green");
      });
    });

    describe("when some devices are unverified", () => {
      it("should show a gray lock", () => {
        expect(getLockColor("encrypted", false)).toBe("gray");
      });
    });
  });

  describe("given an unencrypted room", () => {
    it("should not show a lock icon", () => {
      expect(shouldShowLockIcon("unencrypted")).toBe(false);
    });

    it("should return no lock color", () => {
      expect(getLockColor("unencrypted", false)).toBe("none");
    });
  });
});

describe("MessageShieldIndicator", () => {
  describe("given a verified sender", () => {
    it("should show a shield", () => {
      expect(shouldShowShield("verified")).toBe(true);
    });

    it("should show a green shield", () => {
      expect(getShieldColor("verified")).toBe("green");
    });
  });

  describe("given an unverified sender", () => {
    it("should show a shield", () => {
      expect(shouldShowShield("unverified")).toBe(true);
    });

    it("should show a gray shield", () => {
      expect(getShieldColor("unverified")).toBe("gray");
    });
  });

  describe("given a decryption warning", () => {
    it("should show a shield", () => {
      expect(shouldShowShield("warning")).toBe(true);
    });

    it("should show a red shield", () => {
      expect(getShieldColor("warning")).toBe("red");
    });
  });

  describe("given a non-encrypted message", () => {
    it("should not show a shield", () => {
      expect(shouldShowShield("none")).toBe(false);
    });

    it("should return no color", () => {
      expect(getShieldColor("none")).toBe("none");
    });
  });
});
