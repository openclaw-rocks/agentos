import type * as sdk from "matrix-js-sdk";

/** App identifier registered with the push gateway */
export const PUSH_APP_ID = "rocks.openclaw.app";

/** Default push gateway URL for the OpenClaw infrastructure */
export const DEFAULT_PUSH_GATEWAY = "https://matrix.openclaw.rocks/_matrix/push/v1/notify";

/**
 * Pusher data object matching the Matrix spec for `POST /_matrix/client/v3/pushers/set`.
 * See: https://spec.matrix.org/v1.6/client-server-api/#post_matrixclientv3pushersset
 */
export interface PusherData {
  /** The push gateway URL */
  url: string;
  /** Browser-specific: VAPID public key or endpoint-specific data */
  format?: string;
}

/**
 * Full pusher registration object sent to the homeserver.
 */
export interface Pusher {
  /** Unique identifier for the push destination (e.g. subscription endpoint) */
  pushkey: string;
  /** The kind of pusher: "http" for web push, null to unregister */
  kind: "http" | null;
  /** Reverse-DNS style application identifier */
  app_id: string;
  /** Human-readable application name */
  app_display_name: string;
  /** Human-readable device name */
  device_display_name: string;
  /** Allows multiple pushers for the same user/app on different devices */
  profile_tag: string;
  /** RFC 5646 language tag */
  lang: string;
  /** Push-gateway-specific data */
  data: PusherData;
}

/**
 * Builds a pusher data object per the Matrix spec.
 *
 * @param appId - Application identifier (use PUSH_APP_ID)
 * @param pushKey - The push subscription endpoint or token
 * @param appDisplayName - Readable app name shown on pusher list
 * @param deviceDisplayName - Readable device name
 * @param profileTag - Unique tag for this device's pusher
 * @param gatewayUrl - Push gateway URL (defaults to DEFAULT_PUSH_GATEWAY)
 */
export function buildPusherData(
  appId: string,
  pushKey: string,
  appDisplayName: string,
  deviceDisplayName: string,
  profileTag: string,
  gatewayUrl: string = DEFAULT_PUSH_GATEWAY,
): Pusher {
  return {
    pushkey: pushKey,
    kind: "http",
    app_id: appId,
    app_display_name: appDisplayName,
    device_display_name: deviceDisplayName,
    profile_tag: profileTag,
    lang: typeof navigator !== "undefined" ? navigator.language : "en",
    data: {
      url: gatewayUrl,
    },
  };
}

/**
 * Register a pusher with the homeserver so it sends push notifications
 * to the configured gateway.
 *
 * Uses `client.setPusher()` which maps to `POST /_matrix/client/v3/pushers/set`.
 */
export async function registerPusher(client: sdk.MatrixClient, pusherData: Pusher): Promise<void> {
  // matrix-js-sdk setPusher accepts the pusher object directly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client as any).setPusher(pusherData);
}

/**
 * Unregister a pusher by sending the same pusher data with `kind: null`.
 * This instructs the homeserver to remove the pusher.
 */
export async function unregisterPusher(
  client: sdk.MatrixClient,
  pusherData: Pusher,
): Promise<void> {
  const unregisterData: Pusher = {
    ...pusherData,
    kind: null,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client as any).setPusher(unregisterData);
}

/**
 * Response shape from GET /_matrix/client/v3/pushers.
 */
export interface GetPushersResponse {
  pushers: Pusher[];
}

/**
 * List all registered pushers for the current user.
 *
 * Uses `client.getPushers()` which maps to `GET /_matrix/client/v3/pushers`.
 */
export async function getPushers(client: sdk.MatrixClient): Promise<Pusher[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (client as any).getPushers();
  const data = response as GetPushersResponse;
  return data.pushers ?? [];
}

/**
 * Check whether push notification support is available on this platform.
 *
 * Returns true if either:
 * - The browser supports Service Workers and PushManager (Web Push)
 * - The app is running in Tauri with push notification capability
 */
export function isPushSupported(): boolean {
  // Check for Tauri native push support
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return true;
  }

  // Check for Web Push API support (Service Worker + PushManager)
  if (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window
  ) {
    return true;
  }

  return false;
}
