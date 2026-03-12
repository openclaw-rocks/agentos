import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  registerAccount,
  hasDummyFlow,
  hasRecaptchaFlow,
  describeRegistrationError,
  type UIAAResponse,
} from "./registration";

// Stub global fetch for all tests
const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("Registration", () => {
  describe("registerAccount", () => {
    describe("given valid credentials and a server that accepts m.login.dummy", () => {
      it("should return a registration result", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            user_id: "@alice:example.com",
            access_token: "syt_abc123",
            device_id: "DEVICE_01",
          }),
        });

        const result = await registerAccount(
          "https://matrix.example.com",
          "alice",
          "strongpassword123",
        );

        expect(result).toEqual({
          userId: "@alice:example.com",
          accessToken: "syt_abc123",
          deviceId: "DEVICE_01",
          homeserver: "https://matrix.example.com",
        });

        expect(mockFetch).toHaveBeenCalledWith(
          "https://matrix.example.com/_matrix/client/v3/register",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: "alice",
              password: "strongpassword123",
              initial_device_display_name: "AgentOS",
              auth: { type: "m.login.dummy" },
            }),
          },
        );
      });
    });

    describe("given a 401 UIAA response with dummy flow", () => {
      it("should complete auth by retrying with the session", async () => {
        // First call: server returns 401 with UIAA challenge
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({
            flows: [{ stages: ["m.login.dummy"] }],
            session: "session_xyz",
          }),
        });

        // Second call: retry succeeds
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            user_id: "@bob:example.com",
            access_token: "syt_def456",
            device_id: "DEVICE_02",
          }),
        });

        const result = await registerAccount("https://matrix.example.com", "bob", "p@ssw0rd!");

        expect(result).toEqual({
          userId: "@bob:example.com",
          accessToken: "syt_def456",
          deviceId: "DEVICE_02",
          homeserver: "https://matrix.example.com",
        });

        // Verify the retry included the session
        expect(mockFetch).toHaveBeenCalledTimes(2);
        const retryBody = JSON.parse(
          (mockFetch.mock.calls[1] as [string, RequestInit])[1].body as string,
        );
        expect(retryBody.auth).toEqual({
          type: "m.login.dummy",
          session: "session_xyz",
        });
      });
    });

    describe("given username already taken (M_USER_IN_USE)", () => {
      it("should throw a descriptive error", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({
            errcode: "M_USER_IN_USE",
            error: "User ID already taken.",
          }),
        });

        await expect(
          registerAccount("https://matrix.example.com", "taken", "password123"),
        ).rejects.toThrow("That username is already taken");
      });
    });

    describe("given password too weak (M_WEAK_PASSWORD)", () => {
      it("should throw a descriptive error", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({
            errcode: "M_WEAK_PASSWORD",
            error: "Password must be at least 8 characters and contain a number.",
          }),
        });

        await expect(registerAccount("https://matrix.example.com", "user", "123")).rejects.toThrow(
          "Password must be at least 8 characters and contain a number.",
        );
      });
    });

    describe("given a server requiring recaptcha", () => {
      it("should throw an unsupported captcha error", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({
            flows: [{ stages: ["m.login.recaptcha"] }],
            session: "session_cap",
            params: {
              "m.login.recaptcha": {
                public_key: "6Lc...",
              },
            },
          }),
        });

        await expect(
          registerAccount("https://matrix.example.com", "user", "pass1234"),
        ).rejects.toThrow("CAPTCHA verification");
      });
    });

    describe("given a server with an unknown UIAA flow", () => {
      it("should throw with the stage names", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({
            flows: [{ stages: ["m.login.terms", "m.login.email.identity"] }],
            session: "session_unk",
          }),
        });

        await expect(
          registerAccount("https://matrix.example.com", "user", "pass1234"),
        ).rejects.toThrow("m.login.terms + m.login.email.identity");
      });
    });

    describe("given a homeserver URL with trailing slashes", () => {
      it("should strip trailing slashes before the request", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            user_id: "@test:example.com",
            access_token: "tok",
            device_id: "DEV",
          }),
        });

        await registerAccount("https://matrix.example.com///", "test", "pass1234");

        expect(mockFetch).toHaveBeenCalledWith(
          "https://matrix.example.com/_matrix/client/v3/register",
          expect.anything(),
        );
      });
    });
  });

  describe("hasDummyFlow", () => {
    describe("given a UIAA response with a single-stage dummy flow", () => {
      it("should return true", () => {
        const uiaa: UIAAResponse = {
          flows: [{ stages: ["m.login.dummy"] }],
          session: "s1",
        };

        expect(hasDummyFlow(uiaa)).toBe(true);
      });
    });

    describe("given a UIAA response without a dummy flow", () => {
      it("should return false", () => {
        const uiaa: UIAAResponse = {
          flows: [{ stages: ["m.login.recaptcha"] }],
          session: "s2",
        };

        expect(hasDummyFlow(uiaa)).toBe(false);
      });
    });

    describe("given a UIAA response where dummy is part of a multi-stage flow", () => {
      it("should return false", () => {
        const uiaa: UIAAResponse = {
          flows: [{ stages: ["m.login.dummy", "m.login.email.identity"] }],
          session: "s3",
        };

        expect(hasDummyFlow(uiaa)).toBe(false);
      });
    });
  });

  describe("hasRecaptchaFlow", () => {
    describe("given a UIAA response with recaptcha in a flow", () => {
      it("should return true", () => {
        const uiaa: UIAAResponse = {
          flows: [{ stages: ["m.login.recaptcha"] }],
        };

        expect(hasRecaptchaFlow(uiaa)).toBe(true);
      });
    });

    describe("given a UIAA response without recaptcha", () => {
      it("should return false", () => {
        const uiaa: UIAAResponse = {
          flows: [{ stages: ["m.login.dummy"] }],
        };

        expect(hasRecaptchaFlow(uiaa)).toBe(false);
      });
    });
  });

  describe("describeRegistrationError", () => {
    describe("given M_USER_IN_USE", () => {
      it("should return a user-friendly message", () => {
        const msg = describeRegistrationError("M_USER_IN_USE", "User ID already taken.");
        expect(msg).toContain("already taken");
      });
    });

    describe("given M_INVALID_USERNAME", () => {
      it("should return a user-friendly message", () => {
        const msg = describeRegistrationError("M_INVALID_USERNAME", "");
        expect(msg).toContain("invalid");
      });
    });

    describe("given M_WEAK_PASSWORD with server message", () => {
      it("should return the server message", () => {
        const msg = describeRegistrationError(
          "M_WEAK_PASSWORD",
          "Password needs uppercase letter.",
        );
        expect(msg).toBe("Password needs uppercase letter.");
      });
    });

    describe("given M_WEAK_PASSWORD without server message", () => {
      it("should return a default message", () => {
        const msg = describeRegistrationError("M_WEAK_PASSWORD", "");
        expect(msg).toContain("too weak");
      });
    });

    describe("given an unknown error code", () => {
      it("should return the server message or a fallback", () => {
        const msg = describeRegistrationError("M_SOMETHING_ELSE", "Custom error");
        expect(msg).toBe("Custom error");
      });
    });
  });
});
