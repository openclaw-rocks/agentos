import React, { useMemo, useEffect, useRef } from "react";
import { getCommandCompletions } from "~/lib/slash-commands";

interface SlashCommandHintProps {
  input: string;
  onSelect: (command: string) => void;
  onClose: () => void;
}

export function SlashCommandHint({
  input,
  onSelect,
  onClose,
}: SlashCommandHintProps): React.ReactElement | null {
  const panelRef = useRef<HTMLDivElement>(null);

  const completions = useMemo(() => getCommandCompletions(input), [input]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  if (completions.length === 0) return null;

  return (
    <div
      ref={panelRef}
      className="absolute bottom-full left-0 mb-2 w-80 max-h-64 overflow-y-auto bg-surface-2 border border-border rounded-lg shadow-lg z-50"
    >
      <div className="p-1">
        {completions.map((cmd) => (
          <button
            key={cmd.name}
            onClick={() => onSelect(`/${cmd.name} `)}
            className="w-full text-left px-3 py-2 rounded-md hover:bg-surface-3 transition-colors group"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-accent">/{cmd.name}</span>
              <span className="text-xs text-muted">{cmd.description}</span>
            </div>
            <span className="text-[10px] text-faint group-hover:text-muted">{cmd.usage}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
