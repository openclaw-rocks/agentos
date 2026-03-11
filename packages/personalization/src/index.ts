// Ports
export type { UserPreferences, PreferenceStore } from "./ports/preference-store.js";
export { DEFAULT_PREFERENCES } from "./ports/preference-store.js";

export type { SignalType, Signal, AggregatedSignals, SignalStore } from "./ports/signal-store.js";

// Domain
export { PreferenceManager } from "./domain/preference-manager.js";

export type { SignalCollectorConfig } from "./domain/signal-collector.js";
export { SignalCollector } from "./domain/signal-collector.js";

export type {
  TriggerType,
  ProactiveCondition,
  ProactiveTrigger,
  ProactiveMessage,
} from "./domain/proactive-engine.js";
export { ProactiveEngine } from "./domain/proactive-engine.js";

// Adapters
export { MemoryPreferenceStore } from "./adapters/memory-preference-store.js";
export { MemorySignalStore } from "./adapters/memory-signal-store.js";
