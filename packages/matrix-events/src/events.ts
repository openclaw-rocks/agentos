import type { AnyUIComponent } from "./ui-components.js";
import type { AgentStatus, TaskStatus } from "./constants.js";

/** Content for rocks.openclaw.agent.ui events */
export interface AgentUIEventContent {
  /** The root UI component(s) to render */
  components: AnyUIComponent[];
  /** Agent that sent this UI */
  agent_id: string;
  /** Optional thread/conversation reference */
  thread_id?: string;
  /** Whether this replaces a previous UI event */
  replaces?: string;
}

/** Content for rocks.openclaw.agent.status state events */
export interface AgentStatusEventContent {
  agent_id: string;
  display_name: string;
  avatar_url?: string;
  status: AgentStatus;
  capabilities: string[];
  description?: string;
  version?: string;
  last_active?: number;
}

/** Content for rocks.openclaw.agent.task events */
export interface AgentTaskEventContent {
  task_id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  assigned_to?: string;
  created_by: string;
  result?: unknown;
  error?: string;
  started_at?: number;
  completed_at?: number;
  metadata?: Record<string, unknown>;
}

/** Content for rocks.openclaw.agent.tool_call events */
export interface AgentToolCallEventContent {
  call_id: string;
  task_id?: string;
  agent_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  timestamp: number;
}

/** Content for rocks.openclaw.agent.tool_result events */
export interface AgentToolResultEventContent {
  call_id: string;
  task_id?: string;
  agent_id: string;
  tool_name: string;
  result: unknown;
  error?: string;
  duration_ms: number;
  timestamp: number;
}

/** Content for rocks.openclaw.agent.register state events */
export interface AgentRegisterEventContent {
  agent_id: string;
  display_name: string;
  description: string;
  capabilities: string[];
  auto_join_patterns?: string[];
  avatar_url?: string;
  config_schema?: Record<string, unknown>;
}

/** Content for rocks.openclaw.agent.config state events */
export interface AgentConfigEventContent {
  agent_id: string;
  config: Record<string, unknown>;
  updated_by: string;
  updated_at: number;
}
