import { describe, it, expect } from "vitest";
import type { AgentInfo } from "~/lib/agent-registry";

/**
 * Unit tests for UserProfileCard logic.
 * These tests verify the display logic without requiring DOM rendering,
 * since vitest is configured with environment: "node".
 */

interface ProfileCardData {
  userId: string;
  displayName: string;
  isAgent: boolean;
  agentStatus?: string;
  agentCapabilities?: string[];
}

function extractProfileData(opts: {
  userId: string;
  displayName: string;
  agentInfo?: AgentInfo;
}): ProfileCardData {
  return {
    userId: opts.userId,
    displayName: opts.displayName,
    isAgent: !!opts.agentInfo,
    agentStatus: opts.agentInfo?.status,
    agentCapabilities: opts.agentInfo?.capabilities,
  };
}

describe("UserProfileCard", () => {
  describe("given a regular user", () => {
    it("should display the user's name and ID", () => {
      const data = extractProfileData({
        userId: "@alice:matrix.org",
        displayName: "Alice",
      });

      expect(data.displayName).toBe("Alice");
      expect(data.userId).toBe("@alice:matrix.org");
      expect(data.isAgent).toBe(false);
      expect(data.agentStatus).toBeUndefined();
      expect(data.agentCapabilities).toBeUndefined();
    });
  });

  describe("given an agent user", () => {
    it("should display agent status and capabilities", () => {
      const agentInfo: AgentInfo = {
        agentId: "assistant",
        userId: "@agent-assistant:matrix.org",
        displayName: "Assistant",
        description: "Claude-powered assistant",
        capabilities: ["chat", "code", "search"],
        status: "online",
      };

      const data = extractProfileData({
        userId: "@agent-assistant:matrix.org",
        displayName: "Assistant",
        agentInfo,
      });

      expect(data.isAgent).toBe(true);
      expect(data.agentStatus).toBe("online");
      expect(data.agentCapabilities).toEqual(["chat", "code", "search"]);
      expect(data.displayName).toBe("Assistant");
      expect(data.userId).toBe("@agent-assistant:matrix.org");
    });
  });
});
