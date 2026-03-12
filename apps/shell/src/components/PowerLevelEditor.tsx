import { EventType } from "matrix-js-sdk";
import type { MatrixClient, Room } from "matrix-js-sdk";
import React, { useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PowerLevelEditorProps {
  room: Room;
  client: MatrixClient;
}

interface PowerLevelsContent {
  users_default?: number;
  events_default?: number;
  state_default?: number;
  invite?: number;
  kick?: number;
  ban?: number;
  redact?: number;
  events?: Record<string, number>;
  notifications?: Record<string, number>;
}

interface FieldDef {
  key: string;
  label: string;
  path: "top" | "events" | "notifications";
}

// ---------------------------------------------------------------------------
// Power level presets (exported for testing)
// ---------------------------------------------------------------------------

export interface PowerLevelPreset {
  label: string;
  value: number;
}

export const POWER_LEVEL_PRESETS: readonly PowerLevelPreset[] = [
  { label: "Muted", value: -1 },
  { label: "Default", value: 0 },
  { label: "Moderator", value: 50 },
  { label: "Admin", value: 100 },
] as const;

/**
 * Find the matching preset label for a given power level, or return null
 * if no preset matches exactly.
 */
export function presetLabelForLevel(level: number): string | null {
  const match = POWER_LEVEL_PRESETS.find((p) => p.value === level);
  return match ? match.label : null;
}

/**
 * Clamp a power level value to the allowed range [-100, 100].
 */
export function clampPowerLevel(value: number): number {
  return Math.max(-100, Math.min(100, value));
}

// ---------------------------------------------------------------------------
// Field definitions
// ---------------------------------------------------------------------------

const GENERAL_FIELDS: FieldDef[] = [
  { key: "users_default", label: "Default user level", path: "top" },
  { key: "events_default", label: "Send messages", path: "top" },
  { key: "state_default", label: "Change room settings", path: "top" },
  { key: "invite", label: "Invite users", path: "top" },
  { key: "kick", label: "Kick users", path: "top" },
  { key: "ban", label: "Ban users", path: "top" },
  { key: "redact", label: "Redact messages", path: "top" },
];

const EVENT_FIELDS: FieldDef[] = [
  { key: "m.room.name", label: "Room name", path: "events" },
  { key: "m.room.topic", label: "Room topic", path: "events" },
  { key: "m.room.avatar", label: "Room avatar", path: "events" },
  { key: "m.room.canonical_alias", label: "Room alias", path: "events" },
  { key: "m.room.history_visibility", label: "History visibility", path: "events" },
  { key: "m.room.power_levels", label: "Power levels", path: "events" },
  { key: "m.room.encryption", label: "Encryption", path: "events" },
  { key: "m.room.join_rules", label: "Join rules", path: "events" },
  { key: "m.room.guest_access", label: "Guest access", path: "events" },
];

const NOTIFICATION_FIELDS: FieldDef[] = [
  { key: "room", label: "@room notification", path: "notifications" },
];

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

export function readField(content: PowerLevelsContent, field: FieldDef): number {
  if (field.path === "events") {
    return content.events?.[field.key] ?? content.state_default ?? 50;
  }
  if (field.path === "notifications") {
    return content.notifications?.[field.key] ?? 50;
  }
  // top-level
  return ((content as Record<string, unknown>)[field.key] as number) ?? 0;
}

export function writeField(
  content: PowerLevelsContent,
  field: FieldDef,
  value: number,
): PowerLevelsContent {
  const updated = { ...content };
  if (field.path === "events") {
    updated.events = { ...(updated.events ?? {}), [field.key]: value };
  } else if (field.path === "notifications") {
    updated.notifications = { ...(updated.notifications ?? {}), [field.key]: value };
  } else {
    (updated as Record<string, unknown>)[field.key] = value;
  }
  return updated;
}

// ---------------------------------------------------------------------------
// Sub-component: single power level field with dropdown + numeric input
// ---------------------------------------------------------------------------

function PowerLevelField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}): React.JSX.Element {
  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const selected = e.target.value;
    if (selected === "custom") return;
    onChange(clampPowerLevel(Number(selected)));
  };

  const handleNumericChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const raw = Number(e.target.value);
    onChange(clampPowerLevel(raw));
  };

  // Determine if current value matches a preset
  const matchesPreset = POWER_LEVEL_PRESETS.some((p) => p.value === value);
  const selectValue = matchesPreset ? String(value) : "custom";

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <label className="text-xs text-secondary flex-1 min-w-0 truncate">{label}</label>
      <div className="flex items-center gap-1.5">
        {/* Preset dropdown */}
        <select
          value={selectValue}
          onChange={handlePresetChange}
          className="w-24 px-1 py-1 bg-surface-2 border border-border rounded text-xs text-secondary focus:outline-none focus:border-accent"
        >
          {POWER_LEVEL_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label} ({preset.value})
            </option>
          ))}
          {!matchesPreset && <option value="custom">Custom ({value})</option>}
        </select>
        {/* Numeric input for arbitrary values */}
        <input
          type="number"
          value={value}
          onChange={handleNumericChange}
          className="w-16 px-2 py-1 bg-surface-2 border border-border rounded text-xs text-primary text-center focus:outline-none focus:border-accent"
          min={-100}
          max={100}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }): React.JSX.Element {
  return (
    <h4 className="text-xs font-semibold text-secondary uppercase tracking-wider mt-4 mb-2 first:mt-0">
      {title}
    </h4>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PowerLevelEditor({ room, client }: PowerLevelEditorProps): React.JSX.Element {
  const plEvent = room.currentState.getStateEvents(EventType.RoomPowerLevels, "");
  const initialContent = (plEvent?.getContent() ?? {}) as PowerLevelsContent;

  const [content, setContent] = useState<PowerLevelsContent>(initialContent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const dirty = JSON.stringify(content) !== JSON.stringify(initialContent);

  const handleChange = (field: FieldDef, value: number) => {
    setContent((prev) => writeField(prev, field, value));
    setSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      await client.sendStateEvent(room.roomId, EventType.RoomPowerLevels, content);
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update power levels");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <SectionHeader title="General" />
      {GENERAL_FIELDS.map((field) => (
        <PowerLevelField
          key={field.key}
          label={field.label}
          value={readField(content, field)}
          onChange={(v) => handleChange(field, v)}
        />
      ))}

      <SectionHeader title="Events" />
      {EVENT_FIELDS.map((field) => (
        <PowerLevelField
          key={field.key}
          label={field.label}
          value={readField(content, field)}
          onChange={(v) => handleChange(field, v)}
        />
      ))}

      <SectionHeader title="Notifications" />
      {NOTIFICATION_FIELDS.map((field) => (
        <PowerLevelField
          key={field.key}
          label={field.label}
          value={readField(content, field)}
          onChange={(v) => handleChange(field, v)}
        />
      ))}

      {/* Save */}
      {dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full mt-4 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? "Saving..." : "Save power levels"}
        </button>
      )}

      {error && <p className="text-sm text-status-error mt-2">{error}</p>}
      {success && <p className="text-sm text-status-success mt-2">Power levels updated.</p>}
    </div>
  );
}
