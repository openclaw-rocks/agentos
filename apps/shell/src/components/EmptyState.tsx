import React from "react";

interface EmptyStateProps {
  spaceName?: string;
  suggestions?: string[];
}

const DEFAULT_SUGGESTIONS = ["Try asking me...", "What can you do?", "Help me get started"];

export function EmptyState({ spaceName, suggestions = DEFAULT_SUGGESTIONS }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-7 h-7 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>

        <h3 className="text-base font-semibold text-white mb-1">
          {spaceName ? `Welcome to ${spaceName}` : "No messages yet"}
        </h3>
        <p className="text-sm text-gray-500 mb-5">
          Start a conversation or try one of the suggestions below.
        </p>

        <div className="space-y-2">
          {suggestions.map((suggestion) => (
            <div
              key={suggestion}
              className="px-4 py-2.5 bg-surface-1 border border-border rounded-xl text-sm text-gray-400 hover:text-gray-200 hover:bg-surface-2 transition-colors cursor-default"
            >
              {suggestion}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
