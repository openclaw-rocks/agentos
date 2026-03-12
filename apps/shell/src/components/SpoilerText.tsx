import { useState, useCallback } from "react";

interface SpoilerTextProps {
  text: string;
  reason?: string;
}

/**
 * Renders text hidden behind a blur overlay until clicked.
 * When hidden: dark overlay with "Spoiler" label (or the reason if provided), text is blurred.
 * When revealed: shows text normally with a subtle border indicating it was a spoiler.
 * Click toggles between hidden and revealed states with a smooth transition.
 */
export function SpoilerText({ text, reason }: SpoilerTextProps): React.JSX.Element {
  const [revealed, setRevealed] = useState(false);

  const toggle = useCallback(() => {
    setRevealed((prev) => !prev);
  }, []);

  const label = reason ?? "Spoiler";

  if (revealed) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        className="inline border border-border/40 rounded px-1 py-0.5 text-secondary cursor-pointer transition-all duration-300 ease-in-out"
        title="Click to hide spoiler"
      >
        {text}
      </span>
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
      className="inline-flex items-center gap-1 relative cursor-pointer rounded px-1 py-0.5 bg-surface-2 border border-border hover:bg-surface-3 transition-all duration-300 ease-in-out"
      title="Click to reveal spoiler"
    >
      <span className="text-xs text-secondary font-medium select-none">{label}</span>
      <span
        className="text-sm text-secondary select-none transition-[filter] duration-300 ease-in-out"
        style={{ filter: "blur(5px)" }}
        aria-hidden="true"
      >
        {text}
      </span>
    </span>
  );
}
