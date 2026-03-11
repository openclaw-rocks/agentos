import React from "react";

interface WelcomeBannerProps {
  onDismiss: () => void;
}

export function WelcomeBanner({ onDismiss }: WelcomeBannerProps) {
  return (
    <div className="mx-4 mt-4 bg-surface-1 border border-border rounded-xl p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center flex-shrink-0">
        <svg
          className="w-5 h-5 text-accent"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-white mb-1">Welcome to AgentOS</h3>
        <p className="text-xs text-gray-400 leading-relaxed">
          Your agent-first operating system powered by the Matrix protocol. Create spaces, invite
          agents, and collaborate in real-time. Use{" "}
          <kbd className="px-1 py-0.5 bg-surface-3 rounded text-gray-400 text-[10px] font-mono">
            Cmd+K
          </kbd>{" "}
          to quickly switch between spaces and channels.
        </p>
      </div>

      <button
        onClick={onDismiss}
        className="p-1 text-gray-500 hover:text-gray-300 hover:bg-surface-3 rounded transition-colors flex-shrink-0"
        title="Dismiss"
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
  );
}
