/**
 * Push-to-talk (PTT / walkie-talkie) mode helpers.
 *
 * Pure state management for PTT — no React or DOM dependencies so it is
 * easy to test.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PttState {
  /** Whether PTT mode is currently enabled. */
  enabled: boolean;
  /** Whether the user is currently holding the talk button. */
  transmitting: boolean;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Return the initial PTT state (disabled, not transmitting). */
export function initialPttState(): PttState {
  return { enabled: false, transmitting: false };
}

/** Toggle PTT mode on or off. When turning off, transmitting resets to false. */
export function togglePttMode(state: PttState): PttState {
  const enabled = !state.enabled;
  return { enabled, transmitting: enabled ? false : false };
}

/** Start transmitting (only has effect when PTT is enabled). */
export function startTransmitting(state: PttState): PttState {
  if (!state.enabled) return state;
  if (state.transmitting) return state;
  return { ...state, transmitting: true };
}

/** Stop transmitting (only has effect when PTT is enabled). */
export function stopTransmitting(state: PttState): PttState {
  if (!state.enabled) return state;
  if (!state.transmitting) return state;
  return { ...state, transmitting: false };
}

/**
 * Whether the microphone should be muted given the current PTT state
 * and the user's explicit mute toggle.
 *
 * - If PTT is off, the user's explicit mute state is respected.
 * - If PTT is on, the mic is muted unless the user is transmitting.
 */
export function shouldMute(pttState: PttState, userMuted: boolean): boolean {
  if (!pttState.enabled) return userMuted;
  return !pttState.transmitting;
}

/**
 * Whether a given keyboard event represents a PTT key press (spacebar).
 * Ignores the event if the target is an input, textarea, or contentEditable.
 */
export function isPttKey(key: string, targetTagName: string, isContentEditable: boolean): boolean {
  if (key !== " " && key !== "Space") return false;
  const tag = targetTagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return false;
  if (isContentEditable) return false;
  return true;
}
