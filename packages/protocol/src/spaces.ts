/** Layout mode hint for a context space */
export type LayoutMode = "stream" | "canvas" | "focus";

/** Agent role within a space */
export type AgentRole = "primary" | "specialist" | "background";

/** Agent roster entry for a space */
export interface SpaceAgentEntry {
  id: string;
  role: AgentRole;
  capabilities: string[];
  permissions: string[];
  active: boolean;
}

/** Content for rocks.openclaw.space.config state events */
export interface SpaceConfigEventContent {
  /** Template ID this space was created from */
  template_id: string;
  /** Display name of the template */
  template_name: string;
  /** Icon identifier (emoji or icon name) */
  icon: string;
  /** Short description of the space purpose */
  description: string;
  /** Suggested A2UI layout mode */
  layout_mode: LayoutMode;
  /** Custom metadata from the template */
  metadata?: Record<string, unknown>;
}

/** Content for rocks.openclaw.space.agents state events */
export interface SpaceAgentsEventContent {
  agents: SpaceAgentEntry[];
}

/** Space template definition */
export interface SpaceTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  layout_mode: LayoutMode;
  default_agents: Omit<SpaceAgentEntry, "active">[];
  /** Suggested initial channels to create */
  suggested_channels?: string[];
}

/** Content for rocks.openclaw.agent.memory.<agent_id> state events */
export interface AgentMemoryEventContent {
  agent_id: string;
  /** Key-value pairs of agent memory */
  entries: Record<string, unknown>;
  /** ISO timestamp of last update */
  updated_at: string;
  /** Total size in bytes (for enforcement) */
  size_bytes: number;
}
