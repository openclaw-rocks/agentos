export interface ExportOptions {
  includeMessages?: boolean; // default true
  includeAgentMemory?: boolean; // default true
  includePreferences?: boolean; // default true
  includeEntities?: boolean; // default true
  spaces?: string[]; // specific spaces, or all if omitted
  format?: "json"; // only JSON for now
}

export interface ExportManifest {
  version: "1.0";
  exportedAt: string; // ISO timestamp
  userId: string;
  options: ExportOptions;
  sections: ExportSection[];
  totalSize: number;
}

export interface ExportSection {
  type: "messages" | "agent_memory" | "preferences" | "entities";
  spaceId?: string;
  itemCount: number;
  sizeBytes: number;
}

export interface DeletionRequest {
  userId: string;
  scope: "account" | "space" | "agent_memory";
  spaceId?: string; // required for "space" scope
  agentId?: string; // required for "agent_memory" scope
  requestedAt: string;
  reason?: string;
}

export interface DeletionResult {
  request: DeletionRequest;
  completedAt: string;
  itemsDeleted: number;
  sectionsCleared: string[];
}

/** Build an export manifest (planning step, no actual data) */
export function buildExportManifest(userId: string, options: ExportOptions): ExportManifest {
  const resolvedOptions: ExportOptions = {
    includeMessages: options.includeMessages ?? true,
    includeAgentMemory: options.includeAgentMemory ?? true,
    includePreferences: options.includePreferences ?? true,
    includeEntities: options.includeEntities ?? true,
    format: options.format ?? "json",
    spaces: options.spaces,
  };

  const sections: ExportSection[] = [];

  if (resolvedOptions.includeMessages) {
    sections.push({ type: "messages", itemCount: 0, sizeBytes: 0 });
  }
  if (resolvedOptions.includeAgentMemory) {
    sections.push({ type: "agent_memory", itemCount: 0, sizeBytes: 0 });
  }
  if (resolvedOptions.includePreferences) {
    sections.push({ type: "preferences", itemCount: 0, sizeBytes: 0 });
  }
  if (resolvedOptions.includeEntities) {
    sections.push({ type: "entities", itemCount: 0, sizeBytes: 0 });
  }

  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    userId,
    options: resolvedOptions,
    sections,
    totalSize: 0,
  };
}

/** Validate a deletion request */
export function validateDeletionRequest(request: DeletionRequest): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!request.userId) {
    errors.push("userId is required");
  }

  if (!request.requestedAt) {
    errors.push("requestedAt is required");
  }

  if (request.scope === "space" && !request.spaceId) {
    errors.push("spaceId is required for space-scoped deletion");
  }

  if (request.scope === "agent_memory" && !request.agentId) {
    errors.push("agentId is required for agent_memory-scoped deletion");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/** Create a deletion request */
export function createDeletionRequest(
  userId: string,
  scope: "account" | "space" | "agent_memory",
  options?: { spaceId?: string; agentId?: string; reason?: string },
): DeletionRequest {
  return {
    userId,
    scope,
    spaceId: options?.spaceId,
    agentId: options?.agentId,
    requestedAt: new Date().toISOString(),
    reason: options?.reason,
  };
}

/** Estimate the scope of a deletion */
export function estimateDeletionScope(request: DeletionRequest): {
  sections: string[];
  description: string;
} {
  switch (request.scope) {
    case "account":
      return {
        sections: ["messages", "agent_memory", "preferences", "entities"],
        description: `All data for user "${request.userId}" will be permanently deleted across all spaces.`,
      };
    case "space":
      return {
        sections: ["messages", "agent_memory", "preferences", "entities"],
        description: `All data for user "${request.userId}" in space "${request.spaceId}" will be permanently deleted.`,
      };
    case "agent_memory":
      return {
        sections: ["agent_memory"],
        description: `Agent memory for agent "${request.agentId}" associated with user "${request.userId}" will be permanently deleted.`,
      };
  }
}
