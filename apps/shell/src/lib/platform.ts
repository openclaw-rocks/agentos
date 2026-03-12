export const isTauri = (): boolean => {
  return "__TAURI_INTERNALS__" in window;
};

/** Push notification platform type */
export type PushPlatform = "web" | "tauri" | "unsupported";

/**
 * Check whether the current platform supports push notifications.
 *
 * Returns true if either:
 * - The browser supports ServiceWorkerRegistration.pushManager (Web Push)
 * - The app is running in Tauri with notification capability
 */
export function isPushNotificationSupported(): boolean {
  if (typeof window === "undefined") return false;

  // Tauri native push
  if ("__TAURI_INTERNALS__" in window) {
    return true;
  }

  // Web Push: requires both Service Worker and PushManager
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
    return true;
  }

  return false;
}

/**
 * Determine the push notification platform.
 *
 * @returns 'tauri' when running inside a Tauri shell,
 *          'web' when browser Web Push is available,
 *          'unsupported' otherwise.
 */
export function getPushPlatform(): PushPlatform {
  if (typeof window === "undefined") return "unsupported";

  if ("__TAURI_INTERNALS__" in window) {
    return "tauri";
  }

  if (typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
    return "web";
  }

  return "unsupported";
}
