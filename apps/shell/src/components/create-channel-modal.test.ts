import { describe, it, expect } from "vitest";
import { buildCreationContent } from "./CreateChannelModal";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CreateChannelModal helpers", () => {
  // -----------------------------------------------------------------------
  // buildCreationContent — federation toggle
  // -----------------------------------------------------------------------

  describe("buildCreationContent", () => {
    describe("given federation is enabled and room type is normal", () => {
      it("should return undefined (no special creation content needed)", () => {
        const result = buildCreationContent(true, "normal");
        expect(result).toBeUndefined();
      });
    });

    describe("given federation is disabled", () => {
      it("should include m.federate: false", () => {
        const result = buildCreationContent(false, "normal");
        expect(result).toBeDefined();
        expect(result?.["m.federate"]).toBe(false);
      });
    });

    describe("given room type is video", () => {
      it("should include type: m.video_room", () => {
        const result = buildCreationContent(true, "video");
        expect(result).toBeDefined();
        expect(result?.type).toBe("m.video_room");
      });
    });

    describe("given federation is disabled and room type is video", () => {
      it("should include both m.federate: false and type: m.video_room", () => {
        const result = buildCreationContent(false, "video");
        expect(result).toBeDefined();
        expect(result?.["m.federate"]).toBe(false);
        expect(result?.type).toBe("m.video_room");
      });
    });

    describe("given federation is enabled (default)", () => {
      it("should NOT include m.federate key at all", () => {
        const result = buildCreationContent(true, "video");
        expect(result).toBeDefined();
        expect(result).not.toHaveProperty("m.federate");
      });
    });
  });
});
