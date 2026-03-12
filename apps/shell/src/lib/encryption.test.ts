import { describe, it, expect, vi } from "vitest";
import {
  isRoomEncrypted,
  getEncryptionStatus,
  getCrypto,
  getMessageShieldStatus,
  isCrossSigningReady,
  getKeyBackupStatus,
  getUserVerificationStatus,
  getDeviceVerificationStatus,
} from "./encryption";

/**
 * Minimal stub for sdk.Room.
 */
function createRoom(opts: { hasEncryption: boolean }) {
  return {
    roomId: "!room:test",
    hasEncryptionStateEvent: () => opts.hasEncryption,
  } as Parameters<typeof isRoomEncrypted>[0];
}

/**
 * Minimal stub for sdk.MatrixClient with optional crypto.
 */
function createClient(opts: { hasCrypto?: boolean } = {}) {
  const cryptoApi = opts.hasCrypto
    ? {
        isCrossSigningReady: vi.fn().mockResolvedValue(true),
        getCrossSigningStatus: vi.fn().mockResolvedValue({
          publicKeysOnDevice: true,
          privateKeysInSecretStorage: true,
          privateKeysCachedLocally: {
            masterKey: true,
            selfSigningKey: true,
            userSigningKey: true,
          },
        }),
        getActiveSessionBackupVersion: vi.fn().mockResolvedValue("1"),
        getKeyBackupInfo: vi.fn().mockResolvedValue({ algorithm: "m.megolm.v1.aes-sha2" }),
        isKeyBackupTrusted: vi.fn().mockResolvedValue({ trusted: true }),
        getEncryptionInfoForEvent: vi.fn().mockResolvedValue({
          shieldColour: 0,
          shieldReason: null,
        }),
        getUserVerificationStatus: vi.fn().mockResolvedValue({
          isVerified: () => true,
          isCrossSigningVerified: () => true,
        }),
        getDeviceVerificationStatus: vi.fn().mockResolvedValue({
          isVerified: () => true,
          signedByOwner: true,
          crossSigningVerified: true,
          localVerified: false,
        }),
      }
    : undefined;

  return {
    getCrypto: () => cryptoApi,
    getUserId: () => "@alice:test",
    getDeviceId: () => "DEVICE1",
    initRustCrypto: vi.fn().mockResolvedValue(undefined),
    initLegacyCrypto: vi.fn().mockResolvedValue(undefined),
  } as unknown as Parameters<typeof getCrypto>[0];
}

/**
 * Minimal stub for sdk.MatrixEvent.
 */
function createMatrixEvent(opts: { encrypted: boolean }) {
  return {
    isEncrypted: () => opts.encrypted,
    getId: () => "$event1",
    getType: () => "m.room.message",
  } as unknown as Parameters<typeof getMessageShieldStatus>[1];
}

