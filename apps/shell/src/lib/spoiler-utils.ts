/** Segment type: either plain text or a spoiler span. */
export interface SpoilerSegment {
  type: "text" | "spoiler";
  content: string;
  reason?: string;
}

/**
 * Regex to match Matrix spoiler spans.
 * Format: <span data-mx-spoiler="optional reason">hidden text</span>
 * The reason attribute is optional — if omitted, the tag is just <span data-mx-spoiler>.
 */
const SPOILER_REGEX = /<span\s+data-mx-spoiler(?:="([^"]*)")?\s*>([\s\S]*?)<\/span>/gi;

/**
 * Parses an HTML formatted_body and extracts spoiler segments alongside plain text.
 * Returns an array of segments in document order.
 */
export function parseSpoilers(formattedBody: string): SpoilerSegment[] {
  const segments: SpoilerSegment[] = [];
  let lastIndex = 0;

  // Reset regex state for each call
  SPOILER_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = SPOILER_REGEX.exec(formattedBody)) !== null) {
    // Push any text between the last match and this one
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: formattedBody.slice(lastIndex, match.index),
      });
    }

    const reason = match[1]; // may be undefined if no ="reason" present
    const hiddenText = match[2];

    segments.push({
      type: "spoiler",
      content: hiddenText,
      reason: reason || undefined,
    });

    lastIndex = match.index + match[0].length;
  }

  // Push any remaining text after the last spoiler
  if (lastIndex < formattedBody.length) {
    segments.push({
      type: "text",
      content: formattedBody.slice(lastIndex),
    });
  }

  return segments;
}

/**
 * Checks whether a Matrix message content object contains spoiler text.
 * Looks for the `data-mx-spoiler` attribute in the `formatted_body` field.
 */
export function containsSpoiler(content: Record<string, unknown>): boolean {
  const format = content.format as string | undefined;
  const formattedBody = content.formatted_body as string | undefined;

  if (format !== "org.matrix.custom.html" || !formattedBody) {
    return false;
  }

  return /data-mx-spoiler/i.test(formattedBody);
}

/**
 * Builds a Matrix message content object with spoiler-formatted HTML.
 * Returns the content fields needed for a spoiler message (body, format, formatted_body).
 */
export function buildSpoilerContent(
  text: string,
  reason?: string,
): { body: string; format: string; formatted_body: string; msgtype: string } {
  const reasonAttr = reason ? `="${reason}"` : "";
  const formattedBody = `<span data-mx-spoiler${reasonAttr}>${text}</span>`;

  // The plain-text body uses the Matrix spoiler fallback format
  const reasonPrefix = reason ? `(${reason}) ` : "";
  const body = `[Spoiler] ${reasonPrefix}${text}`;

  return {
    body,
    format: "org.matrix.custom.html",
    formatted_body: formattedBody,
    msgtype: "m.text",
  };
}
