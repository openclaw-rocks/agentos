export const EVENT_NAMESPACE = "rocks.openclaw.agent";
export const SPACE_NAMESPACE = "rocks.openclaw.space";

export const EventTypes = {
  // Agent events
  UI: `${EVENT_NAMESPACE}.ui`,
  Action: `${EVENT_NAMESPACE}.action`,
  Status: `${EVENT_NAMESPACE}.status`,
  Task: `${EVENT_NAMESPACE}.task`,
  ToolCall: `${EVENT_NAMESPACE}.tool_call`,
  ToolResult: `${EVENT_NAMESPACE}.tool_result`,
  Register: `${EVENT_NAMESPACE}.register`,
  Config: `${EVENT_NAMESPACE}.config`,
  // Space events
  SpaceConfig: `${SPACE_NAMESPACE}.config`,
  SpaceAgents: `${SPACE_NAMESPACE}.agents`,
  AgentMemory: `${EVENT_NAMESPACE}.memory`,
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

export const AgentStatusValues = {
  Starting: "starting",
  Online: "online",
  Busy: "busy",
  Offline: "offline",
  Error: "error",
} as const;

export type AgentStatus = (typeof AgentStatusValues)[keyof typeof AgentStatusValues];

export const TaskStatusValues = {
  Pending: "pending",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
  Cancelled: "cancelled",
} as const;

export type TaskStatus = (typeof TaskStatusValues)[keyof typeof TaskStatusValues];
