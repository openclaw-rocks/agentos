import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatTypingNames, createTypingNotifier } from "~/lib/typing-utils";

describe("ChatView typing indicators", () => {
  describe("formatTypingNames", () => {
    describe("given no users are typing", () => {
      it("should return null", () => {
        expect(formatTypingNames([])).toBeNull();
      });
    });

    describe("given one user is typing", () => {
      it("should display the typing user's name", () => {
        expect(formatTypingNames(["Alice"])).toBe("Alice is typing");
      });
    });

    describe("given two users are typing", () => {
      it("should display both names", () => {
        expect(formatTypingNames(["Alice", "Bob"])).toBe("Alice and Bob are typing");
      });
    });

    describe("given three users are typing", () => {
      it("should display all names up to 3", () => {
        expect(formatTypingNames(["Alice", "Bob", "Charlie"])).toBe(
          "Alice, Bob, and Charlie are typing",
        );
      });
    });

    describe("given four users are typing", () => {
      it("should display 3 names and the count of others", () => {
        expect(formatTypingNames(["Alice", "Bob", "Charlie", "Dave"])).toBe(
          "Alice, Bob, Charlie, and 1 other are typing",
        );
      });
    });

    describe("given six users are typing", () => {
      it("should display 3 names and the count of others (plural)", () => {
        expect(formatTypingNames(["Alice", "Bob", "Charlie", "Dave", "Eve", "Frank"])).toBe(
          "Alice, Bob, Charlie, and 3 others are typing",
        );
      });
    });
  });

  describe("createTypingNotifier", () => {
    let mock: ReturnType<typeof vi.fn<(isTyping: boolean) => void>>;

    beforeEach(() => {
      vi.useFakeTimers();
      mock = vi.fn<(isTyping: boolean) => void>();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe("given the user is typing", () => {
      it("should debounce typing notifications to avoid spamming", () => {
        const notifier = createTypingNotifier({
          sendTyping: mock,
          debounceMs: 10_000,
          idleMs: 3_000,
        });

        // First keystroke sends true immediately
        notifier.onKeystroke();
        expect(mock).toHaveBeenCalledTimes(1);
        expect(mock).toHaveBeenCalledWith(true);

        // Rapid keystrokes within debounce window should NOT re-send true
        vi.advanceTimersByTime(500);
        notifier.onKeystroke();
        vi.advanceTimersByTime(500);
        notifier.onKeystroke();
        expect(mock).toHaveBeenCalledTimes(1);

        // Keep typing every 2s to prevent idle timeout from firing
        vi.advanceTimersByTime(2_000);
        notifier.onKeystroke(); // t=3000, resets idle to t=6000
        vi.advanceTimersByTime(2_000);
        notifier.onKeystroke(); // t=5000, resets idle to t=8000
        vi.advanceTimersByTime(2_000);
        notifier.onKeystroke(); // t=7000, resets idle to t=10000
        vi.advanceTimersByTime(2_000);
        notifier.onKeystroke(); // t=9000, resets idle to t=12000
        // Still only 1 call — all within debounce window
        expect(mock).toHaveBeenCalledTimes(1);

        // Advance past 10s debounce (first send was at t=0, now t=9000 + 1500 = t=10500)
        vi.advanceTimersByTime(1_500);
        notifier.onKeystroke(); // t=10500, debounce window passed → sends true again
        expect(mock).toHaveBeenCalledTimes(2);
        expect(mock).toHaveBeenNthCalledWith(2, true);

        notifier.destroy();
      });

      it("should send typing=false after idle timeout", () => {
        const notifier = createTypingNotifier({
          sendTyping: mock,
          debounceMs: 10_000,
          idleMs: 3_000,
        });

        notifier.onKeystroke();
        expect(mock).toHaveBeenCalledTimes(1);
        expect(mock).toHaveBeenCalledWith(true);

        // Advance past idle timeout
        vi.advanceTimersByTime(3_000);
        expect(mock).toHaveBeenCalledTimes(2);
        expect(mock).toHaveBeenNthCalledWith(2, false);

        notifier.destroy();
      });

      it("should send typing=false on explicit stop (send)", () => {
        const notifier = createTypingNotifier({
          sendTyping: mock,
          debounceMs: 10_000,
          idleMs: 3_000,
        });

        notifier.onKeystroke();
        expect(mock).toHaveBeenCalledWith(true);

        notifier.stop();
        expect(mock).toHaveBeenCalledTimes(2);
        expect(mock).toHaveBeenNthCalledWith(2, false);

        notifier.destroy();
      });

      it("should reset idle timer on each keystroke", () => {
        const notifier = createTypingNotifier({
          sendTyping: mock,
          debounceMs: 10_000,
          idleMs: 3_000,
        });

        notifier.onKeystroke();
        expect(mock).toHaveBeenCalledTimes(1);

        // Type again at 2s — resets the 3s idle timer
        vi.advanceTimersByTime(2_000);
        notifier.onKeystroke();

        // At 4s total (2s after last keystroke) — should NOT have sent false yet
        vi.advanceTimersByTime(2_000);
        expect(mock).toHaveBeenCalledTimes(1);

        // At 5s total (3s after last keystroke) — NOW it should go idle
        vi.advanceTimersByTime(1_000);
        expect(mock).toHaveBeenCalledTimes(2);
        expect(mock).toHaveBeenNthCalledWith(2, false);

        notifier.destroy();
      });
    });

    describe("given the notifier is destroyed", () => {
      it("should send typing=false if currently typing", () => {
        const notifier = createTypingNotifier({
          sendTyping: mock,
          debounceMs: 10_000,
          idleMs: 3_000,
        });

        notifier.onKeystroke();
        expect(mock).toHaveBeenCalledWith(true);

        notifier.destroy();
        expect(mock).toHaveBeenCalledTimes(2);
        expect(mock).toHaveBeenNthCalledWith(2, false);
      });

      it("should not send typing=false if not currently typing", () => {
        const notifier = createTypingNotifier({
          sendTyping: mock,
          debounceMs: 10_000,
          idleMs: 3_000,
        });

        notifier.destroy();
        expect(mock).not.toHaveBeenCalled();
      });
    });
  });
});
