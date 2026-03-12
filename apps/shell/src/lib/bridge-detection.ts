/**
 * Bridge detection helpers for Matrix rooms.
 *
 * Detects bridge bots and bridged puppet users from room state events
 * and member lists, supporting MSC2346 (m.bridge / uk.half-shot.bridge)
 * as well as heuristic member-name matching for common bridge bots.
 */

export interface BridgeInfo {
  protocol: string;
  network: string;
  channel: string;
  botUserId: string;
  isConnected: boolean;
}

/** Known bridge protocols and the user-ID prefixes used by their puppet users. */
const BRIDGE_USER_PREFIXES: ReadonlyArray<{ prefix: string; protocol: string }> = [
  { prefix: "@slack_", protocol: "slack" },
  { prefix: "@irc_", protocol: "irc" },
  { prefix: "@telegram_", protocol: "telegram" },
  { prefix: "@discord_", protocol: "discord" },
  { prefix: "@whatsapp_", protocol: "whatsapp" },
  { prefix: "@signal_", protocol: "signal" },
];

/** Known bridge bot user-ID patterns (localpart only, checked after the leading @). */
const BRIDGE_BOT_PATTERNS: ReadonlyArray<{ pattern: string; protocol: string }> = [
  { pattern: "slackbot", protocol: "slack" },
  { pattern: "ircbot", protocol: "irc" },
  { pattern: "telegrambot", protocol: "telegram" },
  { pattern: "discordbot", protocol: "discord" },
  { pattern: "whatsappbot", protocol: "whatsapp" },
  { pattern: "signalbot", protocol: "signal" },
];

/** Human-readable display names for bridge protocols. */
const PROTOCOL_DISPLAY_NAMES: Record<string, string> = {
  slack: "Slack",
  irc: "IRC",
  telegram: "Telegram",
  discord: "Discord",
  whatsapp: "WhatsApp",
  signal: "Signal",
};

/** Simple SVG path data for bridge protocol icons. */
const PROTOCOL_ICONS: Record<string, string> = {
  slack:
    "M6 15a2 2 0 01-2 2 2 2 0 01-2-2 2 2 0 012-2h2m2-2a2 2 0 01-2 2H4a2 2 0 01-2-2 2 2 0 012-2h2m2-2a2 2 0 012-2 2 2 0 012 2v2m2 2a2 2 0 01-2-2V7a2 2 0 012-2 2 2 0 012 2v2m-2 2a2 2 0 012 2 2 2 0 01-2 2h-2m-2 2a2 2 0 012-2h2a2 2 0 012 2 2 2 0 01-2 2h-2m-2 2a2 2 0 01-2 2 2 2 0 01-2-2v-2m-2-2a2 2 0 012 2v2a2 2 0 01-2 2 2 2 0 01-2-2v-2",
  irc: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
  telegram: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
  discord:
    "M8 12a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2zm-3-7C6 5 2 9 2 14c0 3 2 5 4 6l1-2c-1 0-3-1-3-4 0-4 3-7 8-7s8 3 8 7c0 3-2 4-3 4l1 2c2-1 4-3 4-6 0-5-4-9-10-9z",
  whatsapp:
    "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z",
  signal:
    "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z",
};

export interface StateEvent {
  getType(): string;
  getStateKey(): string | undefined;
  getContent(): Record<string, unknown>;
}

interface RoomMember {
  userId: string;
}

/**
 * Detect bridge information from room state events.
 *
 * Looks for `m.bridge` or `uk.half-shot.bridge` state events
 * per MSC2346 and extracts bridge metadata.
 */
