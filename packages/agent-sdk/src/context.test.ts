import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentContext } from "./context.js";

// Minimal mock of the Matrix client that the AgentContext uses
function createMockClient() {
  const stateStore = new Map<string, Record<string, unknown>>();

  return {
    sendTextMessage: vi.fn().mockResolvedValue({ event_id: "$text1" }),
    sendNotice: vi.fn().mockResolvedValue({ event_id: "$notice1" }),
    sendEvent: vi.fn().mockResolvedValue({ event_id: "$event1" }),
    sendStateEvent: vi
      .fn()
      .mockImplementation(
        (_roomId: string, _type: string, content: Record<string, unknown>, stateKey: string) => {
          stateStore.set(`${_type}:${stateKey}`, content);
          return Promise.resolve({ event_id: "$state1" });
        },
      ),
    getStateEvent: vi
      .fn()
      .mockImplementation((_roomId: string, eventType: string, stateKey: string) => {
        const stored = stateStore.get(`${eventType}:${stateKey}`);
        if (stored) return Promise.resolve(stored);
        return Promise.reject(new Error("State not found"));
      }),
    _stateStore: stateStore,
  };
}

describe("AgentContext", () => {
  let ctx: AgentContext;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();

    ctx = new AgentContext(mockClient as any, "test-agent", "!room:test");
  });

  describe("given basic getters", () => {
    it("then getRoomId should return the room ID", () => {
      expect(ctx.getRoomId()).toBe("!room:test");
    });

    it("then getAgentId should return the agent ID", () => {
      expect(ctx.getAgentId()).toBe("test-agent");
    });
  });

  // ─── US-2.4: Agent Memory ──────────────────────────────────────

  describe("given an empty memory store", () => {
    it("then memoryGet should return null for any key", async () => {
      expect(await ctx.memoryGet("diet")).toBeNull();
    });

    it("then memoryList should return an empty array", async () => {
      expect(await ctx.memoryList()).toEqual([]);
    });

    it("then memoryDelete should return false", async () => {
      expect(await ctx.memoryDelete("nonexistent")).toBe(false);
    });
  });

  describe("given a value is stored with memorySet", () => {
    beforeEach(async () => {
      await ctx.memorySet("diet", "vegetarian");
    });

    it("then memoryGet should return the stored value", async () => {
      expect(await ctx.memoryGet("diet")).toBe("vegetarian");
    });

    it("then memoryList should include the key", async () => {
      expect(await ctx.memoryList()).toContain("diet");
    });

    it("then the state event should contain agent_id and entries", () => {
      expect(mockClient.sendStateEvent).toHaveBeenCalled();
      const lastCall = mockClient.sendStateEvent.mock.calls.at(-1);
      expect(lastCall).toBeDefined();
      const content = lastCall![2] as Record<string, unknown>;
      expect(content.agent_id).toBe("test-agent");
      expect(content.entries).toEqual({ diet: "vegetarian" });
      expect(content.updated_at).toBeTruthy();
      expect(typeof content.size_bytes).toBe("number");
    });
  });

  describe("given multiple values are stored", () => {
    beforeEach(async () => {
      await ctx.memorySet("diet", "vegetarian");
      await ctx.memorySet("goal", "lose weight");
    });

    it("then memoryList should return all keys", async () => {
      const keys = await ctx.memoryList();
      expect(keys).toContain("diet");
      expect(keys).toContain("goal");
    });

    it("then memoryGet should return each value independently", async () => {
      expect(await ctx.memoryGet("diet")).toBe("vegetarian");
      expect(await ctx.memoryGet("goal")).toBe("lose weight");
    });
  });

  describe("given a value is deleted with memoryDelete", () => {
    beforeEach(async () => {
      await ctx.memorySet("diet", "vegetarian");
      await ctx.memorySet("goal", "lose weight");
    });

    it("then it should return true for existing keys", async () => {
      expect(await ctx.memoryDelete("diet")).toBe(true);
    });

    it("then the deleted key should no longer be in memoryList", async () => {
      await ctx.memoryDelete("diet");
      const keys = await ctx.memoryList();
      expect(keys).not.toContain("diet");
      expect(keys).toContain("goal");
    });

    it("then memoryGet should return null for the deleted key", async () => {
      await ctx.memoryDelete("diet");
      expect(await ctx.memoryGet("diet")).toBeNull();
    });
  });

  describe("given memoryClear is called", () => {
    beforeEach(async () => {
      await ctx.memorySet("a", 1);
      await ctx.memorySet("b", 2);
      await ctx.memoryClear();
    });

    it("then memoryList should return an empty array", async () => {
      expect(await ctx.memoryList()).toEqual([]);
    });

    it("then memoryGet should return null for all previous keys", async () => {
      expect(await ctx.memoryGet("a")).toBeNull();
      expect(await ctx.memoryGet("b")).toBeNull();
    });
  });

  describe("given complex values are stored", () => {
    it("then objects should be stored and retrieved correctly", async () => {
      const meal = { name: "Lunch", calories: 650, items: ["salad", "soup"] };
      await ctx.memorySet("last_meal", meal);
      expect(await ctx.memoryGet("last_meal")).toEqual(meal);
    });
  });
});
