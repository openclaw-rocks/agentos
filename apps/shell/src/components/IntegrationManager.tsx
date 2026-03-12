import React from "react";
import { loadSettings } from "~/lib/theme";

interface IntegrationManagerProps {
  onClose: () => void;
}

export function IntegrationManager({ onClose }: IntegrationManagerProps): React.ReactElement {
  const settings = loadSettings();
  const enabled = settings.integrationManagerEnabled;
  const url = settings.integrationManagerUrl;

  if (!enabled || !url) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-surface-1 border border-border rounded-xl shadow-2xl w-full max-w-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-primary">Integration Manager</h3>
            <button
              onClick={onClose}
              className="p-1 text-secondary hover:text-primary hover:bg-surface-3 rounded-lg transition-colors"
              aria-label="Close integration manager"
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
          <p className="text-sm text-secondary">
            The integration manager is not configured. Please enable it and set the URL in Settings
            under the Preferences section.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface-1 border border-border rounded-xl shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
          <h3 className="text-sm font-bold text-primary">Integration Manager</h3>
          <button
            onClick={onClose}
            className="p-1 text-secondary hover:text-primary hover:bg-surface-3 rounded-lg transition-colors"
            aria-label="Close integration manager"
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

        {/* Iframe */}
        <iframe
          src={url}
          title="Integration Manager"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          className="flex-1 w-full border-0"
        />
      </div>
    </div>
  );
}
