import type { MatrixClient } from "matrix-js-sdk";
import { describe, it, expect, vi } from "vitest";
import { createModerationCommands } from "./moderation-commands";
import type { CommandContext } from "./slash-commands";

function createMockContext(overrides?: Partial<CommandContext>): CommandContext {
  return {
    client: {} as unknown as MatrixClient,
    roomId: "!room:test",
    sendText: vi.fn(),
    sendNotice: vi.fn(),
    sendEmote: vi.fn(),
    sendHtml: vi.fn(),
    sendHtmlEmote: vi.fn(),
    ...overrides,
  };
}

describe("moderation-commands", () => {
  describe("/report command", () => {
    describe("given the user invokes /report", () => {
      it("should call the onOpenReportModal callback", () => {
        const callback = vi.fn();
        const commands = createModerationCommands({ onOpenReportModal: callback });
        const cmd = commands.find((c) => c.name === "report")!;
        const ctx = createMockContext();
        cmd.execute("", ctx);
        expect(callback).toHaveBeenCalledTimes(1);
      });
    });

    describe("given arguments are passed", () => {
      it("should still open the modal (args are ignored)", () => {
        const callback = vi.fn();
        const commands = createModerationCommands({ onOpenReportModal: callback });
        const cmd = commands.find((c) => c.name === "report")!;
        const ctx = createMockContext();
        cmd.execute("some extra text", ctx);
        expect(callback).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("command definitions", () => {
    it("should return one command: report", () => {
      const commands = createModerationCommands({ onOpenReportModal: vi.fn() });
      const names = commands.map((c) => c.name);
      expect(names).toEqual(["report"]);
    });

    it("should have proper usage and description", () => {
      const commands = createModerationCommands({ onOpenReportModal: vi.fn() });
      const report = commands[0];
      expect(report.usage).toBe("/report");
      expect(report.description).toContain("Report");
    });
  });
});
