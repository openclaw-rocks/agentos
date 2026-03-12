import React, { useEffect, useMemo } from "react";
import { useMatrix } from "~/lib/matrix-context";

export interface EditHistoryModalProps {
  eventId: string;
  roomId: string;
  onClose: () => void;
}

interface EditVersion {
  timestamp: number;
  body: string;
  sender: string;
}

/**
 * Simple word-level diff that highlights added/removed words between two strings.
 * Returns JSX spans with green background for additions and red strikethrough for
 * removals.
 */
function DiffView({ oldText, newText }: { oldText: string; newText: string }): React.ReactElement {
  const oldWords = oldText.split(/\s+/);
  const newWords = newText.split(/\s+/);

  // Build a basic LCS-based diff
  const segments: Array<{ type: "same" | "added" | "removed"; text: string }> = [];
  let oi = 0;
  let ni = 0;

  while (oi < oldWords.length && ni < newWords.length) {
    if (oldWords[oi] === newWords[ni]) {
      segments.push({ type: "same", text: oldWords[oi] });
      oi++;
      ni++;
    } else {
      // Look ahead in newWords for the current oldWord
      const foundInNew = newWords.indexOf(oldWords[oi], ni + 1);
      const foundInOld = oldWords.indexOf(newWords[ni], oi + 1);

      if (foundInNew !== -1 && (foundInOld === -1 || foundInNew - ni <= foundInOld - oi)) {
        // Words were added before a match
        while (ni < foundInNew) {
          segments.push({ type: "added", text: newWords[ni] });
          ni++;
        }
      } else if (foundInOld !== -1) {
        // Words were removed before a match
        while (oi < foundInOld) {
          segments.push({ type: "removed", text: oldWords[oi] });
          oi++;
        }
      } else {
        // No match ahead - show as replaced
        segments.push({ type: "removed", text: oldWords[oi] });
        segments.push({ type: "added", text: newWords[ni] });
        oi++;
        ni++;
      }
    }
  }

  // Remaining old words are removals
  while (oi < oldWords.length) {
    segments.push({ type: "removed", text: oldWords[oi] });
    oi++;
  }

  // Remaining new words are additions
  while (ni < newWords.length) {
    segments.push({ type: "added", text: newWords[ni] });
    ni++;
  }

  return (
    <p className="text-sm text-secondary leading-relaxed">
      {segments.map((seg, i) => {
        if (seg.type === "added") {
          return (
            <span key={i} className="bg-green-500/20 text-green-300 px-0.5 rounded">
              {seg.text}{" "}
            </span>
          );
        }
        if (seg.type === "removed") {
          return (
            <span key={i} className="bg-red-500/20 text-red-400 line-through px-0.5 rounded">
              {seg.text}{" "}
            </span>
          );
        }
        return <span key={i}>{seg.text} </span>;
      })}
    </p>
  );
}

/**
 * Modal that shows the edit history of a message.
 * Fetches `m.replace` relations from the room timeline and displays each
 * version with timestamp and word-level diff highlights.
 */
export function EditHistoryModal({
  eventId,
  roomId,
  onClose,
}: EditHistoryModalProps): React.ReactElement {
  const { client } = useMatrix();

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Collect all versions of the message from the room timeline
  const versions = useMemo((): EditVersion[] => {
    const room = client.getRoom(roomId);
    if (!room) return [];

    const original = room.findEventById(eventId);
    if (!original) return [];

    const timeline = room.getLiveTimeline().getEvents();

    // Find all edit events targeting this event
    const edits = timeline.filter((e) => {
      const content = e.getContent() as Record<string, unknown>;
      const relation = content?.["m.relates_to"] as
        | { rel_type?: string; event_id?: string }
        | undefined;
      return relation?.rel_type === "m.replace" && relation?.event_id === eventId;
    });

    // Build the version list: original first, then edits sorted oldest to newest
    const result: EditVersion[] = [];

    // Original message
    const origContent = original.getContent() as Record<string, unknown>;
    result.push({
      timestamp: original.getTs(),
      body: (origContent.body as string) ?? "",
      sender: original.getSender() ?? "",
    });

    // Edit versions
    const sortedEdits = [...edits].sort((a, b) => a.getTs() - b.getTs());
    for (const edit of sortedEdits) {
      const editContent = edit.getContent() as Record<string, unknown>;
      const newContent = editContent["m.new_content"] as Record<string, unknown> | undefined;
      const body = (newContent?.body as string) ?? (editContent.body as string) ?? "";
      result.push({
        timestamp: edit.getTs(),
        body,
        sender: edit.getSender() ?? "",
      });
    }

    return result;
  }, [client, roomId, eventId]);

  // Reverse to show latest version at top
  const reversedVersions = useMemo(() => [...versions].reverse(), [versions]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-1 border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-primary">Edit History</h3>
          <button
            onClick={onClose}
            className="p-1 text-secondary hover:text-primary hover:bg-surface-3 rounded-lg transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Version list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {reversedVersions.length === 0 && (
            <p className="text-sm text-muted">No edit history available.</p>
          )}

          {reversedVersions.map((version, idx) => {
            const isLatest = idx === 0;
            const isOriginal = idx === reversedVersions.length - 1;
            const prevVersion = !isOriginal && !isLatest ? reversedVersions[idx + 1] : undefined;

            // For the original version, show "Original"; for latest show "Current"
            const label =
              isLatest && reversedVersions.length > 1
                ? "Current version"
                : isOriginal
                  ? "Original"
                  : `Edit ${reversedVersions.length - 1 - idx}`;

            return (
              <div
                key={`${version.timestamp}-${idx}`}
                className={`rounded-lg border p-3 ${
                  isLatest && reversedVersions.length > 1
                    ? "border-accent/30 bg-accent/5"
                    : "border-border bg-surface-2"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-xs font-medium ${isLatest && reversedVersions.length > 1 ? "text-accent" : "text-secondary"}`}
                  >
                    {label}
                  </span>
                  <span className="text-xs text-muted">
                    {new Date(version.timestamp).toLocaleString()}
                  </span>
                </div>

                {/* Show diff compared to previous version (if not original and not the only version) */}
                {prevVersion ? (
                  <DiffView oldText={prevVersion.body} newText={version.body} />
                ) : (
                  <p className="text-sm text-secondary">{version.body}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-secondary bg-surface-2 hover:bg-surface-3 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
