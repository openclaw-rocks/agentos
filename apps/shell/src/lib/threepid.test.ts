import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getThreePids,
  addEmail,
  addPhone,
  submitEmailToken,
  removeThreePid,
  generateThreePidSecret,
} from "./threepid";

// Stub global fetch and crypto
const mockFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

function createMockClient(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    getThreePids: vi.fn(),
    getHomeserverUrl: () => "https://matrix.example.com",
    getAccessToken: () => "test_access_token",
    deleteThreePid: vi.fn(),
    ...overrides,
  };
}

describe("3PID Management", () => {
  describe("generateThreePidSecret", () => {
    describe("given a call to generate a client secret", () => {
      it("should return a 64-character hex string", () => {
        const secret = generateThreePidSecret();
        expect(secret).toHaveLength(64);
        expect(/^[0-9a-f]+$/.test(secret)).toBe(true);
      });
    });
  });

  describe("getThreePids", () => {
    describe("given a client with associated 3PIDs", () => {
      it("should return the list of 3PIDs", async () => {
        const client = createMockClient({
          getThreePids: vi.fn().mockResolvedValue({
            threepids: [
              {
                medium: "email",
                address: "user@example.com",
                validated_at: 1000,
                added_at: 900,
              },
              {
                medium: "msisdn",
                address: "15551234567",
                validated_at: 2000,
                added_at: 1900,
              },
            ],
          }),
        });

        const result = await getThreePids(client as any);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          medium: "email",
          address: "user@example.com",
          validated_at: 1000,
          added_at: 900,
        });
        expect(result[1]).toEqual({
          medium: "msisdn",
          address: "15551234567",
          validated_at: 2000,
          added_at: 1900,
        });
      });
    });

    describe("given a client with no 3PIDs", () => {
      it("should return an empty array", async () => {
        const client = createMockClient({
          getThreePids: vi.fn().mockResolvedValue({ threepids: [] }),
        });

        const result = await getThreePids(client as any);
        expect(result).toEqual([]);
      });
    });
  });

  describe("addEmail", () => {
    describe("given an email to add", () => {
      it("should request a verification token and return sid", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ sid: "session_123" }),
        });

        const client = createMockClient();

        const result = await addEmail(client as any, "new@example.com");

        expect(result.sid).toBe("session_123");
        expect(result.clientSecret).toBeTruthy();
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain("/account/3pid/email/requestToken");
        expect(opts.method).toBe("POST");
        const body = JSON.parse(opts.body);
        expect(body.email).toBe("new@example.com");
      });
    });

    describe("given a server error", () => {
      it("should throw with the error message", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: "Email already in use" }),
        });

        const client = createMockClient();
        await expect(addEmail(client as any, "taken@example.com")).rejects.toThrow(
          "Email already in use",
        );
      });
    });
  });

  describe("addPhone", () => {
    describe("given a phone number and country code to add", () => {
      it("should request a verification token and return sid", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ sid: "phone_session_456" }),
        });

        const client = createMockClient();

        const result = await addPhone(client as any, "5551234567", "US");

        expect(result.sid).toBe("phone_session_456");
        expect(result.clientSecret).toBeTruthy();
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.phone_number).toBe("5551234567");
        expect(body.country).toBe("US");
      });
    });
  });

  describe("submitEmailToken", () => {
    describe("given valid sid and client secret", () => {
      it("should add the 3PID to the account", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

        const client = createMockClient();

        await submitEmailToken(client as any, "sid_123", "secret_abc");

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain("/account/3pid/add");
        const body = JSON.parse(opts.body);
        expect(body.sid).toBe("sid_123");
        expect(body.client_secret).toBe("secret_abc");
      });
    });

    describe("given a failed request", () => {
      it("should throw an error", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: "Token not validated" }),
        });

        const client = createMockClient();
        await expect(submitEmailToken(client as any, "bad_sid", "secret")).rejects.toThrow(
          "Token not validated",
        );
      });
    });
  });

  describe("removeThreePid", () => {
    describe("given a 3PID to remove", () => {
      it("should call deleteThreePid on the client", async () => {
        const deleteFn = vi.fn().mockResolvedValue({});
        const client = createMockClient({ deleteThreePid: deleteFn });

        await removeThreePid(client as any, "email", "user@example.com");

        expect(deleteFn).toHaveBeenCalledWith("email", "user@example.com");
      });
    });
  });
});
