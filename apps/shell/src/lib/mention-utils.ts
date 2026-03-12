/**
 * Utility functions for @-mention detection, insertion, and Matrix formatting.
 */

export interface MentionQuery {
  query: string;
  start: number;
  end: number;
}

/**
 * Detects whether the cursor is currently within an @mention query.
 * Returns the query string and its start/end positions, or null if no active mention.
 *
 * A mention trigger is an `@` that is either at position 0 or preceded by whitespace,
 * followed by zero or more non-whitespace characters up to the cursor position.
 */
export function parseMentionQuery(text: string, cursorPos: number): MentionQuery | null {
  if (cursorPos < 1 || cursorPos > text.length) return null;

  // Walk backwards from cursor to find the @ trigger
  const before = text.slice(0, cursorPos);

  // Find the last @ that could be a mention trigger
  let atPos = -1;
  for (let i = before.length - 1; i >= 0; i--) {
    const ch = before[i];
    // If we hit whitespace before finding @, there's no active mention
    if (ch === " " || ch === "\n" || ch === "\t") break;
    if (ch === "@") {
      // Valid trigger: at start of text or preceded by whitespace
      if (i === 0 || before[i - 1] === " " || before[i - 1] === "\n" || before[i - 1] === "\t") {
        atPos = i;
      }
      break;
    }
  }

  if (atPos === -1) return null;

  const query = before.slice(atPos + 1);

  // Find the end of the mention token (until whitespace or end of text)
  let end = cursorPos;
  while (end < text.length && text[end] !== " " && text[end] !== "\n" && text[end] !== "\t") {
    end++;
  }

  return {
    query,
    start: atPos,
    end,
  };
}

/**
 * Replaces an @mention query in the text with a formatted mention placeholder.
 * The placeholder format is `@DisplayName` followed by a space so the user can keep typing.
 */
export function insertMention(
  text: string,
  start: number,
  end: number,
  _userId: string,
  displayName: string,
): string {
  const before = text.slice(0, start);
  const after = text.slice(end);
  // Store a zero-width mention marker: the display text is what the user sees,
  // and we use a special bracket format that formatMentionsForMatrix can parse.
  // Format: [mention:@userId:DisplayName]
  return `${before}[mention:${_userId}:${displayName}]${after.startsWith(" ") ? after : ` ${after}`}`;
}

/** A single mention found in formatted text */
export interface ParsedMention {
  userId: string;
  displayName: string;
  start: number;
  end: number;
}

const MENTION_RE = /\[mention:(@[^:]+:[^:]+):([^\]]+)\]/g;

/**
 * Parses all mention placeholders from text.
 */
export function parseMentions(text: string): ParsedMention[] {
  const mentions: ParsedMention[] = [];
  let match: RegExpExecArray | null;
  while ((match = MENTION_RE.exec(text)) !== null) {
    mentions.push({
      userId: match[1],
      displayName: match[2],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return mentions;
}

/**
 * Converts text containing mention placeholders into Matrix-compatible
 * body and formatted_body (HTML) with proper Matrix pills.
 *
 * Matrix pill format: <a href="https://matrix.to/#/@user:server">DisplayName</a>
 */
export function formatMentionsForMatrix(text: string): { body: string; formatted_body: string } {
  const mentions = parseMentions(text);

  if (mentions.length === 0) {
    return { body: text, formatted_body: text };
  }

  let body = "";
  let formattedBody = "";
  let lastEnd = 0;

  for (const mention of mentions) {
    // Append text before this mention
    const segment = text.slice(lastEnd, mention.start);
    body += segment;
    formattedBody += escapeHtml(segment);

    // Append the mention
    body += mention.displayName;
    formattedBody += `<a href="https://matrix.to/#/${encodeURI(mention.userId)}">${escapeHtml(mention.displayName)}</a>`;

    lastEnd = mention.end;
  }

  // Append remaining text
  const tail = text.slice(lastEnd);
  body += tail;
  formattedBody += escapeHtml(tail);

  return { body, formatted_body: formattedBody };
}

/**
 * Escape HTML special characters for safe insertion into formatted_body.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
