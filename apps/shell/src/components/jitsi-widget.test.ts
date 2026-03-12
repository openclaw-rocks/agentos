import { describe, it, expect } from "vitest";
import { buildJitsiUrl } from "./JitsiWidget";

describe("buildJitsiUrl", () => {
  describe("Given a standard domain, room name, and display name", () => {
    describe("When building the Jitsi URL", () => {
      it("Then it should construct a valid URL with the correct domain", () => {
        const url = buildJitsiUrl("meet.jit.si", "my-room", "Alice");

        expect(url).toContain("https://meet.jit.si/");
      });

      it("Then it should include the room name as conference ID", () => {
        const url = buildJitsiUrl("meet.jit.si", "my-room", "Alice");

        expect(url).toContain("https://meet.jit.si/my-room");
      });

      it("Then it should start with audio muted", () => {
        const url = buildJitsiUrl("meet.jit.si", "my-room", "Alice");

        expect(url).toContain("config.startWithAudioMuted=true");
      });

      it("Then it should include the display name", () => {
        const url = buildJitsiUrl("meet.jit.si", "my-room", "Alice");

        expect(url).toContain("userInfo.displayName=Alice");
      });
    });
  });

  describe("Given a room name with special characters", () => {
    describe("When building the Jitsi URL", () => {
      it("Then it should sanitise the room name to alphanumeric and dashes", () => {
        const url = buildJitsiUrl("meet.jit.si", "My Room! @#$", "Alice");

        // Extract conference ID: between domain/ and #config
        const confId = url.split("meet.jit.si/")[1].split("#")[0];
        // Special characters replaced with dashes, consecutive dashes collapsed, trailing dashes stripped
        expect(confId).toBe("My-Room");
        // The raw URL should not contain those special characters in the conference part
        expect(confId).not.toContain("!");
        expect(confId).not.toContain("@");
        expect(confId).not.toContain("$");
      });

      it("Then it should strip leading and trailing dashes from the conference ID", () => {
        const url = buildJitsiUrl("meet.jit.si", "!room!", "Alice");

        // The conference ID part (between domain/ and #config)
        const confId = url.split("/")[3].split("#")[0];
        expect(confId).not.toMatch(/^-/);
        expect(confId).not.toMatch(/-$/);
      });
    });
  });

  describe("Given a display name with spaces", () => {
    describe("When building the Jitsi URL", () => {
      it("Then it should URL-encode the display name", () => {
        const url = buildJitsiUrl("meet.jit.si", "room", "Alice Bob");

        expect(url).toContain("userInfo.displayName=Alice%20Bob");
      });
    });
  });

  describe("Given a custom Jitsi domain", () => {
    describe("When building the URL", () => {
      it("Then it should use the custom domain", () => {
        const url = buildJitsiUrl("jitsi.example.com", "room", "Alice");

        expect(url.startsWith("https://jitsi.example.com/")).toBe(true);
      });
    });
  });

  describe("Given an empty room name", () => {
    describe("When building the URL", () => {
      it("Then it should still produce a valid URL", () => {
        const url = buildJitsiUrl("meet.jit.si", "", "Alice");

        expect(url).toContain("https://meet.jit.si/");
        expect(url).toContain("config.startWithAudioMuted=true");
      });
    });
  });
});
