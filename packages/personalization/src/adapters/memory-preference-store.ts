import type { PreferenceStore, UserPreferences } from "../ports/preference-store.js";
import { DEFAULT_PREFERENCES } from "../ports/preference-store.js";

export class MemoryPreferenceStore implements PreferenceStore {
  private data = new Map<string, UserPreferences>();

  async get(userId: string): Promise<UserPreferences> {
    return this.data.get(userId) ?? { ...DEFAULT_PREFERENCES };
  }

  async set(userId: string, prefs: Partial<UserPreferences>): Promise<UserPreferences> {
    const existing = await this.get(userId);
    const merged: UserPreferences = { ...existing, ...prefs };
    this.data.set(userId, merged);
    return { ...merged };
  }

  async reset(userId: string): Promise<UserPreferences> {
    const defaults = { ...DEFAULT_PREFERENCES };
    this.data.set(userId, defaults);
    return { ...defaults };
  }
}
