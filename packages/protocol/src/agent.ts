import type { AgentStatus } from "./constants.js";

/** Represents an agent's identity and capabilities */
export interface AgentInfo {
  id: string;
  displayName: string;
  description: string;
  avatarUrl?: string;
  capabilities: string[];
  status: AgentStatus;
  version?: string;
}

/** Agent auto-join rule */
export interface AutoJoinRule {
  /** Glob pattern matching room name or alias */
  pattern: string;
  /** Agent IDs to auto-deploy when a matching room is created */
  agents: string[];
}

/** Agent action triggered from UI interaction */
export interface AgentAction {
  /** The action identifier from the UI component */
  action: string;
  /** The agent that should handle this action */
  agent_id: string;
  /** Room where the action was triggered */
  room_id: string;
  /** Event ID of the UI event that was interacted with */
  event_id: string;
  /** Any form data or parameters */
  data?: Record<string, unknown>;
}
