import { describe, it, expect, beforeEach } from "vitest";
import { OpenClawGateway } from "./gateway.js";
import type { GatewayConfig } from "./gateway.js";

// ── Helpers ─────────────────────────────────────────────────────────────

function defaultConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    url: "ws://localhost:9090/gateway",
    apiKey: "test-key",
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("OpenClawGateway", () => {
  let gw: OpenClawGateway;

  beforeEach(() => {
    gw = new OpenClawGateway(defaultConfig());
  });

  // ── Constructor & config defaults ───────────────────────────────────

  describe("given a new gateway instance", () => {
    it("then the initial state should be 'disconnected'", () => {
      expect(gw.getState()).toBe("disconnected");
    });

    it("then isConnected() should return false", () => {
      expect(gw.isConnected()).toBe(false);
    });

    it("then getReconnectAttempts() should be 0", () => {
      expect(gw.getReconnectAttempts()).toBe(0);
    });
  });

  describe("given default config values", () => {
    it("then connectTimeoutMs should default to 10 000", () => {
      const g = new OpenClawGateway({ url: "ws://localhost" });
      expect(g.getConfig().connectTimeoutMs).toBe(10_000);
    });

    it("then autoReconnect should default to true", () => {
      const g = new OpenClawGateway({ url: "ws://localhost" });
      expect(g.getConfig().autoReconnect).toBe(true);
    });

    it("then maxReconnectAttempts should default to 5", () => {
      const g = new OpenClawGateway({ url: "ws://localhost" });
      expect(g.getConfig().maxReconnectAttempts).toBe(5);
    });
  });

  describe("given explicit config overrides", () => {
    it("then the resolved config should reflect the overrides", () => {
      const g = new OpenClawGateway({
        url: "ws://gateway.example.com",
        apiKey: "my-key",
        connectTimeoutMs: 5_000,
        autoReconnect: false,
        maxReconnectAttempts: 3,
      });
      const cfg = g.getConfig();
      expect(cfg.url).toBe("ws://gateway.example.com");
      expect(cfg.apiKey).toBe("my-key");
      expect(cfg.connectTimeoutMs).toBe(5_000);
      expect(cfg.autoReconnect).toBe(false);
      expect(cfg.maxReconnectAttempts).toBe(3);
    });
  });

  // ── Connection lifecycle ────────────────────────────────────────────

  describe("given connect() is called", () => {
    it("then the state should transition to 'connected'", async () => {
      await gw.connect();
      expect(gw.getState()).toBe("connected");
    });

    it("then isConnected() should return true", async () => {
      await gw.connect();
      expect(gw.isConnected()).toBe(true);
    });

    it("then calling connect() again should be a no-op", async () => {
      await gw.connect();
      await gw.connect(); // idempotent
      expect(gw.getState()).toBe("connected");
    });
  });

  describe("given disconnect() is called after connect()", () => {
    beforeEach(async () => {
      await gw.connect();
    });

    it("then the state should transition to 'disconnected'", async () => {
      await gw.disconnect();
      expect(gw.getState()).toBe("disconnected");
    });

    it("then isConnected() should return false", async () => {
      await gw.disconnect();
      expect(gw.isConnected()).toBe(false);
    });
  });

  describe("given disconnect() is called when already disconnected", () => {
    it("then it should be a safe no-op", async () => {
      await gw.disconnect();
      expect(gw.getState()).toBe("disconnected");
    });
  });

  // ── reason() ────────────────────────────────────────────────────────

  describe("given reason() is called when not connected", () => {
    it("then it should throw a connection error", async () => {
      await expect(gw.reason({ prompt: "Hello" })).rejects.toThrow(/requires a connected gateway/);
    });
  });

  describe("given reason() is called with an empty prompt", () => {
    beforeEach(async () => {
      await gw.connect();
    });

    it("then it should throw a validation error", async () => {
      await expect(gw.reason({ prompt: "" })).rejects.toThrow(/requires a non-empty prompt/);
    });

    it("then whitespace-only prompt should also be rejected", async () => {
      await expect(gw.reason({ prompt: "   " })).rejects.toThrow(/requires a non-empty prompt/);
    });
  });

  describe("given reason() is called when connected with a valid prompt", () => {
    beforeEach(async () => {
      await gw.connect();
    });

    it("then it should throw a 'not yet implemented' error (stub)", async () => {
      await expect(gw.reason({ prompt: "Summarise this document" })).rejects.toThrow(
        /transport not yet implemented/,
      );
    });
  });

  // ── executeTool() ───────────────────────────────────────────────────

  describe("given executeTool() is called when not connected", () => {
    it("then it should throw a connection error", async () => {
      await expect(gw.executeTool("search", { query: "test" })).rejects.toThrow(
        /requires a connected gateway/,
      );
    });
  });

  describe("given executeTool() is called with an empty tool name", () => {
    beforeEach(async () => {
      await gw.connect();
    });

    it("then it should throw a validation error for empty string", async () => {
      await expect(gw.executeTool("", {})).rejects.toThrow(/requires a non-empty tool name/);
    });

    it("then it should throw a validation error for whitespace-only name", async () => {
      await expect(gw.executeTool("  ", {})).rejects.toThrow(/requires a non-empty tool name/);
    });
  });

  describe("given executeTool() is called when connected with a valid name", () => {
    beforeEach(async () => {
      await gw.connect();
    });

    it("then it should throw a 'not yet implemented' error (stub)", async () => {
      await expect(gw.executeTool("search", { query: "test" })).rejects.toThrow(
        /transport not yet implemented/,
      );
    });
  });

  // ── installSkill() ─────────────────────────────────────────────────

  describe("given installSkill() is called when not connected", () => {
    it("then it should throw a connection error", async () => {
      await expect(gw.installSkill("clawhub/web-search")).rejects.toThrow(
        /requires a connected gateway/,
      );
    });
  });

  describe("given installSkill() is called with an empty skill ID", () => {
    beforeEach(async () => {
      await gw.connect();
    });

    it("then it should throw a validation error for empty string", async () => {
      await expect(gw.installSkill("")).rejects.toThrow(/requires a non-empty skill ID/);
    });

    it("then it should throw a validation error for whitespace-only ID", async () => {
      await expect(gw.installSkill("   ")).rejects.toThrow(/requires a non-empty skill ID/);
    });
  });

  describe("given installSkill() is called when connected with a valid ID", () => {
    beforeEach(async () => {
      await gw.connect();
    });

    it("then it should throw a 'not yet implemented' error (stub)", async () => {
      await expect(gw.installSkill("clawhub/web-search")).rejects.toThrow(
        /transport not yet implemented/,
      );
    });
  });

  // ── ping() ──────────────────────────────────────────────────────────

  describe("given ping() is called when disconnected", () => {
    it("then it should return false", async () => {
      expect(await gw.ping()).toBe(false);
    });
  });

  describe("given ping() is called when connected", () => {
    beforeEach(async () => {
      await gw.connect();
    });

    it("then it should return true (stub)", async () => {
      expect(await gw.ping()).toBe(true);
    });
  });

  // ── Reconnect bookkeeping ──────────────────────────────────────────

  describe("given reconnect attempts are recorded", () => {
    it("then getReconnectAttempts() should increment after each record", () => {
      gw.recordReconnectAttempt();
      expect(gw.getReconnectAttempts()).toBe(1);
      gw.recordReconnectAttempt();
      expect(gw.getReconnectAttempts()).toBe(2);
    });

    it("then resetReconnectAttempts() should reset to 0", () => {
      gw.recordReconnectAttempt();
      gw.recordReconnectAttempt();
      gw.resetReconnectAttempts();
      expect(gw.getReconnectAttempts()).toBe(0);
    });
  });

  describe("given exponential backoff schedule", () => {
    it("then attempt 0 should yield 1 000 ms (2^0 * 1000)", () => {
      expect(gw.getBackoffDelay()).toBe(1_000);
    });

    it("then attempt 1 should yield 2 000 ms", () => {
      gw.recordReconnectAttempt(); // now at attempt 1
      expect(gw.getBackoffDelay()).toBe(2_000);
    });

    it("then attempt 2 should yield 4 000 ms", () => {
      gw.recordReconnectAttempt();
      gw.recordReconnectAttempt();
      expect(gw.getBackoffDelay()).toBe(4_000);
    });

    it("then attempt 3 should yield 8 000 ms", () => {
      for (let i = 0; i < 3; i++) gw.recordReconnectAttempt();
      expect(gw.getBackoffDelay()).toBe(8_000);
    });

    it("then attempt 4 should yield 16 000 ms", () => {
      for (let i = 0; i < 4; i++) gw.recordReconnectAttempt();
      expect(gw.getBackoffDelay()).toBe(16_000);
    });

    it("then attempts beyond 4 should be capped at 16 000 ms", () => {
      for (let i = 0; i < 10; i++) gw.recordReconnectAttempt();
      expect(gw.getBackoffDelay()).toBe(16_000);
    });
  });

  describe("given connect() succeeds after reconnect attempts", () => {
    it("then reconnect counter should be reset to 0", async () => {
      gw.recordReconnectAttempt();
      gw.recordReconnectAttempt();
      expect(gw.getReconnectAttempts()).toBe(2);

      await gw.connect();
      expect(gw.getReconnectAttempts()).toBe(0);
    });
  });

  // ── Error state ────────────────────────────────────────────────────

  describe("given the gateway is in error state after disconnect", () => {
    it("then reason() should mention current state in the error", async () => {
      // Disconnect leaves state = "disconnected"
      await expect(gw.reason({ prompt: "test" })).rejects.toThrow(/current state: disconnected/);
    });
  });
});
