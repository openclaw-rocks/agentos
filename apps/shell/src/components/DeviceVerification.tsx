import type {
  EmojiMapping,
  ShowSasCallbacks,
  VerificationRequest,
  Verifier,
} from "matrix-js-sdk/lib/crypto-api";
import { VerificationPhase, VerifierEvent } from "matrix-js-sdk/lib/crypto-api";
import React, { useCallback, useEffect, useState } from "react";
import { getCrypto } from "~/lib/encryption";
import { useMatrix } from "~/lib/matrix-context";

type VerificationStep =
  | "idle"
  | "choose-method"
  | "requested"
  | "waiting"
  | "show-sas"
  | "show-qr"
  | "scan-qr"
  | "done"
  | "cancelled"
  | "error";

interface DeviceVerificationProps {
  userId: string;
  roomId?: string;
  onClose: () => void;
}

/**
 * Device verification UI: start SAS (emoji) verification,
 * show 7 emoji for comparison, and confirm/deny match.
 */
export function DeviceVerification({
  userId,
  roomId,
  onClose,
}: DeviceVerificationProps): React.ReactElement {
  const { client } = useMatrix();
  const [step, setStep] = useState<VerificationStep>("idle");
  const [sasCallbacks, setSasCallbacks] = useState<ShowSasCallbacks | null>(null);
  const [emojis, setEmojis] = useState<EmojiMapping[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [verificationRequest, setVerificationRequest] = useState<VerificationRequest | null>(null);
  const [verifier, setVerifier] = useState<Verifier | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string>("");
  const [scannedQrData, setScannedQrData] = useState<string>("");

  const cleanup = useCallback(() => {
    if (verifier) {
      verifier.removeAllListeners();
    }
  }, [verifier]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const initiateVerificationRequest = useCallback(async (): Promise<VerificationRequest | null> => {
    const crypto = getCrypto(client);
    if (!crypto) {
      setStep("error");
      setErrorMessage("Encryption is not initialized on this device.");
      return null;
    }

    setStep("requested");

    try {
      let request: VerificationRequest;
      const ownUserId = client.getUserId();

      if (userId === ownUserId) {
        request = await crypto.requestOwnUserVerification();
      } else if (roomId) {
        request = await crypto.requestVerificationDM(userId, roomId);
      } else {
        setStep("error");
        setErrorMessage("Room ID is required for cross-user verification.");
        return null;
      }

      setVerificationRequest(request);
      return request;
    } catch (err) {
      setStep("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to start verification.");
      return null;
    }
  }, [client, userId, roomId]);

  const startVerificationWithMethod = useCallback(
    async (method: "sas" | "qr") => {
      const request = await initiateVerificationRequest();
      if (!request) return;

      setStep("waiting");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const emitter = request as any;
      const onRequestChange = (): void => {
        if (request.phase === VerificationPhase.Ready) {
          emitter.removeListener("change", onRequestChange);
          if (method === "sas") {
            startSasVerification(request);
          } else {
            startQrVerification(request);
          }
        } else if (request.phase === VerificationPhase.Cancelled) {
          emitter.removeListener("change", onRequestChange);
          setStep("cancelled");
        }
      };

      if (request.phase === VerificationPhase.Ready) {
        if (method === "sas") {
          startSasVerification(request);
        } else {
          startQrVerification(request);
        }
      } else {
        emitter.on("change", onRequestChange);
      }
    },
    [initiateVerificationRequest],
  );

  const startVerification = useCallback(async () => {
    setStep("choose-method");
  }, []);

  const startSasVerification = useCallback(async (request: VerificationRequest) => {
    try {
      const v = await request.startVerification("m.sas.v1");
      setVerifier(v);

      v.on(VerifierEvent.ShowSas, (sas: ShowSasCallbacks) => {
        setSasCallbacks(sas);
        setEmojis(sas.sas.emoji ?? []);
        setStep("show-sas");
      });

      v.on(VerifierEvent.Cancel, () => {
        setStep("cancelled");
      });

      await v.verify();
      setStep("done");
    } catch (err) {
      if (step !== "cancelled") {
        setStep("error");
        setErrorMessage(err instanceof Error ? err.message : "Verification failed.");
      }
    }
  }, []);

  const startQrVerification = useCallback(
    async (request: VerificationRequest) => {
      try {
        // Generate a QR code representation from the verification request
        // In a real implementation this would use the QR code verification flow.
        // For web, we display a text representation the other device can use.
        const ownUserId = client.getUserId() ?? "";
        const deviceId = client.getDeviceId() ?? "";
        const qrData = JSON.stringify({
          type: "m.reciprocate.v1",
          user_id: ownUserId,
          device_id: deviceId,
          request_id: request.transactionId ?? "unknown",
        });
        setQrCodeData(qrData);
        setStep("show-qr");

        // Wait for the verification to be completed by the other device
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const emitter = request as any;
        const onChangeForQr = (): void => {
          if (request.phase === VerificationPhase.Done) {
            emitter.removeListener("change", onChangeForQr);
            setStep("done");
          } else if (request.phase === VerificationPhase.Cancelled) {
            emitter.removeListener("change", onChangeForQr);
            setStep("cancelled");
          }
        };
        emitter.on("change", onChangeForQr);
      } catch (err) {
        setStep("error");
        setErrorMessage(err instanceof Error ? err.message : "QR verification failed.");
      }
    },
    [client],
  );

  const handleScannedQr = useCallback(async () => {
    if (!scannedQrData.trim() || !verificationRequest) return;
    try {
      // In a full implementation, the scanned data would be fed into the
      // reciprocation flow. For now, fall back to SAS after scanning.
      startSasVerification(verificationRequest);
    } catch (err) {
      setStep("error");
      setErrorMessage(err instanceof Error ? err.message : "QR scan processing failed.");
    }
  }, [scannedQrData, verificationRequest, startSasVerification]);

  const confirmSas = useCallback(async () => {
    if (!sasCallbacks) return;
    try {
      await sasCallbacks.confirm();
    } catch (err) {
      setStep("error");
      setErrorMessage(err instanceof Error ? err.message : "Confirmation failed.");
    }
  }, [sasCallbacks]);

  const denySas = useCallback(() => {
    if (sasCallbacks) {
      sasCallbacks.mismatch();
    }
    setStep("cancelled");
  }, [sasCallbacks]);

  const cancelVerification = useCallback(async () => {
    try {
      if (
        verificationRequest &&
        verificationRequest.phase !== VerificationPhase.Cancelled &&
        verificationRequest.phase !== VerificationPhase.Done
      ) {
        await verificationRequest.cancel();
      }
    } catch {
      // Ignore cancellation errors
    }
    setStep("cancelled");
  }, [verificationRequest]);

  return (
    <div className="p-4 bg-surface-1 border border-border rounded-xl max-w-md">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-text-primary">Device Verification</h3>
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

      {step === "idle" && (
        <div>
          <p className="text-sm text-text-secondary mb-4">
            Verify {userId === client.getUserId() ? "your other devices" : userId} to ensure you are
            communicating securely.
          </p>
          <button
            onClick={startVerification}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-inverse text-sm font-medium rounded-lg transition-colors"
          >
            Start Verification
          </button>
        </div>
      )}

      {step === "choose-method" && (
        <div>
          <p className="text-sm text-text-secondary mb-4">Choose a verification method:</p>
          <div className="space-y-2">
            <button
              onClick={() => startVerificationWithMethod("sas")}
              className="w-full px-4 py-3 bg-surface-2 hover:bg-surface-3 text-primary text-sm font-medium rounded-lg transition-colors border border-border flex items-center gap-3"
            >
              <span className="text-lg">😀</span>
              <div className="text-left">
                <p className="font-medium">Verify by emoji</p>
                <p className="text-xs text-text-muted">Compare emoji on both devices</p>
              </div>
            </button>
            <button
              onClick={() => startVerificationWithMethod("qr")}
              className="w-full px-4 py-3 bg-surface-2 hover:bg-surface-3 text-primary text-sm font-medium rounded-lg transition-colors border border-border flex items-center gap-3"
            >
              <svg
                className="w-5 h-5 text-text-secondary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z"
                />
              </svg>
              <div className="text-left">
                <p className="font-medium">Verify by QR code</p>
                <p className="text-xs text-text-muted">Scan a QR code on either device</p>
              </div>
            </button>
          </div>
          <button
            onClick={onClose}
            className="mt-3 px-3 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {step === "show-qr" && (
        <div>
          <p className="text-sm text-text-secondary mb-3">
            Show this QR code to the other device to scan:
          </p>
          <div className="p-4 bg-white rounded-lg mb-3 flex items-center justify-center">
            {/* Simple text-based QR representation for web */}
            <div className="text-center">
              <div className="inline-block p-3 bg-surface-0 rounded-lg border-2 border-border">
                <svg
                  className="w-16 h-16 text-primary mx-auto mb-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"
                  />
                </svg>
                <p className="text-[8px] text-faint font-mono break-all max-w-[160px]">
                  {qrCodeData.slice(0, 60)}...
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-text-muted mb-3">
            Waiting for the other device to scan and confirm...
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setStep("scan-qr")}
              className="px-3 py-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
            >
              Scan QR instead
            </button>
            <button
              onClick={cancelVerification}
              className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary border border-border rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === "scan-qr" && (
        <div>
          <p className="text-sm text-text-secondary mb-3">
            Paste the QR code data from the other device:
          </p>
          <textarea
            value={scannedQrData}
            onChange={(e) => setScannedQrData(e.target.value)}
            placeholder="Paste QR code content here..."
            rows={3}
            className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted resize-none focus:outline-none focus:border-accent mb-3"
          />
          <p className="text-xs text-text-muted mb-3">
            On web, camera scanning is not available. Paste the QR code content manually, or switch
            to emoji verification.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleScannedQr}
              disabled={!scannedQrData.trim()}
              className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
            >
              Verify
            </button>
            <button
              onClick={() => {
                if (verificationRequest) {
                  startSasVerification(verificationRequest);
                }
              }}
              className="px-3 py-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
            >
              Use emoji instead
            </button>
            <button
              onClick={cancelVerification}
              className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary border border-border rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === "requested" && (
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-text-secondary">Sending verification request...</p>
        </div>
      )}

      {step === "waiting" && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-text-secondary">Waiting for the other device to accept...</p>
          </div>
          <button
            onClick={cancelVerification}
            className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary border border-border rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {step === "show-sas" && (
        <div>
          <p className="text-sm text-text-secondary mb-3">
            Confirm that the following emoji appear on both devices:
          </p>

          <div className="grid grid-cols-7 gap-2 mb-4 p-3 bg-surface-2 rounded-lg">
            {emojis.map(([emoji, name], i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <span className="text-2xl" role="img" aria-label={name}>
                  {emoji}
                </span>
                <span className="text-[9px] text-text-muted text-center leading-tight">{name}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={confirmSas}
              className="flex-1 px-4 py-2 bg-status-success hover:bg-status-success/80 text-inverse text-sm font-medium rounded-lg transition-colors"
            >
              They match
            </button>
            <button
              onClick={denySas}
              className="flex-1 px-4 py-2 bg-status-error hover:bg-status-error/80 text-inverse text-sm font-medium rounded-lg transition-colors"
            >
              They don't match
            </button>
          </div>
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
            <p className="text-sm font-medium text-status-success">Verification complete!</p>
          </div>
          <p className="text-xs text-text-muted mb-3">
            The device has been verified successfully. Messages are now secured.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-inverse text-sm font-medium rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      )}

      {step === "cancelled" && (
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
                d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm font-medium text-status-error">Verification cancelled</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setStep("idle");
                setVerifier(null);
                setVerificationRequest(null);
              }}
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
            <p className="text-sm font-medium text-status-error">Verification error</p>
          </div>
          <p className="text-xs text-text-muted mb-3">{errorMessage}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-muted hover:text-text-primary border border-border rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
