import type { MatrixClient } from "matrix-js-sdk";

/**
 * Builds forwarded message content from the original event content.
 *
 * - For text messages (m.text, m.notice, m.emote), creates a new m.text
 *   message with a blockquote prefix citing the sender.
 * - For media messages (m.image, m.video, m.audio, m.file), copies the
 *   original content as-is since mxc:// URLs remain valid across rooms.
 */
export function buildForwardedContent(
  originalContent: Record<string, unknown>,
  senderName: string,
): Record<string, unknown> {
  const msgtype = originalContent.msgtype as string | undefined;

  const textTypes = new Set(["m.text", "m.notice", "m.emote"]);

  if (!msgtype || textTypes.has(msgtype)) {
    const originalBody = (originalContent.body as string) ?? "";
    const quotedBody = `> ${senderName}: ${originalBody}\n\n`;
    return {
      msgtype: "m.text",
      body: quotedBody,
    };
  }

  // Media types: copy as-is (mxc URLs are still valid cross-room)
  const forwarded = { ...originalContent };
  // Strip any relation metadata from the original event
  delete forwarded["m.relates_to"];
  delete forwarded["m.new_content"];
  return forwarded;
}

/**
 * Sends forwarded content to a target room.
 */
export async function forwardMessage(
  client: MatrixClient,
  targetRoomId: string,
  content: Record<string, unknown>,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await client.sendEvent(targetRoomId, "m.room.message" as any, content);
}
