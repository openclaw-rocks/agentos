import { describe, it, expect } from "vitest";
import {
  generateQrSessionId,
  buildQrLoginData,
  parseQrLoginData,
  isValidHomeserverUrl,
} from "./qr-login";

describe("QR Code Login", () => {
  // -------------------------------------------------------------------------
  // generateQrSessionId
  // -------------------------------------------------------------------------

  describe("generateQrSessionId", () => {
    describe("given a call to generate a session ID", () => {
      it("should return a string starting with 'qr-'", () => {
        const id = generateQrSessionId();
        expect(id).toMatch(/^qr-/);
      });

      it("should generate unique IDs on successive calls", () => {
        const id1 = generateQrSessionId();
        const id2 = generateQrSessionId();
        expect(id1).not.toBe(id2);
      });

      it("should return a non-empty string", () => {
        const id = generateQrSessionId();
        expect(id.length).toBeGreaterThan(3);
      });
    });
  });

  // -------------------------------------------------------------------------
  // buildQrLoginData
  // -------------------------------------------------------------------------

  describe("buildQrLoginData", () => {
    describe("given a valid homeserver URL and session ID", () => {
      it("should produce valid JSON", () => {
        const data = buildQrLoginData("https://matrix.example.com", "session-123");
        expect(() => JSON.parse(data)).not.toThrow();
      });

      it("should contain the homeserver URL", () => {
        const data = buildQrLoginData("https://matrix.example.com", "session-123");
        const parsed = JSON.parse(data);
        expect(parsed.homeserver).toBe("https://matrix.example.com");
      });

      it("should contain mode 'login_verification'", () => {
        const data = buildQrLoginData("https://matrix.example.com", "session-123");
        const parsed = JSON.parse(data);
        expect(parsed.mode).toBe("login_verification");
      });

      it("should contain the session ID", () => {
        const data = buildQrLoginData("https://matrix.example.com", "session-123");
        const parsed = JSON.parse(data);
        expect(parsed.sessionId).toBe("session-123");
      });
    });

    describe("given a homeserver URL with trailing slash", () => {
      it("should strip the trailing slash", () => {
        const data = buildQrLoginData("https://matrix.example.com/", "s1");
        const parsed = JSON.parse(data);
        expect(parsed.homeserver).toBe("https://matrix.example.com");
      });
    });

    describe("given a homeserver URL with multiple trailing slashes", () => {
      it("should strip all trailing slashes", () => {
        const data = buildQrLoginData("https://matrix.example.com///", "s1");
        const parsed = JSON.parse(data);
        expect(parsed.homeserver).toBe("https://matrix.example.com");
      });
    });
  });

  // -------------------------------------------------------------------------
  // parseQrLoginData
  // -------------------------------------------------------------------------

  describe("parseQrLoginData", () => {
    describe("given valid QR login JSON", () => {
      it("should return the parsed payload", () => {
        const json = JSON.stringify({
          homeserver: "https://matrix.org",
          mode: "login_verification",
          sessionId: "abc-123",
        });

        const result = parseQrLoginData(json);

        expect(result).not.toBeNull();
        expect(result!.homeserver).toBe("https://matrix.org");
        expect(result!.mode).toBe("login_verification");
        expect(result!.sessionId).toBe("abc-123");
      });
    });

    describe("given invalid JSON", () => {
      it("should return null", () => {
        expect(parseQrLoginData("not json")).toBeNull();
      });
    });

    describe("given JSON with wrong mode", () => {
      it("should return null", () => {
        const json = JSON.stringify({
          homeserver: "https://matrix.org",
          mode: "something_else",
          sessionId: "abc",
        });
        expect(parseQrLoginData(json)).toBeNull();
      });
    });

    describe("given JSON missing homeserver", () => {
      it("should return null", () => {
        const json = JSON.stringify({
          mode: "login_verification",
          sessionId: "abc",
        });
        expect(parseQrLoginData(json)).toBeNull();
      });
    });

    describe("given JSON missing sessionId", () => {
      it("should return null", () => {
        const json = JSON.stringify({
          homeserver: "https://matrix.org",
          mode: "login_verification",
        });
        expect(parseQrLoginData(json)).toBeNull();
      });
    });

    describe("given a non-object JSON value", () => {
      it("should return null for string", () => {
        expect(parseQrLoginData('"just a string"')).toBeNull();
      });

      it("should return null for number", () => {
        expect(parseQrLoginData("42")).toBeNull();
      });

      it("should return null for null", () => {
        expect(parseQrLoginData("null")).toBeNull();
      });
    });

    describe("given roundtrip with buildQrLoginData", () => {
      it("should parse back to the original values", () => {
        const data = buildQrLoginData("https://matrix.example.com", "test-session");
        const result = parseQrLoginData(data);

        expect(result).not.toBeNull();
        expect(result!.homeserver).toBe("https://matrix.example.com");
        expect(result!.sessionId).toBe("test-session");
      });
    });
  });

  // -------------------------------------------------------------------------
  // isValidHomeserverUrl
  // -------------------------------------------------------------------------

  describe("isValidHomeserverUrl", () => {
    describe("given a valid https URL", () => {
      it("should return true", () => {
        expect(isValidHomeserverUrl("https://matrix.org")).toBe(true);
      });
    });

    describe("given a valid http URL", () => {
      it("should return true", () => {
        expect(isValidHomeserverUrl("http://localhost:8008")).toBe(true);
      });
    });

    describe("given a domain without protocol", () => {
      it("should return true (assumes https)", () => {
        expect(isValidHomeserverUrl("matrix.org")).toBe(true);
      });
    });

    describe("given an empty string", () => {
      it("should return false", () => {
        expect(isValidHomeserverUrl("")).toBe(false);
      });
    });

    describe("given whitespace only", () => {
      it("should return false", () => {
        expect(isValidHomeserverUrl("   ")).toBe(false);
      });
    });
  });
});
