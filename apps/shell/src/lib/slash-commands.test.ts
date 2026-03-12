import type { MatrixClient } from "matrix-js-sdk";
import { describe, it, expect, vi } from "vitest";
import {
  parseCommand,
  COMMANDS,
  getCommandCompletions,
  rainbowText,
  type CommandContext,
} from "./slash-commands";

function createMockContext(overrides?: Partial<CommandContext>): CommandContext {
  return {
    client: {
      setDisplayName: vi.fn().mockResolvedValue(undefined),
      joinRoom: vi.fn().mockResolvedValue(undefined),
      leave: vi.fn().mockResolvedValue(undefined),
      invite: vi.fn().mockResolvedValue(undefined),
      kick: vi.fn().mockResolvedValue(undefined),
      ban: vi.fn().mockResolvedValue(undefined),
      unban: vi.fn().mockResolvedValue(undefined),
      sendStateEvent: vi.fn().mockResolvedValue(undefined),
      getUserId: vi.fn().mockReturnValue("@me:test"),
      getRoom: vi.fn().mockReturnValue({
        getMember: vi.fn().mockReturnValue({
          events: { member: { getContent: () => ({ membership: "join" }) } },
        }),
        getJoinedMembers: vi
          .fn()
          .mockReturnValue([{ userId: "@me:test" }, { userId: "@other:test" }]),
      }),
      setPowerLevel: vi.fn().mockResolvedValue(undefined),
      getIgnoredUsers: vi.fn().mockReturnValue([]),
      setIgnoredUsers: vi.fn().mockResolvedValue(undefined),
      getAccountData: vi.fn().mockReturnValue({ getContent: () => ({}) }),
      setAccountData: vi.fn().mockResolvedValue(undefined),
    } as unknown as MatrixClient,
    roomId: "!room:test",
    sendText: vi.fn(),
    sendNotice: vi.fn(),
    sendEmote: vi.fn(),
    sendHtml: vi.fn(),
    sendHtmlEmote: vi.fn(),
    ...overrides,
  };
}

