import type { MatrixClient } from "matrix-js-sdk";
import { describe, it, expect, vi } from "vitest";
import { reportEvent, SEVERITY_SCORES, SEVERITY_LABELS } from "./report-content";

function createMockClient(): MatrixClient {
  return {
    reportEvent: vi.fn().mockResolvedValue(undefined),
  } as unknown as MatrixClient;
}

describe("report-content", () => {
  describe("reportEvent", () => {
    describe("given a valid event to report", () => {
      it("should call client.reportEvent with the correct arguments", async () => {
        const client = createMockClient();
        await reportEvent(client, "!room:test", "$event1", -80, "Harassment");
        expect(client.reportEvent).toHaveBeenCalledWith("!room:test", "$event1", -80, "Harassment");
      });
    });

    describe("given a spam report", () => {
      it("should pass score -50", async () => {
        const client = createMockClient();
        await reportEvent(client, "!room:test", "$event2", SEVERITY_SCORES.spam, "Spammy content");
        expect(client.reportEvent).toHaveBeenCalledWith(
          "!room:test",
          "$event2",
          -50,
          "Spammy content",
        );
      });
    });

    describe("given an illegal content report", () => {
      it("should pass score -100", async () => {
        const client = createMockClient();
        await reportEvent(
          client,
          "!room:test",
          "$event3",
          SEVERITY_SCORES.illegal,
          "Illegal material",
        );
        expect(client.reportEvent).toHaveBeenCalledWith(
          "!room:test",
          "$event3",
          -100,
          "Illegal material",
        );
      });
    });

    describe("given a client error", () => {
      it("should propagate the error", async () => {
        const client = createMockClient();
        (client.reportEvent as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("forbidden"));
        await expect(reportEvent(client, "!room:test", "$event4", -30, "test")).rejects.toThrow(
          "forbidden",
        );
      });
    });
  });

  describe("SEVERITY_SCORES", () => {
    it("should have the correct score for each severity", () => {
      expect(SEVERITY_SCORES.spam).toBe(-50);
      expect(SEVERITY_SCORES.harassment).toBe(-80);
      expect(SEVERITY_SCORES.illegal).toBe(-100);
      expect(SEVERITY_SCORES.other).toBe(-30);
    });
  });

  describe("SEVERITY_LABELS", () => {
    it("should have human-readable labels for each severity", () => {
      expect(SEVERITY_LABELS.spam).toBe("Spam");
      expect(SEVERITY_LABELS.harassment).toBe("Harassment");
      expect(SEVERITY_LABELS.illegal).toBe("Illegal content");
      expect(SEVERITY_LABELS.other).toBe("Other");
    });
  });
});
