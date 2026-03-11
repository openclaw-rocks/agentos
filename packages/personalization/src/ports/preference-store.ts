export interface UserPreferences {
  theme: "dark" | "light" | "system";
  layoutMode: "stream" | "canvas" | "focus";
  notificationLevel: "all" | "mentions" | "none";
  voiceResponseEnabled: boolean;
  proactiveSuggestionsEnabled: boolean;
  language: string;
  timezone: string;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "dark",
  layoutMode: "stream",
  notificationLevel: "all",
  voiceResponseEnabled: false,
  proactiveSuggestionsEnabled: true,
  language: "en-US",
  timezone: "UTC",
};

/** Port: stores and retrieves user preferences */
export interface PreferenceStore {
  get(userId: string): Promise<UserPreferences>;
  set(userId: string, prefs: Partial<UserPreferences>): Promise<UserPreferences>;
  reset(userId: string): Promise<UserPreferences>;
}
