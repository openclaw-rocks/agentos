import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getTheme,
  setTheme,
  applyTheme,
  applyFontSize,
  applyCompact,
  loadSettings,
  saveSettings,
  applyAllSettings,
  formatMessageTimestamp,
  isEmojiOnly,
  type AppSettings,
} from "./theme";

const SETTINGS_KEY = "openclaw:settings";

// In the node test environment, localStorage and document.documentElement may
// not exist.  Provide lightweight stubs so the theme module can be exercised
// without a full browser / jsdom runtime.

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
}

function createMockClassList(): DOMTokenList {
  const classes = new Set<string>();
  return {
    add: (...tokens: string[]) => {
      for (const t of tokens) classes.add(t);
    },
    remove: (...tokens: string[]) => {
      for (const t of tokens) classes.delete(t);
    },
    contains: (token: string) => classes.has(token),
    toggle: (token: string) => {
      if (classes.has(token)) {
        classes.delete(token);
        return false;
      }
      classes.add(token);
      return true;
    },
    // Minimal set needed by the theme module
  } as unknown as DOMTokenList;
}

describe("Theme", () => {
  let mockStorage: Storage;
  let mockClassList: DOMTokenList;

  beforeEach(() => {
    mockStorage = createMockStorage();

    // Install localStorage mock
    Object.defineProperty(globalThis, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true,
    });

    // Install document.documentElement.classList mock
    mockClassList = createMockClassList();
    if (typeof document === "undefined") {
      // @ts-expect-error stub for node env
      globalThis.document = { documentElement: { classList: mockClassList, className: "" } };
    } else {
      Object.defineProperty(document.documentElement, "classList", {
        value: mockClassList,
        writable: true,
        configurable: true,
      });
    }
  });

  afterEach(() => {
    mockStorage.clear();
  });

  describe("getTheme", () => {
    describe("given no settings are stored", () => {
      it("should return 'light' by default", () => {
        expect(getTheme()).toBe("light");
      });
    });

    describe("given a theme is stored in localStorage", () => {
      it("should return stored theme from localStorage", () => {
        mockStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: "light" }));
        expect(getTheme()).toBe("light");
      });

      it("should return high-contrast when stored", () => {
        mockStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: "high-contrast" }));
        expect(getTheme()).toBe("high-contrast");
      });
    });

    describe("given invalid data in localStorage", () => {
      it("should return 'light' for invalid theme value", () => {
        mockStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: "invalid-theme" }));
        expect(getTheme()).toBe("light");
      });

      it("should return 'light' for corrupt JSON", () => {
        mockStorage.setItem(SETTINGS_KEY, "not-valid-json");
        expect(getTheme()).toBe("light");
      });
    });
  });

  describe("setTheme", () => {
    describe("given a valid theme", () => {
      it("should store theme in localStorage", () => {
        setTheme("dark");
        const stored = JSON.parse(mockStorage.getItem(SETTINGS_KEY)!);
        expect(stored.theme).toBe("dark");
      });

      it("should apply the theme to the document", () => {
        setTheme("dark");
        expect(mockClassList.contains("dark")).toBe(true);
      });
    });
  });

  describe("applyTheme", () => {
    describe("given the light theme", () => {
      it("should not add any theme class for light (default)", () => {
        applyTheme("light");
        expect(mockClassList.contains("dark")).toBe(false);
        expect(mockClassList.contains("high-contrast")).toBe(false);
      });
    });

    describe("given the high-contrast theme", () => {
      it("should add high-contrast class for high contrast theme", () => {
        applyTheme("high-contrast");
        expect(mockClassList.contains("high-contrast")).toBe(true);
      });
    });

    describe("given the dark theme", () => {
      it("should add dark class for dark theme", () => {
        applyTheme("dark");
        expect(mockClassList.contains("dark")).toBe(true);
      });
    });

    describe("when switching themes", () => {
      it("should remove other theme classes when switching", () => {
        applyTheme("dark");
        expect(mockClassList.contains("dark")).toBe(true);

        applyTheme("high-contrast");
        expect(mockClassList.contains("dark")).toBe(false);
        expect(mockClassList.contains("high-contrast")).toBe(true);

        applyTheme("light");
        expect(mockClassList.contains("dark")).toBe(false);
        expect(mockClassList.contains("high-contrast")).toBe(false);
      });
    });
  });

  describe("applyFontSize", () => {
    describe("given the small font size", () => {
      it("should add font-small class", () => {
        applyFontSize("small");
        expect(mockClassList.contains("font-small")).toBe(true);
      });
    });

    describe("given the large font size", () => {
      it("should add font-large class", () => {
        applyFontSize("large");
        expect(mockClassList.contains("font-large")).toBe(true);
      });
    });

    describe("given the normal font size", () => {
      it("should not add any font class", () => {
        applyFontSize("normal");
        expect(mockClassList.contains("font-small")).toBe(false);
        expect(mockClassList.contains("font-large")).toBe(false);
      });
    });

    describe("when switching font sizes", () => {
      it("should remove previous font class", () => {
        applyFontSize("small");
        expect(mockClassList.contains("font-small")).toBe(true);

        applyFontSize("large");
        expect(mockClassList.contains("font-small")).toBe(false);
        expect(mockClassList.contains("font-large")).toBe(true);
      });
    });
  });

  describe("applyCompact", () => {
    describe("given compact is enabled", () => {
      it("should add compact class", () => {
        applyCompact(true);
        expect(mockClassList.contains("compact")).toBe(true);
      });
    });

    describe("given compact is disabled", () => {
      it("should remove compact class", () => {
        mockClassList.add("compact");
        applyCompact(false);
        expect(mockClassList.contains("compact")).toBe(false);
      });
    });
  });

  describe("loadSettings", () => {
    describe("given no settings are stored", () => {
      it("should return default settings", () => {
        const settings = loadSettings();
        expect(settings).toEqual({
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
        });
      });
    });

    describe("given partial settings are stored", () => {
      it("should merge with defaults", () => {
        mockStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: "light", compact: true }));
        const settings = loadSettings();
        expect(settings.theme).toBe("light");
        expect(settings.compact).toBe(true);
        expect(settings.fontSize).toBe("normal");
        expect(settings.notificationsEnabled).toBe(true);
      });
    });
  });

  describe("saveSettings", () => {
    describe("given valid settings", () => {
      it("should persist settings to localStorage", () => {
        const fullSettings: AppSettings = {
          theme: "high-contrast",
          fontSize: "large",
          compact: true,
          messageLayout: "modern",
          imageSize: "medium",
          customThemeUrl: null,
          showHiddenEvents: false,
          notificationsEnabled: false,
          soundEnabled: false,
          notificationPreview: false,
          showJoinLeaveEvents: false,
          showAvatarChanges: false,
          showDisplayNameChanges: false,
          sendReadReceipts: false,
          showReadReceipts: false,
          sendTypingNotifications: false,
          showTypingNotifications: false,
          use24HourTime: true,
          showSeconds: true,
          enterToSend: false,
          showUrlPreviews: false,
          bigEmoji: false,
          language: "de",
          emailNotifications: true,
          enableEncryptedSearch: false,
          neverSendToUnverified: false,
          integrationManagerEnabled: true,
          integrationManagerUrl: "https://scalar.vector.im",
          markdownEnabled: false,
        };
        saveSettings(fullSettings);
        const stored = JSON.parse(mockStorage.getItem(SETTINGS_KEY)!);
        expect(stored.theme).toBe("high-contrast");
        expect(stored.fontSize).toBe("large");
        expect(stored.compact).toBe(true);
        expect(stored.notificationsEnabled).toBe(false);
        expect(stored.enterToSend).toBe(false);
        expect(stored.use24HourTime).toBe(true);
        expect(stored.language).toBe("de");
      });
    });
  });

  describe("applyAllSettings", () => {
    describe("given a full settings object", () => {
      it("should apply theme, font size, and compact mode together", () => {
        applyAllSettings({
          theme: "light",
          fontSize: "large",
          compact: true,
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
        });
        // light is the default — no class added
        expect(mockClassList.contains("dark")).toBe(false);
        expect(mockClassList.contains("font-large")).toBe(true);
        expect(mockClassList.contains("compact")).toBe(true);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* New Preferences                                                     */
  /* ------------------------------------------------------------------ */

  describe("new preferences", () => {
    describe("given default preferences", () => {
      it("should have showJoinLeaveEvents default to true", () => {
        expect(loadSettings().showJoinLeaveEvents).toBe(true);
      });

      it("should have showAvatarChanges default to true", () => {
        expect(loadSettings().showAvatarChanges).toBe(true);
      });

      it("should have showDisplayNameChanges default to true", () => {
        expect(loadSettings().showDisplayNameChanges).toBe(true);
      });

      it("should have sendReadReceipts default to true", () => {
        expect(loadSettings().sendReadReceipts).toBe(true);
      });

      it("should have showReadReceipts default to true", () => {
        expect(loadSettings().showReadReceipts).toBe(true);
      });

      it("should have sendTypingNotifications default to true", () => {
        expect(loadSettings().sendTypingNotifications).toBe(true);
      });

      it("should have showTypingNotifications default to true", () => {
        expect(loadSettings().showTypingNotifications).toBe(true);
      });

      it("should have use24HourTime default to false", () => {
        expect(loadSettings().use24HourTime).toBe(false);
      });

      it("should have showSeconds default to false", () => {
        expect(loadSettings().showSeconds).toBe(false);
      });

      it("should have enterToSend default to true", () => {
        expect(loadSettings().enterToSend).toBe(true);
      });

      it("should have showUrlPreviews default to true", () => {
        expect(loadSettings().showUrlPreviews).toBe(true);
      });

      it("should have bigEmoji default to true", () => {
        expect(loadSettings().bigEmoji).toBe(true);
      });

      it("should have language default to 'en'", () => {
        expect(loadSettings().language).toBe("en");
      });
    });

    describe("given saved preferences with new fields", () => {
      it("should load boolean preferences correctly", () => {
        mockStorage.setItem(
          SETTINGS_KEY,
          JSON.stringify({
            sendReadReceipts: false,
            showTypingNotifications: false,
            enterToSend: false,
            use24HourTime: true,
            showSeconds: true,
            bigEmoji: false,
            showUrlPreviews: false,
          }),
        );
        const settings = loadSettings();
        expect(settings.sendReadReceipts).toBe(false);
        expect(settings.showTypingNotifications).toBe(false);
        expect(settings.enterToSend).toBe(false);
        expect(settings.use24HourTime).toBe(true);
        expect(settings.showSeconds).toBe(true);
        expect(settings.bigEmoji).toBe(false);
        expect(settings.showUrlPreviews).toBe(false);
      });

      it("should load language preference correctly", () => {
        mockStorage.setItem(SETTINGS_KEY, JSON.stringify({ language: "de" }));
        const settings = loadSettings();
        expect(settings.language).toBe("de");
      });

      it("should fall back to defaults for missing new fields", () => {
        mockStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: "light" }));
        const settings = loadSettings();
        expect(settings.theme).toBe("light");
        expect(settings.enterToSend).toBe(true);
        expect(settings.use24HourTime).toBe(false);
        expect(settings.language).toBe("en");
        expect(settings.bigEmoji).toBe(true);
      });
    });

    describe("given preference changes", () => {
      it("should persist new preference fields via save and load", () => {
        const settings = loadSettings();
        settings.enterToSend = false;
        settings.use24HourTime = true;
        settings.showSeconds = true;
        settings.language = "fr";
        settings.bigEmoji = false;
        saveSettings(settings);

        const reloaded = loadSettings();
        expect(reloaded.enterToSend).toBe(false);
        expect(reloaded.use24HourTime).toBe(true);
        expect(reloaded.showSeconds).toBe(true);
        expect(reloaded.language).toBe("fr");
        expect(reloaded.bigEmoji).toBe(false);
      });

      it("should persist read receipt and typing preferences", () => {
        const settings = loadSettings();
        settings.sendReadReceipts = false;
        settings.showReadReceipts = false;
        settings.sendTypingNotifications = false;
        settings.showTypingNotifications = false;
        saveSettings(settings);

        const reloaded = loadSettings();
        expect(reloaded.sendReadReceipts).toBe(false);
        expect(reloaded.showReadReceipts).toBe(false);
        expect(reloaded.sendTypingNotifications).toBe(false);
        expect(reloaded.showTypingNotifications).toBe(false);
      });

      it("should persist timeline visibility preferences", () => {
        const settings = loadSettings();
        settings.showJoinLeaveEvents = false;
        settings.showAvatarChanges = false;
        settings.showDisplayNameChanges = false;
        saveSettings(settings);

        const reloaded = loadSettings();
        expect(reloaded.showJoinLeaveEvents).toBe(false);
        expect(reloaded.showAvatarChanges).toBe(false);
        expect(reloaded.showDisplayNameChanges).toBe(false);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* formatMessageTimestamp                                               */
  /* ------------------------------------------------------------------ */

  describe("formatMessageTimestamp", () => {
    describe("given 12-hour format without seconds", () => {
      it("should format as 12-hour time", () => {
        // 2026-03-11 14:30:45
        const ts = new Date(2026, 2, 11, 14, 30, 45).getTime();
        const result = formatMessageTimestamp(ts, false, false);
        expect(result).toMatch(/2:30/);
        expect(result).toMatch(/PM/i);
      });
    });

    describe("given 24-hour format without seconds", () => {
      it("should format as 24-hour time", () => {
        const ts = new Date(2026, 2, 11, 14, 30, 45).getTime();
        const result = formatMessageTimestamp(ts, true, false);
        expect(result).toMatch(/14:30/);
      });
    });

    describe("given 24-hour format with seconds", () => {
      it("should include seconds", () => {
        const ts = new Date(2026, 2, 11, 14, 30, 45).getTime();
        const result = formatMessageTimestamp(ts, true, true);
        expect(result).toMatch(/14:30:45/);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* isEmojiOnly                                                         */
  /* ------------------------------------------------------------------ */

  describe("isEmojiOnly", () => {
    describe("given a single emoji", () => {
      it("should return true", () => {
        expect(isEmojiOnly("\u{1F600}")).toBe(true);
      });
    });

    describe("given two emoji", () => {
      it("should return true", () => {
        expect(isEmojiOnly("\u{1F600}\u{1F389}")).toBe(true);
      });
    });

    describe("given three emoji", () => {
      it("should return true", () => {
        expect(isEmojiOnly("\u{1F600}\u{1F389}\u{1F680}")).toBe(true);
      });
    });

    describe("given text with emoji", () => {
      it("should return false", () => {
        expect(isEmojiOnly("hello \u{1F600}")).toBe(false);
      });
    });

    describe("given plain text", () => {
      it("should return false", () => {
        expect(isEmojiOnly("hello world")).toBe(false);
      });
    });

    describe("given four emoji", () => {
      it("should return false", () => {
        expect(isEmojiOnly("\u{1F600}\u{1F389}\u{1F680}\u{1F44D}")).toBe(false);
      });
    });

    describe("given an empty string", () => {
      it("should return false", () => {
        expect(isEmojiOnly("")).toBe(false);
      });
    });
  });
});
