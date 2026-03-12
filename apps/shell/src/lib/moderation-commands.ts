import type { SlashCommand } from "./slash-commands";

/**
 * Creates the /report slash command which requires a UI callback
 * to open the report modal. The /ignore and /unignore commands
 * are registered directly in slash-commands.ts.
 */
export function createModerationCommands(opts: { onOpenReportModal: () => void }): SlashCommand[] {
  return [
    {
      name: "report",
      description: "Report the last message in this room",
      usage: "/report",
      execute(_args, _ctx) {
        opts.onOpenReportModal();
      },
    },
  ];
}
