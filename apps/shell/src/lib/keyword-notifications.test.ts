import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getKeywordRules,
  addKeywordRule,
  removeKeywordRule,
  buildKeywordRuleId,
  setEmailNotificationRule,
} from "./keyword-notifications";

function createMockClient(contentRules: Array<Record<string, unknown>> = []) {
  return {
    pushRules: {
      global: {
        content: contentRules,
        override: [],
        room: [],
        sender: [],
        underride: [],
      },
    },
    addPushRule: vi.fn().mockResolvedValue(undefined),
    deletePushRule: vi.fn().mockResolvedValue(undefined),
  };
}

describe("keyword-notifications", () => {
  describe("buildKeywordRuleId", () => {
    describe("given a keyword", () => {
      it("should prefix the keyword with the openclaw namespace", () => {
        expect(buildKeywordRuleId("hello")).toBe("rocks.openclaw.keyword.hello");
      });
    });

    describe("given an empty keyword", () => {
      it("should still produce a valid rule ID", () => {
        expect(buildKeywordRuleId("")).toBe("rocks.openclaw.keyword.");
      });
    });
  });

  describe("getKeywordRules", () => {
    describe("given no content rules", () => {
      it("should return an empty array", () => {
        const client = createMockClient([]);

        const rules = getKeywordRules(client as any);
        expect(rules).toEqual([]);
      });
    });

    describe("given content rules with keyword prefix", () => {
      it("should return matching keyword rules", () => {
        const client = createMockClient([
          {
            rule_id: "rocks.openclaw.keyword.urgent",
            enabled: true,
            pattern: "urgent",
            actions: ["notify"],
          },
          {
            rule_id: "rocks.openclaw.keyword.deploy",
            enabled: false,
            pattern: "deploy",
            actions: ["notify"],
          },
          {
            rule_id: ".m.rule.contains_display_name",
            enabled: true,
            pattern: "Alice",
            actions: ["notify"],
          },
        ]);

        const rules = getKeywordRules(client as any);
        expect(rules).toHaveLength(2);
        expect(rules[0]).toEqual({
          ruleId: "rocks.openclaw.keyword.urgent",
          keyword: "urgent",
          enabled: true,
        });
        expect(rules[1]).toEqual({
          ruleId: "rocks.openclaw.keyword.deploy",
          keyword: "deploy",
          enabled: false,
        });
      });
    });

    describe("given a client with no pushRules", () => {
      it("should return an empty array", () => {
        const client = { pushRules: undefined };

        const rules = getKeywordRules(client as any);
        expect(rules).toEqual([]);
      });
    });

    describe("given a client with no global rules", () => {
      it("should return an empty array", () => {
        const client = { pushRules: { global: undefined } };

        const rules = getKeywordRules(client as any);
        expect(rules).toEqual([]);
      });
    });
  });

  describe("addKeywordRule", () => {
    let mockClient: ReturnType<typeof createMockClient>;

    beforeEach(() => {
      mockClient = createMockClient();
    });

    describe("given a keyword to add", () => {
      it("should call addPushRule with the correct scope, kind, and rule ID", async () => {
        await addKeywordRule(mockClient as any, "hotfix");

        expect(mockClient.addPushRule).toHaveBeenCalledTimes(1);
        expect(mockClient.addPushRule).toHaveBeenCalledWith(
          "global",
          "content",
          "rocks.openclaw.keyword.hotfix",
          {
            pattern: "hotfix",
            actions: [
              "notify",
              { set_tweak: "sound", value: "default" },
              { set_tweak: "highlight" },
            ],
          },
        );
      });
    });

    describe("given a keyword with special characters", () => {
      it("should use the keyword as-is in the pattern", async () => {
        await addKeywordRule(mockClient as any, "on-call");

        expect(mockClient.addPushRule).toHaveBeenCalledWith(
          "global",
          "content",
          "rocks.openclaw.keyword.on-call",
          expect.objectContaining({ pattern: "on-call" }),
        );
      });
    });
  });

  describe("removeKeywordRule", () => {
    let mockClient: ReturnType<typeof createMockClient>;

    beforeEach(() => {
      mockClient = createMockClient();
    });

    describe("given a keyword to remove", () => {
      it("should call deletePushRule with the correct scope, kind, and rule ID", async () => {
        await removeKeywordRule(mockClient as any, "hotfix");

        expect(mockClient.deletePushRule).toHaveBeenCalledTimes(1);
        expect(mockClient.deletePushRule).toHaveBeenCalledWith(
          "global",
          "content",
          "rocks.openclaw.keyword.hotfix",
        );
      });
    });
  });

  describe("setEmailNotificationRule", () => {
    let mockClient: ReturnType<typeof createMockClient>;

    beforeEach(() => {
      mockClient = createMockClient();
    });

    describe("given enable is true", () => {
      it("should add an override push rule for email notifications", async () => {
        await setEmailNotificationRule(mockClient as any, true);

        expect(mockClient.addPushRule).toHaveBeenCalledTimes(1);
        expect(mockClient.addPushRule).toHaveBeenCalledWith(
          "global",
          "override",
          "rocks.openclaw.email_notifications",
          {
            conditions: [{ kind: "event_match", key: "type", pattern: "m.room.message" }],
            actions: ["notify", { set_tweak: "sound", value: "default" }],
          },
        );
      });
    });

    describe("given enable is false", () => {
      it("should delete the override push rule for email notifications", async () => {
        await setEmailNotificationRule(mockClient as any, false);

        expect(mockClient.deletePushRule).toHaveBeenCalledTimes(1);
        expect(mockClient.deletePushRule).toHaveBeenCalledWith(
          "global",
          "override",
          "rocks.openclaw.email_notifications",
        );
      });
    });

    describe("given enable is false and the rule does not exist", () => {
      it("should not throw when deletePushRule fails", async () => {
        mockClient.deletePushRule.mockRejectedValue(new Error("Not found"));

        await expect(setEmailNotificationRule(mockClient as any, false)).resolves.toBeUndefined();
      });
    });
  });
});
