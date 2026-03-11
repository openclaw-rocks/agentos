export type SignalType =
  | "space_visit"
  | "time_of_day_activity"
  | "component_interaction"
  | "suggestion_dismissed"
  | "message_sent"
  | "agent_invoked";

export interface Signal {
  type: SignalType;
  spaceId?: string;
  agentId?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface AggregatedSignals {
  /** Most visited spaces (ordered by frequency) */
  topSpaces: Array<{ spaceId: string; visitCount: number }>;
  /** Hour-of-day activity pattern (0-23) */
  activeHours: number[];
  /** Most interacted component types */
  topComponents: Array<{ type: string; count: number }>;
  /** Agents invoked most frequently */
  topAgents: Array<{ agentId: string; count: number }>;
  /** Total signals collected */
  totalSignals: number;
  /** Window start timestamp */
  windowStart: number;
}

/** Port: local-only signal collection */
export interface SignalStore {
  record(userId: string, signal: Signal): Promise<void>;
  getAggregated(userId: string): Promise<AggregatedSignals>;
  clear(userId: string): Promise<void>;
  getSignalCount(userId: string): Promise<number>;
}
