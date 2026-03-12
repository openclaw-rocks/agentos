import type { MatrixClient } from "matrix-js-sdk";
import type { ISearchResults } from "matrix-js-sdk/lib/@types/search";

/** A single text segment, optionally marked as a match for highlighting. */
export interface TextSegment {
  text: string;
  isMatch: boolean;
}

/** A formatted search result suitable for display. */
export interface FormattedSearchResult {
  eventId: string;
  roomId: string;
  roomName: string;
  sender: string;
  senderName: string;
  body: string;
  timestamp: number;
}

/** Options for the search function. */
export interface SearchOptions {
  orderBy?: "recent" | "rank";
}

/**
 * Split `text` by occurrences of `term` (case-insensitive) and return
 * segments annotated with whether they matched.
 */
export function highlightMatches(text: string, term: string): TextSegment[] {
  if (!term) {
    return [{ text, isMatch: false }];
  }

  const segments: TextSegment[] = [];
  const lowerText = text.toLowerCase();
  const lowerTerm = term.toLowerCase();
  let cursor = 0;

  while (cursor < text.length) {
    const matchIndex = lowerText.indexOf(lowerTerm, cursor);
    if (matchIndex === -1) {
      segments.push({ text: text.slice(cursor), isMatch: false });
      break;
    }

    if (matchIndex > cursor) {
      segments.push({ text: text.slice(cursor, matchIndex), isMatch: false });
    }

    segments.push({
      text: text.slice(matchIndex, matchIndex + term.length),
      isMatch: true,
    });

    cursor = matchIndex + term.length;
  }

  return segments;
}

const MAX_PREVIEW_LENGTH = 200;

/**
 * Truncate a message body for display in search results.
 * If the text exceeds `MAX_PREVIEW_LENGTH`, it is cut and an ellipsis is
 * appended.
 */
export function truncatePreview(text: string, maxLength: number = MAX_PREVIEW_LENGTH): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "\u2026";
}

/**
 * Format a timestamp into a short human-readable string.
 */
export function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    date.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " +
    date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

/**
 * Format raw ISearchResults into a flat list of display-ready results.
 */
export function formatSearchResults(
  searchResults: ISearchResults,
  client: MatrixClient,
): FormattedSearchResult[] {
  return searchResults.results.map((result) => {
    const event = result.context.ourEvent;
    const roomId = event.getRoomId() ?? "";
    const room = client.getRoom(roomId);
    const sender = event.getSender() ?? "";
    const member = room?.getMember(sender);

    return {
      eventId: event.getId() ?? "",
      roomId,
      roomName: room?.name ?? roomId,
      sender,
      senderName: member?.name ?? sender.split(":")[0].slice(1),
      body: (event.getContent().body as string) ?? "",
      timestamp: event.getTs(),
    };
  });
}

/**
 * Search messages via the Matrix server-side search API.
 *
 * When `roomId` is provided the search is scoped to that room; otherwise it
 * searches across all joined rooms.
 */
export async function searchMessages(
  client: MatrixClient,
  term: string,
  roomId?: string,
  _options?: SearchOptions,
): Promise<ISearchResults> {
  const filter = roomId ? { rooms: [roomId] } : undefined;

  const results = await client.searchRoomEvents({
    term,
    filter,
  });

  return results;
}

/**
 * Load the next page of results from a previous search.
 */
export async function searchMessagesNextPage(
  client: MatrixClient,
  previousResults: ISearchResults,
): Promise<ISearchResults> {
  return client.backPaginateRoomEventsSearch(previousResults);
}

/**
 * Create a debounced version of a function.
 * Returns a wrapper that delays invocation until `delayMs` milliseconds have
 * elapsed since the last call.
 */
export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number,
): (...args: TArgs) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return (...args: TArgs) => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, delayMs);
  };
}