describe("slash-commands", () => {
  describe("parseCommand", () => {
    describe("given a valid command input", () => {
      it("should parse command name and args", () => {
        const result = parseCommand("/me waves hello");
        expect(result).toEqual({ command: "me", args: "waves hello" });
      });

      it("should parse command with no args", () => {
        const result = parseCommand("/leave");
        expect(result).toEqual({ command: "leave", args: "" });
      });

      it("should be case-insensitive for command names", () => {
        const result = parseCommand("/TOPIC some topic");
        expect(result).toEqual({ command: "topic", args: "some topic" });
      });

      it("should handle leading whitespace", () => {
        const result = parseCommand("  /me dances");
        expect(result).toEqual({ command: "me", args: "dances" });
      });
    });

    describe("given a non-command input", () => {
      it("should return null for regular text", () => {
        expect(parseCommand("hello world")).toBeNull();
      });

      it("should return null for empty string", () => {
        expect(parseCommand("")).toBeNull();
      });

      it("should return null for slash in the middle of text", () => {
        expect(parseCommand("hello /me")).toBeNull();
      });
    });
  });

  describe("/me command", () => {
    it("should send an emote with the provided text", () => {
      const ctx = createMockContext();
      const cmd = COMMANDS.get("me")!;
      cmd.execute("waves happily", ctx);
      expect(ctx.sendEmote).toHaveBeenCalledWith("waves happily");
    });

    it("should not send anything when args are empty", () => {
      const ctx = createMockContext();
      const cmd = COMMANDS.get("me")!;
      cmd.execute("", ctx);
      expect(ctx.sendEmote).not.toHaveBeenCalled();
    });
  });

  describe("/topic command", () => {
    it("should set the room topic via a state event", async () => {
      const ctx = createMockContext();
      const cmd = COMMANDS.get("topic")!;
      await cmd.execute("New topic here", ctx);
      expect(ctx.client.sendStateEvent).toHaveBeenCalledWith(
        "!room:test",
        "m.room.topic",
        { topic: "New topic here" },
        "",
      );
    });
  });

  describe("/nick command", () => {
    it("should change the user display name", async () => {
      const ctx = createMockContext();
      const cmd = COMMANDS.get("nick")!;
      await cmd.execute("NewName", ctx);
      expect(ctx.client.setDisplayName).toHaveBeenCalledWith("NewName");
    });
  });

  describe("/join command", () => {
    it("should join the specified room", async () => {
      const ctx = createMockContext();
      const cmd = COMMANDS.get("join")!;
      await cmd.execute("#general:matrix.org", ctx);
      expect(ctx.client.joinRoom).toHaveBeenCalledWith("#general:matrix.org");
    });
  });

  describe("/leave command", () => {
    it("should leave the current room", async () => {
      const ctx = createMockContext();
      const cmd = COMMANDS.get("leave")!;
      await cmd.execute("", ctx);
      expect(ctx.client.leave).toHaveBeenCalledWith("!room:test");
    });
  });

  describe("/invite command", () => {
    it("should invite the specified user", async () => {
      const ctx = createMockContext();
      const cmd = COMMANDS.get("invite")!;
      await cmd.execute("@bob:matrix.org", ctx);
      expect(ctx.client.invite).toHaveBeenCalledWith("!room:test", "@bob:matrix.org");
    });
  });

  describe("/kick command", () => {
    it("should kick a user with optional reason", async () => {
      const ctx = createMockContext();
      const cmd = COMMANDS.get("kick")!;
      await cmd.execute("@bob:matrix.org being rude", ctx);
      expect(ctx.client.kick).toHaveBeenCalledWith("!room:test", "@bob:matrix.org", "being rude");
    });

    it("should kick a user without reason", async () => {
      const ctx = createMockContext();
      const cmd = COMMANDS.get("kick")!;
      await cmd.execute("@bob:matrix.org", ctx);
      expect(ctx.client.kick).toHaveBeenCalledWith("!room:test", "@bob:matrix.org", undefined);
    });
  });

  describe("/ban command", () => {
    it("should ban a user with optional reason", async () => {
      const ctx = createMockContext();
      const cmd = COMMANDS.get("ban")!;
      await cmd.execute("@troll:matrix.org spam", ctx);
      expect(ctx.client.ban).toHaveBeenCalledWith("!room:test", "@troll:matrix.org", "spam");
    });
  });

  describe("/unban command", () => {
    it("should unban the specified user", async () => {
      const ctx = createMockContext();
      const cmd = COMMANDS.get("unban")!;
      await cmd.execute("@user:matrix.org", ctx);
      expect(ctx.client.unban).toHaveBeenCalledWith("!room:test", "@user:matrix.org");
    });
  });

  describe("/notice command", () => {
    it("should send a notice message", () => {
      const ctx = createMockContext();
      const cmd = COMMANDS.get("notice")!;
      cmd.execute("Server maintenance at 5pm", ctx);
      expect(ctx.sendNotice).toHaveBeenCalledWith("Server maintenance at 5pm");
    });
  });

  describe("emoticon commands", () => {
    describe("/shrug", () => {
      it("should send shrug with optional text prepended", () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("shrug")!;
        cmd.execute("whatever", ctx);
        expect(ctx.sendText).toHaveBeenCalledWith("whatever \u00AF\\_(\u30C4)_/\u00AF");
      });

      it("should send just the shrug when no text is given", () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("shrug")!;
        cmd.execute("", ctx);
        expect(ctx.sendText).toHaveBeenCalledWith("\u00AF\\_(\u30C4)_/\u00AF");
      });
    });

    describe("/tableflip", () => {
      it("should send tableflip with optional text prepended", () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("tableflip")!;
        cmd.execute("rage", ctx);
        expect(ctx.sendText).toHaveBeenCalledWith(
          "rage (\u256F\u00B0\u25A1\u00B0)\u256F\uFE35 \u253B\u2501\u253B",
        );
      });
    });

    describe("/lenny", () => {
      it("should send lenny face with optional text prepended", () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("lenny")!;
        cmd.execute("oh really", ctx);
        expect(ctx.sendText).toHaveBeenCalledWith(
          "oh really ( \u0361\u00B0 \u035C\u0296 \u0361\u00B0)",
        );
      });
    });
  });

  describe("/help command", () => {
    it("should send a notice listing all available commands", () => {
      const ctx = createMockContext();
      const cmd = COMMANDS.get("help")!;
      cmd.execute("", ctx);
      expect(ctx.sendNotice).toHaveBeenCalledTimes(1);
      const noticeText = (ctx.sendNotice as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(noticeText).toContain("Available commands");
      expect(noticeText).toContain("/me");
      expect(noticeText).toContain("/topic");
      expect(noticeText).toContain("/help");
    });
  });

  describe("/roomname command", () => {
    describe("given a room name argument", () => {
      it("should set the room name via a state event", async () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("roomname")!;
        await cmd.execute("New Room Name", ctx);
        expect(ctx.client.sendStateEvent).toHaveBeenCalledWith(
          "!room:test",
          "m.room.name",
          { name: "New Room Name" },
          "",
        );
      });
    });

    describe("given no arguments", () => {
      it("should not call sendStateEvent", async () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("roomname")!;
        await cmd.execute("", ctx);
        expect(ctx.client.sendStateEvent).not.toHaveBeenCalled();
      });
    });
  });

  describe("/myroomnick command", () => {
    describe("given a nickname argument", () => {
      it("should set the per-room display name via member state event", async () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("myroomnick")!;
        await cmd.execute("RoomNick", ctx);
        expect(ctx.client.sendStateEvent).toHaveBeenCalledWith(
          "!room:test",
          "m.room.member",
          expect.objectContaining({ displayname: "RoomNick" }),
          "@me:test",
        );
      });
    });

    describe("given no arguments", () => {
      it("should not call sendStateEvent", async () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("myroomnick")!;
        await cmd.execute("", ctx);
        expect(ctx.client.sendStateEvent).not.toHaveBeenCalled();
      });
    });
  });

  describe("/op command", () => {
    describe("given a user and power level", () => {
      it("should set the user's power level", async () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("op")!;
        await cmd.execute("@bob:matrix.org 50", ctx);
        expect(ctx.client.setPowerLevel).toHaveBeenCalledWith("!room:test", "@bob:matrix.org", 50);
      });
    });

    describe("given missing power level", () => {
      it("should not set power level", async () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("op")!;
        await cmd.execute("@bob:matrix.org", ctx);
        expect(ctx.client.setPowerLevel).not.toHaveBeenCalled();
      });
    });

    describe("given non-numeric power level", () => {
      it("should not set power level", async () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("op")!;
        await cmd.execute("@bob:matrix.org abc", ctx);
        expect(ctx.client.setPowerLevel).not.toHaveBeenCalled();
      });
    });
  });

  describe("/deop command", () => {
    describe("given a user", () => {
      it("should reset power level to 0", async () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("deop")!;
        await cmd.execute("@bob:matrix.org", ctx);
        expect(ctx.client.setPowerLevel).toHaveBeenCalledWith("!room:test", "@bob:matrix.org", 0);
      });
    });

    describe("given no arguments", () => {
      it("should not call setPowerLevel", async () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("deop")!;
        await cmd.execute("", ctx);
        expect(ctx.client.setPowerLevel).not.toHaveBeenCalled();
      });
    });
  });

  describe("/ignore command", () => {
    describe("given a user to ignore", () => {
      it("should add the user to the ignore list and send a notice", async () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("ignore")!;
        await cmd.execute("@spam:matrix.org", ctx);

        expect((ctx.client as any).setIgnoredUsers).toHaveBeenCalledWith(["@spam:matrix.org"]);
        expect(ctx.sendNotice).toHaveBeenCalledWith("Ignored user @spam:matrix.org");
      });
    });

    describe("given the user is already ignored", () => {
      it("should not duplicate the user in the list", async () => {
        const ctx = createMockContext({
          client: {
            ...createMockContext().client,
            getIgnoredUsers: vi.fn().mockReturnValue(["@spam:matrix.org"]),
            setIgnoredUsers: vi.fn().mockResolvedValue(undefined),
          } as unknown as MatrixClient,
        });
        const cmd = COMMANDS.get("ignore")!;
        await cmd.execute("@spam:matrix.org", ctx);
        // ignoreUser returns early without calling setIgnoredUsers when already ignored

        expect((ctx.client as any).setIgnoredUsers).not.toHaveBeenCalled();
      });
    });
  });

  describe("/unignore command", () => {
    describe("given a user to unignore", () => {
      it("should remove the user from the ignore list and send a notice", async () => {
        const ctx = createMockContext({
          client: {
            ...createMockContext().client,
            getIgnoredUsers: vi.fn().mockReturnValue(["@spam:matrix.org", "@other:matrix.org"]),
            setIgnoredUsers: vi.fn().mockResolvedValue(undefined),
          } as unknown as MatrixClient,
        });
        const cmd = COMMANDS.get("unignore")!;
        await cmd.execute("@spam:matrix.org", ctx);

        expect((ctx.client as any).setIgnoredUsers).toHaveBeenCalledWith(["@other:matrix.org"]);
        expect(ctx.sendNotice).toHaveBeenCalledWith("Unignored user @spam:matrix.org");
      });
    });
  });

  describe("/converttodm command", () => {
    describe("given a room with another member", () => {
      it("should mark the room as a DM in account data", async () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("converttodm")!;
        await cmd.execute("", ctx);

        expect((ctx.client as any).setAccountData).toHaveBeenCalledWith("m.direct", {
          "@other:test": ["!room:test"],
        });
      });
    });
  });

  describe("/converttoroom command", () => {
    describe("given a room that is currently a DM", () => {
      it("should remove the room from the DM list in account data", async () => {
        const ctx = createMockContext({
          client: {
            ...createMockContext().client,
            getAccountData: vi.fn().mockReturnValue({
              getContent: () => ({ "@other:test": ["!room:test", "!other:test"] }),
            }),
            setAccountData: vi.fn().mockResolvedValue(undefined),
          } as unknown as MatrixClient,
        });
        const cmd = COMMANDS.get("converttoroom")!;
        await cmd.execute("", ctx);

        expect((ctx.client as any).setAccountData).toHaveBeenCalledWith("m.direct", {
          "@other:test": ["!other:test"],
        });
      });
    });
  });

  describe("rainbowText", () => {
    describe("given a string of text", () => {
      it("should wrap each non-space character in a colored span", () => {
        const result = rainbowText("Hi");
        expect(result).toContain("<span");
        expect(result).toContain("hsl(");
        expect(result).toContain("H");
        expect(result).toContain("i");
      });

      it("should preserve spaces without wrapping", () => {
        const result = rainbowText("a b");
        expect(result).toContain(" ");
        // Spaces are not wrapped in spans
        const spansCount = (result.match(/<span/g) ?? []).length;
        expect(spansCount).toBe(2); // only "a" and "b"
      });

      it("should return empty string for empty input", () => {
        expect(rainbowText("")).toBe("");
      });
    });
  });

  describe("/rainbow command", () => {
    describe("given text", () => {
      it("should send an HTML message with rainbow-colored text", () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("rainbow")!;
        cmd.execute("hello", ctx);
        expect(ctx.sendHtml).toHaveBeenCalledTimes(1);
        const [plain, html] = (ctx.sendHtml as ReturnType<typeof vi.fn>).mock.calls[0] as [
          string,
          string,
        ];
        expect(plain).toBe("hello");
        expect(html).toContain("<span");
        expect(html).toContain("hsl(");
      });
    });

    describe("given no arguments", () => {
      it("should not send anything", () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("rainbow")!;
        cmd.execute("", ctx);
        expect(ctx.sendHtml).not.toHaveBeenCalled();
      });
    });
  });

  describe("/rainbowme command", () => {
    describe("given text", () => {
      it("should send an HTML emote with rainbow-colored text", () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("rainbowme")!;
        cmd.execute("dances", ctx);
        expect(ctx.sendHtmlEmote).toHaveBeenCalledTimes(1);
        const [plain, html] = (ctx.sendHtmlEmote as ReturnType<typeof vi.fn>).mock.calls[0] as [
          string,
          string,
        ];
        expect(plain).toBe("dances");
        expect(html).toContain("<span");
        expect(html).toContain("hsl(");
      });
    });

    describe("given no arguments", () => {
      it("should not send anything", () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("rainbowme")!;
        cmd.execute("", ctx);
        expect(ctx.sendHtmlEmote).not.toHaveBeenCalled();
      });
    });
  });

  describe("/html command", () => {
    describe("given HTML content", () => {
      it("should send the text as an HTML formatted message", () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("html")!;
        cmd.execute("<b>bold</b> text", ctx);
        expect(ctx.sendHtml).toHaveBeenCalledWith("<b>bold</b> text", "<b>bold</b> text");
      });
    });

    describe("given no arguments", () => {
      it("should not send anything", () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("html")!;
        cmd.execute("", ctx);
        expect(ctx.sendHtml).not.toHaveBeenCalled();
      });
    });
  });

  describe("/myroomavatar command", () => {
    describe("given an MXC URL argument", () => {
      it("should set the per-room avatar via member state event", async () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("myroomavatar")!;
        await cmd.execute("mxc://server.com/avatar123", ctx);
        expect(ctx.client.sendStateEvent).toHaveBeenCalledWith(
          "!room:test",
          "m.room.member",
          expect.objectContaining({ avatar_url: "mxc://server.com/avatar123" }),
          "@me:test",
        );
      });
    });

    describe("given no arguments", () => {
      it("should not call sendStateEvent", async () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("myroomavatar")!;
        await cmd.execute("", ctx);
        expect(ctx.client.sendStateEvent).not.toHaveBeenCalled();
      });
    });
  });

  describe("/markdown command", () => {
    describe("given 'on' argument", () => {
      it("should enable markdown and send a notice", () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("markdown")!;
        cmd.execute("on", ctx);
        expect(ctx.sendNotice).toHaveBeenCalledWith("Markdown rendering enabled");
      });
    });

    describe("given 'off' argument", () => {
      it("should disable markdown and send a notice", () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("markdown")!;
        cmd.execute("off", ctx);
        expect(ctx.sendNotice).toHaveBeenCalledWith("Markdown rendering disabled");
      });
    });

    describe("given an invalid argument", () => {
      it("should send usage notice", () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("markdown")!;
        cmd.execute("maybe", ctx);
        expect(ctx.sendNotice).toHaveBeenCalledWith("Usage: /markdown <on|off>");
      });
    });

    describe("given no arguments", () => {
      it("should send usage notice", () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("markdown")!;
        cmd.execute("", ctx);
        expect(ctx.sendNotice).toHaveBeenCalledWith("Usage: /markdown <on|off>");
      });
    });
  });

  describe("/upgraderoom command", () => {
    describe("given a version argument", () => {
      it("should call upgradeRoom on the client", async () => {
        const ctx = createMockContext({
          client: {
            ...createMockContext().client,
            upgradeRoom: vi.fn().mockResolvedValue({ replacement_room: "!new-room:test" }),
          } as unknown as MatrixClient,
        });
        const cmd = COMMANDS.get("upgraderoom")!;
        await cmd.execute("10", ctx);

        expect((ctx.client as any).upgradeRoom).toHaveBeenCalledWith("!room:test", {
          version: "10",
        });
        expect(ctx.sendNotice).toHaveBeenCalledWith(
          "Room upgraded to version 10. New room: !new-room:test",
        );
      });
    });

    describe("given no arguments", () => {
      it("should send usage notice", async () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("upgraderoom")!;
        await cmd.execute("", ctx);
        expect(ctx.sendNotice).toHaveBeenCalledWith("Usage: /upgraderoom <version>");
      });
    });
  });

  describe("getCommandCompletions", () => {
    it("should return all commands when just / is typed", () => {
      const results = getCommandCompletions("/");
      expect(results.length).toBe(COMMANDS.size);
    });

    it("should return matching commands for a partial input", () => {
      const results = getCommandCompletions("/sh");
      expect(results.length).toBe(1);
      expect(results[0].name).toBe("shrug");
    });

    it("should return multiple matches when applicable", () => {
      const results = getCommandCompletions("/le");
      const names = results.map((c) => c.name);
      expect(names).toContain("leave");
      expect(names).toContain("lenny");
    });

    it("should return empty array for non-slash input", () => {
      expect(getCommandCompletions("hello")).toEqual([]);
    });

    it("should return empty array when no commands match", () => {
      expect(getCommandCompletions("/zzzzz")).toEqual([]);
    });

    it("should not return completions when input has a space after the command", () => {
      expect(getCommandCompletions("/me ")).toEqual([]);
    });
  });

  describe("/plain command", () => {
    it("should send text without markdown processing", () => {
      const ctx = createMockContext();
      const cmd = COMMANDS.get("plain")!;
      cmd.execute("**not bold**", ctx);
      expect(ctx.sendText).toHaveBeenCalledWith("**not bold**");
    });
  });

  describe("/addwidget command", () => {
    describe("given a URL argument", () => {
      it("should send a widget state event and notice", async () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("addwidget")!;
        await cmd.execute("https://example.com/widget", ctx);
        expect(ctx.client.sendStateEvent).toHaveBeenCalledWith(
          "!room:test",
          "im.vector.modular.widgets",
          expect.objectContaining({
            type: "customwidget",
            url: "https://example.com/widget",
            name: "Custom Widget",
          }),
          expect.stringContaining("widget_"),
        );
        expect(ctx.sendNotice).toHaveBeenCalledWith(expect.stringContaining("Widget added"));
      });
    });

    describe("given no arguments", () => {
      it("should send usage notice", async () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("addwidget")!;
        await cmd.execute("", ctx);
        expect(ctx.sendNotice).toHaveBeenCalledWith("Usage: /addwidget <url>");
      });
    });
  });

  describe("/whois command", () => {
    describe("given a user who can be looked up via admin API", () => {
      it("should show whois info with device count", async () => {
        const ctx = createMockContext({
          client: {
            ...createMockContext().client,
            whoisUser: vi.fn().mockResolvedValue({
              devices: { device1: {}, device2: {} },
            }),
          } as unknown as MatrixClient,
        });
        const cmd = COMMANDS.get("whois")!;
        await cmd.execute("@alice:test", ctx);
        expect(ctx.sendNotice).toHaveBeenCalledWith(expect.stringContaining("2 device(s)"));
      });
    });

    describe("given admin API fails, falling back to profile", () => {
      it("should show profile info", async () => {
        const ctx = createMockContext({
          client: {
            ...createMockContext().client,
            whoisUser: vi.fn().mockRejectedValue(new Error("forbidden")),
            getProfileInfo: vi.fn().mockResolvedValue({
              displayname: "Alice",
              avatar_url: "mxc://server/abc",
            }),
          } as unknown as MatrixClient,
        });
        const cmd = COMMANDS.get("whois")!;
        await cmd.execute("@alice:test", ctx);
        expect(ctx.sendNotice).toHaveBeenCalledWith(expect.stringContaining("Alice"));
        expect(ctx.sendNotice).toHaveBeenCalledWith(expect.stringContaining("mxc://server/abc"));
      });
    });

    describe("given no arguments", () => {
      it("should send usage notice", async () => {
        const ctx = createMockContext();
        const cmd = COMMANDS.get("whois")!;
        await cmd.execute("", ctx);
        expect(ctx.sendNotice).toHaveBeenCalledWith("Usage: /whois <user>");
      });
    });

    describe("given both admin and profile lookups fail", () => {
      it("should send an error notice", async () => {
        const ctx = createMockContext({
          client: {
            ...createMockContext().client,
            whoisUser: vi.fn().mockRejectedValue(new Error("forbidden")),
            getProfileInfo: vi.fn().mockRejectedValue(new Error("not found")),
          } as unknown as MatrixClient,
        });
        const cmd = COMMANDS.get("whois")!;
        await cmd.execute("@unknown:test", ctx);
        expect(ctx.sendNotice).toHaveBeenCalledWith("Could not fetch info for @unknown:test");
      });
    });
  });
});
