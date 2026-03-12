const SETTINGS_KEY = "openclaw:settings";

export type Theme = "dark" | "light" | "high-contrast";
export type FontSize = "small" | "normal" | "large";
export type MessageLayout = "modern" | "irc" | "bubble";
export type ImageSize = "small" | "medium" | "large";

export interface AppSettings {
  theme: Theme;
  fontSize: FontSize;
  compact: boolean;
  messageLayout: MessageLayout;
  imageSize: ImageSize;
  customThemeUrl: string | null;
  showHiddenEvents: boolean;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  notificationPreview: boolean;
  showJoinLeaveEvents: boolean;
  showAvatarChanges: boolean;
  showDisplayNameChanges: boolean;
  sendReadReceipts: boolean;
  showReadReceipts: boolean;
  sendTypingNotifications: boolean;
  showTypingNotifications: boolean;
  use24HourTime: boolean;
  showSeconds: boolean;
  enterToSend: boolean;
  showUrlPreviews: boolean;
  bigEmoji: boolean;
  language: string;
  emailNotifications: boolean;
  enableEncryptedSearch: boolean;
  neverSendToUnverified: boolean;
  integrationManagerEnabled: boolean;
  integrationManagerUrl: string | null;
  markdownEnabled: boolean;
}

const THEME_CLASSES: readonly string[] = ["dark", "high-contrast"] as const;
const FONT_CLASSES: readonly string[] = ["font-small", "font-large"] as const;

function defaultSettings(): AppSettings {
  return {
    theme: "light",
    fontSize: "normal",
    compact: false,
    messageLayout: "modern",
    imageSize: "medium",
    customThemeUrl: null,
    showHiddenEvents: false,
    notificationsEnabled: true,
    soundEnabled: true,
    notificationPreview: true,
    showJoinLeaveEvents: true,
    showAvatarChanges: true,
    showDisplayNameChanges: true,
    sendReadReceipts: true,
    showReadReceipts: true,
    sendTypingNotifications: true,
    showTypingNotifications: true,
    use24HourTime: false,
    showSeconds: false,
    enterToSend: true,
    showUrlPreviews: true,
    bigEmoji: true,
    language: "en",
    emailNotifications: false,
    enableEncryptedSearch: false,
    neverSendToUnverified: false,
    integrationManagerEnabled: false,
    integrationManagerUrl: null,
    markdownEnabled: true,
  };
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return defaultSettings();
    const record = parsed as Record<string, unknown>;
    const defaults = defaultSettings();
    return {
      theme: isTheme(record.theme) ? record.theme : defaults.theme,
      fontSize: isFontSize(record.fontSize) ? record.fontSize : defaults.fontSize,
      compact: typeof record.compact === "boolean" ? record.compact : defaults.compact,
      messageLayout: isMessageLayout(record.messageLayout)
        ? record.messageLayout
        : defaults.messageLayout,
      imageSize: isImageSize(record.imageSize) ? record.imageSize : defaults.imageSize,
      customThemeUrl:
        typeof record.customThemeUrl === "string" ? record.customThemeUrl : defaults.customThemeUrl,
      showHiddenEvents:
        typeof record.showHiddenEvents === "boolean"
          ? record.showHiddenEvents
          : defaults.showHiddenEvents,
      notificationsEnabled:
        typeof record.notificationsEnabled === "boolean"
          ? record.notificationsEnabled
          : defaults.notificationsEnabled,
      soundEnabled:
        typeof record.soundEnabled === "boolean" ? record.soundEnabled : defaults.soundEnabled,
      notificationPreview:
        typeof record.notificationPreview === "boolean"
          ? record.notificationPreview
          : defaults.notificationPreview,
      showJoinLeaveEvents:
        typeof record.showJoinLeaveEvents === "boolean"
          ? record.showJoinLeaveEvents
          : defaults.showJoinLeaveEvents,
      showAvatarChanges:
        typeof record.showAvatarChanges === "boolean"
          ? record.showAvatarChanges
          : defaults.showAvatarChanges,
      showDisplayNameChanges:
        typeof record.showDisplayNameChanges === "boolean"
          ? record.showDisplayNameChanges
          : defaults.showDisplayNameChanges,
      sendReadReceipts:
        typeof record.sendReadReceipts === "boolean"
          ? record.sendReadReceipts
          : defaults.sendReadReceipts,
      showReadReceipts:
        typeof record.showReadReceipts === "boolean"
          ? record.showReadReceipts
          : defaults.showReadReceipts,
      sendTypingNotifications:
        typeof record.sendTypingNotifications === "boolean"
          ? record.sendTypingNotifications
          : defaults.sendTypingNotifications,
      showTypingNotifications:
        typeof record.showTypingNotifications === "boolean"
          ? record.showTypingNotifications
          : defaults.showTypingNotifications,
      use24HourTime:
        typeof record.use24HourTime === "boolean" ? record.use24HourTime : defaults.use24HourTime,
      showSeconds:
        typeof record.showSeconds === "boolean" ? record.showSeconds : defaults.showSeconds,
      enterToSend:
        typeof record.enterToSend === "boolean" ? record.enterToSend : defaults.enterToSend,
      showUrlPreviews:
        typeof record.showUrlPreviews === "boolean"
          ? record.showUrlPreviews
          : defaults.showUrlPreviews,
      bigEmoji: typeof record.bigEmoji === "boolean" ? record.bigEmoji : defaults.bigEmoji,
      language: typeof record.language === "string" ? record.language : defaults.language,
      emailNotifications:
        typeof record.emailNotifications === "boolean"
          ? record.emailNotifications
          : defaults.emailNotifications,
      enableEncryptedSearch:
        typeof record.enableEncryptedSearch === "boolean"
          ? record.enableEncryptedSearch
          : defaults.enableEncryptedSearch,
      neverSendToUnverified:
        typeof record.neverSendToUnverified === "boolean"
          ? record.neverSendToUnverified
          : defaults.neverSendToUnverified,
      integrationManagerEnabled:
        typeof record.integrationManagerEnabled === "boolean"
          ? record.integrationManagerEnabled
          : defaults.integrationManagerEnabled,
      integrationManagerUrl:
        typeof record.integrationManagerUrl === "string"
          ? record.integrationManagerUrl
          : defaults.integrationManagerUrl,
      markdownEnabled:
        typeof record.markdownEnabled === "boolean"
          ? record.markdownEnabled
          : defaults.markdownEnabled,
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage may be unavailable
  }
}

