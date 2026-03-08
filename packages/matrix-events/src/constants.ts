export const EVENT_NAMESPACE = "rocks.openclaw.agent";

export const EventTypes = {
  UI: `${EVENT_NAMESPACE}.ui`,
  Status: `${EVENT_NAMESPACE}.status`,
  Task: `${EVENT_NAMESPACE}.task`,
  ToolCall: `${EVENT_NAMESPACE}.tool_call`,
  ToolResult: `${EVENT_NAMESPACE}.tool_result`,
  Register: `${EVENT_NAMESPACE}.register`,
  Config: `${EVENT_NAMESPACE}.config`,
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

export const AgentStatusValues = {
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
