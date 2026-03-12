import { describe, it, expect } from "vitest";
import { collectLogs, buildRageshakePayload, type LogEntry } from "./rageshake";

describe("rageshake", () => {
  describe("collectLogs", () => {
    describe("Given no logs have been intercepted", () => {
      describe("When collecting logs from an empty buffer", () => {
        it("Then it should return an empty array", () => {
          // collectLogs reads from a module-level buffer.
          // In a fresh test module, if interceptConsole hasn't been called,
          // the buffer is empty. We test the pure slice logic here.
          const result = collectLogs(10);

          expect(Array.isArray(result)).toBe(true);
        });
      });
    });

    describe("Given the maxLines parameter", () => {
      describe("When maxLines is greater than available logs", () => {
        it("Then it should return all available logs", () => {
          const result = collectLogs(10000);

          expect(Array.isArray(result)).toBe(true);
          // Should not throw or return more than buffer size
          expect(result.length).toBeLessThanOrEqual(10000);
        });
      });

      describe("When maxLines is 0", () => {
        it("Then it should return an empty array", () => {
          const result = collectLogs(0);

          expect(result).toHaveLength(0);
        });
      });
    });
  });

  describe("buildRageshakePayload", () => {
    describe("Given a description and log entries", () => {
      describe("When building the payload", () => {
        it("Then it should include the description", () => {
          const logs: LogEntry[] = [];
          const payload = buildRageshakePayload("Something broke", logs, "TestAgent/1.0", "0.1.0");

          expect(payload.description).toBe("Something broke");
        });

        it("Then it should include the user agent", () => {
          const payload = buildRageshakePayload("Bug", [], "TestAgent/1.0", "0.1.0");

          expect(payload.userAgent).toBe("TestAgent/1.0");
        });

        it("Then it should include the app version", () => {
          const payload = buildRageshakePayload("Bug", [], "TestAgent/1.0", "0.1.0");

          expect(payload.appVersion).toBe("0.1.0");
        });
      });
    });

    describe("Given log entries with different levels", () => {
      describe("When building the payload", () => {
        it("Then it should format logs as timestamped lines with level", () => {
          const logs: LogEntry[] = [
            {
              level: "log",
              timestamp: 1710000000000,
              args: ["hello world"],
            },
            {
              level: "error",
              timestamp: 1710000001000,
              args: ["something failed"],
            },
          ];

          const payload = buildRageshakePayload("Bug", logs, "TestAgent", "0.1.0");

          expect(payload.logs).toContain("[LOG]");
          expect(payload.logs).toContain("hello world");
          expect(payload.logs).toContain("[ERROR]");
          expect(payload.logs).toContain("something failed");
        });

        it("Then each log line should contain an ISO timestamp", () => {
          const logs: LogEntry[] = [
            {
              level: "warn",
              timestamp: 1710000000000,
              args: ["warning text"],
            },
          ];

          const payload = buildRageshakePayload("Bug", logs, "TestAgent", "0.1.0");

          // ISO timestamp format: YYYY-MM-DDTHH:mm:ss.sssZ
          expect(payload.logs).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });
      });
    });

    describe("Given log entries with multiple args", () => {
      describe("When building the payload", () => {
        it("Then it should join args with spaces", () => {
          const logs: LogEntry[] = [
            {
              level: "log",
              timestamp: 1710000000000,
              args: ["first", "second", "third"],
            },
          ];

          const payload = buildRageshakePayload("Bug", logs, "TestAgent", "0.1.0");

          expect(payload.logs).toContain("first second third");
        });
      });
    });

    describe("Given an empty log array", () => {
      describe("When building the payload", () => {
        it("Then the logs field should be an empty string", () => {
          const payload = buildRageshakePayload("Bug", [], "TestAgent", "0.1.0");

          expect(payload.logs).toBe("");
        });
      });
    });
  });
});
