import React from "react";
import type { RoomFilter } from "~/lib/room-filters";

const FILTERS: Array<{ value: RoomFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "unreads", label: "Unreads" },
  { value: "people", label: "People" },
  { value: "rooms", label: "Rooms" },
  { value: "favourites", label: "Favs" },
  { value: "orphaned", label: "Other" },
];

interface RoomListFiltersProps {
  active: RoomFilter;
  onChange: (filter: RoomFilter) => void;
}

/**
 * Horizontal row of pill-shaped filter buttons shown above the channel list.
 * Supports horizontal scrolling on narrow (mobile) viewports.
 */
export const RoomListFilters = React.memo(function RoomListFilters({
  active,
  onChange,
}: RoomListFiltersProps) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto scrollbar-none"
      role="tablist"
      aria-label="Room filters"
    >
      {FILTERS.map(({ value, label }) => {
        const isActive = active === value;
        return (
          <button
            key={value}
            onClick={() => onChange(value)}
            role="tab"
            aria-selected={isActive}
            aria-label={`Filter: ${label}`}
            className={`flex-shrink-0 px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
              isActive
                ? "bg-accent text-inverse"
                : "bg-surface-2 text-secondary hover:bg-surface-3 hover:text-secondary"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
});
