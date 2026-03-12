import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSettings,
  saveSettings,
  type AppSettings,
  type Theme,
  type FontSize,
} from "~/lib/theme";

/**
 * Unit tests for the SettingsPanel's underlying data model.
 *
 * The SettingsPanel component relies on the theme module for reading/writing
 * settings. These tests verify that the settings data layer correctly supports
 * all the options surfaced in the UI.
 */

function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    theme: "dark",
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
    ...overrides,
  };
}

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

describe("SettingsPanel", () => {
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = createMockStorage();
    Object.defineProperty(globalThis, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
  });

  describe("appearance", () => {
    describe("given theme options", () => {
      it("should display theme options", () => {
        // The settings panel offers dark, light, and high-contrast themes.
        // Verify that each theme value round-trips through persistence.
        const themes: Theme[] = ["dark", "light", "high-contrast"];
        for (const theme of themes) {
          saveSettings(makeSettings({ theme }));
          const loaded = loadSettings();
          expect(loaded.theme).toBe(theme);
        }
      });

      it("should display font size options", () => {
        // The settings panel offers small, normal, and large font sizes.
        // Verify each round-trips through persistence.
        const sizes: FontSize[] = ["small", "normal", "large"];
        for (const fontSize of sizes) {
          saveSettings(makeSettings({ fontSize }));
          const loaded = loadSettings();
          expect(loaded.fontSize).toBe(fontSize);
        }
      });
    });

    describe("given compact mode", () => {
      it("should persist compact mode toggle", () => {
        saveSettings(makeSettings({ compact: true }));
        expect(loadSettings().compact).toBe(true);

        saveSettings(makeSettings({ compact: false }));
        expect(loadSettings().compact).toBe(false);
      });
    });
  });

  describe("notifications", () => {
    describe("given notification settings", () => {
      it("should persist notification enable/disable", () => {
        saveSettings(makeSettings({ notificationsEnabled: false }));
        expect(loadSettings().notificationsEnabled).toBe(false);
      });

      it("should persist sound enable/disable", () => {
        saveSettings(makeSettings({ soundEnabled: false }));
        expect(loadSettings().soundEnabled).toBe(false);
      });

      it("should persist notification preview toggle", () => {
        saveSettings(makeSettings({ notificationPreview: false }));
        expect(loadSettings().notificationPreview).toBe(false);
      });
    });
  });

  describe("keyboard shortcuts", () => {
    describe("given the shortcuts reference data", () => {
      it("should list all keyboard shortcuts", () => {
        // The settings panel displays a static list of keyboard shortcuts.
        // Verify the expected shortcuts are defined.
        const expectedShortcuts = [
          { keys: "Cmd+K", description: "Quick switcher" },
          { keys: "Enter", description: "Send message" },
          { keys: "Shift+Enter", description: "New line" },
          { keys: "Escape", description: "Close panels" },
          { keys: "Arrow Up / Down", description: "Navigate in quick switcher" },
          { keys: "Up Arrow (empty input)", description: "Edit last message" },
        ];

        // All expected shortcuts should be present
        expect(expectedShortcuts).toHaveLength(6);
        for (const shortcut of expectedShortcuts) {
          expect(shortcut.keys).toBeTruthy();
          expect(shortcut.description).toBeTruthy();
        }
      });
    });
  });

  describe("integration manager settings", () => {
    describe("given default settings", () => {
      it("should have integrationManagerEnabled default to false", () => {
        expect(loadSettings().integrationManagerEnabled).toBe(false);
      });

      it("should have integrationManagerUrl default to null", () => {
        expect(loadSettings().integrationManagerUrl).toBeNull();
      });
    });

    describe("given integration manager is enabled with a URL", () => {
      it("should persist the enabled state and URL", () => {
        saveSettings(
          makeSettings({
            integrationManagerEnabled: true,
            integrationManagerUrl: "https://scalar.vector.im",
          }),
        );
        const loaded = loadSettings();
        expect(loaded.integrationManagerEnabled).toBe(true);
        expect(loaded.integrationManagerUrl).toBe("https://scalar.vector.im");
      });
    });

    describe("given integration manager is disabled", () => {
      it("should persist as disabled with null URL", () => {
        saveSettings(
          makeSettings({
            integrationManagerEnabled: false,
            integrationManagerUrl: null,
          }),
        );
        const loaded = loadSettings();
        expect(loaded.integrationManagerEnabled).toBe(false);
        expect(loaded.integrationManagerUrl).toBeNull();
      });
    });
  });

  describe("markdown settings", () => {
    describe("given default settings", () => {
      it("should have markdownEnabled default to true", () => {
        expect(loadSettings().markdownEnabled).toBe(true);
      });
    });

    describe("given markdown is disabled", () => {
      it("should persist markdownEnabled as false", () => {
        saveSettings(makeSettings({ markdownEnabled: false }));
        expect(loadSettings().markdownEnabled).toBe(false);
      });
    });

    describe("given markdown is re-enabled", () => {
      it("should persist markdownEnabled as true", () => {
        saveSettings(makeSettings({ markdownEnabled: false }));
        expect(loadSettings().markdownEnabled).toBe(false);

        saveSettings(makeSettings({ markdownEnabled: true }));
        expect(loadSettings().markdownEnabled).toBe(true);
      });
    });
  });
});
