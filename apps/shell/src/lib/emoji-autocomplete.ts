/**
 * Utility functions for :shortcode: emoji autocomplete detection, search, and insertion.
 */

import { EMOJI_DATA } from "./emoji-data";

export interface EmojiQuery {
  query: string;
  start: number;
  end: number;
}

export interface EmojiMatch {
  emoji: string;
  shortcode: string;
  name: string;
}

const DEFAULT_LIMIT = 6;

/**
 * Detects whether the cursor is currently within a :shortcode query.
 * Returns the query string and its start/end positions, or null if no active emoji query.
 *
 * A colon trigger is a `:` that is either at position 0 or preceded by whitespace,
 * followed by 2 or more non-whitespace, non-colon characters up to the cursor position.
 * Does not trigger inside code blocks (backtick fences).
 */
export function parseEmojiQuery(text: string, cursorPos: number): EmojiQuery | null {
  if (cursorPos < 3 || cursorPos > text.length) return null;

  // Check if cursor is inside a code block (between ``` fences)
  if (isInsideCodeBlock(text, cursorPos)) return null;

  // Check if cursor is inside an inline code span (between single backticks)
  if (isInsideInlineCode(text, cursorPos)) return null;

  // Walk backwards from cursor to find the : trigger
  const before = text.slice(0, cursorPos);

  let colonPos = -1;
  for (let i = before.length - 1; i >= 0; i--) {
    const ch = before[i];
    // If we hit whitespace or another colon before finding our trigger colon, no active query
    if (ch === " " || ch === "\n" || ch === "\t") break;
    if (ch === ":") {
      // Valid trigger: at start of text or preceded by whitespace
      if (i === 0 || before[i - 1] === " " || before[i - 1] === "\n" || before[i - 1] === "\t") {
        colonPos = i;
      }
      break;
    }
  }

  if (colonPos === -1) return null;

  const query = before.slice(colonPos + 1);

  // Minimum 2 characters after the colon
  if (query.length < 2) return null;

  // Find the end of the emoji token (until whitespace, colon, or end of text)
  let end = cursorPos;
  while (
    end < text.length &&
    text[end] !== " " &&
    text[end] !== "\n" &&
    text[end] !== "\t" &&
    text[end] !== ":"
  ) {
    end++;
  }

  return {
    query,
    start: colonPos,
    end,
  };
}

/**
 * Replaces a :shortcode query in the text with the actual emoji character,
 * followed by a space so the user can keep typing.
 */
export function insertEmoji(text: string, start: number, end: number, emoji: string): string {
  const before = text.slice(0, start);
  const after = text.slice(end);
  return `${before}${emoji}${after.startsWith(" ") ? after : ` ${after}`}`;
}

/**
 * Search emoji by name/shortcode. Words in the query are matched against
 * the emoji name (all words must appear, in any order).
 * Returns up to `limit` results (default 6).
 */
export function searchEmoji(query: string, limit: number = DEFAULT_LIMIT): EmojiMatch[] {
  const q = query.toLowerCase().replace(/_/g, " ");
  const words = q.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];

  const results: EmojiMatch[] = [];

  for (const entry of EMOJI_DATA) {
    if (results.length >= limit) break;
    const name = entry.name.toLowerCase();
    if (words.every((w) => name.includes(w))) {
      results.push({
        emoji: entry.emoji,
        shortcode: entry.name.replace(/\s+/g, "_"),
        name: entry.name,
      });
    }
  }

  return results;
}

/**
 * Check if a cursor position is inside a fenced code block (``` ... ```).
 */
function isInsideCodeBlock(text: string, cursorPos: number): boolean {
  const before = text.slice(0, cursorPos);
  const fenceCount = (before.match(/```/g) || []).length;
  // Odd number of ``` means we're inside a code block
  return fenceCount % 2 !== 0;
}

/**
 * Check if a cursor position is inside an inline code span (` ... `).
 */
function isInsideInlineCode(text: string, cursorPos: number): boolean {
  const before = text.slice(0, cursorPos);
  // Count single backticks that are NOT part of triple backticks
  // Remove triple backticks first, then count remaining singles
  const withoutTriple = before.replace(/```/g, "");
  const backtickCount = (withoutTriple.match(/`/g) || []).length;
  return backtickCount % 2 !== 0;
}
