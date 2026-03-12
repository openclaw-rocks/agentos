import React, { useState, useCallback, useRef, useEffect } from "react";
import { useMatrix } from "~/lib/matrix-context";
import { reportEvent, SEVERITY_SCORES, SEVERITY_LABELS } from "~/lib/report-content";
import type { ReportSeverity } from "~/lib/report-content";

interface ReportContentModalProps {
  roomId: string;
  eventId: string;
  onClose: () => void;
}

const SEVERITIES: ReportSeverity[] = ["spam", "harassment", "illegal", "other"];

export function ReportContentModal({
  roomId,
  eventId,
  onClose,
}: ReportContentModalProps): React.ReactElement {
  const { client } = useMatrix();
  const [severity, setSeverity] = useState<ReportSeverity>("spam");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };

    const handleClickOutside = (e: MouseEvent): void => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const score = SEVERITY_SCORES[severity];
      const fullReason = reason.trim() || SEVERITY_LABELS[severity];
      await reportEvent(client, roomId, eventId, score, fullReason);
      setFeedback({ type: "success", message: "Report submitted. Thank you." });
      setTimeout(onClose, 1500);
    } catch {
      setFeedback({ type: "error", message: "Failed to submit report. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }, [client, roomId, eventId, severity, reason, submitting, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-label="Report content"
    >
      <div
        ref={modalRef}
        className="w-96 bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-primary">Report Content</h3>
          <button
            onClick={onClose}
            className="p-1 text-muted hover:text-secondary rounded transition-colors"
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

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Severity selector */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-2">Severity</label>
            <div className="space-y-2">
              {SEVERITIES.map((sev) => (
                <label
                  key={sev}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    severity === sev
                      ? "bg-accent/10 border border-accent/30"
                      : "bg-surface-2 border border-transparent hover:bg-surface-3"
                  }`}
                >
                  <input
                    type="radio"
                    name="severity"
                    value={sev}
                    checked={severity === sev}
                    onChange={() => setSeverity(sev)}
                    className="sr-only"
                  />
                  <div
                    className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                      severity === sev ? "border-accent" : "border-border"
                    }`}
                  >
                    {severity === sev && <div className="w-1.5 h-1.5 rounded-full bg-accent" />}
                  </div>
                  <span className="text-sm text-secondary">{SEVERITY_LABELS[sev]}</span>
                  <span className="ml-auto text-[10px] text-faint">
                    score: {SEVERITY_SCORES[sev]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Reason text input */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">
              Reason (optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe why you are reporting this content..."
              rows={3}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-primary placeholder-muted resize-none focus:outline-none focus:border-accent/50"
            />
          </div>

          {/* Feedback */}
          {feedback && (
            <div
              className={`px-3 py-2 rounded-lg text-xs ${
                feedback.type === "success"
                  ? "bg-status-success/10 text-status-success"
                  : "bg-status-error/10 text-status-error"
              }`}
            >
              {feedback.message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-secondary hover:text-secondary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-xs font-medium text-primary bg-status-error hover:bg-status-error/80 disabled:opacity-50 rounded-lg transition-colors"
          >
            {submitting ? "Submitting..." : "Submit Report"}
          </button>
        </div>
      </div>
    </div>
  );
}
