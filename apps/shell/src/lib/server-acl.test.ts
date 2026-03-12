import { describe, it, expect } from "vitest";
import {
  parseServerAcl,
  parseServerList,
  serializeServerList,
  validateServerPattern,
  validateServerAcl,
  buildServerAclContent,
  DEFAULT_SERVER_ACL,
} from "./server-acl";
import type { ServerAclContent } from "./server-acl";

describe("Server ACL", () => {
  // -------------------------------------------------------------------------
  // parseServerAcl
  // -------------------------------------------------------------------------

  describe("parseServerAcl", () => {
    describe("given undefined content", () => {
      it("should return default ACL", () => {
        const result = parseServerAcl(undefined);
        expect(result).toEqual(DEFAULT_SERVER_ACL);
      });
    });

    describe("given a valid m.room.server_acl event content", () => {
      it("should parse allow, deny, and allow_ip_literals", () => {
        const content = {
          allow: ["*"],
          deny: ["evil.example.com"],
          allow_ip_literals: false,
        };

        const result = parseServerAcl(content);

        expect(result.allow).toEqual(["*"]);
        expect(result.deny).toEqual(["evil.example.com"]);
        expect(result.allow_ip_literals).toBe(false);
      });
    });

    describe("given content with missing allow field", () => {
      it("should default allow to ['*']", () => {
        const result = parseServerAcl({ deny: ["bad.com"] });
        expect(result.allow).toEqual(["*"]);
      });
    });

    describe("given content with missing deny field", () => {
      it("should default deny to empty array", () => {
        const result = parseServerAcl({ allow: ["*"] });
        expect(result.deny).toEqual([]);
      });
    });

    describe("given content with missing allow_ip_literals", () => {
      it("should default to true", () => {
        const result = parseServerAcl({ allow: ["*"] });
        expect(result.allow_ip_literals).toBe(true);
      });
    });

    describe("given content with non-string values in allow array", () => {
      it("should filter out non-string values", () => {
        const content = { allow: ["*", 42, null, "example.com", undefined] };
        const result = parseServerAcl(content);
        expect(result.allow).toEqual(["*", "example.com"]);
      });
    });

    describe("given an empty content object", () => {
      it("should return defaults", () => {
        const result = parseServerAcl({});
        expect(result.allow).toEqual(["*"]);
        expect(result.deny).toEqual([]);
        expect(result.allow_ip_literals).toBe(true);
      });
    });
  });

  // -------------------------------------------------------------------------
  // parseServerList
  // -------------------------------------------------------------------------

  describe("parseServerList", () => {
    describe("given a multi-line string", () => {
      it("should split into an array of trimmed server patterns", () => {
        const text = "*.example.com\nevil.org\n  bad.net  ";
        const result = parseServerList(text);
        expect(result).toEqual(["*.example.com", "evil.org", "bad.net"]);
      });
    });

    describe("given a string with empty lines", () => {
      it("should skip empty lines", () => {
        const text = "example.com\n\n\nanother.com\n";
        const result = parseServerList(text);
        expect(result).toEqual(["example.com", "another.com"]);
      });
    });

    describe("given an empty string", () => {
      it("should return an empty array", () => {
        const result = parseServerList("");
        expect(result).toEqual([]);
      });
    });

    describe("given a single entry", () => {
      it("should return a single-element array", () => {
        const result = parseServerList("matrix.org");
        expect(result).toEqual(["matrix.org"]);
      });
    });
  });

  // -------------------------------------------------------------------------
  // serializeServerList
  // -------------------------------------------------------------------------

  describe("serializeServerList", () => {
    describe("given an array of server patterns", () => {
      it("should join with newlines", () => {
        const result = serializeServerList(["example.com", "another.org"]);
        expect(result).toBe("example.com\nanother.org");
      });
    });

    describe("given an empty array", () => {
      it("should return an empty string", () => {
        const result = serializeServerList([]);
        expect(result).toBe("");
      });
    });
  });

  // -------------------------------------------------------------------------
  // validateServerPattern
  // -------------------------------------------------------------------------

  describe("validateServerPattern", () => {
    describe("given a valid wildcard pattern", () => {
      it("should accept '*'", () => {
        expect(validateServerPattern("*").valid).toBe(true);
      });

      it("should accept '*.example.com'", () => {
        expect(validateServerPattern("*.example.com").valid).toBe(true);
      });
    });

    describe("given a valid exact server name", () => {
      it("should accept 'matrix.example.com'", () => {
        expect(validateServerPattern("matrix.example.com").valid).toBe(true);
      });

      it("should accept server name with port", () => {
        expect(validateServerPattern("matrix.example.com:8448").valid).toBe(true);
      });
    });

    describe("given an empty string", () => {
      it("should return invalid with error", () => {
        const result = validateServerPattern("");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("empty");
      });
    });

    describe("given a pattern with spaces", () => {
      it("should return invalid", () => {
        const result = validateServerPattern("bad server.com");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("whitespace");
      });
    });

    describe("given a pattern with protocol", () => {
      it("should return invalid for https://", () => {
        const result = validateServerPattern("https://example.com");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("protocol");
      });
    });

    describe("given a pattern with invalid characters", () => {
      it("should return invalid for patterns with slashes", () => {
        const result = validateServerPattern("example.com/path");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("invalid characters");
      });
    });
  });

  // -------------------------------------------------------------------------
  // validateServerAcl
  // -------------------------------------------------------------------------

  describe("validateServerAcl", () => {
    describe("given a valid ACL", () => {
      it("should return valid with no errors", () => {
        const acl: ServerAclContent = {
          allow: ["*"],
          deny: ["evil.com"],
          allow_ip_literals: true,
        };

        const result = validateServerAcl(acl);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      });
    });

    describe("given an ACL with invalid allow patterns", () => {
      it("should return errors for the invalid patterns", () => {
        const acl: ServerAclContent = {
          allow: ["*", "https://bad.com"],
          deny: [],
          allow_ip_literals: true,
        };

        const result = validateServerAcl(acl);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain("Allow list");
      });
    });

    describe("given an ACL with invalid deny patterns", () => {
      it("should return errors for the invalid patterns", () => {
        const acl: ServerAclContent = {
          allow: ["*"],
          deny: ["bad server"],
          allow_ip_literals: true,
        };

        const result = validateServerAcl(acl);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain("Deny list");
      });
    });

    describe("given an ACL with empty allow list", () => {
      it("should return an error warning that all servers will be denied", () => {
        const acl: ServerAclContent = {
          allow: [],
          deny: [],
          allow_ip_literals: true,
        };

        const result = validateServerAcl(acl);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain("Allow list is empty — this will deny all servers");
      });
    });

    describe("given a fully valid complex ACL", () => {
      it("should accept multiple patterns in both lists", () => {
        const acl: ServerAclContent = {
          allow: ["*.matrix.org", "example.com", "test.net:8448"],
          deny: ["evil.com", "*.bad.org"],
          allow_ip_literals: false,
        };

        const result = validateServerAcl(acl);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      });
    });
  });

  // -------------------------------------------------------------------------
  // buildServerAclContent
  // -------------------------------------------------------------------------

  describe("buildServerAclContent", () => {
    describe("given a valid ACL object", () => {
      it("should produce the event content with correct keys", () => {
        const acl: ServerAclContent = {
          allow: ["*"],
          deny: ["evil.com"],
          allow_ip_literals: false,
        };

        const content = buildServerAclContent(acl);

        expect(content.allow).toEqual(["*"]);
        expect(content.deny).toEqual(["evil.com"]);
        expect(content.allow_ip_literals).toBe(false);
      });
    });
  });
});
