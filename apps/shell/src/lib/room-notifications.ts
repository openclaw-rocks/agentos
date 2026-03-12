import { ConditionKind, PushRuleActionName, PushRuleKind, TweakName } from "matrix-js-sdk";
import type { IEventMatchCondition, IPushRule, PushRuleAction } from "matrix-js-sdk";
import type * as sdk from "matrix-js-sdk";

export type RoomNotificationLevel = "all_loud" | "all" | "mentions" | "mute";

/**
 * Read the per-room notification level from the client's push rules.
 *
 * Matrix push rules are evaluated in priority order. We inspect the room-level
 * override rules to determine the effective notification level:
 *
 * - An override rule with `dont_notify` => mute
 * - An override rule with `notify` + `sound` action => all_loud
 * - An override rule with `notify` (no sound) => all
 * - No override rule => mentions (the Matrix default)
 */
export function getRoomNotificationLevel(
  client: sdk.MatrixClient,
  roomId: string,
): RoomNotificationLevel {
  const pushRules = client.pushRules;
  if (!pushRules) return "mentions";

  const globalRules = pushRules.global;
  if (!globalRules) return "mentions";

  // Check override rules first (highest priority)
  const overrideRules = globalRules.override ?? [];
  const overrideRule = overrideRules.find((rule) => ruleMatchesRoom(rule, roomId));

  if (overrideRule) {
    return classifyRuleActions(overrideRule.actions);
  }

  // Check room rules
  const roomRules = globalRules.room ?? [];
  const roomRule = roomRules.find((rule) => rule.rule_id === roomId);

  if (roomRule) {
    return classifyRuleActions(roomRule.actions);
  }

  return "mentions";
}

/**
 * Set the per-room notification level by manipulating Matrix push rules.
 *
 * - `all_loud`: override rule with `notify` + `sound` action
 * - `all`: override rule with `notify` action (no sound)
 * - `mentions`: remove any override (use defaults which notify on mention)
 * - `mute`: override rule with `dont_notify` action
 */
export async function setRoomNotificationLevel(
  client: sdk.MatrixClient,
  roomId: string,
  level: RoomNotificationLevel,
): Promise<void> {
  // First, clean up any existing room-level rules
  await removeExistingRoomRules(client, roomId);

  const roomCondition: IEventMatchCondition = {
    kind: ConditionKind.EventMatch,
    key: "room_id",
    pattern: roomId,
  };

  switch (level) {
    case "mentions":
      // Default behaviour — no override needed. We already removed existing rules.
      break;

    case "mute":
      await client.addPushRule("global", PushRuleKind.Override, roomId, {
        conditions: [roomCondition],
        actions: [PushRuleActionName.DontNotify],
      });
      break;

    case "all":
      await client.addPushRule("global", PushRuleKind.Override, roomId, {
        conditions: [roomCondition],
        actions: [PushRuleActionName.Notify],
      });
      break;

    case "all_loud":
      await client.addPushRule("global", PushRuleKind.Override, roomId, {
        conditions: [roomCondition],
        actions: [PushRuleActionName.Notify, { set_tweak: TweakName.Sound, value: "default" }],
      });
      break;
  }
}

/**
 * Mark a room as read by sending a read receipt for the latest event.
 */
export async function markRoomAsRead(client: sdk.MatrixClient, roomId: string): Promise<void> {
  const room = client.getRoom(roomId);
  if (!room) return;

  const timeline = room.getLiveTimeline().getEvents();
  if (timeline.length === 0) return;

  const lastEvent = timeline[timeline.length - 1];
  await client.sendReadReceipt(lastEvent);
}

/* ----- Internal helpers ----- */

function classifyRuleActions(actions: PushRuleAction[]): RoomNotificationLevel {
  const hasNotify = actions.includes(PushRuleActionName.Notify);
  const hasDontNotify = actions.includes(PushRuleActionName.DontNotify);

  if (hasDontNotify) return "mute";

  if (hasNotify) {
    const hasSound = actions.some(
      (a) => typeof a === "object" && a !== null && a.set_tweak === TweakName.Sound,
    );
    return hasSound ? "all_loud" : "all";
  }

  return "mentions";
}

function ruleMatchesRoom(rule: IPushRule, roomId: string): boolean {
  if (rule.rule_id === roomId) return true;

  const conditions = rule.conditions ?? [];
  return conditions.some((c) => {
    if (c.kind !== ConditionKind.EventMatch) return false;
    const em = c as IEventMatchCondition;
    return em.key === "room_id" && em.pattern === roomId;
  });
}

async function removeExistingRoomRules(client: sdk.MatrixClient, roomId: string): Promise<void> {
  const pushRules = client.pushRules;
  if (!pushRules?.global) return;

  const overrideRules = pushRules.global.override ?? [];
  const roomRules = pushRules.global.room ?? [];

  // Remove matching override rules
  for (const rule of overrideRules) {
    if (ruleMatchesRoom(rule, roomId)) {
      await client.deletePushRule("global", PushRuleKind.Override, rule.rule_id);
    }
  }

  // Remove matching room rules
  for (const rule of roomRules) {
    if (rule.rule_id === roomId) {
      await client.deletePushRule("global", PushRuleKind.RoomSpecific, rule.rule_id);
    }
  }
}
