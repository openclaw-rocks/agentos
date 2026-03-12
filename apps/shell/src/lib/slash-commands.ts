import type { MatrixClient } from "matrix-js-sdk";
import { ignoreUser, unignoreUser } from "./user-ignore";

export interface CommandContext {
  client: MatrixClient;
  roomId: string;
  sendText: (text: string) => void;
  sendNotice: (text: string) => void;
  sendEmote: (text: string) => void;
  sendHtml: (plain: string, html: string) => void;
  sendHtmlEmote: (plain: string, html: string) => void;
}

export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  execute: (args: string, context: CommandContext) => Promise<void> | void;
}

export interface ParsedCommand {
  command: string;
  args: string;
}

export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith("/")) return null;

  const match = trimmed.match(/^\/(\S+)\s*(.*)/s);
  if (!match) return null;

  return {
    command: match[1].toLowerCase(),
    args: match[2].trimEnd(),
  };
}

export const COMMANDS: Map<string, SlashCommand> = new Map();

function registerCommand(cmd: SlashCommand): void {
  COMMANDS.set(cmd.name, cmd);
}

registerCommand({
  name: "me",
  description: "Send an emote action",
  usage: "/me <action>",
  execute(args, ctx) {
    if (!args) return;
    ctx.sendEmote(args);
  },
});

registerCommand({
  name: "topic",
  description: "Set the room topic",
  usage: "/topic <text>",
  async execute(args, ctx) {
    if (!args) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.client.sendStateEvent(ctx.roomId, "m.room.topic" as any, { topic: args }, "");
  },
});

registerCommand({
  name: "nick",
  description: "Change your display name",
  usage: "/nick <name>",
  async execute(args, ctx) {
    if (!args) return;
    await ctx.client.setDisplayName(args);
  },
});

registerCommand({
  name: "join",
  description: "Join a room",
  usage: "/join <room>",
  async execute(args, ctx) {
    if (!args) return;
    await ctx.client.joinRoom(args.trim());
  },
});

registerCommand({
  name: "leave",
  description: "Leave the current room",
  usage: "/leave",
  async execute(_args, ctx) {
    await ctx.client.leave(ctx.roomId);
  },
});

registerCommand({
  name: "invite",
  description: "Invite a user to this room",
  usage: "/invite <userId>",
  async execute(args, ctx) {
    if (!args) return;
    await ctx.client.invite(ctx.roomId, args.trim());
  },
});

registerCommand({
  name: "kick",
  description: "Kick a user from this room",
  usage: "/kick <userId> [reason]",
  async execute(args, ctx) {
    if (!args) return;
    const parts = args.split(/\s+/);
    const userId = parts[0];
    const reason = parts.slice(1).join(" ") || undefined;
    await ctx.client.kick(ctx.roomId, userId, reason);
  },
});

registerCommand({
  name: "ban",
  description: "Ban a user from this room",
  usage: "/ban <userId> [reason]",
  async execute(args, ctx) {
    if (!args) return;
    const parts = args.split(/\s+/);
    const userId = parts[0];
    const reason = parts.slice(1).join(" ") || undefined;
    await ctx.client.ban(ctx.roomId, userId, reason);
  },
});

registerCommand({
  name: "unban",
  description: "Unban a user from this room",
  usage: "/unban <userId>",
  async execute(args, ctx) {
    if (!args) return;
    await ctx.client.unban(ctx.roomId, args.trim());
  },
});

registerCommand({
  name: "notice",
  description: "Send a notice message",
  usage: "/notice <text>",
  execute(args, ctx) {
    if (!args) return;
    ctx.sendNotice(args);
  },
});

registerCommand({
  name: "shrug",
  description: "Send a shrug emoticon",
  usage: "/shrug [text]",
  execute(args, ctx) {
    const shrug = "\u00AF\\_(\u30C4)_/\u00AF";
    const text = args ? `${args} ${shrug}` : shrug;
    ctx.sendText(text);
  },
});

registerCommand({
  name: "tableflip",
  description: "Send a tableflip emoticon",
  usage: "/tableflip [text]",
  execute(args, ctx) {
    const flip = "(\u256F\u00B0\u25A1\u00B0)\u256F\uFE35 \u253B\u2501\u253B";
    const text = args ? `${args} ${flip}` : flip;
    ctx.sendText(text);
  },
});

registerCommand({
  name: "lenny",
  description: "Send a lenny face",
  usage: "/lenny [text]",
  execute(args, ctx) {
    const lenny = "( \u0361\u00B0 \u035C\u0296 \u0361\u00B0)";
    const text = args ? `${args} ${lenny}` : lenny;
    ctx.sendText(text);
  },
});

registerCommand({
  name: "plain",
  description: "Send a message without markdown processing",
  usage: "/plain <text>",
  execute(args, ctx) {
    if (!args) return;
    ctx.sendText(args);
  },
});

