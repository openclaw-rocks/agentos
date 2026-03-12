/**
 * Regex matching 1-3 consecutive emoji characters (Emoji_Presentation) with no
 * surrounding text. Whitespace around the string is trimmed before matching.
 */
const EMOJI_ONLY_RE = /^\p{Emoji_Presentation}{1,3}$/u;

/**
 * Check if a message body consists of only 1-3 emoji characters (no other text).
 * Returns false for 4+ emoji or any non-emoji characters.
 */
export function isEmojiOnlyMessage(body: string): boolean {
  return EMOJI_ONLY_RE.test(body.trim());
}

/**
 * Produce a replacement event body pair for a Matrix message edit.
 *
 * The returned `body` uses the Matrix convention of prefixing the new text with
 * `* `, and `formatted_body` (if different) uses `<em>* </em>` before the HTML.
 */
export function formatEditedContent(
  _original: string,
  newBody: string,
): { body: string; formatted_body?: string } {
  return {
    body: `* ${newBody}`,
  };
}
