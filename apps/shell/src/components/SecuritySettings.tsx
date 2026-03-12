import React, { useCallback, useEffect, useState } from "react";
import { DeviceVerification } from "./DeviceVerification";
import { KeyBackupSetup } from "./KeyBackupSetup";
import {
  exportRoomKeys,
  getCrossSigningStatus,
  getKeyBackupStatus,
  getUserDevicesWithStatus,
  importRoomKeys,
  type CrossSigningStatusInfo,
  type DeviceSecurityInfo,
  type KeyBackupStatus,
} from "~/lib/encryption";
import { useMatrix } from "~/lib/matrix-context";
import { loadSettings, saveSettings } from "~/lib/theme";

/**
 * Security section for the settings panel.
 *
 * Shows: cross-signing status, key backup status, device list with
 * verification status, export/import keys buttons.
 */
export function SecuritySettings(): React.ReactElement {
  const { client } = useMatrix();
  const [crossSigningStatus, setCrossSigningStatus] = useState<CrossSigningStatusInfo | null>(null);
  const [backupStatus, setBackupStatus] = useState<KeyBackupStatus | null>(null);
  const [devices, setDevices] = useState<DeviceSecurityInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showVerification, setShowVerification] = useState(false);
  const [showBackupSetup, setShowBackupSetup] = useState(false);
  const [exportStatus, setExportStatus] = useState<"idle" | "exporting" | "done" | "error">("idle");
  const [importStatus, setImportStatus] = useState<"idle" | "importing" | "done" | "error">("idle");
  const [importError, setImportError] = useState("");

  // Security preference toggles (persisted in AppSettings)
  const [neverSendToUnverified, setNeverSendToUnverified] = useState(
    () => loadSettings().neverSendToUnverified,
  );
  const [enableEncryptedSearch, setEnableEncryptedSearch] = useState(
    () => loadSettings().enableEncryptedSearch,
  );

  const loadSecurityInfo = useCallback(async () => {
    setLoading(true);
    try {
      const userId = client.getUserId();
      const [csStatus, kbStatus, deviceList] = await Promise.all([
        getCrossSigningStatus(client),
        getKeyBackupStatus(client),
        userId ? getUserDevicesWithStatus(client, userId) : Promise.resolve([]),
      ]);
      setCrossSigningStatus(csStatus);
      setBackupStatus(kbStatus);
      setDevices(deviceList);
    } catch {
      // Gracefully handle errors
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadSecurityInfo();
  }, [loadSecurityInfo]);

  const handleExportKeys = useCallback(async () => {
    setExportStatus("exporting");
    try {
      const keysJson = await exportRoomKeys(client);
      if (!keysJson) {
        setExportStatus("error");
        return;
      }

      // Download as file
      const blob = new Blob([keysJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `openclaw-keys-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportStatus("done");
      setTimeout(() => setExportStatus("idle"), 3000);
    } catch {
      setExportStatus("error");
      setTimeout(() => setExportStatus("idle"), 3000);
    }
  }, [client]);

  const handleImportKeys = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      setImportStatus("importing");
      setImportError("");

      try {
        const text = await file.text();
        await importRoomKeys(client, text);
        setImportStatus("done");
        setTimeout(() => setImportStatus("idle"), 3000);
      } catch (err) {
        setImportStatus("error");
        setImportError(err instanceof Error ? err.message : "Import failed");
        setTimeout(() => setImportStatus("idle"), 5000);
      }
    };

    input.click();
  }, [client]);

  if (showVerification) {
    const userId = client.getUserId() ?? "";
    return (
      <DeviceVerification
        userId={userId}
        onClose={() => {
          setShowVerification(false);
          loadSecurityInfo();
        }}
      />
    );
  }

  if (showBackupSetup) {
    return (
      <KeyBackupSetup
        onClose={() => {
          setShowBackupSetup(false);
          loadSecurityInfo();
        }}
      />
    );
  }

  return (
    <div>
      <h3 className="text-lg font-bold text-text-primary mb-4">Security</h3>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-text-muted py-4">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Loading security information...
        </div>
      )}

      {!loading && (
        <>
          {/* Cross-Signing Status */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-text-primary mb-2">Cross-Signing</h4>
            <div className="p-3 bg-surface-2 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    crossSigningStatus?.ready ? "bg-status-success" : "bg-status-error"
                  }`}
                />
                <span className="text-sm text-text-primary">
                  {crossSigningStatus?.ready
                    ? "Cross-signing is set up"
                    : "Cross-signing not set up"}
                </span>
              </div>
              {crossSigningStatus && (
                <div className="space-y-1 text-xs text-text-muted">
                  <p>
                    Public keys on device: {crossSigningStatus.publicKeysOnDevice ? "Yes" : "No"}
                  </p>
                  <p>
                    Private keys in storage:{" "}
                    {crossSigningStatus.privateKeysInSecretStorage ? "Yes" : "No"}
                  </p>
                  <p>
                    Cached locally: master={crossSigningStatus.masterKeyCached ? "yes" : "no"},
                    self-signing={crossSigningStatus.selfSigningKeyCached ? "yes" : "no"},
                    user-signing={crossSigningStatus.userSigningKeyCached ? "yes" : "no"}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Key Backup Status */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-text-primary mb-2">Key Backup</h4>
            <div className="p-3 bg-surface-2 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      backupStatus?.enabled ? "bg-status-success" : "bg-status-error"
                    }`}
                  />
                  <span className="text-sm text-text-primary">
                    {backupStatus?.enabled
                      ? `Backup active (v${backupStatus.version})`
                      : "Backup not enabled"}
                  </span>
                </div>
                <button
                  onClick={() => setShowBackupSetup(true)}
                  className="px-3 py-1 text-xs text-accent hover:text-accent-hover transition-colors"
                >
                  {backupStatus?.enabled ? "Manage" : "Set up"}
                </button>
              </div>
              {backupStatus?.enabled && (
                <p className="text-xs text-text-muted mt-1">
                  Trusted: {backupStatus.trusted ? "Yes" : "No"}
                </p>
              )}
            </div>
          </div>

          {/* Device List */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-text-primary">Devices</h4>
              <button
                onClick={() => setShowVerification(true)}
                className="px-3 py-1 text-xs text-accent hover:text-accent-hover transition-colors"
              >
                Verify devices
              </button>
            </div>
            <div className="space-y-2">
              {devices.map((device) => (
                <div
                  key={device.deviceId}
                  className={`p-3 rounded-lg border transition-colors ${
                    device.current ? "bg-accent/10 border-accent/30" : "bg-surface-2 border-border"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          device.verified ? "bg-status-success" : "bg-surface-4"
                        }`}
                      />
                      <span className="text-sm text-text-primary">{device.displayName}</span>
                      {device.current && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-accent/20 text-accent rounded">
                          Current
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-text-muted">
                      {device.verified ? "Verified" : "Unverified"}
                    </span>
                  </div>
                  <p className="text-[10px] text-text-muted mt-0.5">{device.deviceId}</p>
                </div>
              ))}
              {devices.length === 0 && (
                <p className="text-sm text-text-muted p-3 bg-surface-2 rounded-lg">
                  No device information available. Encryption may not be initialized.
                </p>
              )}
            </div>
          </div>

          {/* Export / Import Keys */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-text-primary mb-2">Key Management</h4>
            <div className="flex gap-2">
              <button
                onClick={handleExportKeys}
                disabled={exportStatus === "exporting"}
                className="px-4 py-2 text-sm bg-surface-2 hover:bg-surface-3 text-text-secondary border border-border rounded-lg transition-colors disabled:opacity-50"
              >
                {exportStatus === "exporting"
                  ? "Exporting..."
                  : exportStatus === "done"
                    ? "Exported!"
                    : exportStatus === "error"
                      ? "Export failed"
                      : "Export keys"}
              </button>
              <button
                onClick={handleImportKeys}
                disabled={importStatus === "importing"}
                className="px-4 py-2 text-sm bg-surface-2 hover:bg-surface-3 text-text-secondary border border-border rounded-lg transition-colors disabled:opacity-50"
              >
                {importStatus === "importing"
                  ? "Importing..."
                  : importStatus === "done"
                    ? "Imported!"
                    : importStatus === "error"
                      ? "Import failed"
                      : "Import keys"}
              </button>
            </div>
            {importStatus === "error" && importError && (
              <p className="text-xs text-status-error mt-1">{importError}</p>
            )}
            <p className="text-xs text-text-muted mt-2">
              Export your encryption keys to restore message history on other devices. Import
              previously exported keys to decrypt old messages.
            </p>
          </div>

          {/* Security Preferences */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-text-primary mb-3">Security Preferences</h4>

            {/* Never Send to Unverified Toggle */}
            <label className="flex items-center justify-between py-3 cursor-pointer">
              <div className="flex-1 pr-4">
                <span className="text-sm text-text-secondary">
                  Never send encrypted messages to unverified sessions
                </span>
                <p className="text-xs text-text-muted mt-0.5">
                  When enabled, messages will not be sent to sessions that have not been verified.
                  This improves security but may prevent some users from reading messages.
                </p>
              </div>
              <button
                role="switch"
                aria-checked={neverSendToUnverified}
                onClick={() => {
                  const next = !neverSendToUnverified;
                  setNeverSendToUnverified(next);
                  const settings = loadSettings();
                  settings.neverSendToUnverified = next;
                  saveSettings(settings);
                  // Apply to Matrix client if the API is available
                  try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const c = client as any;
                    if (typeof c.setGlobalBlacklistUnverifiedDevices === "function") {
                      c.setGlobalBlacklistUnverifiedDevices(next);
                    }
                  } catch {
                    // Ignore if API not available
                  }
                }}
                className={`relative flex-shrink-0 w-10 h-5 rounded-full transition-colors ${neverSendToUnverified ? "bg-accent" : "bg-surface-3"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${neverSendToUnverified ? "translate-x-5" : ""}`}
                />
              </button>
            </label>

            {/* Encrypted Room Search Toggle */}
            <label className="flex items-center justify-between py-3 cursor-pointer">
              <div className="flex-1 pr-4">
                <span className="text-sm text-text-secondary">
                  Enable search in encrypted rooms
                </span>
                <p className="text-xs text-text-muted mt-0.5">
                  This stores an encrypted search index on this device. Search results for encrypted
                  rooms will only be available on this device.
                </p>
              </div>
              <button
                role="switch"
                aria-checked={enableEncryptedSearch}
                onClick={() => {
                  const next = !enableEncryptedSearch;
                  setEnableEncryptedSearch(next);
                  const settings = loadSettings();
                  settings.enableEncryptedSearch = next;
                  saveSettings(settings);
                }}
                className={`relative flex-shrink-0 w-10 h-5 rounded-full transition-colors ${enableEncryptedSearch ? "bg-accent" : "bg-surface-3"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${enableEncryptedSearch ? "translate-x-5" : ""}`}
                />
              </button>
            </label>
          </div>
        </>
      )}
    </div>
  );
}
