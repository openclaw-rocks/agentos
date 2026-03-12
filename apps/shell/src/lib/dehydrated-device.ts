/**
 * Dehydrated device support (MSC3814).
 *
 * MSC3814 is experimental and not yet supported by most homeservers.
 * These stubs exist as placeholders for future implementation once the
 * spec stabilises and homeserver support becomes widely available.
 */

/**
 * Check whether dehydrated device support is available.
 * Currently always returns false — MSC3814 is not yet widely supported.
 */
export function isDehydratedDeviceSupported(): boolean {
  return false;
}

/**
 * Set up a dehydrated device for the current session.
 * Currently a no-op — MSC3814 is not yet widely supported.
 */
export async function setupDehydratedDevice(): Promise<void> {
  // No-op stub: dehydrated devices (MSC3814) are not yet implemented.
}
