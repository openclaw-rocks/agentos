/**
 * Helpers for registering a Service Worker and subscribing to Web Push.
 *
 * These functions wrap the browser Push API to keep the rest of the app
 * decoupled from the raw ServiceWorker/PushManager interfaces.
 */

/** Default path for the push notification service worker script */
export const SW_PATH = "/push-sw.js";

/**
 * Register (or re-use) the push notification service worker.
 *
 * @param swPath - Path to the service worker script (defaults to SW_PATH)
 * @returns The active ServiceWorkerRegistration, or null if unsupported
 */
export async function registerServiceWorker(
  swPath: string = SW_PATH,
): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  const registration = await navigator.serviceWorker.register(swPath, {
    scope: "/",
  });

  // Wait for the SW to be active
  if (registration.installing) {
    await new Promise<void>((resolve) => {
      const sw = registration.installing!;
      sw.addEventListener("statechange", () => {
        if (sw.state === "activated") resolve();
      });
    });
  }

  return registration;
}

/**
 * Subscribe to web push notifications via the PushManager.
 *
 * @param registration - An active ServiceWorkerRegistration
 * @param vapidPublicKey - The VAPID public key from the push gateway (base64url encoded)
 * @returns The PushSubscription, or null if subscription failed
 */
export async function subscribeToPush(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string,
): Promise<PushSubscription | null> {
  if (!registration.pushManager) {
    return null;
  }

  const keyBytes = urlBase64ToUint8Array(vapidPublicKey);
  // PushManager.subscribe expects an ArrayBuffer, not a Uint8Array
  const applicationServerKey = keyBytes.buffer as ArrayBuffer;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });

  return subscription;
}

/**
 * Check for an existing push subscription on the given registration.
 *
 * @param registration - An active ServiceWorkerRegistration
 * @returns The existing PushSubscription, or null if none exists
 */
export async function getExistingSubscription(
  registration: ServiceWorkerRegistration,
): Promise<PushSubscription | null> {
  if (!registration.pushManager) {
    return null;
  }

  return registration.pushManager.getSubscription();
}

/**
 * Convert a base64url-encoded VAPID key to a Uint8Array suitable for
 * the `applicationServerKey` option of PushManager.subscribe().
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}
