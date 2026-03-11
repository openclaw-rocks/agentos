import { describe, it, expect } from "vitest";
import { createLogger } from "./logger.js";
import type { LogEntry } from "./logger.js";

function captureLogger(config: { agentId?: string; level?: "debug" | "info" | "warn" | "error" }) {
  const lines: string[] = [];
  const logger = createLogger({
    ...config,
    output: (line: string) => lines.push(line),
  });
  return { logger, lines, parsed: () => lines.map((l) => JSON.parse(l) as LogEntry) };
}

describe("createLogger", () => {
  describe("given a logger created with level 'info'", () => {
    it("then it should output info-level messages", () => {
      const { logger, parsed } = captureLogger({ level: "info" });
      logger.info("hello");
      expect(parsed()).toHaveLength(1);
      expect(parsed()[0].level).toBe("info");
    });

    it("then it should filter out debug-level messages", () => {
      const { logger, lines } = captureLogger({ level: "info" });
      logger.debug("hidden");
      expect(lines).toHaveLength(0);
    });

    it("then it should output warn-level messages", () => {
      const { logger, parsed } = captureLogger({ level: "info" });
      logger.warn("warning");
      expect(parsed()).toHaveLength(1);
      expect(parsed()[0].level).toBe("warn");
    });

    it("then it should output error-level messages", () => {
      const { logger, parsed } = captureLogger({ level: "info" });
      logger.error("failure");
      expect(parsed()).toHaveLength(1);
      expect(parsed()[0].level).toBe("error");
    });
  });

  describe("given a logger created with level 'error'", () => {
    it("then it should only output error messages", () => {
      const { logger, lines } = captureLogger({ level: "error" });
      logger.debug("no");
      logger.info("no");
      logger.warn("no");
      logger.error("yes");
      expect(lines).toHaveLength(1);
      const entry = JSON.parse(lines[0]) as LogEntry;
      expect(entry.level).toBe("error");
    });
  });

  describe("given a logger created with level 'debug'", () => {
    it("then it should output all messages including debug", () => {
      const { logger, lines } = captureLogger({ level: "debug" });
      logger.debug("d");
      logger.info("i");
      logger.warn("w");
      logger.error("e");
      expect(lines).toHaveLength(4);
    });
  });

  describe("given structured JSON output format", () => {
    it("then each line should be valid JSON with level, message, and timestamp", () => {
      const { logger, lines } = captureLogger({ level: "debug" });
      logger.info("structured");
      expect(lines).toHaveLength(1);
      const entry = JSON.parse(lines[0]) as LogEntry;
      expect(entry).toHaveProperty("level", "info");
      expect(entry).toHaveProperty("message", "structured");
      expect(entry).toHaveProperty("timestamp");
      expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
    });

    it("then it should include agentId when configured", () => {
      const { logger, parsed } = captureLogger({ agentId: "echo-bot", level: "debug" });
      logger.info("test");
      expect(parsed()[0].agentId).toBe("echo-bot");
    });

    it("then it should include metadata when provided", () => {
      const { logger, parsed } = captureLogger({ level: "debug" });
      logger.info("with meta", { roomId: "!abc:localhost", count: 42 });
      expect(parsed()[0].metadata).toEqual({ roomId: "!abc:localhost", count: 42 });
    });
  });

  describe("given a child logger", () => {
    it("then it should inherit parent context", () => {
      const { logger, parsed } = captureLogger({ agentId: "parent-agent", level: "debug" });
      const child = logger.child({ roomId: "!room:localhost" });
      child.info("child message");
      expect(parsed()[0].agentId).toBe("parent-agent");
      expect(parsed()[0]).toHaveProperty("roomId", "!room:localhost");
    });

    it("then it should add its own context fields", () => {
      const { logger, parsed } = captureLogger({ level: "debug" });
      const child = logger.child({ correlationId: "req-123" });
      child.info("correlated");
      expect(parsed()[0]).toHaveProperty("correlationId", "req-123");
    });

    it("then it should inherit the parent log level filtering", () => {
      const { logger, lines } = captureLogger({ level: "warn" });
      const child = logger.child({ component: "sub" });
      child.debug("hidden");
      child.info("hidden");
      child.warn("visible");
      expect(lines).toHaveLength(1);
    });
  });
});
