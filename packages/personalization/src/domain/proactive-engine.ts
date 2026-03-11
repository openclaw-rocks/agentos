import type { SignalType, AggregatedSignals } from "../ports/signal-store.js";

export type TriggerType = "time_based" | "pattern_based" | "event_based";

export type ProactiveCondition =
  | { type: "time_based"; hour: number; minute?: number }
  | { type: "pattern_based"; signal: SignalType; threshold: number }
  | { type: "event_based"; eventType: string };

export interface ProactiveTrigger {
  id: string;
  agentId: string;
  spaceId: string;
  type: TriggerType;
  condition: ProactiveCondition;
  /** Max times this can fire per day */
  maxPerDay?: number;
}

export interface ProactiveMessage {
  triggerId: string;
  agentId: string;
  spaceId: string;
  reason: string;
  dismissable: boolean;
}

const DEFAULT_MAX_PER_DAY = 3;

export class ProactiveEngine {
  private triggers = new Map<string, ProactiveTrigger>();
  private fireCountToday = new Map<string, number>();
  private snoozedUntil = new Map<string, number>();
  private disabledAgents = new Set<string>();

  /** Register a proactive trigger */
  register(trigger: ProactiveTrigger): void {
    this.triggers.set(trigger.id, trigger);
  }

  /** Unregister a trigger */
  unregister(triggerId: string): boolean {
    this.fireCountToday.delete(triggerId);
    this.snoozedUntil.delete(triggerId);
    return this.triggers.delete(triggerId);
  }

  /** Evaluate all triggers against current state, return messages to show */
  evaluate(currentHour: number, signals: AggregatedSignals): ProactiveMessage[] {
    const messages: ProactiveMessage[] = [];
    const now = Date.now();

    for (const trigger of this.triggers.values()) {
      // Skip if agent is disabled
      if (this.disabledAgents.has(trigger.agentId)) {
        continue;
      }

      // Skip if snoozed
      const snoozedTime = this.snoozedUntil.get(trigger.id);
      if (snoozedTime !== undefined && now < snoozedTime) {
        continue;
      }

      // Skip if max per day reached
      const maxPerDay = trigger.maxPerDay ?? DEFAULT_MAX_PER_DAY;
      const currentCount = this.fireCountToday.get(trigger.id) ?? 0;
      if (currentCount >= maxPerDay) {
        continue;
      }

      const message = this.evaluateTrigger(trigger, currentHour, signals);
      if (message) {
        this.fireCountToday.set(trigger.id, currentCount + 1);
        messages.push(message);
      }
    }

    return messages;
  }

  /** Mark a message as dismissed (snooze until end of day) */
  snooze(triggerId: string): void {
    // Snooze until the end of the current day (next midnight)
    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    this.snoozedUntil.set(triggerId, endOfDay.getTime());
  }

  /** Disable all proactive messages from an agent */
  disableAgent(agentId: string): void {
    this.disabledAgents.add(agentId);
  }

  /** Re-enable an agent */
  enableAgent(agentId: string): void {
    this.disabledAgents.delete(agentId);
  }

  /** Check if an agent is enabled for proactive messages */
  isAgentEnabled(agentId: string): boolean {
    return !this.disabledAgents.has(agentId);
  }

  /** Reset daily counters (call at midnight) */
  resetDailyCounters(): void {
    this.fireCountToday.clear();
    this.snoozedUntil.clear();
  }

  /** Get all registered triggers */
  getTriggers(): ProactiveTrigger[] {
    return Array.from(this.triggers.values());
  }

  private evaluateTrigger(
    trigger: ProactiveTrigger,
    currentHour: number,
    signals: AggregatedSignals,
  ): ProactiveMessage | null {
    const condition = trigger.condition;

    switch (condition.type) {
      case "time_based": {
        if (condition.hour === currentHour) {
          return {
            triggerId: trigger.id,
            agentId: trigger.agentId,
            spaceId: trigger.spaceId,
            reason: `Scheduled for hour ${condition.hour}`,
            dismissable: true,
          };
        }
        return null;
      }

      case "pattern_based": {
        const matchesThreshold = this.checkPatternThreshold(
          condition.signal,
          condition.threshold,
          signals,
        );
        if (matchesThreshold) {
          return {
            triggerId: trigger.id,
            agentId: trigger.agentId,
            spaceId: trigger.spaceId,
            reason: `Pattern "${condition.signal}" exceeded threshold of ${condition.threshold}`,
            dismissable: true,
          };
        }
        return null;
      }

      case "event_based": {
        return {
          triggerId: trigger.id,
          agentId: trigger.agentId,
          spaceId: trigger.spaceId,
          reason: `Event "${condition.eventType}" detected`,
          dismissable: true,
        };
      }

      default:
        return null;
    }
  }

  private checkPatternThreshold(
    signalType: SignalType,
    threshold: number,
    signals: AggregatedSignals,
  ): boolean {
    switch (signalType) {
      case "space_visit": {
        const total = signals.topSpaces.reduce((sum, s) => sum + s.visitCount, 0);
        return total >= threshold;
      }
      case "component_interaction": {
        const total = signals.topComponents.reduce((sum, c) => sum + c.count, 0);
        return total >= threshold;
      }
      case "agent_invoked": {
        const total = signals.topAgents.reduce((sum, a) => sum + a.count, 0);
        return total >= threshold;
      }
      case "message_sent":
      case "suggestion_dismissed":
      case "time_of_day_activity":
        return signals.totalSignals >= threshold;
      default:
        return false;
    }
  }
}
