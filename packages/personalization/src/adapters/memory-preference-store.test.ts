import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_PREFERENCES } from "../ports/preference-store.js";
import { MemoryPreferenceStore } from "./memory-preference-store.js";

describe("MemoryPreferenceStore", () => {
  let store: MemoryPreferenceStore;

  beforeEach(() => {
    store = new MemoryPreferenceStore();
  });

  describe("get", () => {
    it("should return defaults for unknown user", async () => {
      const prefs = await store.get("unknown");
      expect(prefs).toEqual(DEFAULT_PREFERENCES);
    });

    it("should return a copy, not a reference to internal state", async () => {
      const prefs1 = await store.get("user-1");
      const prefs2 = await store.get("user-1");
      expect(prefs1).not.toBe(prefs2);
      expect(prefs1).toEqual(prefs2);
    });
  });

  describe("set", () => {
    it("should merge partial preferences with defaults", async () => {
      const result = await store.set("user-1", { theme: "light" });
      expect(result.theme).toBe("light");
      expect(result.layoutMode).toBe("stream"); // default preserved
      expect(result.language).toBe("en-US"); // default preserved
    });

    it("should persist preferences across get calls", async () => {
      await store.set("user-1", { theme: "system", language: "fr" });
      const prefs = await store.get("user-1");
      expect(prefs.theme).toBe("system");
      expect(prefs.language).toBe("fr");
    });

    it("should merge subsequent sets", async () => {
      await store.set("user-1", { theme: "light" });
      await store.set("user-1", { layoutMode: "canvas" });
      const prefs = await store.get("user-1");
      expect(prefs.theme).toBe("light");
      expect(prefs.layoutMode).toBe("canvas");
    });
  });

  describe("reset", () => {
    it("should restore defaults after customization", async () => {
      await store.set("user-1", {
        theme: "light",
        layoutMode: "focus",
        language: "ja",
      });
      const prefs = await store.reset("user-1");
      expect(prefs).toEqual(DEFAULT_PREFERENCES);
    });

    it("should persist the reset across get calls", async () => {
      await store.set("user-1", { theme: "light" });
      await store.reset("user-1");
      const prefs = await store.get("user-1");
      expect(prefs).toEqual(DEFAULT_PREFERENCES);
    });
  });
});
