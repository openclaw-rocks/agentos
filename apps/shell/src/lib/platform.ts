export const isTauri = (): boolean => {
  return "__TAURI_INTERNALS__" in window;
};

/**
 * Whether this is the hosted version of AgentOS (openclaw.rocks).
 *
 * Set via VITE_IS_HOSTED=true at build time. The hosted version includes
 * additional UX for non-technical users: simplified onboarding, managed
 * spaces, and billing. The open-source version exposes raw Matrix concepts.
 *
 * Code that differs between hosted and open-source should check this flag:
 *
 *   if (isHosted()) {
 *     // Show friendly "Create Space" wizard
 *   } else {
 *     // Show raw Matrix room creation
 *   }
 *
 * Hosted-only features live in apps/shell/src/ee/ and are tree-shaken
 * out of open-source builds.
 */
export const isHosted = (): boolean => {
  return import.meta.env.VITE_IS_HOSTED === "true";
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
