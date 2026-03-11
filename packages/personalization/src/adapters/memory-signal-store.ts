import type { Signal, SignalStore, AggregatedSignals } from "../ports/signal-store.js";

export class MemorySignalStore implements SignalStore {
  private signals = new Map<string, Signal[]>();

  async record(userId: string, signal: Signal): Promise<void> {
    const existing = this.signals.get(userId) ?? [];
    existing.push(signal);
    this.signals.set(userId, existing);
  }

  async getAggregated(userId: string): Promise<AggregatedSignals> {
    const signals = this.signals.get(userId) ?? [];

    const spaceCounts = new Map<string, number>();
    const hourCounts = new Map<number, number>();
    const componentCounts = new Map<string, number>();
    const agentCounts = new Map<string, number>();
    let windowStart = Infinity;

    for (const signal of signals) {
      if (signal.timestamp < windowStart) {
        windowStart = signal.timestamp;
      }

      // Track space visits
      if (signal.type === "space_visit" && signal.spaceId) {
        spaceCounts.set(signal.spaceId, (spaceCounts.get(signal.spaceId) ?? 0) + 1);
      }

      // Track activity hours
      if (signal.type === "time_of_day_activity") {
        const hour = new Date(signal.timestamp).getHours();
        hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
      }

      // Track component interactions
      if (signal.type === "component_interaction") {
        const componentType = (signal.metadata?.componentType as string) ?? "unknown";
        componentCounts.set(componentType, (componentCounts.get(componentType) ?? 0) + 1);
      }

      // Track agent invocations
      if (signal.type === "agent_invoked" && signal.agentId) {
        agentCounts.set(signal.agentId, (agentCounts.get(signal.agentId) ?? 0) + 1);
      }
    }

    const topSpaces = Array.from(spaceCounts.entries())
      .map(([spaceId, visitCount]) => ({ spaceId, visitCount }))
      .sort((a, b) => b.visitCount - a.visitCount);

    const activeHours = Array.from(hourCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([hour]) => hour);

    const topComponents = Array.from(componentCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    const topAgents = Array.from(agentCounts.entries())
      .map(([agentId, count]) => ({ agentId, count }))
      .sort((a, b) => b.count - a.count);

    return {
      topSpaces,
      activeHours,
      topComponents,
      topAgents,
      totalSignals: signals.length,
      windowStart: signals.length > 0 ? windowStart : 0,
    };
  }

  async clear(userId: string): Promise<void> {
    this.signals.delete(userId);
  }

  async getSignalCount(userId: string): Promise<number> {
    return (this.signals.get(userId) ?? []).length;
  }
}
