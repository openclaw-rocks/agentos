/**
 * US-3.3: Agent-to-Agent Delegation (IPC)
 *
 * Manages delegation of tasks between agents via `rocks.openclaw.agent.task`
 * events. The DelegationManager creates task event content and tracks pending
 * delegations — it does NOT send Matrix events itself. The BaseAgent / runtime
 * is responsible for actually sending and receiving events over Matrix.
 *
 * Key behaviours:
 * - Delegation creates a pending task and returns a Promise that resolves
 *   when the target agent responds (or on timeout).
 * - Circular delegation chains (A→B→A, or A→A) are detected and rejected.
 * - All pending delegations can be cancelled in bulk (e.g. on agent shutdown).
 */

import type { AgentTaskEventContent } from "@openclaw/protocol";
import { TaskStatusValues } from "@openclaw/protocol";

// ── Public types ────────────────────────────────────────────────────────

export interface DelegationRequest {
  targetAgentId: string;
  title: string;
  description?: string;
  input: Record<string, unknown>;
  timeoutMs?: number; // default 30_000
}

export interface DelegationResult {
  taskId: string;
  status: "completed" | "failed" | "timeout";
  result?: unknown;
  error?: string;
  durationMs: number;
}

// ── Internal bookkeeping ────────────────────────────────────────────────

interface PendingDelegation {
  resolve: (result: DelegationResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  createdAt: number;
}

interface DelegationChainEntry {
  from: string;
  to: string;
  taskId: string;
}

// ── Manager ─────────────────────────────────────────────────────────────

export class DelegationManager {
  static readonly DEFAULT_TIMEOUT = 30_000;

  private pendingDelegations = new Map<string, PendingDelegation>();

  /** Track active delegation chains to detect circular delegation */
  private activeDelegationChains = new Map<string, DelegationChainEntry>();

  /** Monotonically increasing counter for task-ID uniqueness fallback */
  private counter = 0;

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Create a delegation request.
   *
   * Returns the `AgentTaskEventContent` that the caller should send as a
   * `rocks.openclaw.agent.task` event, together with a `Promise` that will
   * resolve when the target agent responds (or on timeout).
   */
  createDelegation(
    fromAgentId: string,
    request: DelegationRequest,
  ): { taskContent: AgentTaskEventContent; promise: Promise<DelegationResult> } {
    const taskId = this.generateTaskId();
    const timeoutMs = request.timeoutMs ?? DelegationManager.DEFAULT_TIMEOUT;
    const createdAt = Date.now();

    const taskContent: AgentTaskEventContent = {
      task_id: taskId,
      title: request.title,
      description: request.description,
      status: TaskStatusValues.Pending,
      assigned_to: request.targetAgentId,
      created_by: fromAgentId,
      metadata: { input: request.input },
    };

    const promise = new Promise<DelegationResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.pendingDelegations.get(taskId);
        if (pending) {
          this.pendingDelegations.delete(taskId);
          this.untrackDelegation(taskId);
          resolve({
            taskId,
            status: "timeout",
            error: `Delegation to ${request.targetAgentId} timed out after ${timeoutMs}ms`,
            durationMs: Date.now() - createdAt,
          });
        }
      }, timeoutMs);

      this.pendingDelegations.set(taskId, { resolve, reject, timer, createdAt });
    });

    return { taskContent, promise };
  }

  /**
   * Handle an incoming task result, resolving the corresponding pending
   * delegation. Returns `true` if a matching pending delegation was found.
   */
  handleTaskResult(
    taskId: string,
    status: "completed" | "failed",
    result?: unknown,
    error?: string,
  ): boolean {
    const pending = this.pendingDelegations.get(taskId);
    if (!pending) return false;

    clearTimeout(pending.timer);
    this.pendingDelegations.delete(taskId);
    this.untrackDelegation(taskId);

    pending.resolve({
      taskId,
      status,
      result,
      error,
      durationMs: Date.now() - pending.createdAt,
    });

    return true;
  }

  /**
   * Check whether delegating from `fromAgentId` to `targetAgentId` would
   * create a circular chain.
   *
   * A cycle exists when following the chain of active delegations from
   * `targetAgentId` eventually leads back to `fromAgentId`, or when
   * `fromAgentId === targetAgentId` (self-delegation).
   */
  wouldCreateCycle(fromAgentId: string, targetAgentId: string): boolean {
    // Self-delegation is always circular
    if (fromAgentId === targetAgentId) return true;

    // Walk the existing chain starting from targetAgentId
    const visited = new Set<string>();
    let current = targetAgentId;

    while (true) {
      if (visited.has(current)) break; // prevent infinite loop on existing cycles
      visited.add(current);

      // Find whether `current` has an active outgoing delegation
      let foundNext = false;
      for (const entry of this.activeDelegationChains.values()) {
        if (entry.from === current) {
          if (entry.to === fromAgentId) return true; // cycle detected
          current = entry.to;
          foundNext = true;
          break;
        }
      }

      if (!foundNext) break;
    }

    return false;
  }

  /** Register an active delegation in the chain tracker */
  trackDelegation(fromAgentId: string, targetAgentId: string, taskId: string): void {
    this.activeDelegationChains.set(taskId, {
      from: fromAgentId,
      to: targetAgentId,
      taskId,
    });
  }

  /** Remove a completed delegation from chain tracker */
  untrackDelegation(taskId: string): void {
    this.activeDelegationChains.delete(taskId);
  }

  /** Get count of pending delegations */
  getPendingCount(): number {
    return this.pendingDelegations.size;
  }

  /** Cancel all pending delegations (e.g. on agent shutdown) */
  cancelAll(): void {
    for (const [taskId, pending] of this.pendingDelegations) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`Delegation ${taskId} cancelled`));
    }
    this.pendingDelegations.clear();
  }

  // ── Internals ─────────────────────────────────────────────────────────

  /** Generate a unique task ID */
  private generateTaskId(): string {
    this.counter++;
    const unique =
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${this.counter}`;
    return `delegation-${unique}-${this.counter}`;
  }
}
