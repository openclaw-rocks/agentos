import { describe, it, expect } from "vitest";
import {
  readField,
  writeField,
  POWER_LEVEL_PRESETS,
  presetLabelForLevel,
  clampPowerLevel,
} from "./PowerLevelEditor";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PowerLevelEditor helpers", () => {
  // -----------------------------------------------------------------------
  // POWER_LEVEL_PRESETS
  // -----------------------------------------------------------------------

  describe("POWER_LEVEL_PRESETS", () => {
    describe("given the preset list", () => {
      it("should include Muted, Default, Moderator, and Admin", () => {
        const labels = POWER_LEVEL_PRESETS.map((p) => p.label);
        expect(labels).toContain("Muted");
        expect(labels).toContain("Default");
        expect(labels).toContain("Moderator");
        expect(labels).toContain("Admin");
      });

      it("should have Muted at -1", () => {
        const muted = POWER_LEVEL_PRESETS.find((p) => p.label === "Muted");
        expect(muted?.value).toBe(-1);
      });

      it("should have Default at 0", () => {
        const def = POWER_LEVEL_PRESETS.find((p) => p.label === "Default");
        expect(def?.value).toBe(0);
      });

      it("should have Moderator at 50", () => {
        const mod = POWER_LEVEL_PRESETS.find((p) => p.label === "Moderator");
        expect(mod?.value).toBe(50);
      });

      it("should have Admin at 100", () => {
        const admin = POWER_LEVEL_PRESETS.find((p) => p.label === "Admin");
        expect(admin?.value).toBe(100);
      });
    });
  });

  // -----------------------------------------------------------------------
  // presetLabelForLevel
  // -----------------------------------------------------------------------

  describe("presetLabelForLevel", () => {
    describe("given a level that matches a preset", () => {
      it("should return the preset label for -1 (Muted)", () => {
        expect(presetLabelForLevel(-1)).toBe("Muted");
      });

      it("should return the preset label for 0 (Default)", () => {
        expect(presetLabelForLevel(0)).toBe("Default");
      });

      it("should return the preset label for 50 (Moderator)", () => {
        expect(presetLabelForLevel(50)).toBe("Moderator");
      });

      it("should return the preset label for 100 (Admin)", () => {
        expect(presetLabelForLevel(100)).toBe("Admin");
      });
    });

    describe("given a level that does not match any preset", () => {
      it("should return null for 25", () => {
        expect(presetLabelForLevel(25)).toBeNull();
      });

      it("should return null for -50", () => {
        expect(presetLabelForLevel(-50)).toBeNull();
      });

      it("should return null for 75", () => {
        expect(presetLabelForLevel(75)).toBeNull();
      });
    });
  });

  // -----------------------------------------------------------------------
  // clampPowerLevel
  // -----------------------------------------------------------------------

  describe("clampPowerLevel", () => {
    describe("given a value within range [-100, 100]", () => {
      it("should return the value unchanged for 0", () => {
        expect(clampPowerLevel(0)).toBe(0);
      });

      it("should return the value unchanged for -1", () => {
        expect(clampPowerLevel(-1)).toBe(-1);
      });

      it("should return the value unchanged for 50", () => {
        expect(clampPowerLevel(50)).toBe(50);
      });

      it("should return the value unchanged for -100", () => {
        expect(clampPowerLevel(-100)).toBe(-100);
      });

      it("should return the value unchanged for 100", () => {
        expect(clampPowerLevel(100)).toBe(100);
      });
    });

    describe("given a value below -100", () => {
      it("should clamp to -100", () => {
        expect(clampPowerLevel(-200)).toBe(-100);
      });

      it("should clamp -101 to -100", () => {
        expect(clampPowerLevel(-101)).toBe(-100);
      });
    });

    describe("given a value above 100", () => {
      it("should clamp to 100", () => {
        expect(clampPowerLevel(200)).toBe(100);
      });

      it("should clamp 101 to 100", () => {
        expect(clampPowerLevel(101)).toBe(100);
      });
    });
  });

  // -----------------------------------------------------------------------
  // readField
  // -----------------------------------------------------------------------

  describe("readField", () => {
    describe("given a top-level field", () => {
      it("should read the value from the content", () => {
        const content = { kick: 50 };
        const field = { key: "kick", label: "Kick users", path: "top" as const };
        expect(readField(content, field)).toBe(50);
      });

      it("should default to 0 if the field is missing", () => {
        const content = {};
        const field = { key: "kick", label: "Kick users", path: "top" as const };
        expect(readField(content, field)).toBe(0);
      });

      it("should support negative values", () => {
        const content = { users_default: -1 };
        const field = { key: "users_default", label: "Default user level", path: "top" as const };
        expect(readField(content, field)).toBe(-1);
      });
    });

    describe("given an events field", () => {
      it("should read from the events sub-object", () => {
        const content = { events: { "m.room.name": 75 } };
        const field = { key: "m.room.name", label: "Room name", path: "events" as const };
        expect(readField(content, field)).toBe(75);
      });

      it("should fall back to state_default when events key is missing", () => {
        const content = { state_default: 30 };
        const field = { key: "m.room.name", label: "Room name", path: "events" as const };
        expect(readField(content, field)).toBe(30);
      });

      it("should fall back to 50 when both are missing", () => {
        const content = {};
        const field = { key: "m.room.name", label: "Room name", path: "events" as const };
        expect(readField(content, field)).toBe(50);
      });
    });

    describe("given a notifications field", () => {
      it("should read from the notifications sub-object", () => {
        const content = { notifications: { room: 25 } };
        const field = { key: "room", label: "@room notification", path: "notifications" as const };
        expect(readField(content, field)).toBe(25);
      });

      it("should fall back to 50 when missing", () => {
        const content = {};
        const field = { key: "room", label: "@room notification", path: "notifications" as const };
        expect(readField(content, field)).toBe(50);
      });
    });
  });

  // -----------------------------------------------------------------------
  // writeField
  // -----------------------------------------------------------------------

  describe("writeField", () => {
    describe("given a top-level field", () => {
      it("should set the value on the content", () => {
        const content = { kick: 50 };
        const field = { key: "kick", label: "Kick users", path: "top" as const };
        const result = writeField(content, field, 75);
        expect(result.kick).toBe(75);
      });

      it("should support writing negative values", () => {
        const content = {};
        const field = { key: "users_default", label: "Default user level", path: "top" as const };
        const result = writeField(content, field, -1);
        expect((result as Record<string, unknown>).users_default).toBe(-1);
      });

      it("should not mutate the original content", () => {
        const content = { kick: 50 };
        const field = { key: "kick", label: "Kick users", path: "top" as const };
        writeField(content, field, 75);
        expect(content.kick).toBe(50);
      });
    });

    describe("given an events field", () => {
      it("should write into the events sub-object", () => {
        const content = {};
        const field = { key: "m.room.name", label: "Room name", path: "events" as const };
        const result = writeField(content, field, 60);
        expect(result.events?.["m.room.name"]).toBe(60);
      });

      it("should preserve existing events keys", () => {
        const content = { events: { "m.room.topic": 30 } };
        const field = { key: "m.room.name", label: "Room name", path: "events" as const };
        const result = writeField(content, field, 60);
        expect(result.events?.["m.room.topic"]).toBe(30);
        expect(result.events?.["m.room.name"]).toBe(60);
      });
    });

    describe("given a notifications field", () => {
      it("should write into the notifications sub-object", () => {
        const content = {};
        const field = { key: "room", label: "@room notification", path: "notifications" as const };
        const result = writeField(content, field, 10);
        expect(result.notifications?.room).toBe(10);
      });
    });
  });
});