export function getTheme(): Theme {
  return loadSettings().theme;
}

export function setTheme(theme: Theme): void {
  const settings = loadSettings();
  settings.theme = theme;
  saveSettings(settings);
  applyTheme(theme);
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  for (const cls of THEME_CLASSES) {
    root.classList.remove(cls);
  }
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "high-contrast") {
    root.classList.add("high-contrast");
  }
  // light is the default (no class needed)
}

export function applyFontSize(size: FontSize): void {
  const root = document.documentElement;
  for (const cls of FONT_CLASSES) {
    root.classList.remove(cls);
  }
  if (size === "small") {
    root.classList.add("font-small");
  } else if (size === "large") {
    root.classList.add("font-large");
  }
  // normal is the default (no class needed)
}

export function applyCompact(compact: boolean): void {
  const root = document.documentElement;
  if (compact) {
    root.classList.add("compact");
  } else {
    root.classList.remove("compact");
  }
}

/** Apply all settings to the document */
export function applyAllSettings(settings: AppSettings): void {
  applyTheme(settings.theme);
  applyFontSize(settings.fontSize);
  applyCompact(settings.compact);
}

/**
 * Format a timestamp for display in message rows, respecting user preferences.
 */
export function formatMessageTimestamp(
  timestamp: number,
  use24Hour: boolean,
  showSecs: boolean,
): string {
  const date = new Date(timestamp);
  const options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: !use24Hour,
  };
  if (showSecs) {
    options.second = "2-digit";
  }
  return date.toLocaleTimeString([], options);
}

/** Regex matching 1-3 consecutive emoji characters with no surrounding text. */
const EMOJI_ONLY_RE = /^\p{Emoji_Presentation}{1,3}$/u;

/**
 * Check if a message body consists of only 1-3 emoji characters (no other text).
 */
export function isEmojiOnly(text: string): boolean {
  return EMOJI_ONLY_RE.test(text.trim());
}

/**
 * Fetch a custom theme from a JSON URL and apply CSS custom properties.
 * The JSON should map CSS custom property names to values,
 * e.g. `{"--color-bg": "20 20 30", "--color-accent": "100 100 255"}`.
 */
export async function loadCustomTheme(url: string): Promise<Record<string, string>> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load theme: ${response.status} ${response.statusText}`);
  }
  const data: unknown = await response.json();
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Invalid theme format: expected a JSON object");
  }
  const themeMap = data as Record<string, unknown>;
  const result: Record<string, string> = {};
  const root = document.documentElement;
  for (const [key, value] of Object.entries(themeMap)) {
    if (typeof key === "string" && key.startsWith("--") && typeof value === "string") {
      root.style.setProperty(key, value);
      result[key] = value;
    }
  }
  return result;
}

/** Remove all custom theme CSS properties from the document root. */
export function clearCustomTheme(): void {
  const root = document.documentElement;
  // Remove any inline custom properties that were set
  root.removeAttribute("style");
}

/**
 * Fetch a custom theme from a JSON URL and apply CSS custom properties.
 * Supports the `{"colors": {"background": "#hex", ...}}` format,
 * mapping color keys to `--color-<key>` custom properties.
 */
export async function applyCustomTheme(url: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load custom theme: ${response.status} ${response.statusText}`);
  }
  const data: unknown = await response.json();
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Invalid theme format: expected a JSON object");
  }
  const obj = data as Record<string, unknown>;
  const root = document.documentElement;
  const colors = obj.colors;
  if (typeof colors === "object" && colors !== null && !Array.isArray(colors)) {
    for (const [key, value] of Object.entries(colors as Record<string, unknown>)) {
      if (typeof value === "string") {
        root.style.setProperty(`--color-${key}`, value);
      }
    }
  }
  // Also support top-level CSS custom properties (--var: value)
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith("--") && typeof value === "string") {
      root.style.setProperty(key, value);
    }
  }
}

/** Image size class map for timeline images. */
export const IMAGE_SIZE_CLASSES: Record<ImageSize, string> = {
  small: "max-w-48",
  medium: "max-w-80",
  large: "max-w-lg",
};

function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light" || value === "high-contrast";
}

function isFontSize(value: unknown): value is FontSize {
  return value === "small" || value === "normal" || value === "large";
}

function isMessageLayout(value: unknown): value is MessageLayout {
  return value === "modern" || value === "irc" || value === "bubble";
}

function isImageSize(value: unknown): value is ImageSize {
  return value === "small" || value === "medium" || value === "large";
}
