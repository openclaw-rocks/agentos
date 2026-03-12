/**
 * Chat export utilities for exporting room timelines as text, HTML, or JSON.
 */

import type { TimelineMessage } from "./event-store";

export type ExportFormat = "html" | "text" | "json";

export interface ExportOptions {
  format: ExportFormat;
  includeMedia: boolean;
  fromDate?: Date;
  toDate?: Date;
}

/** Exported event shape for JSON output. */
export interface ExportedEvent {
  type: string;
  sender: string;
  senderName: string;
  content: Record<string, unknown>;
  timestamp: string;
}

/**
 * Filter events by optional date range.
 */
export function filterByDateRange(
  events: readonly TimelineMessage[],
  fromDate?: Date,
  toDate?: Date,
): TimelineMessage[] {
  return events.filter((e) => {
    const ts = e.timestamp;
    if (fromDate && ts < fromDate.getTime()) return false;
    if (toDate && ts > toDate.getTime()) return false;
    return true;
  });
}

/**
 * Format a timestamp as an ISO-like local datetime string for display.
 */
function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, " UTC");
}

/**
 * Extract the text body from a message content object.
 */
function extractBody(content: Record<string, unknown>): string {
  const body = content.body;
  if (typeof body === "string") return body;
  const msgtype = content.msgtype;
  if (typeof msgtype === "string") return `[${msgtype}]`;
  return "[unknown]";
}

/**
 * Export room events as plain text.
 * Format: `[timestamp] sender: message`
 */
export function exportRoomAsText(events: readonly TimelineMessage[], roomName: string): string {
  const lines: string[] = [];
  lines.push(`Chat export: ${roomName}`);
  lines.push(`Exported: ${new Date().toISOString()}`);
  lines.push(`Messages: ${events.length}`);
  lines.push("---");
  lines.push("");

  for (const event of events) {
    const ts = formatTimestamp(event.timestamp);
    const body = extractBody(event.content);
    lines.push(`[${ts}] ${event.senderName}: ${body}`);
  }

  return lines.join("\n");
}

/**
 * Escape HTML entities in a string.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Export room events as an HTML document with basic styling.
 */
export function exportRoomAsHtml(events: readonly TimelineMessage[], roomName: string): string {
  const escapedRoomName = escapeHtml(roomName);
  const messageRows = events
    .map((event) => {
      const ts = formatTimestamp(event.timestamp);
      const sender = escapeHtml(event.senderName);
      const body = escapeHtml(extractBody(event.content));
      return `    <div class="message">
      <span class="timestamp">${ts}</span>
      <span class="sender">${sender}</span>
      <span class="body">${body}</span>
    </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chat Export: ${escapedRoomName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #e0e0e0; margin: 0; padding: 20px; }
    h1 { color: #fff; font-size: 1.5rem; margin-bottom: 4px; }
    .meta { color: #888; font-size: 0.85rem; margin-bottom: 20px; }
    .message { padding: 6px 0; border-bottom: 1px solid #2a2a3e; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
    .timestamp { color: #666; font-size: 0.75rem; flex-shrink: 0; }
    .sender { color: #7c8aff; font-weight: 600; font-size: 0.875rem; flex-shrink: 0; }
    .sender::after { content: ':'; }
    .body { color: #d0d0d0; font-size: 0.875rem; word-break: break-word; }
  </style>
</head>
<body>
  <h1>${escapedRoomName}</h1>
  <p class="meta">Exported ${escapeHtml(new Date().toISOString())} &mdash; ${events.length} messages</p>
${messageRows}
</body>
</html>`;
}

/**
 * Export room events as a JSON string.
 * Returns a JSON array of event objects with type, sender, content, and timestamp.
 */
export function exportRoomAsJson(events: readonly TimelineMessage[], roomName: string): string {
  const exported: ExportedEvent[] = events.map((event) => ({
    type: event.type,
    sender: event.sender,
    senderName: event.senderName,
    content: event.content,
    timestamp: new Date(event.timestamp).toISOString(),
  }));

  return JSON.stringify(
    {
      roomName,
      exportedAt: new Date().toISOString(),
      messageCount: exported.length,
      messages: exported,
    },
    null,
    2,
  );
}

/**
 * Trigger a file download in the browser by creating a hidden `<a>` element.
 */
export function downloadExport(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // Clean up after a short delay to ensure the download starts
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 100);
}
