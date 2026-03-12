import type { MatrixClient, Room, MatrixEvent } from "matrix-js-sdk";
import type {
  CryptoApi,
  DeviceVerificationStatus,
  EventEncryptionInfo,
  EventShieldColour,
  UserVerificationStatus,
} from "matrix-js-sdk/lib/crypto-api";

/**
 * Encryption status for a room.
 */
export type RoomEncryptionStatus = "encrypted" | "unencrypted";

/**
 * Shield status for an individual message in an encrypted room.
 */
export type MessageShieldStatus = "verified" | "unverified" | "warning" | "none";

/**
 * Device info used in the security settings UI.
 */
export interface DeviceSecurityInfo {
  deviceId: string;
  displayName: string;
  verified: boolean;
  current: boolean;
}

/**
 * Key backup status information.
 */
export interface KeyBackupStatus {
  enabled: boolean;
  version: string | null;
  trusted: boolean;
}

/**
 * Cross-signing status information.
 */
export interface CrossSigningStatusInfo {
  ready: boolean;
  publicKeysOnDevice: boolean;
  privateKeysInSecretStorage: boolean;
  masterKeyCached: boolean;
  selfSigningKeyCached: boolean;
  userSigningKeyCached: boolean;
}

/**
 * Initialize the crypto module on the given MatrixClient.
 *
 * Tries Rust crypto first (v36+), then falls back to legacy crypto.
 * If neither is available, logs a warning and returns without error.
 */
export async function initializeCrypto(client: MatrixClient): Promise<void> {
  try {
    if (typeof client.initRustCrypto === "function") {
      await client.initRustCrypto();
      return;
    }
  } catch (err) {
    console.warn("[E2EE] Rust crypto init failed, trying legacy:", err);
  }

  try {
    if (typeof client.initLegacyCrypto === "function") {
      await client.initLegacyCrypto();
      return;
    }
  } catch (err) {
    console.warn("[E2EE] Legacy crypto init failed:", err);
  }

  console.warn("[E2EE] No crypto module available; encryption is disabled.");
}

/**
 * Check whether a room has an encryption state event.
 */
export function isRoomEncrypted(room: Room): boolean {
  return room.hasEncryptionStateEvent();
}

/**
 * Get the encryption status of a room.
 */
export function getEncryptionStatus(room: Room): RoomEncryptionStatus {
  return isRoomEncrypted(room) ? "encrypted" : "unencrypted";
}

/**
 * Enable encryption for a room by sending the m.room.encryption state event.
 */
export async function enableRoomEncryption(client: MatrixClient, roomId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client as any).sendStateEvent(roomId, "m.room.encryption", {
    algorithm: "m.megolm.v1.aes-sha2",
  });
}

/**
 * Get the CryptoApi from the client, or null if crypto is not initialized.
 */
export function getCrypto(client: MatrixClient): CryptoApi | null {
  return client.getCrypto() ?? null;
}

/**
 * Get the verification status for a user.
 * Returns null if crypto is not available.
 */
export async function getUserVerificationStatus(
  client: MatrixClient,
  userId: string,
): Promise<UserVerificationStatus | null> {
  const crypto = getCrypto(client);
  if (!crypto) return null;
  try {
    return await crypto.getUserVerificationStatus(userId);
  } catch {
    return null;
  }
}

/**
 * Get verification status for a specific device.
 * Returns null if crypto is not available or the device is unknown.
 */
export async function getDeviceVerificationStatus(
  client: MatrixClient,
  userId: string,
  deviceId: string,
): Promise<DeviceVerificationStatus | null> {
  const crypto = getCrypto(client);
  if (!crypto) return null;
  try {
    return await crypto.getDeviceVerificationStatus(userId, deviceId);
  } catch {
    return null;
  }
}

/**
 * Determine the shield status for an encrypted event.
 *
 * - "verified": green shield (sender verified)
 * - "unverified": gray shield (sender unverified)
 * - "warning": red shield (decryption failed or authenticity issue)
 * - "none": no shield (event is not encrypted)
 */
export async function getMessageShieldStatus(
  client: MatrixClient,
  event: MatrixEvent,
): Promise<MessageShieldStatus> {
  if (!event.isEncrypted()) return "none";

  const crypto = getCrypto(client);
  if (!crypto) return "none";

  try {
    const info: EventEncryptionInfo | null = await crypto.getEncryptionInfoForEvent(event);

    if (!info) return "unverified";

    // EventShieldColour: NONE = 0, GREY = 1, RED = 2
    const colour: EventShieldColour = info.shieldColour;
    if (colour === 0) return "verified";
    if (colour === 2) return "warning";
    return "unverified";
  } catch {
    return "warning";
  }
}

/**
 * Check if cross-signing is ready on this device.
 */
export async function isCrossSigningReady(client: MatrixClient): Promise<boolean> {
  const crypto = getCrypto(client);
  if (!crypto) return false;
  try {
    return await crypto.isCrossSigningReady();
  } catch {
    return false;
  }
}

/**
 * Get detailed cross-signing status.
 */