registerCommand({
  name: "roomname",
  description: "Change the room name",
  usage: "/roomname <name>",
  async execute(args, ctx) {
    if (!args) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.client.sendStateEvent(ctx.roomId, "m.room.name" as any, { name: args }, "");
  },
});

registerCommand({
  name: "myroomnick",
  description: "Change your per-room display name",
  usage: "/myroomnick <name>",
  async execute(args, ctx) {
    if (!args) return;
    const userId = ctx.client.getUserId();
    if (!userId) return;

    const memberEvent = ctx.client.getRoom(ctx.roomId)?.getMember(userId);
    const currentContent = memberEvent?.events?.member?.getContent() ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.client.sendStateEvent(
      ctx.roomId,
      "m.room.member" as any,
      {
        ...currentContent,
        displayname: args,
      },
      userId,
    );
  },
});

registerCommand({
  name: "op",
  description: "Set a user's power level",
  usage: "/op <user> <level>",
  async execute(args, ctx) {
    if (!args) return;
    const parts = args.split(/\s+/);
    if (parts.length < 2) return;
    const userId = parts[0];
    const level = parseInt(parts[1], 10);
    if (isNaN(level)) return;
    await ctx.client.setPowerLevel(ctx.roomId, userId, level);
  },
});

registerCommand({
  name: "deop",
  description: "Reset a user's power level to default",
  usage: "/deop <user>",
  async execute(args, ctx) {
    if (!args) return;
    await ctx.client.setPowerLevel(ctx.roomId, args.trim(), 0);
  },
});

registerCommand({
  name: "ignore",
  description: "Ignore/block a user (hides their messages)",
  usage: "/ignore <@user:server>",
  async execute(args, ctx) {
    if (!args) return;
    const userId = args.trim();
    await ignoreUser(ctx.client, userId);
    ctx.sendNotice(`Ignored user ${userId}`);
  },
});

registerCommand({
  name: "unignore",
  description: "Unignore/unblock a user",
  usage: "/unignore <@user:server>",
  async execute(args, ctx) {
    if (!args) return;
    const userId = args.trim();
    await unignoreUser(ctx.client, userId);
    ctx.sendNotice(`Unignored user ${userId}`);
  },
});

