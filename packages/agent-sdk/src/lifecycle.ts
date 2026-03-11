export type AgentState = "starting" | "online" | "busy" | "offline" | "error";

/** Valid state transitions */
const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  starting: ["online", "error", "offline"],
  online: ["busy", "offline", "error"],
  busy: ["online", "offline", "error"],
  offline: ["starting"],
  error: ["starting", "offline"],
};

export interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

export interface LifecycleEvents {
  onStateChange?: (from: AgentState, to: AgentState) => void;
  onHealthCheck?: () => Promise<HealthCheckResult>;
  onRestart?: () => Promise<void>;
}

export class AgentLifecycleManager {
  private state: AgentState = "offline";
  private restartCount = 0;
  private healthCheckTimer?: ReturnType<typeof setInterval>;

  static readonly BACKOFF_SCHEDULE = [5_000, 15_000, 60_000, 300_000];
  static readonly HEALTH_CHECK_TIMEOUT = 10_000;
  static readonly HEALTH_CHECK_INTERVAL = 30_000;

  constructor(
    private readonly agentId: string,
    private readonly events: LifecycleEvents,
  ) {}

  getState(): AgentState {
    return this.state;
  }

  getAgentId(): string {
    return this.agentId;
  }

  getRestartCount(): number {
    return this.restartCount;
  }

  /** Check if a transition is valid from the current state. */
  canTransition(to: AgentState): boolean {
    return VALID_TRANSITIONS[this.state].includes(to);
  }

  /** Transition to a new state. Throws if the transition is invalid. */
  transition(to: AgentState): void {
    if (!this.canTransition(to)) {
      throw new Error(`Invalid state transition: ${this.state} → ${to}`);
    }
    const from = this.state;
    this.state = to;
    this.events.onStateChange?.(from, to);
  }

  /** Start health-check polling. */
  startHealthChecks(): void {
    this.stopHealthChecks();
    this.healthCheckTimer = setInterval(() => {
      void this.runHealthCheck();
    }, AgentLifecycleManager.HEALTH_CHECK_INTERVAL);
  }

  /** Stop health-check polling. */
  stopHealthChecks(): void {
    if (this.healthCheckTimer !== undefined) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /** Get the backoff delay for the current restart count. */
  getBackoffDelay(): number {
    const schedule = AgentLifecycleManager.BACKOFF_SCHEDULE;
    const index = Math.min(this.restartCount, schedule.length - 1);
    return schedule[index];
  }

  /** Record a restart attempt. Returns the backoff delay in ms. */
  recordRestart(): number {
    const delay = this.getBackoffDelay();
    this.restartCount++;
    return delay;
  }

  /** Reset restart counter (called after successful recovery). */
  resetRestartCount(): void {
    this.restartCount = 0;
  }

  /** Clean up resources. */
  dispose(): void {
    this.stopHealthChecks();
  }

  // ── internal ───────────────────────────────────────────────────

  private async runHealthCheck(): Promise<void> {
    if (!this.events.onHealthCheck) return;

    // Only run health checks when the agent is in a "live" state.
    if (this.state !== "online" && this.state !== "busy") return;

    try {
      const result = await Promise.race<HealthCheckResult>([
        this.events.onHealthCheck(),
        new Promise<HealthCheckResult>((_, reject) =>
          setTimeout(
            () => reject(new Error("Health check timed out")),
            AgentLifecycleManager.HEALTH_CHECK_TIMEOUT,
          ),
        ),
      ]);

      if (!result.healthy) {
        this.transition("error");
      }
    } catch {
      this.transition("error");
    }
  }
}
