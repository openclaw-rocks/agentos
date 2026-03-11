import type { Signal, SignalStore, AggregatedSignals } from "../ports/signal-store.js";

export interface SignalCollectorConfig {
  /** Rolling window in days */
  retentionDays?: number;
  /** Maximum signals per user before eviction */
  maxSignalsPerUser?: number;
  /** Whether collection is enabled */
  enabled?: boolean;
}

const DEFAULT_CONFIG: Required<SignalCollectorConfig> = {
  retentionDays: 30,
  maxSignalsPerUser: 10000,
  enabled: true,
};

export class SignalCollector {
  private config: Required<SignalCollectorConfig>;

  constructor(
    private store: SignalStore,
    config?: SignalCollectorConfig,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Record a signal (no-op if disabled) */
  async record(userId: string, signal: Signal): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    await this.store.record(userId, signal);
  }

  /** Get aggregated patterns for a user */
  async getPatterns(userId: string): Promise<AggregatedSignals> {
    return this.store.getAggregated(userId);
  }

  /** Clear all signals for a user */
  async clearSignals(userId: string): Promise<void> {
    await this.store.clear(userId);
  }

  /** Check if collection is enabled */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /** Enable/disable collection */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }
}
