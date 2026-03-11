export type PermissionScope =
  | "read_messages"
  | "send_messages"
  | "read_state"
  | "write_state"
  | "cross_space_read"
  | "proactive"
  | "camera_access"
  | "voice_access"
  | "file_access";

export interface AgentPermissions {
  agentId: string;
  spaceId: string;
  granted: PermissionScope[];
  denied: PermissionScope[];
  consentedAt?: number;
  consentedBy?: string;
}

/** Default permissions for each agent role */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionScope[]> = {
  primary: ["read_messages", "send_messages", "read_state", "write_state"],
  specialist: ["read_messages", "send_messages", "read_state"],
  background: ["read_state", "proactive"],
};

/** Compose a map key from agentId and spaceId */
function permKey(agentId: string, spaceId: string): string {
  return `${agentId}:${spaceId}`;
}

export class PermissionManager {
  private permissions = new Map<string, AgentPermissions>();

  /** Set permissions for an agent in a space */
  setPermissions(agentId: string, spaceId: string, granted: PermissionScope[]): void {
    const key = permKey(agentId, spaceId);
    const existing = this.permissions.get(key);
    this.permissions.set(key, {
      agentId,
      spaceId,
      granted: [...granted],
      denied: existing?.denied ?? [],
      consentedAt: existing?.consentedAt,
      consentedBy: existing?.consentedBy,
    });
  }

  /** Check if an agent has a specific permission */
  hasPermission(agentId: string, spaceId: string, scope: PermissionScope): boolean {
    const entry = this.permissions.get(permKey(agentId, spaceId));
    if (!entry) return false;
    if (entry.denied.includes(scope)) return false;
    return entry.granted.includes(scope);
  }

  /** Get all permissions for an agent in a space */
  getPermissions(agentId: string, spaceId: string): AgentPermissions | null {
    return this.permissions.get(permKey(agentId, spaceId)) ?? null;
  }

  /** Grant a specific permission */
  grant(agentId: string, spaceId: string, scope: PermissionScope): void {
    const key = permKey(agentId, spaceId);
    const existing = this.permissions.get(key);
    if (existing) {
      if (!existing.granted.includes(scope)) {
        existing.granted.push(scope);
      }
      // Remove from denied if it was there
      existing.denied = existing.denied.filter((s) => s !== scope);
    } else {
      this.permissions.set(key, {
        agentId,
        spaceId,
        granted: [scope],
        denied: [],
      });
    }
  }

  /** Revoke a specific permission */
  revoke(agentId: string, spaceId: string, scope: PermissionScope): void {
    const key = permKey(agentId, spaceId);
    const existing = this.permissions.get(key);
    if (existing) {
      existing.granted = existing.granted.filter((s) => s !== scope);
      if (!existing.denied.includes(scope)) {
        existing.denied.push(scope);
      }
    } else {
      this.permissions.set(key, {
        agentId,
        spaceId,
        granted: [],
        denied: [scope],
      });
    }
  }

  /** Check permission and throw if denied */
  enforce(agentId: string, spaceId: string, scope: PermissionScope): void {
    if (!this.hasPermission(agentId, spaceId, scope)) {
      throw new Error(
        `Permission denied: agent "${agentId}" does not have "${scope}" permission in space "${spaceId}"`,
      );
    }
  }

  /** Get default permissions for a role */
  static getDefaultsForRole(role: string): PermissionScope[] {
    return DEFAULT_ROLE_PERMISSIONS[role] ?? [];
  }

  /** Record consent timestamp */
  recordConsent(agentId: string, spaceId: string, userId: string): void {
    const key = permKey(agentId, spaceId);
    const existing = this.permissions.get(key);
    if (existing) {
      existing.consentedAt = Date.now();
      existing.consentedBy = userId;
    } else {
      this.permissions.set(key, {
        agentId,
        spaceId,
        granted: [],
        denied: [],
        consentedAt: Date.now(),
        consentedBy: userId,
      });
    }
  }
}
