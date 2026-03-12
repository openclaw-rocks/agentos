import React, { useCallback, useEffect } from "react";

interface ShortcutEntry {
  keys: string[];
  description: string;
}

interface ShortcutCategory {
  name: string;
  shortcuts: ShortcutEntry[];
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    name: "Navigation",
    shortcuts: [
      { keys: ["Cmd", "K"], description: "Quick switcher" },
      { keys: ["Cmd", "F"], description: "Search messages" },
      { keys: ["Alt", "\u2191"], description: "Navigate to previous room" },
      { keys: ["Alt", "\u2193"], description: "Navigate to next room" },
      { keys: ["Escape"], description: "Close panels and modals" },
    ],
  },
  {
    name: "Composer",
    shortcuts: [
      { keys: ["Enter"], description: "Send message" },
      { keys: ["Shift", "Enter"], description: "Insert newline" },
      { keys: ["\u2191"], description: "Edit last message (when empty)" },
      { keys: ["Ctrl", "B"], description: "Bold selected text" },
      { keys: ["Ctrl", "I"], description: "Italic selected text" },
    ],
  },
  {
    name: "Calls",
    shortcuts: [
      { keys: ["Ctrl", "D"], description: "Toggle microphone" },
      { keys: ["Ctrl", "E"], description: "Toggle camera" },
    ],
  },
  {
    name: "General",
    shortcuts: [
      { keys: ["Cmd", "/"], description: "Keyboard shortcuts" },
      { keys: ["Ctrl", "Shift", "U"], description: "Upload file" },
    ],
  },
];

/** Replace "Cmd" with "Ctrl" on non-Mac platforms. */
function platformKeys(keys: string[]): string[] {
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  if (isMac) return keys;
  return keys.map((k) => (k === "Cmd" ? "Ctrl" : k));
}

interface KeyboardShortcutsOverlayProps {
  onClose: () => void;
}

export const KeyboardShortcutsOverlay = React.memo(function KeyboardShortcutsOverlay({
  onClose,
}: KeyboardShortcutsOverlayProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="bg-surface-1 border border-border rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-primary">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="p-1 text-secondary hover:text-primary hover:bg-surface-3 rounded-lg transition-colors"
            aria-label="Close keyboard shortcuts"
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

        {/* Shortcut categories */}
        <div className="px-6 py-4 space-y-5">
          {SHORTCUT_CATEGORIES.map((category) => (
            <div key={category.name}>
              <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-2">
                {category.name}
              </h3>
              <div className="space-y-1.5">
                {category.shortcuts.map((shortcut, idx) => {
                  const keys = platformKeys(shortcut.keys);
                  return (
                    <div key={idx} className="flex items-center justify-between py-1">
                      <span className="text-sm text-secondary">{shortcut.description}</span>
                      <div className="flex items-center gap-1">
                        {keys.map((key, ki) => (
                          <React.Fragment key={ki}>
                            {ki > 0 && <span className="text-faint text-xs">+</span>}
                            <kbd className="min-w-[24px] h-6 flex items-center justify-center px-1.5 bg-surface-3 border border-border rounded text-xs text-secondary font-mono">
                              {key}
                            </kbd>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
