/**
 * QR code login helpers.
 *
 * Generates data suitable for QR codes shown on the login screen.
 * The QR code contains information that a signed-in device can scan
 * to verify and establish a session on the new device.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QrLoginPayload {
  /** The homeserver URL that the new device wants to connect to. */
  homeserver: string;
  /** Indicates this is a login verification QR code. */
  mode: "login_verification";
  /** A random session ID for this login attempt. */
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Generate a unique session ID for the QR login flow.
 */
export function generateQrSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `qr-${timestamp}-${random}`;
}

/**
 * Build the data string that will be encoded in the QR code.
 * The data is a JSON object containing the homeserver URL and session info.
 */
export function buildQrLoginData(homeserverUrl: string, sessionId: string): string {
  const payload: QrLoginPayload = {
    homeserver: homeserverUrl.replace(/\/+$/, ""),
    mode: "login_verification",
    sessionId,
  };
  return JSON.stringify(payload);
}

/**
 * Parse a QR login data string back into a payload.
 * Returns null if the data is not a valid QR login payload.
 */
export function parseQrLoginData(data: string): QrLoginPayload | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== "object" || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;
    if (typeof obj.homeserver !== "string") return null;
    if (obj.mode !== "login_verification") return null;
    if (typeof obj.sessionId !== "string") return null;

    return {
      homeserver: obj.homeserver,
      mode: "login_verification",
      sessionId: obj.sessionId,
    };
  } catch {
    return null;
  }
}

/**
 * Validate a homeserver URL for QR login.
 * Returns true if the URL looks like a valid homeserver URL.
 */
export function isValidHomeserverUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.length === 0) return false;

  try {
    // If it has a protocol, parse it directly
    if (/^https?:\/\//i.test(trimmed)) {
      new URL(trimmed);
      return true;
    }
    // Otherwise try adding https://
    new URL(`https://${trimmed}`);
    return true;
  } catch {
    return false;
  }
}
