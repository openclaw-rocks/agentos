import React, { useState, useCallback } from "react";
import {
  exportRoomAsText,
  exportRoomAsHtml,
  exportRoomAsJson,
  downloadExport,
  filterByDateRange,
} from "~/lib/chat-export";
import type { ExportFormat } from "~/lib/chat-export";
import { useMatrix } from "~/lib/matrix-context";

interface ExportChatModalProps {
  roomId: string;
  roomName: string;
  onClose: () => void;
}

const FORMAT_OPTIONS: Array<{ value: ExportFormat; label: string; description: string }> = [
  { value: "html", label: "HTML", description: "Styled HTML document" },
  { value: "text", label: "Plain Text", description: "Simple text file" },
  { value: "json", label: "JSON", description: "Structured data for processing" },
];

export function ExportChatModal({
  roomId,
  roomName,
  onClose,
}: ExportChatModalProps): React.JSX.Element {
  const { eventStore } = useMatrix();
  const [format, setFormat] = useState<ExportFormat>("html");
  const [includeMedia, setIncludeMedia] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const handleExport = useCallback(() => {
    setExporting(true);
    setError("");

    try {
      let events = eventStore.getMessagesForRoom(roomId);

      // Apply date range filter
      const from = fromDate ? new Date(fromDate) : undefined;
      const to = toDate ? new Date(toDate + "T23:59:59.999Z") : undefined;
      events = filterByDateRange(events, from, to);

      // Sanitise the room name for use in a filename
      const safeName = roomName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50) || "chat";
      const dateStamp = new Date().toISOString().slice(0, 10);

      let content: string;
      let filename: string;
      let mimeType: string;

      switch (format) {
        case "text":
          content = exportRoomAsText(events, roomName);
          filename = `${safeName}_${dateStamp}.txt`;
          mimeType = "text/plain;charset=utf-8";
          break;
        case "html":
          content = exportRoomAsHtml(events, roomName);
          filename = `${safeName}_${dateStamp}.html`;
          mimeType = "text/html;charset=utf-8";
          break;
        case "json":
          content = exportRoomAsJson(events, roomName);
          filename = `${safeName}_${dateStamp}.json`;
          mimeType = "application/json;charset=utf-8";
          break;
      }

      downloadExport(content, filename, mimeType);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [eventStore, roomId, roomName, format, fromDate, toDate, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-surface-1 border border-border rounded-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-primary mb-1">Export Chat</h2>
        <p className="text-sm text-secondary mb-5">
          Export messages from <span className="text-primary font-medium">{roomName}</span>
        </p>

        <div className="space-y-4">
          {/* Format selection */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-2">Format</label>
            <div className="space-y-1.5">
              {FORMAT_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                    format === opt.value
                      ? "bg-accent/10 border-accent"
                      : "bg-surface-2 border-border hover:border-surface-4"
                  }`}
                >
                  <input
                    type="radio"
                    name="export-format"
                    value={opt.value}
                    checked={format === opt.value}
                    onChange={() => setFormat(opt.value)}
                    className="sr-only"
                  />
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      format === opt.value ? "border-accent" : "border-surface-4"
                    }`}
                  >
                    {format === opt.value && <div className="w-2 h-2 rounded-full bg-accent" />}
                  </div>
                  <div>
                    <span className="text-sm text-primary font-medium">{opt.label}</span>
                    <span className="text-xs text-muted ml-2">{opt.description}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Include media checkbox (relevant for HTML) */}
          {format === "html" && (
            <div>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={includeMedia}
                  onChange={(e) => setIncludeMedia(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-4 h-4 rounded border border-border bg-surface-2 flex items-center justify-center peer-checked:bg-accent peer-checked:border-accent transition-colors">
                  {includeMedia && (
                    <svg
                      className="w-3 h-3 text-primary"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-secondary group-hover:text-primary transition-colors">
                  Include media references
                </span>
              </label>
            </div>
          )}

          {/* Date range */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">
              Date range <span className="text-faint">(optional)</span>
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] text-muted mb-1">From</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary focus:outline-none focus:border-accent [color-scheme:dark]"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] text-muted mb-1">To</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary focus:outline-none focus:border-accent [color-scheme:dark]"
                />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-status-error">{error}</p>}

          {/* Action buttons */}
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-secondary hover:text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              {exporting ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Exporting...
                </>
              ) : (
                <>
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                    />
                  </svg>
                  Export
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