registerCommand({
  name: "converttodm",
  description: "Mark this room as a direct message",
  usage: "/converttodm",
  async execute(_args, ctx) {
    const userId = ctx.client.getUserId();
    if (!userId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accountData = (ctx.client as any).getAccountData?.("m.direct");
    const content: Record<string, string[]> = accountData?.getContent?.() ?? {};
    const members = ctx.client.getRoom(ctx.roomId)?.getJoinedMembers() ?? [];
    const otherUser = members.find((m) => m.userId !== userId);
    if (!otherUser) return;
    const existing = content[otherUser.userId] ?? [];
    if (!existing.includes(ctx.roomId)) {
      content[otherUser.userId] = [...existing, ctx.roomId];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ctx.client as any).setAccountData("m.direct", content);
  },
});

registerCommand({
  name: "converttoroom",
  description: "Unmark this room as a direct message",
  usage: "/converttoroom",
  async execute(_args, ctx) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accountData = (ctx.client as any).getAccountData?.("m.direct");
    const content: Record<string, string[]> = accountData?.getContent?.() ?? {};
    for (const userId of Object.keys(content)) {
      content[userId] = content[userId].filter((rid: string) => rid !== ctx.roomId);
      if (content[userId].length === 0) {
        delete content[userId];
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ctx.client as any).setAccountData("m.direct", content);
  },
});

export function rainbowText(text: string): string {
  const chars = [...text];
  if (chars.length === 0) return "";
  return chars
    .map((char, i) => {
      if (char === " ") return " ";
      const hue = Math.round((i / Math.max(chars.length - 1, 1)) * 360);
      return `<span style="color: hsl(${hue}, 100%, 50%)">${char}</span>`;
    })
    .join("");
}

registerCommand({
  name: "rainbow",
  description: "Send text with rainbow colors",
  usage: "/rainbow <text>",
  execute(args, ctx) {
    if (!args) return;
    const html = rainbowText(args);
    ctx.sendHtml(args, html);
  },
});

registerCommand({
  name: "rainbowme",
  description: "Send an emote with rainbow colors",
  usage: "/rainbowme <text>",
  execute(args, ctx) {
    if (!args) return;
    const html = rainbowText(args);
    ctx.sendHtmlEmote(args, html);
  },
});

registerCommand({
  name: "html",
  description: "Send an HTML formatted message",
  usage: "/html <text>",
  execute(args, ctx) {
    if (!args) return;
    ctx.sendHtml(args, args);
  },
});

registerCommand({
  name: "devtools",
  description: "Open the developer tools panel",
  usage: "/devtools",
  execute() {
    window.dispatchEvent(new CustomEvent("openclaw:open-devtools"));
  },
});

registerCommand({
  name: "help",
  description: "List available slash commands",
  usage: "/help",
  execute(_args, ctx) {
    const lines: string[] = ["**Available commands:**"];
    for (const cmd of COMMANDS.values()) {
      lines.push(`\`${cmd.usage}\` — ${cmd.description}`);
    }
    ctx.sendNotice(lines.join("\n"));
  },
});

/**
 * Register additional slash commands at runtime.
 * Used by moderation-commands and other extensions.
 */
export function registerCommands(commands: SlashCommand[]): void {
  for (const cmd of commands) {
    COMMANDS.set(cmd.name, cmd);
  }
}

registerCommand({
  name: "myroomavatar",
  description: "Set your per-room avatar via URL",
  usage: "/myroomavatar <mxc://url>",
  async execute(args, ctx) {
    if (!args) return;
    const userId = ctx.client.getUserId();
    if (!userId) return;

    const memberEvent = ctx.client.getRoom(ctx.roomId)?.getMember(userId);
    const currentContent = memberEvent?.events?.member?.getContent() ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.client.sendStateEvent(
      ctx.roomId,
      "m.room.member" as any,
      {
        ...currentContent,
        avatar_url: args.trim(),
      },
      userId,
    );
  },
});

registerCommand({
  name: "markdown",
  description: "Toggle markdown rendering preference",
  usage: "/markdown <on|off>",
  execute(args, ctx) {
    const val = args.trim().toLowerCase();
    if (val !== "on" && val !== "off") {
      ctx.sendNotice("Usage: /markdown <on|off>");
      return;
    }
    const enabled = val === "on";
    try {
      const raw = localStorage.getItem("openclaw-settings");
      const settings = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      settings.markdownEnabled = enabled;
      localStorage.setItem("openclaw-settings", JSON.stringify(settings));
    } catch {
      // best-effort
    }
    ctx.sendNotice(`Markdown rendering ${enabled ? "enabled" : "disabled"}`);
  },
});

registerCommand({
  name: "upgraderoom",
  description: "Upgrade the room to a specified version",
  usage: "/upgraderoom <version>",
  async execute(args, ctx) {
    const version = args.trim();
    if (!version) {
      ctx.sendNotice("Usage: /upgraderoom <version>");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (ctx.client as any).upgradeRoom(ctx.roomId, { version });
    const newRoomId = result?.replacement_room as string | undefined;
    if (newRoomId) {
      ctx.sendNotice(`Room upgraded to version ${version}. New room: ${newRoomId}`);
    }
  },
});

registerCommand({
  name: "addwidget",
  description: "Add a widget to the room",
  usage: "/addwidget <url>",
  async execute(args, ctx) {
    const url = args.trim();
    if (!url) {
      ctx.sendNotice("Usage: /addwidget <url>");
      return;
    }
    const widgetId = `widget_${Date.now()}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.client.sendStateEvent(
      ctx.roomId,
      "im.vector.modular.widgets" as any,
      {
        type: "customwidget",
        url,
        name: "Custom Widget",
        data: {},
      },
      widgetId,
    );
    ctx.sendNotice("Widget added.");
  },
});

registerCommand({
  name: "rageshake",
  description: "Report a bug",
  usage: "/rageshake",
  execute(_args, ctx) {
    ctx.sendNotice("To report a bug, use the Report Bug button in Settings > About.");
    window.dispatchEvent(new CustomEvent("openclaw:open-bugreport"));
  },
});

registerCommand({
  name: "whois",
  description: "Show user profile info",
  usage: "/whois <user>",
  async execute(args, ctx) {
    const targetUserId = args.trim();
    if (!targetUserId) {
      ctx.sendNotice("Usage: /whois <user>");
      return;
    }
    // Try admin whois first, fall back to profile info
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const info = await (ctx.client as any).whoisUser(targetUserId);
      if (info) {
        const connections = info.devices
          ? Object.values(info.devices as Record<string, unknown>).length
          : 0;
        ctx.sendNotice(`**User:** ${targetUserId}\n**Connections:** ${connections} device(s)`);
        return;
      }
    } catch {
      // Not an admin or whois not supported — fall back to profile
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profile = await (ctx.client as any).getProfileInfo(targetUserId);
      const displayName = (profile?.displayname as string) ?? "N/A";
      const avatarUrl = (profile?.avatar_url as string) ?? "N/A";
      ctx.sendNotice(
        `**User:** ${targetUserId}\n**Display Name:** ${displayName}\n**Avatar:** ${avatarUrl}`,
      );
    } catch {
      ctx.sendNotice(`Could not fetch info for ${targetUserId}`);
    }
  },
});

export function getCommandCompletions(partial: string): SlashCommand[] {
  const trimmed = partial.trimStart();
  if (!trimmed.startsWith("/")) return [];

  const match = trimmed.match(/^\/(\S*)$/);
  if (!match) return [];

  const fragment = match[1].toLowerCase();
  if (!fragment) {
    return Array.from(COMMANDS.values());
  }

  return Array.from(COMMANDS.values()).filter((cmd) => cmd.name.startsWith(fragment));
}
