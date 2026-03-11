import { describe, it, expect } from "vitest";
import {
  buildExportManifest,
  validateDeletionRequest,
  createDeletionRequest,
  estimateDeletionScope,
} from "./data-portability.js";
import type { DeletionRequest } from "./data-portability.js";

describe("Data Portability", () => {
  // ── buildExportManifest ──────────────────────────────────────────

  describe("buildExportManifest", () => {
    describe("given default options", () => {
      it("then it should include all four sections", () => {
        const manifest = buildExportManifest("user-1", {});

        expect(manifest.sections).toHaveLength(4);
        const types = manifest.sections.map((s) => s.type);
        expect(types).toContain("messages");
        expect(types).toContain("agent_memory");
        expect(types).toContain("preferences");
        expect(types).toContain("entities");
      });

      it("then it should set version to 1.0", () => {
        const manifest = buildExportManifest("user-1", {});
        expect(manifest.version).toBe("1.0");
      });

      it("then it should set the userId", () => {
        const manifest = buildExportManifest("user-1", {});
        expect(manifest.userId).toBe("user-1");
      });

      it("then it should include an ISO exportedAt timestamp", () => {
        const manifest = buildExportManifest("user-1", {});
        expect(manifest.exportedAt).toBeDefined();
        expect(new Date(manifest.exportedAt).toISOString()).toBe(manifest.exportedAt);
      });
    });

    describe("given specific options to exclude sections", () => {
      it("then it should respect includeMessages: false", () => {
        const manifest = buildExportManifest("user-1", { includeMessages: false });

        const types = manifest.sections.map((s) => s.type);
        expect(types).not.toContain("messages");
        expect(types).toContain("agent_memory");
      });

      it("then it should respect includeAgentMemory: false", () => {
        const manifest = buildExportManifest("user-1", { includeAgentMemory: false });

        const types = manifest.sections.map((s) => s.type);
        expect(types).not.toContain("agent_memory");
        expect(types).toContain("messages");
      });

      it("then it should respect includePreferences: false and includeEntities: false", () => {
        const manifest = buildExportManifest("user-1", {
          includePreferences: false,
          includeEntities: false,
        });

        const types = manifest.sections.map((s) => s.type);
        expect(types).not.toContain("preferences");
        expect(types).not.toContain("entities");
        expect(types).toContain("messages");
        expect(types).toContain("agent_memory");
      });
    });

    describe("given spaces filter is provided", () => {
      it("then the manifest options should contain the spaces", () => {
        const manifest = buildExportManifest("user-1", { spaces: ["space-1", "space-2"] });

        expect(manifest.options.spaces).toEqual(["space-1", "space-2"]);
      });
    });
  });

  // ── validateDeletionRequest ──────────────────────────────────────

  describe("validateDeletionRequest", () => {
    describe("given a valid account deletion request", () => {
      it("then it should return valid: true with no errors", () => {
        const request: DeletionRequest = {
          userId: "user-1",
          scope: "account",
          requestedAt: new Date().toISOString(),
        };

        const result = validateDeletionRequest(request);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe("given a valid space deletion request", () => {
      it("then it should return valid: true when spaceId is provided", () => {
        const request: DeletionRequest = {
          userId: "user-1",
          scope: "space",
          spaceId: "space-1",
          requestedAt: new Date().toISOString(),
        };

        const result = validateDeletionRequest(request);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe("given a space deletion request without spaceId", () => {
      it("then it should return valid: false with an error about spaceId", () => {
        const request: DeletionRequest = {
          userId: "user-1",
          scope: "space",
          requestedAt: new Date().toISOString(),
        };

        const result = validateDeletionRequest(request);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain("spaceId is required for space-scoped deletion");
      });
    });

    describe("given an agent_memory deletion request without agentId", () => {
      it("then it should return valid: false with an error about agentId", () => {
        const request: DeletionRequest = {
          userId: "user-1",
          scope: "agent_memory",
          requestedAt: new Date().toISOString(),
        };

        const result = validateDeletionRequest(request);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain("agentId is required for agent_memory-scoped deletion");
      });
    });

    describe("given a valid agent_memory deletion request", () => {
      it("then it should return valid: true when agentId is provided", () => {
        const request: DeletionRequest = {
          userId: "user-1",
          scope: "agent_memory",
          agentId: "agent-a",
          requestedAt: new Date().toISOString(),
        };

        const result = validateDeletionRequest(request);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  // ── createDeletionRequest ────────────────────────────────────────

  describe("createDeletionRequest", () => {
    describe("given an account-scoped request is created", () => {
      it("then it should set correct fields and include a timestamp", () => {
        const before = new Date().toISOString();
        const request = createDeletionRequest("user-1", "account", { reason: "GDPR" });
        const after = new Date().toISOString();

        expect(request.userId).toBe("user-1");
        expect(request.scope).toBe("account");
        expect(request.reason).toBe("GDPR");
        expect(request.requestedAt).toBeDefined();
        expect(request.requestedAt >= before).toBe(true);
        expect(request.requestedAt <= after).toBe(true);
      });
    });

    describe("given a space-scoped request is created", () => {
      it("then it should include the spaceId", () => {
        const request = createDeletionRequest("user-1", "space", { spaceId: "space-1" });

        expect(request.scope).toBe("space");
        expect(request.spaceId).toBe("space-1");
      });
    });

    describe("given an agent_memory-scoped request is created", () => {
      it("then it should include the agentId", () => {
        const request = createDeletionRequest("user-1", "agent_memory", { agentId: "agent-a" });

        expect(request.scope).toBe("agent_memory");
        expect(request.agentId).toBe("agent-a");
      });
    });
  });

  // ── estimateDeletionScope ────────────────────────────────────────

  describe("estimateDeletionScope", () => {
    describe("given an account-scoped deletion", () => {
      it("then it should list all sections", () => {
        const request = createDeletionRequest("user-1", "account");
        const scope = estimateDeletionScope(request);

        expect(scope.sections).toEqual(["messages", "agent_memory", "preferences", "entities"]);
        expect(scope.description).toContain("user-1");
        expect(scope.description).toContain("all spaces");
      });
    });

    describe("given a space-scoped deletion", () => {
      it("then it should list space-specific sections", () => {
        const request = createDeletionRequest("user-1", "space", { spaceId: "space-1" });
        const scope = estimateDeletionScope(request);

        expect(scope.sections).toEqual(["messages", "agent_memory", "preferences", "entities"]);
        expect(scope.description).toContain("space-1");
      });
    });

    describe("given an agent_memory-scoped deletion", () => {
      it("then it should only list agent_memory", () => {
        const request = createDeletionRequest("user-1", "agent_memory", { agentId: "agent-a" });
        const scope = estimateDeletionScope(request);

        expect(scope.sections).toEqual(["agent_memory"]);
        expect(scope.description).toContain("agent-a");
      });
    });
  });
});
