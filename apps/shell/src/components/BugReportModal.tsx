import React, { useCallback, useState } from "react";
import { collectLogs, buildRageshakePayload, submitRageshake } from "~/lib/rageshake";

interface BugReportModalProps {
  onClose: () => void;
}

const RAGESHAKE_SERVER = "https://rageshake.element.io";
const APP_VERSION = "0.1.0";

export function BugReportModal({ onClose }: BugReportModalProps): React.ReactElement {
  const [description, setDescription] = useState("");
  const [includeLogs, setIncludeLogs] = useState(true);
  const [includeScreenshot, setIncludeScreenshot] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = useCallback(async () => {
    if (!description.trim()) return;

    setStatus("loading");
    setErrorMessage("");

    try {
      const logs = includeLogs ? collectLogs(500) : [];
      const payload = buildRageshakePayload(description, logs, navigator.userAgent, APP_VERSION);
      await submitRageshake(RAGESHAKE_SERVER, payload);
      setStatus("success");
    } catch (err: unknown) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to submit bug report");
    }
  }, [description, includeLogs]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface-1 border border-border rounded-xl shadow-2xl w-full max-w-md p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-primary">Report Bug</h3>
          <button
            onClick={onClose}
            className="p-1 text-secondary hover:text-primary hover:bg-surface-3 rounded-lg transition-colors"
            aria-label="Close bug report"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {status === "success" ? (
          <div>
            <p className="text-sm text-green-400 mb-4">
              Bug report submitted successfully. Thank you!
            </p>
            <button
              onClick={onClose}
              className="w-full py-2 bg-accent hover:bg-accent-hover text-inverse text-sm font-medium rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Description */}
            <div className="mb-4">
              <label htmlFor="bug-description" className="block text-sm text-secondary mb-1">
                Description (required)
              </label>
              <textarea
                id="bug-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue..."
                rows={4}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-primary placeholder-muted resize-none focus:outline-none focus:border-accent"
              />
            </div>

            {/* Options */}
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeLogs}
                  onChange={(e) => setIncludeLogs(e.target.checked)}
                  className="rounded border-border bg-surface-2 text-accent focus:ring-accent"
                />
                <span className="text-sm text-secondary">Include logs</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeScreenshot}
                  onChange={(e) => setIncludeScreenshot(e.target.checked)}
                  className="rounded border-border bg-surface-2 text-accent focus:ring-accent"
                />
                <span className="text-sm text-secondary">
                  Include screenshot (not yet implemented)
                </span>
              </label>
            </div>

            {/* Error message */}
            {status === "error" && <p className="text-sm text-red-400 mb-3">{errorMessage}</p>}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!description.trim() || status === "loading"}
              className="w-full py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-inverse text-sm font-medium rounded-lg transition-colors"
            >
              {status === "loading" ? "Submitting..." : "Submit Report"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
