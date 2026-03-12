/**
 * 3PID (Third-Party Identifier) management utilities.
 *
 * Handles email and phone number associations with Matrix accounts,
 * including listing, adding, verifying, and removing 3PIDs.
 */

import type { MatrixClient } from "matrix-js-sdk";

export interface ThreePid {
  medium: "email" | "msisdn";
  address: string;
  validated_at: number;
  added_at: number;
}

/**
 * Generate a client secret for 3PID token requests.
 */
export function generateThreePidSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Retrieve the list of 3PIDs associated with the current user.
 */
export async function getThreePids(client: MatrixClient): Promise<ThreePid[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (client as any).getThreePids();
  const threepids: unknown[] = response?.threepids ?? [];
  return threepids.map((tp) => {
    const record = tp as Record<string, unknown>;
    return {
      medium: record.medium as "email" | "msisdn",
      address: record.address as string,
      validated_at: (record.validated_at as number) ?? 0,
      added_at: (record.added_at as number) ?? 0,
    };
  });
}

/**
 * Request an email verification token for adding an email 3PID.
 * Returns the session ID (sid) for subsequent verification.
 */
export async function addEmail(
  client: MatrixClient,
  email: string,
): Promise<{ sid: string; clientSecret: string }> {
  const clientSecret = generateThreePidSecret();
  const baseUrl = client.getHomeserverUrl();
  const accessToken = client.getAccessToken();

  const res = await fetch(`${baseUrl}/_matrix/client/v3/account/3pid/email/requestToken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      email,
      client_secret: clientSecret,
      send_attempt: 1,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error((err as Record<string, string>).error ?? "Failed to request email token");
  }

  const data: unknown = await res.json();
  const record = data as Record<string, unknown>;
  return {
    sid: record.sid as string,
    clientSecret,
  };
}

/**
 * Request a phone verification token for adding a phone 3PID.
 * Returns the session ID (sid) for subsequent verification.
 */
export async function addPhone(
  client: MatrixClient,
  phone: string,
  country: string,
): Promise<{ sid: string; clientSecret: string }> {
  const clientSecret = generateThreePidSecret();
  const baseUrl = client.getHomeserverUrl();
  const accessToken = client.getAccessToken();

  const res = await fetch(`${baseUrl}/_matrix/client/v3/account/3pid/msisdn/requestToken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      phone_number: phone,
      country,
      client_secret: clientSecret,
      send_attempt: 1,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error((err as Record<string, string>).error ?? "Failed to request phone token");
  }

  const data: unknown = await res.json();
  const record = data as Record<string, unknown>;
  return {
    sid: record.sid as string,
    clientSecret,
  };
}

/**
 * Submit the token received via email to complete email 3PID verification,
 * then bind the 3PID to the account.
 */
export async function submitEmailToken(
  client: MatrixClient,
  sid: string,
  clientSecret: string,
): Promise<void> {
  const baseUrl = client.getHomeserverUrl();
  const accessToken = client.getAccessToken();

  // Add the 3PID to the account using the verified session
  const addRes = await fetch(`${baseUrl}/_matrix/client/v3/account/3pid/add`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      sid,
      client_secret: clientSecret,
    }),
  });

  if (!addRes.ok) {
    const err = await addRes.json().catch(() => ({ error: "Add failed" }));
    throw new Error((err as Record<string, string>).error ?? "Failed to add 3PID to account");
  }
}

/**
 * Remove a 3PID from the account.
 */
export async function removeThreePid(
  client: MatrixClient,
  medium: string,
  address: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client as any).deleteThreePid(medium, address);
}
