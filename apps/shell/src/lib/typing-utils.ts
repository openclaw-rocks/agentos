/**
 * Pure utility functions for typing indicator logic.
 * Extracted to keep ChatView lean and enable easy testing.
 */

const MAX_DISPLAYED_NAMES = 3;

/**
 * Formats a list of typing user display names into a human-readable string.
 *
 * - 0 names: returns null (nothing to display)
 * - 1 name: "Alice is typing"
 * - 2 names: "Alice and Bob are typing"
 * - 3 names: "Alice, Bob, and Charlie are typing"
 * - 4+ names: "Alice, Bob, Charlie, and 2 others are typing"
 */
export function formatTypingNames(names: readonly string[]): string | null {
  if (names.length === 0) return null;

  if (names.length === 1) {
    return `${names[0]} is typing`;
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]} are typing`;
  }

  if (names.length <= MAX_DISPLAYED_NAMES) {
    const allButLast = names.slice(0, -1).join(", ");
    const last = names[names.length - 1];
    return `${allButLast}, and ${last} are typing`;
  }

  const displayed = names.slice(0, MAX_DISPLAYED_NAMES).join(", ");
  const remaining = names.length - MAX_DISPLAYED_NAMES;
  return `${displayed}, and ${remaining} ${remaining === 1 ? "other" : "others"} are typing`;
}

/**
 * Creates a debounced typing notifier that:
 * - Sends typing=true immediately on first keystroke
 * - Won't send another typing=true within `debounceMs`
 * - Sends typing=false after `idleMs` of inactivity or on explicit stop
 */
export function createTypingNotifier(opts: {
  sendTyping: (isTyping: boolean) => void;
  debounceMs: number;
  idleMs: number;
}): { onKeystroke: () => void; stop: () => void; destroy: () => void } {
  const { sendTyping, debounceMs, idleMs } = opts;

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSentAt = 0;
  let isCurrentlyTyping = false;

  function clearIdle(): void {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function setIdle(): void {
    clearIdle();
    idleTimer = setTimeout(() => {
      if (isCurrentlyTyping) {
        isCurrentlyTyping = false;
        sendTyping(false);
      }
    }, idleMs);
  }

  function onKeystroke(): void {
    const now = Date.now();

    // Reset idle timer on every keystroke
    setIdle();

    // Debounce: only send typing=true if enough time has passed
    if (now - lastSentAt >= debounceMs) {
      lastSentAt = now;
      isCurrentlyTyping = true;
      sendTyping(true);
    }
  }

  function stop(): void {
    clearIdle();
    if (isCurrentlyTyping) {
      isCurrentlyTyping = false;
      lastSentAt = 0;
      sendTyping(false);
    }
  }

  function destroy(): void {
    clearIdle();
    // Best-effort: send stop if we were typing
    if (isCurrentlyTyping) {
      isCurrentlyTyping = false;
      sendTyping(false);
    }
  }

  return { onKeystroke, stop, destroy };
}
