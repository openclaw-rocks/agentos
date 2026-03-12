import { describe, it, expect } from "vitest";
import {
  initialPttState,
  togglePttMode,
  startTransmitting,
  stopTransmitting,
  shouldMute,
  isPttKey,
} from "./ptt";
import type { PttState } from "./ptt";

describe("PTT (Push-to-Talk)", () => {
  // -------------------------------------------------------------------------
  // initialPttState
  // -------------------------------------------------------------------------

  describe("initialPttState", () => {
    describe("given no arguments", () => {
      it("should return PTT disabled and not transmitting", () => {
        const state = initialPttState();
        expect(state.enabled).toBe(false);
        expect(state.transmitting).toBe(false);
      });
    });
  });

  // -------------------------------------------------------------------------
  // togglePttMode
  // -------------------------------------------------------------------------

  describe("togglePttMode", () => {
    describe("given PTT is disabled", () => {
      it("should enable PTT mode", () => {
        const state = initialPttState();
        const next = togglePttMode(state);
        expect(next.enabled).toBe(true);
        expect(next.transmitting).toBe(false);
      });
    });

    describe("given PTT is enabled", () => {
      it("should disable PTT mode", () => {
        const state: PttState = { enabled: true, transmitting: false };
        const next = togglePttMode(state);
        expect(next.enabled).toBe(false);
        expect(next.transmitting).toBe(false);
      });

      it("should reset transmitting to false when disabling", () => {
        const state: PttState = { enabled: true, transmitting: true };
        const next = togglePttMode(state);
        expect(next.enabled).toBe(false);
        expect(next.transmitting).toBe(false);
      });
    });
  });

  // -------------------------------------------------------------------------
  // startTransmitting
  // -------------------------------------------------------------------------

  describe("startTransmitting", () => {
    describe("given PTT is enabled and not transmitting", () => {
      it("should set transmitting to true", () => {
        const state: PttState = { enabled: true, transmitting: false };
        const next = startTransmitting(state);
        expect(next.transmitting).toBe(true);
      });
    });

    describe("given PTT is enabled and already transmitting", () => {
      it("should return the same state", () => {
        const state: PttState = { enabled: true, transmitting: true };
        const next = startTransmitting(state);
        expect(next).toBe(state);
      });
    });

    describe("given PTT is disabled", () => {
      it("should not change state", () => {
        const state: PttState = { enabled: false, transmitting: false };
        const next = startTransmitting(state);
        expect(next).toBe(state);
      });
    });
  });

  // -------------------------------------------------------------------------
  // stopTransmitting
  // -------------------------------------------------------------------------

  describe("stopTransmitting", () => {
    describe("given PTT is enabled and transmitting", () => {
      it("should set transmitting to false", () => {
        const state: PttState = { enabled: true, transmitting: true };
        const next = stopTransmitting(state);
        expect(next.transmitting).toBe(false);
      });
    });

    describe("given PTT is enabled and not transmitting", () => {
      it("should return the same state", () => {
        const state: PttState = { enabled: true, transmitting: false };
        const next = stopTransmitting(state);
        expect(next).toBe(state);
      });
    });

    describe("given PTT is disabled", () => {
      it("should not change state", () => {
        const state: PttState = { enabled: false, transmitting: false };
        const next = stopTransmitting(state);
        expect(next).toBe(state);
      });
    });
  });

  // -------------------------------------------------------------------------
  // shouldMute
  // -------------------------------------------------------------------------

  describe("shouldMute", () => {
    describe("given PTT is disabled", () => {
      it("should respect user mute state (unmuted)", () => {
        const state: PttState = { enabled: false, transmitting: false };
        expect(shouldMute(state, false)).toBe(false);
      });

      it("should respect user mute state (muted)", () => {
        const state: PttState = { enabled: false, transmitting: false };
        expect(shouldMute(state, true)).toBe(true);
      });
    });

    describe("given PTT is enabled", () => {
      it("should mute when not transmitting", () => {
        const state: PttState = { enabled: true, transmitting: false };
        expect(shouldMute(state, false)).toBe(true);
      });

      it("should unmute when transmitting", () => {
        const state: PttState = { enabled: true, transmitting: true };
        expect(shouldMute(state, false)).toBe(false);
      });

      it("should unmute when transmitting regardless of user mute", () => {
        const state: PttState = { enabled: true, transmitting: true };
        expect(shouldMute(state, true)).toBe(false);
      });
    });
  });

  // -------------------------------------------------------------------------
  // isPttKey
  // -------------------------------------------------------------------------

  describe("isPttKey", () => {
    describe("given the Space key on a non-input element", () => {
      it("should return true for ' '", () => {
        expect(isPttKey(" ", "DIV", false)).toBe(true);
      });

      it("should return true for 'Space'", () => {
        expect(isPttKey("Space", "BUTTON", false)).toBe(true);
      });
    });

    describe("given the Space key on an input element", () => {
      it("should return false for <input>", () => {
        expect(isPttKey(" ", "INPUT", false)).toBe(false);
      });

      it("should return false for <textarea>", () => {
        expect(isPttKey(" ", "TEXTAREA", false)).toBe(false);
      });

      it("should return false for <select>", () => {
        expect(isPttKey(" ", "SELECT", false)).toBe(false);
      });
    });

    describe("given the Space key on a contentEditable element", () => {
      it("should return false", () => {
        expect(isPttKey(" ", "DIV", true)).toBe(false);
      });
    });

    describe("given a non-Space key", () => {
      it("should return false for Enter", () => {
        expect(isPttKey("Enter", "DIV", false)).toBe(false);
      });

      it("should return false for 'a'", () => {
        expect(isPttKey("a", "DIV", false)).toBe(false);
      });
    });
  });
});
