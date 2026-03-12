import type { MatrixClient } from "matrix-js-sdk";

/**
 * Severity levels for content reports, mapped to numeric scores.
 * Score range: -100 (most offensive) to 0 (least offensive).
 */
export type ReportSeverity = "spam" | "harassment" | "illegal" | "other";

export const SEVERITY_SCORES: Record<ReportSeverity, number> = {
  spam: -50,
  harassment: -80,
  illegal: -100,
  other: -30,
};

export const SEVERITY_LABELS: Record<ReportSeverity, string> = {
  spam: "Spam",
  harassment: "Harassment",
  illegal: "Illegal content",
  other: "Other",
};

/**
 * Report a Matrix event to the homeserver for moderation review.
 *
 * @param client - The Matrix client instance
 * @param roomId - The room containing the event
 * @param eventId - The event to report
 * @param score - Severity score from -100 (most offensive) to 0 (least)
 * @param reason - Human-readable reason for the report
 */
export async function reportEvent(
  client: MatrixClient,
  roomId: string,
  eventId: string,
  score: number,
  reason: string,
): Promise<void> {
  await client.reportEvent(roomId, eventId, score, reason);
}
