import React, { useCallback, useEffect, useState } from "react";
import {
  bootstrapCrossSigning,
  bootstrapSecretStorage,
  createRecoveryKey,
  getKeyBackupStatus,
  resetKeyBackup,
  type KeyBackupStatus,
} from "~/lib/encryption";
import { useMatrix } from "~/lib/matrix-context";

type SetupStep = "status" | "creating" | "show-key" | "done" | "error";

interface KeyBackupSetupProps {
  onClose: () => void;
}

/**
 * Key backup setup and recovery UI.
 *
 * - Setup: create recovery key, store backup on server
 * - Show recovery key for user to copy
 * - Display backup status (enabled/disabled)
 */
export function KeyBackupSetup({ onClose }: KeyBackupSetupProps): React.ReactElement {
  const { client } = useMatrix();
  const [step, setStep] = useState<SetupStep>("status");
  const [backupStatus, setBackupStatus] = useState<KeyBackupStatus | null>(null);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const status = await getKeyBackupStatus(client);
      setBackupStatus(status);
    } catch {
      setBackupStatus({ enabled: false, version: null, trusted: false });
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleSetup = useCallback(async () => {
    setStep("creating");
    setErrorMessage("");

    try {
      // Step 1: Bootstrap cross-signing
      await bootstrapCrossSigning(client);

      // Step 2: Create a recovery key
      const keyResult = await createRecoveryKey(client);
      if (!keyResult) {
        throw new Error("Failed to create recovery key");
      }

      const encodedKey = keyResult.encodedPrivateKey;
      setRecoveryKey(encodedKey);

      // Step 3: Bootstrap secret storage with the key
      await bootstrapSecretStorage(client, async () => ({
        privateKey: keyResult.privateKey,
        encodedPrivateKey: encodedKey,
      }));

      // Step 4: Create key backup
      await resetKeyBackup(client);

      setStep("show-key");
    } catch (err) {
      setStep("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to set up key backup");
    }
  }, [client]);

  const handleCopyKey = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text for manual copy
    }
  }, [recoveryKey]);

  const handleDone = useCallback(() => {
    setStep("done");
    loadStatus();
  }, [loadStatus]);

  return (
    <div className="p-4 bg-surface-1 border border-border rounded-xl max-w-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-text-primary">Key Backup</h3>
        <button
          onClick={onClose}
          className="p-1 text-text-muted hover:text-text-primary transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-text-muted py-4">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Loading backup status...
        </div>
      )}

      {!loading && step === "status" && backupStatus && (
        <div>
          <div className="mb-4 p-3 bg-surface-2 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  backupStatus.enabled ? "bg-status-success" : "bg-status-error"
                }`}
              />
              <span className="text-sm font-medium text-text-primary">
                {backupStatus.enabled ? "Key backup enabled" : "Key backup not set up"}
              </span>
            </div>
            {backupStatus.enabled && (
              <>
                <p className="text-xs text-text-muted">
                  Version: {backupStatus.version ?? "unknown"}
                </p>
                <p className="text-xs text-text-muted">
                  Trusted: {backupStatus.trusted ? "Yes" : "No"}
                </p>
              </>
            )}
          </div>

          {!backupStatus.enabled && (
            <div>
              <p className="text-sm text-text-secondary mb-3">
                Set up key backup to secure your message history. If you lose access to your
                devices, the recovery key lets you restore encrypted messages.
              </p>
              <button
                onClick={handleSetup}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-inverse text-sm font-medium rounded-lg transition-colors"
              >
                Set Up Key Backup
              </button>
            </div>
          )}

          {backupStatus.enabled && (
            <p className="text-xs text-text-muted">
              Your messages are being backed up. Keep your recovery key safe to restore messages on
              new devices.
            </p>
          )}
        </div>
      )}

      {step === "creating" && (
        <div className="flex items-center gap-3 py-4">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-text-secondary">Setting up encryption backup...</p>
        </div>
      )}

      {step === "show-key" && (
        <div>
          <div className="mb-3 p-3 bg-status-error/10 border border-status-error/30 rounded-lg">
            <p className="text-xs text-status-error font-medium mb-1">
              Save your recovery key now!
            </p>
            <p className="text-xs text-text-muted">
              This is the only way to restore encrypted messages if you lose all your devices. Store
              it somewhere safe, then click "I've saved it".
            </p>
          </div>

          <div className="mb-4 p-3 bg-surface-2 rounded-lg">
            <label className="block text-xs text-text-muted mb-1">Recovery Key</label>
            <div className="flex gap-2">
              <code className="flex-1 text-xs font-mono text-text-primary bg-surface-3 p-2 rounded break-all select-all">
                {recoveryKey}
              </code>
              <button
                onClick={handleCopyKey}
                className="px-3 py-1 text-xs bg-surface-3 hover:bg-surface-2 text-text-secondary border border-border rounded transition-colors flex-shrink-0"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <button
            onClick={handleDone}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-inverse text-sm font-medium rounded-lg transition-colors"
          >
            I've saved my recovery key
          </button>
        </div>
      )}

      {step === "done" && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <svg
              className="w-5 h-5 text-status-success"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm font-medium text-status-success">Key backup is active</p>
          </div>
          <p className="text-xs text-text-muted mb-3">
            Your encrypted messages are now being backed up securely.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-inverse text-sm font-medium rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      )}

      {step === "error" && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <svg
              className="w-5 h-5 text-status-error"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            <p className="text-sm font-medium text-status-error">Setup failed</p>
          </div>
          <p className="text-xs text-text-muted mb-3">{errorMessage}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setStep("status")}
              className="px-3 py-1.5 text-sm text-accent hover:text-accent-hover transition-colors"
            >
              Try again
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
