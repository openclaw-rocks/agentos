import { describe, it, expect, vi, afterEach } from "vitest";
import { formatDateSeparator, isSameDay } from "./date-utils";

describe("date-utils", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("formatDateSeparator", () => {
    describe("given today's date", () => {
      it("should return 'Today'", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 2, 11, 14, 30, 0)); // March 11, 2026 at 2:30 PM
        const today = new Date(2026, 2, 11, 9, 0, 0); // same day, different time
        expect(formatDateSeparator(today)).toBe("Today");
      });
    });

    describe("given yesterday's date", () => {
      it("should return 'Yesterday'", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 2, 11, 14, 30, 0)); // March 11, 2026
        const yesterday = new Date(2026, 2, 10, 18, 0, 0); // March 10, 2026
        expect(formatDateSeparator(yesterday)).toBe("Yesterday");
      });
    });

    describe("given an older date", () => {
      it("should return formatted date like 'March 10, 2026'", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0)); // March 15, 2026
        const older = new Date(2026, 2, 10, 12, 0, 0); // March 10, 2026
        expect(formatDateSeparator(older)).toBe("March 10, 2026");
      });
    });

    describe("given a date from a different month", () => {
      it("should return the full formatted date", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 2, 11, 12, 0, 0)); // March 11, 2026
        const older = new Date(2026, 0, 5, 12, 0, 0); // January 5, 2026
        expect(formatDateSeparator(older)).toBe("January 5, 2026");
      });
    });

    describe("given a date from a different year", () => {
      it("should return the full formatted date with the year", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 2, 11, 12, 0, 0)); // March 11, 2026
        const older = new Date(2025, 11, 25, 12, 0, 0); // December 25, 2025
        expect(formatDateSeparator(older)).toBe("December 25, 2025");
      });
    });
  });

  describe("isSameDay", () => {
    describe("given two dates on the same day", () => {
      it("should return true", () => {
        const a = new Date(2026, 2, 11, 9, 0, 0);
        const b = new Date(2026, 2, 11, 23, 59, 59);
        expect(isSameDay(a, b)).toBe(true);
      });
    });

    describe("given two dates on different days", () => {
      it("should return false", () => {
        const a = new Date(2026, 2, 10, 23, 59, 59);
        const b = new Date(2026, 2, 11, 0, 0, 0);
        expect(isSameDay(a, b)).toBe(false);
      });
    });

    describe("given two dates in different months but same day number", () => {
      it("should return false", () => {
        const a = new Date(2026, 1, 11, 12, 0, 0); // Feb 11
        const b = new Date(2026, 2, 11, 12, 0, 0); // Mar 11
        expect(isSameDay(a, b)).toBe(false);
      });
    });

    describe("given two dates in different years but same month and day", () => {
      it("should return false", () => {
        const a = new Date(2025, 2, 11, 12, 0, 0);
        const b = new Date(2026, 2, 11, 12, 0, 0);
        expect(isSameDay(a, b)).toBe(false);
      });
    });

    describe("given the exact same date object", () => {
      it("should return true", () => {
        const date = new Date(2026, 2, 11, 14, 30, 0);
        expect(isSameDay(date, date)).toBe(true);
      });
    });
  });
});