describe("Encryption", () => {
  describe("isRoomEncrypted", () => {
    describe("given a room with an encryption state event", () => {
      it("should return true", () => {
        const room = createRoom({ hasEncryption: true });
        expect(isRoomEncrypted(room)).toBe(true);
      });
    });

    describe("given a room without an encryption state event", () => {
      it("should return false", () => {
        const room = createRoom({ hasEncryption: false });
        expect(isRoomEncrypted(room)).toBe(false);
      });
    });
  });

  describe("getEncryptionStatus", () => {
    describe("given an encrypted room", () => {
      it("should return 'encrypted'", () => {
        const room = createRoom({ hasEncryption: true });
        expect(getEncryptionStatus(room)).toBe("encrypted");
      });
    });

    describe("given an unencrypted room", () => {
      it("should return 'unencrypted'", () => {
        const room = createRoom({ hasEncryption: false });
        expect(getEncryptionStatus(room)).toBe("unencrypted");
      });
    });
  });

  describe("getCrypto", () => {
    describe("given a client with crypto initialized", () => {
      it("should return the CryptoApi", () => {
        const client = createClient({ hasCrypto: true });
        expect(getCrypto(client)).not.toBeNull();
      });
    });

    describe("given a client without crypto", () => {
      it("should return null", () => {
        const client = createClient({ hasCrypto: false });
        expect(getCrypto(client)).toBeNull();
      });
    });
  });

  describe("getMessageShieldStatus", () => {
    describe("given a non-encrypted event", () => {
      it("should return 'none'", async () => {
        const client = createClient({ hasCrypto: true });
        const event = createMatrixEvent({ encrypted: false });
        const status = await getMessageShieldStatus(client, event);
        expect(status).toBe("none");
      });
    });

    describe("given an encrypted event with verified sender", () => {
      it("should return 'verified'", async () => {
        const client = createClient({ hasCrypto: true });
        const event = createMatrixEvent({ encrypted: true });
        const status = await getMessageShieldStatus(client, event);
        expect(status).toBe("verified");
      });
    });

    describe("given an encrypted event with no crypto available", () => {
      it("should return 'none'", async () => {
        const client = createClient({ hasCrypto: false });
        const event = createMatrixEvent({ encrypted: true });
        const status = await getMessageShieldStatus(client, event);
        expect(status).toBe("none");
      });
    });

    describe("given an encrypted event with grey shield", () => {
      it("should return 'unverified'", async () => {
        const client = createClient({ hasCrypto: true });
        const crypto = client.getCrypto();
        // EventShieldColour.GREY = 1
        (crypto as unknown as Record<string, unknown>).getEncryptionInfoForEvent = vi
          .fn()
          .mockResolvedValue({ shieldColour: 1, shieldReason: 1 });

        const event = createMatrixEvent({ encrypted: true });
        const status = await getMessageShieldStatus(client, event);
        expect(status).toBe("unverified");
      });
    });

    describe("given an encrypted event with red shield", () => {
      it("should return 'warning'", async () => {
        const client = createClient({ hasCrypto: true });
        const crypto = client.getCrypto();
        // EventShieldColour.RED = 2
        (crypto as unknown as Record<string, unknown>).getEncryptionInfoForEvent = vi
          .fn()
          .mockResolvedValue({ shieldColour: 2, shieldReason: 3 });

        const event = createMatrixEvent({ encrypted: true });
        const status = await getMessageShieldStatus(client, event);
        expect(status).toBe("warning");
      });
    });
  });

  describe("isCrossSigningReady", () => {
    describe("given crypto is available and cross-signing is ready", () => {
      it("should return true", async () => {
        const client = createClient({ hasCrypto: true });
        const result = await isCrossSigningReady(client);
        expect(result).toBe(true);
      });
    });

    describe("given crypto is not available", () => {
      it("should return false", async () => {
        const client = createClient({ hasCrypto: false });
        const result = await isCrossSigningReady(client);
        expect(result).toBe(false);
      });
    });
  });

  describe("getKeyBackupStatus", () => {
    describe("given key backup is active and trusted", () => {
      it("should return enabled=true with version and trusted", async () => {
        const client = createClient({ hasCrypto: true });
        const status = await getKeyBackupStatus(client);
        expect(status.enabled).toBe(true);
        expect(status.version).toBe("1");
        expect(status.trusted).toBe(true);
      });
    });

    describe("given crypto is not available", () => {
      it("should return enabled=false", async () => {
        const client = createClient({ hasCrypto: false });
        const status = await getKeyBackupStatus(client);
        expect(status.enabled).toBe(false);
        expect(status.version).toBeNull();
        expect(status.trusted).toBe(false);
      });
    });
  });

  describe("getUserVerificationStatus", () => {
    describe("given crypto is available", () => {
      it("should return the user verification status", async () => {
        const client = createClient({ hasCrypto: true });
        const status = await getUserVerificationStatus(client, "@bob:test");
        expect(status).not.toBeNull();
        expect(status?.isVerified()).toBe(true);
      });
    });

    describe("given crypto is not available", () => {
      it("should return null", async () => {
        const client = createClient({ hasCrypto: false });
        const status = await getUserVerificationStatus(client, "@bob:test");
        expect(status).toBeNull();
      });
    });
  });

  describe("getDeviceVerificationStatus", () => {
    describe("given crypto is available", () => {
      it("should return the device verification status", async () => {
        const client = createClient({ hasCrypto: true });
        const status = await getDeviceVerificationStatus(client, "@bob:test", "DEVICEX");
        expect(status).not.toBeNull();
        expect(status?.isVerified()).toBe(true);
      });
    });

    describe("given crypto is not available", () => {
      it("should return null", async () => {
        const client = createClient({ hasCrypto: false });
        const status = await getDeviceVerificationStatus(client, "@bob:test", "DEVICEX");
        expect(status).toBeNull();
      });
    });
  });
});
