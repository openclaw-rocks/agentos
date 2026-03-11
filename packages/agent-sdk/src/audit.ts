import type { PermissionScope } from "./permissions.js";

export interface AuditEntry {
  timestamp: number;
  agentId: string;
  spaceId: string;
  action: string;
  permissionUsed: PermissionScope;
  success: boolean;
  metadata?: Record<string, unknown>;
}

const DEFAULT_MAX_ENTRIES = 10000;

export class AuditLog {
  private entries: AuditEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries?: number) {
    this.maxEntries = maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /** Record an audit entry */
  record(entry: Omit<AuditEntry, "timestamp">): void {
    const fullEntry: AuditEntry = {
      ...entry,
      timestamp: Date.now(),
    };
    this.entries.push(fullEntry);

    // Evict oldest entries if we exceed the cap
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(this.entries.length - this.maxEntries);
    }
  }

  /** Query entries */
  query(filter: {
    agentId?: string;
    spaceId?: string;
    action?: string;
    since?: number;
    limit?: number;
  }): AuditEntry[] {
    let results = this.entries;

    if (filter.agentId !== undefined) {
      results = results.filter((e) => e.agentId === filter.agentId);
    }
    if (filter.spaceId !== undefined) {
      results = results.filter((e) => e.spaceId === filter.spaceId);
    }
    if (filter.action !== undefined) {
      results = results.filter((e) => e.action === filter.action);
    }
    if (filter.since !== undefined) {
      const since = filter.since;
      results = results.filter((e) => e.timestamp >= since);
    }
    if (filter.limit !== undefined) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  /** Get total entry count */
  count(): number {
    return this.entries.length;
  }

  /** Clear all entries */
  clear(): void {
    this.entries = [];
  }

  /** Export entries as JSON */
  export(): AuditEntry[] {
    return [...this.entries];
  }
}
