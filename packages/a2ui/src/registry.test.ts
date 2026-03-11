import { describe, it, expect } from "vitest";
import { componentRegistry } from "./registry.js";

describe("ComponentRegistry", () => {
  describe("given the default registry", () => {
    it("then it should have all 26 component types registered", () => {
      expect(componentRegistry.types()).toHaveLength(26);
    });

    it("then it should include all expected A2UI component types", () => {
      const types = componentRegistry.types();
      const expected = [
        "text",
        "button",
        "button_group",
        "code",
        "status",
        "progress",
        "table",
        "card",
        "input",
        "form",
        "divider",
        "image",
        "log",
        "diff",
        "metric",
        "chart",
        "list",
        "tabs",
        "avatar",
        "badge",
        "timeline",
        "media",
        "map",
        "grid",
        "stack",
        "split",
      ];
      for (const type of expected) {
        expect(types).toContain(type);
      }
    });
  });

  describe("given a known component type", () => {
    it("then get() should return its metadata", () => {
      const textMeta = componentRegistry.get("text");
      expect(textMeta).toBeDefined();
      expect(textMeta!.displayName).toBe("Text");
      expect(textMeta!.requiredFields).toContain("content");
      expect(textMeta!.canContainChildren).toBe(false);
    });

    it("then has() should return true", () => {
      expect(componentRegistry.has("card")).toBe(true);
    });
  });

  describe("given an unknown component type", () => {
    it("then get() should return undefined", () => {
      expect(componentRegistry.get("nonexistent")).toBeUndefined();
    });

    it("then has() should return false", () => {
      expect(componentRegistry.has("nonexistent")).toBe(false);
    });
  });

  describe("given container components", () => {
    it("then card should be marked as canContainChildren", () => {
      expect(componentRegistry.get("card")!.canContainChildren).toBe(true);
    });

    it("then form should be marked as canContainChildren", () => {
      expect(componentRegistry.get("form")!.canContainChildren).toBe(true);
    });

    it("then tabs should be marked as canContainChildren", () => {
      expect(componentRegistry.get("tabs")!.canContainChildren).toBe(true);
    });

    it("then grid should be marked as canContainChildren", () => {
      expect(componentRegistry.get("grid")!.canContainChildren).toBe(true);
    });

    it("then stack should be marked as canContainChildren", () => {
      expect(componentRegistry.get("stack")!.canContainChildren).toBe(true);
    });

    it("then split should be marked as canContainChildren", () => {
      expect(componentRegistry.get("split")!.canContainChildren).toBe(true);
    });
  });

  describe("given leaf components", () => {
    it("then they should not be marked as canContainChildren", () => {
      const leafTypes = [
        "text",
        "button",
        "code",
        "status",
        "progress",
        "divider",
        "image",
        "metric",
        "chart",
        "list",
        "avatar",
        "badge",
        "timeline",
        "media",
        "map",
      ];
      for (const type of leafTypes) {
        expect(componentRegistry.get(type)!.canContainChildren).toBe(false);
      }
    });
  });
});
