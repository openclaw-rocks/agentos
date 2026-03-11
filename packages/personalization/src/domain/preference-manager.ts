import type { PreferenceStore, UserPreferences } from "../ports/preference-store.js";

const VALID_THEMES = new Set(["dark", "light", "system"]);
const VALID_LAYOUT_MODES = new Set(["stream", "canvas", "focus"]);
const VALID_NOTIFICATION_LEVELS = new Set(["all", "mentions", "none"]);
const BCP47_PATTERN = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;

export class PreferenceManager {
  constructor(private store: PreferenceStore) {}

  /** Get preferences for a user, returns defaults if none set */
  async getPreferences(userId: string): Promise<UserPreferences> {
    return this.store.get(userId);
  }

  /** Update specific preferences, merging with existing */
  async updatePreferences(
    userId: string,
    updates: Partial<UserPreferences>,
  ): Promise<UserPreferences> {
    const validation = PreferenceManager.validate(updates);
    if (!validation.valid) {
      throw new Error(`Invalid preferences: ${validation.errors.join(", ")}`);
    }
    return this.store.set(userId, updates);
  }

  /** Reset to defaults */
  async resetPreferences(userId: string): Promise<UserPreferences> {
    return this.store.reset(userId);
  }

  /** Validate preference values */
  static validate(prefs: Partial<UserPreferences>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (prefs.theme !== undefined && !VALID_THEMES.has(prefs.theme)) {
      errors.push(`Invalid theme: "${prefs.theme}". Must be one of: dark, light, system`);
    }

    if (prefs.layoutMode !== undefined && !VALID_LAYOUT_MODES.has(prefs.layoutMode)) {
      errors.push(
        `Invalid layoutMode: "${prefs.layoutMode}". Must be one of: stream, canvas, focus`,
      );
    }

    if (
      prefs.notificationLevel !== undefined &&
      !VALID_NOTIFICATION_LEVELS.has(prefs.notificationLevel)
    ) {
      errors.push(
        `Invalid notificationLevel: "${prefs.notificationLevel}". Must be one of: all, mentions, none`,
      );
    }

    if (prefs.language !== undefined && !BCP47_PATTERN.test(prefs.language)) {
      errors.push(
        `Invalid language: "${prefs.language}". Must be a valid BCP47 tag (e.g. "en" or "en-US")`,
      );
    }

    if (prefs.timezone !== undefined && prefs.timezone.trim() === "") {
      errors.push("Invalid timezone: must be a non-empty string");
    }

    return { valid: errors.length === 0, errors };
  }
}