export function detectBridgeFromState(stateEvents: ReadonlyArray<StateEvent>): BridgeInfo | null {
  for (const event of stateEvents) {
    const eventType = event.getType();
    if (eventType !== "m.bridge" && eventType !== "uk.half-shot.bridge") {
      continue;
    }

    const content = event.getContent();
    if (!content || typeof content !== "object") continue;

    const protocol = content.protocol as Record<string, unknown> | undefined;
    if (!protocol || typeof protocol !== "object") continue;

    const protocolId = typeof protocol.id === "string" ? protocol.id : "unknown";
    const displayName =
      typeof protocol.displayname === "string" ? protocol.displayname : protocolId;

    const network = content.network as Record<string, unknown> | undefined;
    const networkName =
      network && typeof network.displayname === "string" ? network.displayname : "";

    const channel = content.channel as Record<string, unknown> | undefined;
    const channelId = channel && typeof channel.id === "string" ? channel.id : "";

    const creator = typeof content.creator === "string" ? content.creator : "";
    const bridgebot = typeof content.bridgebot === "string" ? content.bridgebot : creator;

    return {
      protocol: displayName.toLowerCase(),
      network: networkName,
      channel: channelId,
      botUserId: bridgebot,
      isConnected: true,
    };
  }

  return null;
}

/**
 * Detect bridge information from room member list by matching common
 * bridge bot naming patterns.
 */
export function detectBridgeFromMembers(members: ReadonlyArray<RoomMember>): BridgeInfo | null {
  // First, look for a bridge bot
  for (const member of members) {
    for (const { pattern, protocol } of BRIDGE_BOT_PATTERNS) {
      const localpart = member.userId.split(":")[0]?.slice(1) ?? "";
      if (localpart === pattern) {
        return {
          protocol,
          network: getBridgeDisplayName(protocol),
          channel: "",
          botUserId: member.userId,
          isConnected: true,
        };
      }
    }
  }

  // Fallback: look for bridged puppet users to infer bridge presence
  for (const member of members) {
    for (const { prefix, protocol } of BRIDGE_USER_PREFIXES) {
      if (member.userId.startsWith(prefix)) {
        return {
          protocol,
          network: getBridgeDisplayName(protocol),
          channel: "",
          botUserId: "",
          isConnected: true,
        };
      }
    }
  }

  return null;
}

/**
 * Return a human-readable display name for a bridge protocol.
 */
export function getBridgeDisplayName(protocol: string): string {
  return PROTOCOL_DISPLAY_NAMES[protocol.toLowerCase()] ?? protocol;
}

/**
 * Return a simple SVG path string for a bridge protocol icon.
 * Falls back to a generic bridge icon if the protocol is not recognized.
 */
export function getBridgeIcon(protocol: string): string {
  const key = protocol.toLowerCase();
  if (key in PROTOCOL_ICONS) {
    return PROTOCOL_ICONS[key];
  }
  // Generic bridge icon (link/chain)
  return "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1";
}

/**
 * Check whether a user ID matches a bridged puppet user pattern.
 *
 * Puppet users are the "ghost" accounts that represent users on the
 * remote platform (e.g. `@slack_U12345:example.com`).
 */
export function isBridgedUser(userId: string): boolean {
  for (const { prefix } of BRIDGE_USER_PREFIXES) {
    if (userId.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/**
 * Check whether a user ID matches a known bridge bot pattern.
 *
 * Bridge bots are the service accounts that manage the bridge
 * (e.g. `@slackbot:example.com`).
 */
export function isBridgeBot(userId: string): boolean {
  const localpart = userId.split(":")[0]?.slice(1) ?? "";
  for (const { pattern } of BRIDGE_BOT_PATTERNS) {
    if (localpart === pattern) {
      return true;
    }
  }
  return false;
}

/**
 * Return the protocol name for a bridged user or bridge bot, or null
 * if the user ID does not match any known pattern.
 */
export function getBridgeProtocol(userId: string): string | null {
  for (const { prefix, protocol } of BRIDGE_USER_PREFIXES) {
    if (userId.startsWith(prefix)) {
      return protocol;
    }
  }
  const localpart = userId.split(":")[0]?.slice(1) ?? "";
  for (const { pattern, protocol } of BRIDGE_BOT_PATTERNS) {
    if (localpart === pattern) {
      return protocol;
    }
  }
  return null;
}
