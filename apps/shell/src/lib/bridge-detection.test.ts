import { describe, it, expect } from "vitest";
import {
  detectBridgeFromState,
  detectBridgeFromMembers,
  getBridgeDisplayName,
  getBridgeIcon,
  isBridgedUser,
  isBridgeBot,
  getBridgeProtocol,
} from "./bridge-detection";

/* ---- Test helpers ---- */

function mockStateEvent(type: string, stateKey: string, content: Record<string, unknown>) {
  return {
    getType: () => type,
    getStateKey: () => stateKey,
    getContent: () => content,
  };
}

function mockMember(userId: string) {
  return { userId };
}

/* ---- Tests ---- */

describe("bridge-detection", () => {
  /* ========================================
   * detectBridgeFromState
   * ======================================== */
  describe("detectBridgeFromState", () => {
    describe("given a valid m.bridge state event", () => {
      it("should extract bridge info", () => {
        // Given
        const events = [
          mockStateEvent("m.bridge", "slack-bridge-key", {
            protocol: { id: "slack", displayname: "Slack" },
            network: { displayname: "Acme Corp Slack" },
            channel: { id: "#general" },
            bridgebot: "@slackbot:example.com",
          }),
        ];

        // When
        const result = detectBridgeFromState(events);

        // Then
        expect(result).not.toBeNull();
        expect(result!.protocol).toBe("slack");
        expect(result!.network).toBe("Acme Corp Slack");
        expect(result!.channel).toBe("#general");
        expect(result!.botUserId).toBe("@slackbot:example.com");
        expect(result!.isConnected).toBe(true);
      });
    });

    describe("given a valid uk.half-shot.bridge state event", () => {
      it("should extract bridge info from the legacy event type", () => {
        // Given
        const events = [
          mockStateEvent("uk.half-shot.bridge", "irc-key", {
            protocol: { id: "irc", displayname: "IRC" },
            network: { displayname: "Libera.Chat" },
            channel: { id: "#matrix" },
            creator: "@ircbot:example.com",
          }),
        ];

        // When
        const result = detectBridgeFromState(events);

        // Then
        expect(result).not.toBeNull();
        expect(result!.protocol).toBe("irc");
        expect(result!.network).toBe("Libera.Chat");
        expect(result!.channel).toBe("#matrix");
        expect(result!.botUserId).toBe("@ircbot:example.com");
      });
    });

    describe("given an empty event list", () => {
      it("should return null", () => {
        // Given / When
        const result = detectBridgeFromState([]);

        // Then
        expect(result).toBeNull();
      });
    });

    describe("given events with no bridge type", () => {
      it("should return null when only non-bridge events are present", () => {
        // Given
        const events = [
          mockStateEvent("m.room.name", "", { name: "My Room" }),
          mockStateEvent("m.room.topic", "", { topic: "Hello" }),
        ];

        // When
        const result = detectBridgeFromState(events);

        // Then
        expect(result).toBeNull();
      });
    });

    describe("given a malformed bridge event", () => {
      it("should return null when protocol field is missing", () => {
        // Given
        const events = [
          mockStateEvent("m.bridge", "bad", {
            // no protocol field
            network: { displayname: "X" },
          }),
        ];

        // When
        const result = detectBridgeFromState(events);

        // Then
        expect(result).toBeNull();
      });

      it("should return null when protocol is not an object", () => {
        // Given
        const events = [
          mockStateEvent("m.bridge", "bad", {
            protocol: "slack",
          }),
        ];

        // When
        const result = detectBridgeFromState(events);

        // Then
        expect(result).toBeNull();
      });

      it("should handle missing optional fields gracefully", () => {
        // Given — protocol present but network/channel/bridgebot missing
        const events = [
          mockStateEvent("m.bridge", "minimal", {
            protocol: { id: "telegram", displayname: "Telegram" },
          }),
        ];

        // When
        const result = detectBridgeFromState(events);

        // Then
        expect(result).not.toBeNull();
        expect(result!.protocol).toBe("telegram");
        expect(result!.network).toBe("");
        expect(result!.channel).toBe("");
        expect(result!.botUserId).toBe("");
      });
    });

    describe("given an event with null content", () => {
      it("should return null", () => {
        // Given
        const events = [
          mockStateEvent("m.bridge", "bad", null as unknown as Record<string, unknown>),
        ];

        // When
        const result = detectBridgeFromState(events);

        // Then
        expect(result).toBeNull();
      });
    });

    describe("given bridgebot falls back to creator", () => {
      it("should use creator when bridgebot is not set", () => {
        // Given
        const events = [
          mockStateEvent("m.bridge", "key", {
            protocol: { id: "discord", displayname: "Discord" },
            creator: "@discordbot:example.com",
          }),
        ];

        // When
        const result = detectBridgeFromState(events);

        // Then
        expect(result!.botUserId).toBe("@discordbot:example.com");
      });
    });
  });

  /* ========================================
   * detectBridgeFromMembers
   * ======================================== */
  describe("detectBridgeFromMembers", () => {
    describe("given a Slack bridge bot in the room", () => {
      it("should detect the Slack bridge", () => {
        // Given
        const members = [
          mockMember("@alice:example.com"),
          mockMember("@slackbot:example.com"),
          mockMember("@bob:example.com"),
        ];

        // When
        const result = detectBridgeFromMembers(members);

        // Then
        expect(result).not.toBeNull();
        expect(result!.protocol).toBe("slack");
        expect(result!.botUserId).toBe("@slackbot:example.com");
        expect(result!.isConnected).toBe(true);
      });
    });

    describe("given an IRC bridge bot", () => {
      it("should detect the IRC bridge", () => {
        // Given
        const members = [mockMember("@ircbot:example.com"), mockMember("@alice:example.com")];

        // When
        const result = detectBridgeFromMembers(members);

        // Then
        expect(result).not.toBeNull();
        expect(result!.protocol).toBe("irc");
        expect(result!.botUserId).toBe("@ircbot:example.com");
      });
    });

    describe("given a Telegram bridge bot", () => {
      it("should detect the Telegram bridge", () => {
        // Given
        const members = [mockMember("@telegrambot:matrix.org")];

        // When
        const result = detectBridgeFromMembers(members);

        // Then
        expect(result).not.toBeNull();
        expect(result!.protocol).toBe("telegram");
      });
    });

    describe("given a Discord bridge bot", () => {
      it("should detect the Discord bridge", () => {
        // Given
        const members = [mockMember("@discordbot:example.com")];

        // When
        const result = detectBridgeFromMembers(members);

        // Then
        expect(result!.protocol).toBe("discord");
      });
    });

    describe("given a WhatsApp bridge bot", () => {
      it("should detect the WhatsApp bridge", () => {
        // Given
        const members = [mockMember("@whatsappbot:example.com")];

        // When
        const result = detectBridgeFromMembers(members);

        // Then
        expect(result!.protocol).toBe("whatsapp");
      });
    });

    describe("given a Signal bridge bot", () => {
      it("should detect the Signal bridge", () => {
        // Given
        const members = [mockMember("@signalbot:example.com")];

        // When
        const result = detectBridgeFromMembers(members);

        // Then
        expect(result!.protocol).toBe("signal");
      });
    });

    describe("given only bridged puppet users (no bot)", () => {
      it("should detect the bridge from puppet user prefixes", () => {
        // Given — room has Slack puppets but no slackbot
        const members = [
          mockMember("@alice:example.com"),
          mockMember("@slack_U12345:example.com"),
          mockMember("@slack_U67890:example.com"),
        ];

        // When
        const result = detectBridgeFromMembers(members);

        // Then
        expect(result).not.toBeNull();
        expect(result!.protocol).toBe("slack");
        // No bot found, so botUserId is empty
        expect(result!.botUserId).toBe("");
      });
    });

    describe("given only regular users", () => {
      it("should return null", () => {
        // Given
        const members = [
          mockMember("@alice:example.com"),
          mockMember("@bob:example.com"),
          mockMember("@carol:matrix.org"),
        ];

        // When
        const result = detectBridgeFromMembers(members);

        // Then
        expect(result).toBeNull();
      });
    });

    describe("given an empty member list", () => {
      it("should return null", () => {
        // Given / When
        const result = detectBridgeFromMembers([]);

        // Then
        expect(result).toBeNull();
      });
    });

    describe("given both a bridge bot and puppet users for the same protocol", () => {
      it("should prefer the bridge bot result", () => {
        // Given
        const members = [
          mockMember("@slack_U111:example.com"),
          mockMember("@slackbot:example.com"),
          mockMember("@alice:example.com"),
        ];

        // When
        const result = detectBridgeFromMembers(members);

        // Then
        expect(result).not.toBeNull();
        expect(result!.protocol).toBe("slack");
        expect(result!.botUserId).toBe("@slackbot:example.com");
      });
    });

    describe("given mixed bridge types", () => {
      it("should detect the first bridge bot found", () => {
        // Given — unlikely but tests priority
        const members = [mockMember("@ircbot:example.com"), mockMember("@slackbot:example.com")];

        // When
        const result = detectBridgeFromMembers(members);

        // Then
        expect(result).not.toBeNull();
        // IRC bot appears first in iteration
        expect(result!.protocol).toBe("irc");
      });
    });
  });

  /* ========================================
   * getBridgeDisplayName
   * ======================================== */
  describe("getBridgeDisplayName", () => {
    describe("given known protocols", () => {
      it("should return 'Slack' for slack", () => {
        expect(getBridgeDisplayName("slack")).toBe("Slack");
      });

      it("should return 'IRC' for irc", () => {
        expect(getBridgeDisplayName("irc")).toBe("IRC");
      });

      it("should return 'Telegram' for telegram", () => {
        expect(getBridgeDisplayName("telegram")).toBe("Telegram");
      });

      it("should return 'Discord' for discord", () => {
        expect(getBridgeDisplayName("discord")).toBe("Discord");
      });

      it("should return 'WhatsApp' for whatsapp", () => {
        expect(getBridgeDisplayName("whatsapp")).toBe("WhatsApp");
      });

      it("should return 'Signal' for signal", () => {
        expect(getBridgeDisplayName("signal")).toBe("Signal");
      });
    });

    describe("given case-insensitive input", () => {
      it("should handle uppercase protocol names", () => {
        expect(getBridgeDisplayName("SLACK")).toBe("Slack");
        expect(getBridgeDisplayName("IRC")).toBe("IRC");
      });

      it("should handle mixed-case protocol names", () => {
        expect(getBridgeDisplayName("Telegram")).toBe("Telegram");
      });
    });

    describe("given an unknown protocol", () => {
      it("should return the protocol string as-is", () => {
        expect(getBridgeDisplayName("mattermost")).toBe("mattermost");
      });
    });
  });

  /* ========================================
   * getBridgeIcon
   * ======================================== */
  describe("getBridgeIcon", () => {
    describe("given known protocols", () => {
      it("should return a non-empty SVG path for slack", () => {
        const icon = getBridgeIcon("slack");
        expect(icon).toBeTruthy();
        expect(icon.length).toBeGreaterThan(0);
      });

      it("should return a non-empty SVG path for irc", () => {
        expect(getBridgeIcon("irc")).toBeTruthy();
      });

      it("should return a non-empty SVG path for telegram", () => {
        expect(getBridgeIcon("telegram")).toBeTruthy();
      });

      it("should return a non-empty SVG path for discord", () => {
        expect(getBridgeIcon("discord")).toBeTruthy();
      });

      it("should return a non-empty SVG path for whatsapp", () => {
        expect(getBridgeIcon("whatsapp")).toBeTruthy();
      });

      it("should return a non-empty SVG path for signal", () => {
        expect(getBridgeIcon("signal")).toBeTruthy();
      });
    });

    describe("given an unknown protocol", () => {
      it("should return a generic fallback SVG path", () => {
        const icon = getBridgeIcon("unknown-bridge");
        expect(icon).toBeTruthy();
        expect(icon.length).toBeGreaterThan(0);
      });
    });

    describe("given case-insensitive input", () => {
      it("should match regardless of case", () => {
        expect(getBridgeIcon("SLACK")).toBe(getBridgeIcon("slack"));
        expect(getBridgeIcon("Discord")).toBe(getBridgeIcon("discord"));
      });
    });
  });

  /* ========================================
   * isBridgedUser
   * ======================================== */
  describe("isBridgedUser", () => {
    describe("given Slack puppet users", () => {
      it("should return true for @slack_U12345:example.com", () => {
        expect(isBridgedUser("@slack_U12345:example.com")).toBe(true);
      });

      it("should return true for @slack_WABCDEF:matrix.org", () => {
        expect(isBridgedUser("@slack_WABCDEF:matrix.org")).toBe(true);
      });
    });

    describe("given IRC puppet users", () => {
      it("should return true for @irc_nick:example.com", () => {
        expect(isBridgedUser("@irc_nick:example.com")).toBe(true);
      });
    });

    describe("given Telegram puppet users", () => {
      it("should return true for @telegram_123456:example.com", () => {
        expect(isBridgedUser("@telegram_123456:example.com")).toBe(true);
      });
    });

    describe("given Discord puppet users", () => {
      it("should return true for @discord_123456789:example.com", () => {
        expect(isBridgedUser("@discord_123456789:example.com")).toBe(true);
      });
    });

    describe("given WhatsApp puppet users", () => {
      it("should return true for @whatsapp_15551234567:example.com", () => {
        expect(isBridgedUser("@whatsapp_15551234567:example.com")).toBe(true);
      });
    });

    describe("given Signal puppet users", () => {
      it("should return true for @signal_uuid:example.com", () => {
        expect(isBridgedUser("@signal_uuid:example.com")).toBe(true);
      });
    });

    describe("given regular Matrix users", () => {
      it("should return false for @alice:example.com", () => {
        expect(isBridgedUser("@alice:example.com")).toBe(false);
      });

      it("should return false for @bob:matrix.org", () => {
        expect(isBridgedUser("@bob:matrix.org")).toBe(false);
      });
    });

    describe("given bridge bots", () => {
      it("should return false for @slackbot:example.com (bot, not puppet)", () => {
        expect(isBridgedUser("@slackbot:example.com")).toBe(false);
      });

      it("should return false for @ircbot:example.com", () => {
        expect(isBridgedUser("@ircbot:example.com")).toBe(false);
      });
    });
  });

  /* ========================================
   * isBridgeBot
   * ======================================== */
  describe("isBridgeBot", () => {
    describe("given known bridge bot user IDs", () => {
      it("should return true for @slackbot:example.com", () => {
        expect(isBridgeBot("@slackbot:example.com")).toBe(true);
      });

      it("should return true for @ircbot:example.com", () => {
        expect(isBridgeBot("@ircbot:example.com")).toBe(true);
      });

      it("should return true for @telegrambot:matrix.org", () => {
        expect(isBridgeBot("@telegrambot:matrix.org")).toBe(true);
      });

      it("should return true for @discordbot:example.com", () => {
        expect(isBridgeBot("@discordbot:example.com")).toBe(true);
      });

      it("should return true for @whatsappbot:example.com", () => {
        expect(isBridgeBot("@whatsappbot:example.com")).toBe(true);
      });

      it("should return true for @signalbot:example.com", () => {
        expect(isBridgeBot("@signalbot:example.com")).toBe(true);
      });
    });

    describe("given regular users", () => {
      it("should return false for @alice:example.com", () => {
        expect(isBridgeBot("@alice:example.com")).toBe(false);
      });

      it("should return false for @bob:matrix.org", () => {
        expect(isBridgeBot("@bob:matrix.org")).toBe(false);
      });
    });

    describe("given puppet users", () => {
      it("should return false for @slack_U12345:example.com", () => {
        expect(isBridgeBot("@slack_U12345:example.com")).toBe(false);
      });

      it("should return false for @irc_nick:example.com", () => {
        expect(isBridgeBot("@irc_nick:example.com")).toBe(false);
      });
    });

    describe("given user IDs with similar but non-matching localparts", () => {
      it("should return false for @slackbot2:example.com", () => {
        expect(isBridgeBot("@slackbot2:example.com")).toBe(false);
      });

      it("should return false for @myslackbot:example.com", () => {
        expect(isBridgeBot("@myslackbot:example.com")).toBe(false);
      });
    });
  });

  /* ========================================
   * getBridgeProtocol
   * ======================================== */
  describe("getBridgeProtocol", () => {
    describe("given a puppet user", () => {
      it("should return the protocol for @slack_U123:example.com", () => {
        expect(getBridgeProtocol("@slack_U123:example.com")).toBe("slack");
      });

      it("should return the protocol for @telegram_456:example.com", () => {
        expect(getBridgeProtocol("@telegram_456:example.com")).toBe("telegram");
      });
    });

    describe("given a bridge bot", () => {
      it("should return the protocol for @ircbot:example.com", () => {
        expect(getBridgeProtocol("@ircbot:example.com")).toBe("irc");
      });

      it("should return the protocol for @discordbot:example.com", () => {
        expect(getBridgeProtocol("@discordbot:example.com")).toBe("discord");
      });
    });

    describe("given a regular user", () => {
      it("should return null for @alice:example.com", () => {
        expect(getBridgeProtocol("@alice:example.com")).toBeNull();
      });
    });
  });
});