export async function getCrossSigningStatus(client: MatrixClient): Promise<CrossSigningStatusInfo> {
  const crypto = getCrypto(client);
  if (!crypto) {
    return {
      ready: false,
      publicKeysOnDevice: false,
      privateKeysInSecretStorage: false,
      masterKeyCached: false,
      selfSigningKeyCached: false,
      userSigningKeyCached: false,
    };
  }
  try {
    const ready = await crypto.isCrossSigningReady();
    const status = await crypto.getCrossSigningStatus();
    return {
      ready,
      publicKeysOnDevice: status.publicKeysOnDevice,
      privateKeysInSecretStorage: status.privateKeysInSecretStorage,
      masterKeyCached: status.privateKeysCachedLocally.masterKey,
      selfSigningKeyCached: status.privateKeysCachedLocally.selfSigningKey,
      userSigningKeyCached: status.privateKeysCachedLocally.userSigningKey,
    };
  } catch {
    return {
      ready: false,
      publicKeysOnDevice: false,
      privateKeysInSecretStorage: false,
      masterKeyCached: false,
      selfSigningKeyCached: false,
      userSigningKeyCached: false,
    };
  }
}

/**
 * Bootstrap cross-signing keys. Safe to call if already set up.
 */
export async function bootstrapCrossSigning(client: MatrixClient): Promise<void> {
  const crypto = getCrypto(client);
  if (!crypto) {
    throw new Error("Crypto module is not initialized");
  }
  await crypto.bootstrapCrossSigning({});
}

/**
 * Bootstrap secret storage. Safe to call if already set up.
 */
export async function bootstrapSecretStorage(
  client: MatrixClient,
  createKey?: () => Promise<Record<string, unknown>>,
): Promise<void> {
  const crypto = getCrypto(client);
  if (!crypto) {
    throw new Error("Crypto module is not initialized");
  }
  await crypto.bootstrapSecretStorage({
    createSecretStorageKey: createKey as Parameters<
      typeof crypto.bootstrapSecretStorage
    >[0]["createSecretStorageKey"],
  });
}

/**
 * Create a recovery key for secret storage.
 * Returns the encoded recovery key string and the raw private key.
 */
export async function createRecoveryKey(
  client: MatrixClient,
  passphrase?: string,
): Promise<{ encodedPrivateKey: string; privateKey: Uint8Array } | null> {
  const crypto = getCrypto(client);
  if (!crypto) return null;
  try {
    const result = await crypto.createRecoveryKeyFromPassphrase(passphrase);
    return {
      encodedPrivateKey: result.encodedPrivateKey ?? "",
      privateKey: result.privateKey,
    };
  } catch {
    return null;
  }
}

/**
 * Get key backup status.
 */
export async function getKeyBackupStatus(client: MatrixClient): Promise<KeyBackupStatus> {
  const crypto = getCrypto(client);
  if (!crypto) {
    return { enabled: false, version: null, trusted: false };
  }
  try {
    const version = await crypto.getActiveSessionBackupVersion();
    if (!version) {
      return { enabled: false, version: null, trusted: false };
    }
    const info = await crypto.getKeyBackupInfo();
    if (!info) {
      return { enabled: true, version, trusted: false };
    }
    const trust = await crypto.isKeyBackupTrusted(info);
    return {
      enabled: true,
      version,
      trusted: trust.trusted,
    };
  } catch {
    return { enabled: false, version: null, trusted: false };
  }
}

/**
 * Export room keys as a JSON string for the user to save.
 */
export async function exportRoomKeys(client: MatrixClient): Promise<string | null> {
  const crypto = getCrypto(client);
  if (!crypto) return null;
  try {
    return await crypto.exportRoomKeysAsJson();
  } catch {
    return null;
  }
}

/**
 * Import room keys from a JSON string.
 */
export async function importRoomKeys(client: MatrixClient, keysJson: string): Promise<void> {
  const crypto = getCrypto(client);
  if (!crypto) {
    throw new Error("Crypto module is not initialized");
  }
  await crypto.importRoomKeysAsJson(keysJson);
}

/**
 * Get the list of devices for a user, with their verification status.
 */
export async function getUserDevicesWithStatus(
  client: MatrixClient,
  userId: string,
): Promise<DeviceSecurityInfo[]> {
  const crypto = getCrypto(client);
  if (!crypto) return [];
  try {
    const deviceMap = await crypto.getUserDeviceInfo([userId], true);
    const currentDeviceId = client.getDeviceId();
    const devices: DeviceSecurityInfo[] = [];

    const userDevices = deviceMap.get(userId);
    if (userDevices) {
      for (const [deviceId, device] of userDevices) {
        const verificationStatus = await crypto.getDeviceVerificationStatus(userId, deviceId);
        devices.push({
          deviceId,
          displayName: device.displayName ?? deviceId,
          verified: verificationStatus?.isVerified() ?? false,
          current: deviceId === currentDeviceId,
        });
      }
    }

    return devices;
  } catch {
    return [];
  }
}

/**
 * Start a verification request to another user's device via DM.
 */
export async function requestVerificationDM(
  client: MatrixClient,
  userId: string,
  roomId: string,
): Promise<unknown> {
  const crypto = getCrypto(client);
  if (!crypto) {
    throw new Error("Crypto module is not initialized");
  }
  return crypto.requestVerificationDM(userId, roomId);
}

/**
 * Request verification of our own devices (self-verification).
 */
export async function requestOwnUserVerification(client: MatrixClient): Promise<unknown> {
  const crypto = getCrypto(client);
  if (!crypto) {
    throw new Error("Crypto module is not initialized");
  }
  return crypto.requestOwnUserVerification();
}

/**
 * Reset the key backup, creating a new version.
 */
export async function resetKeyBackup(client: MatrixClient): Promise<void> {
  const crypto = getCrypto(client);
  if (!crypto) {
    throw new Error("Crypto module is not initialized");
  }
  await crypto.resetKeyBackup();
}
