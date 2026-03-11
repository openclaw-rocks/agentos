import type { AnyUIComponent } from "@openclaw/protocol";
import { describe, it, expect } from "vitest";
import { deserializeUI, serializeUI } from "./serialize.js";

describe("serializeUI", () => {
  describe("given an array of A2UI components", () => {
    it("then it should produce a valid JSON string", () => {
      const components: AnyUIComponent[] = [{ type: "text", content: "Hello" }];
      const json = serializeUI(components);
      expect(JSON.parse(json)).toEqual(components);
    });
  });

  describe("given an empty array", () => {
    it("then it should serialize to '[]'", () => {
      expect(serializeUI([])).toBe("[]");
    });
  });
});

describe("deserializeUI", () => {
  describe("given a valid JSON string", () => {
    it("then it should parse into components", () => {
      const components: AnyUIComponent[] = [{ type: "text", content: "Hello" }];
      const json = JSON.stringify(components);
      expect(deserializeUI(json)).toEqual(components);
    });
  });

  describe("given a parsed array directly", () => {
    it("then it should return the array as-is", () => {
      const components: AnyUIComponent[] = [{ type: "text", content: "Hello" }];
      expect(deserializeUI(components)).toEqual(components);
    });
  });

  describe("given invalid JSON string", () => {
    it("then it should return null", () => {
      expect(deserializeUI("not-json")).toBeNull();
    });
  });

  describe("given a non-array input", () => {
    it("then it should return null", () => {
      expect(deserializeUI({ type: "text" })).toBeNull();
    });
  });

  describe("given components with validation warnings", () => {
    it("then it should still return the components (lenient deserialization)", () => {
      const components = [{ type: "text" }];
      const result = deserializeUI(components);
      expect(result).toEqual(components);
    });
  });

  describe("given a round-trip through serialize and deserialize", () => {
    it("then the output should match the original input", () => {
      const original: AnyUIComponent[] = [
        { type: "text", content: "Hello" },
        { type: "button", label: "Click", action: "do_it", style: "primary" },
        { type: "divider" },
      ];
      const result = deserializeUI(serializeUI(original));
      expect(result).toEqual(original);
    });

    it("then it should preserve expanded component types through round-trip", () => {
      const original: AnyUIComponent[] = [
        { type: "metric", label: "Revenue", value: "$42k", trend: "up" },
        { type: "badge", label: "New", color: "success" },
        { type: "timeline", events: [{ label: "Start", status: "info" }] },
        { type: "grid", columns: 2, children: [{ type: "text", content: "A" }] },
      ];
      const result = deserializeUI(serializeUI(original));
      expect(result).toEqual(original);
    });
  });
});
