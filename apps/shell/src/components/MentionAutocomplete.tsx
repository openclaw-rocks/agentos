import type { RoomMember } from "matrix-js-sdk";
import React, {
  useMemo,
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";

const MAX_SUGGESTIONS = 6;

interface MentionAutocompleteMember {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

interface MentionAutocompleteProps {
  query: string;
  members: RoomMember[];
  homeserverUrl: string;
  onSelect: (userId: string, displayName: string) => void;
  onClose: () => void;
}

function memberToSuggestion(member: RoomMember, homeserverUrl: string): MentionAutocompleteMember {
  const mxcUrl = member.getMxcAvatarUrl();
  let avatarUrl: string | null = null;
  if (mxcUrl?.startsWith("mxc://")) {
    const parts = mxcUrl.slice(6).split("/");
    if (parts.length >= 2 && parts[0] && parts[1]) {
      avatarUrl = `${homeserverUrl}/_matrix/media/v3/thumbnail/${parts[0]}/${parts[1]}?width=28&height=28&method=crop`;
    }
  }
  return {
    userId: member.userId,
    displayName: member.name || member.userId,
    avatarUrl,
  };
}

export const MentionAutocomplete = forwardRef<HTMLDivElement, MentionAutocompleteProps>(
  function MentionAutocomplete(
    { query, members, homeserverUrl, onSelect, onClose },
    forwardedRef,
  ): React.ReactElement | null {
    const internalRef = useRef<HTMLDivElement>(null);
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Merge the forwarded ref with our internal ref
    useImperativeHandle(forwardedRef, () => internalRef.current as HTMLDivElement);

    const suggestions = useMemo(() => {
      const q = query.toLowerCase();
      const matched: MentionAutocompleteMember[] = [];

      for (const member of members) {
        if (matched.length >= MAX_SUGGESTIONS) break;
        const name = (member.name || "").toLowerCase();
        const id = member.userId.toLowerCase();
        if (name.includes(q) || id.includes(q)) {
          matched.push(memberToSuggestion(member, homeserverUrl));
        }
      }

      return matched;
    }, [query, members, homeserverUrl]);

    // Reset selection when suggestions change
    useEffect(() => {
      setSelectedIndex(0);
    }, [suggestions]);

    // Close on outside click
    useEffect(() => {
      const handler = (e: MouseEvent): void => {
        if (internalRef.current && !internalRef.current.contains(e.target as Node)) {
          onClose();
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [onClose]);

    // Keyboard navigation handler -- called from parent via getMentionKeyHandler
    const handleKeyDown = useCallback(
      (e: KeyboardEvent | React.KeyboardEvent): boolean => {
        if (suggestions.length === 0) return false;

        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % suggestions.length);
          return true;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
          return true;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const selected = suggestions[selectedIndex];
          if (selected) {
            onSelect(selected.userId, selected.displayName);
          }
          return true;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
          return true;
        }
        return false;
      },
      [suggestions, selectedIndex, onSelect, onClose],
    );

    // Expose keyboard handler on the DOM element so the parent can access it
    useEffect(() => {
      const panel = internalRef.current;
      if (!panel) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (panel as any).__mentionKeyDown = handleKeyDown;
      return () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (panel as any).__mentionKeyDown;
      };
    }, [handleKeyDown]);

    if (suggestions.length === 0) return null;

    return (
      <div
        ref={internalRef}
        data-testid="mention-autocomplete"
        className="absolute bottom-full left-0 mb-2 w-72 max-h-64 overflow-y-auto bg-surface-2 border border-border rounded-lg shadow-lg z-50"
      >
        <div className="p-1">
          {suggestions.map((suggestion, idx) => (
            <button
              key={suggestion.userId}
              onClick={() => onSelect(suggestion.userId, suggestion.displayName)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`w-full text-left px-3 py-2 rounded-md transition-colors flex items-center gap-3 ${
                idx === selectedIndex ? "bg-surface-3" : "hover:bg-surface-3"
              }`}
            >
              {/* Avatar */}
              <div className="w-7 h-7 rounded-lg flex items-center justify-center overflow-hidden bg-surface-3 flex-shrink-0">
                {suggestion.avatarUrl ? (
                  <img
                    src={suggestion.avatarUrl}
                    alt={suggestion.displayName}
                    className="w-7 h-7 rounded-lg object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="text-[10px] font-bold text-secondary">
                    {suggestion.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Name and user ID */}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-primary truncate">
                  {suggestion.displayName}
                </div>
                <div className="text-[10px] text-muted truncate">{suggestion.userId}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  },
);

/**
 * Returns the keyboard handler from a MentionAutocomplete panel ref, if one is mounted.
 * Call this from the parent's onKeyDown to let the mention popup intercept arrow/enter/escape keys.
 */
export function getMentionKeyHandler(
  panelRef: React.RefObject<HTMLDivElement | null>,
): ((e: React.KeyboardEvent) => boolean) | null {
  const panel = panelRef.current;
  if (!panel) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = (panel as any).__mentionKeyDown;
  return typeof handler === "function" ? handler : null;
}
