/**
 * Helpers for managing custom keyword notification push rules via the Matrix push rules API.
 *
 * Each keyword creates a `content` rule that matches the keyword in message bodies
 * and triggers a notification with sound.
 */
import type { MatrixClient } from "matrix-js-sdk";

/** Prefix used for keyword push rule IDs to distinguish them from other content rules. */
const KEYWORD_RULE_PREFIX = "rocks.openclaw.keyword.";

export interface KeywordRule {
  ruleId: string;
  keyword: string;
  enabled: boolean;
}

/**
 * Build the rule ID for a keyword.
 */
export function buildKeywordRuleId(keyword: string): string {
  return `${KEYWORD_RULE_PREFIX}${keyword}`;
}

/**
 * Get all custom keyword push rules from the client's push rules.
 */
export function getKeywordRules(client: MatrixClient): KeywordRule[] {
  const pushRules = client.pushRules;
  if (!pushRules) return [];

  const global = pushRules.global;
  if (!global) return [];

  const contentRules = global.content;
  if (!Array.isArray(contentRules)) return [];

  const results: KeywordRule[] = [];
  for (const rule of contentRules) {
    const rec = rule as unknown as Record<string, unknown>;
    const ruleId = rec.rule_id;
    if (typeof ruleId === "string" && ruleId.startsWith(KEYWORD_RULE_PREFIX)) {
      const keyword = ruleId.slice(KEYWORD_RULE_PREFIX.length);
      const enabled = rec.enabled !== false;
      results.push({ ruleId, keyword, enabled });
    }
  }
  return results;
}

/**
 * Add a keyword push rule. Creates a `content` rule that matches the keyword
 * in message bodies and triggers a notification with default sound.
 */
export async function addKeywordRule(client: MatrixClient, keyword: string): Promise<void> {
  const ruleId = buildKeywordRuleId(keyword);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client as any).addPushRule("global", "content", ruleId, {
    pattern: keyword,
    actions: ["notify", { set_tweak: "sound", value: "default" }, { set_tweak: "highlight" }],
  });
}

/**
 * Remove a keyword push rule.
 */
export async function removeKeywordRule(client: MatrixClient, keyword: string): Promise<void> {
  const ruleId = buildKeywordRuleId(keyword);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client as any).deletePushRule("global", "content", ruleId);
}

/**
 * Enable or disable email push rules.
 *
 * When `enable` is true, adds an override push rule that triggers
 * an email notification action for all messages.
 *
 * When `enable` is false, removes that rule.
 */
const EMAIL_RULE_ID = "rocks.openclaw.email_notifications";

export async function setEmailNotificationRule(
  client: MatrixClient,
  enable: boolean,
): Promise<void> {
  if (enable) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any).addPushRule("global", "override", EMAIL_RULE_ID, {
      conditions: [{ kind: "event_match", key: "type", pattern: "m.room.message" }],
      actions: ["notify", { set_tweak: "sound", value: "default" }],
    });
  } else {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (client as any).deletePushRule("global", "override", EMAIL_RULE_ID);
    } catch {
      // Rule may not exist; ignore
    }
  }
}
