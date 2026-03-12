import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  discoverSSOProviders,
  extractSSOProviders,
  buildSSORedirectUrl,
  completeSSOLogin,
  discoverOIDC,
  hasPasswordLogin,
  requestPasswordResetEmail,
  resetPassword,
  generateClientSecret,
  type LoginFlowsResponse,
} from "./sso-utils";

// Stub global fetch for all tests
const mockFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("SSO Utilities", () => {
  describe("discoverSSOProviders", () => {
    describe("given a homeserver with SSO identity providers", () => {
      it("should return the list of providers", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            flows: [
              {
                type: "m.login.sso",
                identity_providers: [
                  { id: "google", name: "Google", brand: "google" },
                  { id: "github", name: "GitHub", icon: "https://example.com/gh.png" },
                ],
              },
              { type: "m.login.password" },
            ],
          }),
        });

        const providers = await discoverSSOProviders("https://matrix.example.com");

        expect(providers).toHaveLength(2);
        expect(providers[0]).toEqual({
          id: "google",
          name: "Google",
          icon: undefined,
          brand: "google",
        });
        expect(providers[1]).toEqual({
          id: "github",
          name: "GitHub",
          icon: "https://example.com/gh.png",
          brand: undefined,
        });
      });
    });

    describe("given a homeserver with a generic SSO flow (no identity_providers)", () => {
      it("should return a single generic SSO provider", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            flows: [{ type: "m.login.sso" }],
          }),
        });

        const providers = await discoverSSOProviders("https://matrix.example.com");

        expect(providers).toHaveLength(1);
        expect(providers[0]).toEqual({ id: "__sso__", name: "SSO" });
      });
    });

    describe("given a homeserver with a CAS flow", () => {
      it("should return a generic CAS provider", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            flows: [{ type: "m.login.cas" }],
          }),
        });

        const providers = await discoverSSOProviders("https://matrix.example.com");

        expect(providers).toHaveLength(1);
        expect(providers[0]).toEqual({ id: "__cas__", name: "CAS" });
      });
    });

    describe("given a homeserver with no SSO flows", () => {
      it("should return an empty array", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            flows: [{ type: "m.login.password" }],
          }),
        });

        const providers = await discoverSSOProviders("https://matrix.example.com");

        expect(providers).toEqual([]);
      });
    });

    describe("given a homeserver that returns an error", () => {
      it("should return an empty array", async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

        const providers = await discoverSSOProviders("https://matrix.example.com");

        expect(providers).toEqual([]);
      });
    });

    describe("given a homeserver URL with trailing slashes", () => {
      it("should strip trailing slashes before fetching", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ flows: [] }),
        });

        await discoverSSOProviders("https://matrix.example.com///");

        expect(mockFetch).toHaveBeenCalledWith(
          "https://matrix.example.com/_matrix/client/v3/login",
        );
      });
    });
  });

  describe("extractSSOProviders", () => {
    describe("given flows with both SSO and CAS entries", () => {
      it("should extract providers from all SSO-type flows", () => {
        const data: LoginFlowsResponse = {
          flows: [
            {
              type: "m.login.sso",
              identity_providers: [{ id: "oidc", name: "OIDC Provider" }],
            },
            { type: "m.login.cas" },
            { type: "m.login.password" },
          ],
        };

        const providers = extractSSOProviders(data);

        expect(providers).toHaveLength(2);
        expect(providers[0].id).toBe("oidc");
        expect(providers[1].id).toBe("__cas__");
      });
    });
  });

  describe("buildSSORedirectUrl", () => {
    describe("given a specific provider ID", () => {
      it("should construct a redirect URL with the provider in the path", () => {
        const url = buildSSORedirectUrl(
          "https://matrix.example.com",
          "google",
          "https://app.example.com/sso-callback",
        );

        expect(url).toBe(
          "https://matrix.example.com/_matrix/client/v3/login/sso/redirect/google?redirectUrl=https%3A%2F%2Fapp.example.com%2Fsso-callback",
        );
      });
    });

    describe("given the generic __sso__ provider ID", () => {
      it("should construct a redirect URL without a provider path segment", () => {
        const url = buildSSORedirectUrl(
          "https://matrix.example.com",
          "__sso__",
          "https://app.example.com/sso-callback",
        );

        expect(url).toBe(
          "https://matrix.example.com/_matrix/client/v3/login/sso/redirect?redirectUrl=https%3A%2F%2Fapp.example.com%2Fsso-callback",
        );
      });
    });

    describe("given the generic __cas__ provider ID", () => {
      it("should construct a redirect URL without a provider path segment", () => {
        const url = buildSSORedirectUrl(
          "https://matrix.example.com",
          "__cas__",
          "https://app.example.com/callback",
        );

        expect(url).toBe(
          "https://matrix.example.com/_matrix/client/v3/login/sso/redirect?redirectUrl=https%3A%2F%2Fapp.example.com%2Fcallback",
        );
      });
    });

    describe("given a homeserver URL with trailing slashes", () => {
      it("should strip trailing slashes", () => {
        const url = buildSSORedirectUrl(
          "https://matrix.example.com/",
          "github",
          "https://app.example.com/cb",
        );

        expect(url).toContain("https://matrix.example.com/_matrix/");
        expect(url).not.toContain("https://matrix.example.com//_matrix/");
      });
    });
  });

  describe("completeSSOLogin", () => {
    describe("given a valid login token", () => {
      it("should POST the token and return userId and accessToken", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            user_id: "@alice:example.com",
            access_token: "syt_abc123",
          }),
        });

        const result = await completeSSOLogin("https://matrix.example.com", "mytoken123");

        expect(result).toEqual({
          userId: "@alice:example.com",
          accessToken: "syt_abc123",
        });

        expect(mockFetch).toHaveBeenCalledWith(
          "https://matrix.example.com/_matrix/client/v3/login",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "m.login.token",
              token: "mytoken123",
            }),
          },
        );
      });
    });

    describe("given an invalid login token", () => {
      it("should throw an error with the server message", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 403,
          json: async () => ({ error: "Invalid token" }),
        });

        await expect(completeSSOLogin("https://matrix.example.com", "badtoken")).rejects.toThrow(
          "Invalid token",
        );
      });
    });

    describe("given a server error with no JSON body", () => {
      it("should throw a generic error with the status code", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => {
            throw new Error("not json");
          },
        });

        await expect(completeSSOLogin("https://matrix.example.com", "tok")).rejects.toThrow(
          "SSO login failed (500)",
        );
      });
    });
  });

  describe("discoverOIDC", () => {
    describe("given a well-known response with OIDC authentication", () => {
      it("should return the issuer and account URL", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            "m.homeserver": { base_url: "https://matrix.example.com" },
            "org.matrix.msc2965.authentication": {
              issuer: "https://auth.example.com/",
              account: "https://auth.example.com/account",
            },
          }),
        });

        const result = await discoverOIDC("https://example.com");

        expect(result).toEqual({
          issuer: "https://auth.example.com/",
          account: "https://auth.example.com/account",
        });
      });
    });

    describe("given a well-known response without OIDC", () => {
      it("should return null", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            "m.homeserver": { base_url: "https://matrix.example.com" },
          }),
        });

        const result = await discoverOIDC("https://example.com");

        expect(result).toBeNull();
      });
    });

    describe("given a network error", () => {
      it("should return null", async () => {
        mockFetch.mockRejectedValueOnce(new Error("Network error"));

        const result = await discoverOIDC("https://example.com");

        expect(result).toBeNull();
      });
    });
  });

  describe("hasPasswordLogin", () => {
    describe("given flows that include m.login.password", () => {
      it("should return true", () => {
        const data: LoginFlowsResponse = {
          flows: [{ type: "m.login.password" }, { type: "m.login.sso" }],
        };

        expect(hasPasswordLogin(data)).toBe(true);
      });
    });

    describe("given flows without m.login.password", () => {
      it("should return false", () => {
        const data: LoginFlowsResponse = {
          flows: [{ type: "m.login.sso" }],
        };

        expect(hasPasswordLogin(data)).toBe(false);
      });
    });
  });

  describe("requestPasswordResetEmail", () => {
    describe("given valid email and homeserver", () => {
      it("should POST the reset request and return the session ID", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ sid: "session123" }),
        });

        const result = await requestPasswordResetEmail(
          "https://matrix.example.com",
          "alice@example.com",
          "secret_abc",
          1,
        );

        expect(result).toEqual({ sid: "session123" });
        expect(mockFetch).toHaveBeenCalledWith(
          "https://matrix.example.com/_matrix/client/v3/account/password/email/requestToken",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: "alice@example.com",
              client_secret: "secret_abc",
              send_attempt: 1,
            }),
          },
        );
      });
    });

    describe("given a server error", () => {
      it("should throw with the server error message", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({ error: "Email not found" }),
        });

        await expect(
          requestPasswordResetEmail("https://matrix.example.com", "bad@example.com", "secret", 1),
        ).rejects.toThrow("Email not found");
      });
    });
  });

  describe("resetPassword", () => {
    describe("given valid credentials", () => {
      it("should POST the new password with email identity auth", async () => {
        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

        await resetPassword("https://matrix.example.com", "newpass123", "session456", "secret_def");

        expect(mockFetch).toHaveBeenCalledWith(
          "https://matrix.example.com/_matrix/client/v3/account/password",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              new_password: "newpass123",
              auth: {
                type: "m.login.email.identity",
                threepid_creds: {
                  sid: "session456",
                  client_secret: "secret_def",
                },
                threepidCreds: {
                  sid: "session456",
                  client_secret: "secret_def",
                },
              },
            }),
          },
        );
      });
    });

    describe("given a server rejection", () => {
      it("should throw with the server error message", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: "Email not yet validated" }),
        });

        await expect(resetPassword("https://matrix.example.com", "pass", "s", "c")).rejects.toThrow(
          "Email not yet validated",
        );
      });
    });
  });

  describe("generateClientSecret", () => {
    describe("when called", () => {
      it("should return a 32-character hex string", () => {
        // Stub crypto.getRandomValues for deterministic output
        const originalGetRandomValues = crypto.getRandomValues;
        const mockGetRandomValues = vi.fn((arr: Uint8Array) => {
          for (let i = 0; i < arr.length; i++) {
            arr[i] = i;
          }
          return arr;
        });
        vi.stubGlobal("crypto", {
          ...crypto,
          getRandomValues: mockGetRandomValues,
        });

        const secret = generateClientSecret();

        expect(secret).toHaveLength(32);
        expect(secret).toMatch(/^[0-9a-f]{32}$/);
        expect(secret).toBe("000102030405060708090a0b0c0d0e0f");

        vi.stubGlobal("crypto", {
          ...crypto,
          getRandomValues: originalGetRandomValues,
        });
      });
    });
  });
});
