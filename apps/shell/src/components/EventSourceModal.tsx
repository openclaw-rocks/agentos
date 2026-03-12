import React, { useCallback, useEffect, useState } from "react";

interface EventSourceModalProps {
  event: Record<string, unknown>;
  onClose: () => void;
}

export function EventSourceModal({ event, onClose }: EventSourceModalProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const json = JSON.stringify(event, null, 2);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(json)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        /* clipboard not available */
      });
  }, [json]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-1 border border-border rounded-xl shadow-2xl w-[600px] max-w-[90vw] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <h3 className="text-sm font-semibold text-primary">Event Source</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 text-xs bg-surface-2 border border-border text-secondary rounded-lg hover:bg-surface-3 transition-colors"
            >
              {copied ? "Copied!" : "Copy JSON"}
            </button>
            <button
              onClick={onClose}
              className="p-1 text-muted hover:text-secondary hover:bg-surface-3 rounded transition-colors"
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
        </div>

        {/* JSON content */}
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-xs font-mono text-secondary whitespace-pre-wrap break-all">
            {json}
          </pre>
        </div>
      </div>
    </div>
  );
}
