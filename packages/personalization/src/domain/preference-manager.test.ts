import { describe, it, expect, beforeEach } from "vitest";
import { MemoryPreferenceStore } from "../adapters/memory-preference-store.js";
import { DEFAULT_PREFERENCES } from "../ports/preference-store.js";
import { PreferenceManager } from "./preference-manager.js";

describe("PreferenceManager", () => {
  let store: MemoryPreferenceStore;
  let manager: PreferenceManager;

  beforeEach(() => {
    store = new MemoryPreferenceStore();
    manager = new PreferenceManager(store);
  });

  describe("getPreferences", () => {
    it("should return defaults for unknown user", async () => {
      const prefs = await manager.getPreferences("unknown-user");
      expect(prefs).toEqual(DEFAULT_PREFERENCES);
    });

    it("should return stored preferences for known user", async () => {
      await store.set("user-1", { theme: "light" });
      const prefs = await manager.getPreferences("user-1");
      expect(prefs.theme).toBe("light");
    });
  });

  describe("updatePreferences", () => {
    it("should merge updates with existing preferences", async () => {
      await manager.updatePreferences("user-1", { theme: "light" });
      const prefs = await manager.getPreferences("user-1");

      expect(prefs.theme).toBe("light");
      expect(prefs.layoutMode).toBe("stream"); // unchanged default
      expect(prefs.language).toBe("en-US"); // unchanged default
    });

    it("should allow updating multiple fields at once", async () => {
      const prefs = await manager.updatePreferences("user-1", {
        theme: "system",
        layoutMode: "canvas",
        language: "de-DE",
      });

      expect(prefs.theme).toBe("system");
      expect(prefs.layoutMode).toBe("canvas");
      expect(prefs.language).toBe("de-DE");
    });

    it("should throw on invalid preferences", async () => {
      await expect(
        manager.updatePreferences("user-1", {
          theme: "neon" as "dark",
        }),
      ).rejects.toThrow("Invalid preferences");
    });

    it("should preserve previously set values when updating other fields", async () => {
      await manager.updatePreferences("user-1", { theme: "light" });
      await manager.updatePreferences("user-1", { layoutMode: "focus" });

      const prefs = await manager.getPreferences("user-1");
      expect(prefs.theme).toBe("light");
      expect(prefs.layoutMode).toBe("focus");
    });
  });

  describe("resetPreferences", () => {
    it("should reset to defaults", async () => {
      await manager.updatePreferences("user-1", {
        theme: "light",
        layoutMode: "canvas",
        language: "fr-FR",
      });

      const prefs = await manager.resetPreferences("user-1");
      expect(prefs).toEqual(DEFAULT_PREFERENCES);
    });

    it("should return defaults even if user had no prior preferences", async () => {
      const prefs = await manager.resetPreferences("new-user");
      expect(prefs).toEqual(DEFAULT_PREFERENCES);
    });
  });

  describe("validate", () => {
    it("should accept valid preferences", () => {
      const result = PreferenceManager.validate({
        theme: "dark",
        layoutMode: "stream",
        notificationLevel: "all",
        language: "en-US",
        timezone: "America/New_York",
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should accept empty partial preferences", () => {
      const result = PreferenceManager.validate({});
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject invalid theme", () => {
      const result = PreferenceManager.validate({
        theme: "neon" as "dark",
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("theme");
    });

    it("should reject invalid layoutMode", () => {
      const result = PreferenceManager.validate({
        layoutMode: "grid" as "stream",
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("layoutMode");
    });

    it("should reject invalid notificationLevel", () => {
      const result = PreferenceManager.validate({
        notificationLevel: "silent" as "none",
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("notificationLevel");
    });

    it("should reject invalid language tag", () => {
      const result = PreferenceManager.validate({
        language: "not-a-valid-tag-123",
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("language");
    });

    it("should accept short BCP47 language codes", () => {
      const result = PreferenceManager.validate({ language: "en" });
      expect(result.valid).toBe(true);
    });

    it("should reject empty timezone", () => {
      const result = PreferenceManager.validate({ timezone: "" });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("timezone");
    });

    it("should reject whitespace-only timezone", () => {
      const result = PreferenceManager.validate({ timezone: "   " });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("timezone");
    });

    it("should collect multiple errors at once", () => {
      const result = PreferenceManager.validate({
        theme: "neon" as "dark",
        layoutMode: "grid" as "stream",
        language: "!!!",
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
    });
  });
});
