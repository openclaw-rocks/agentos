import type { MatrixEvent } from "matrix-js-sdk";
import type { AgentAction, AgentInfo } from "@openclaw/matrix-events";

export interface AgentConfig {
  /** Matrix homeserver URL */
  homeserverUrl: string;
  /** Agent's Matrix user ID (e.g., @echo-bot:openclaw.rocks) */
  userId: string;
  /** Access token for the agent's Matrix account */
  accessToken: string;
  /** Agent metadata */
  info: Omit<AgentInfo, "status">;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, {
    type: string;
    description: string;
    required?: boolean;
  }>;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  context: { roomId: string; senderId: string }
) => Promise<unknown>;

export interface AgentHandler {
  /** Called when the agent receives a text message in a joined room */
  onMessage?(roomId: string, sender: string, content: string, event: MatrixEvent): Promise<void>;

  /** Called when a UI action is triggered (button click, form submit, etc.) */
  onAction?(action: AgentAction): Promise<void>;

  /** Called when the agent is invited to a room */
  onInvite?(roomId: string, inviter: string): Promise<void>;

  /** Called when a task is assigned to this agent */
  onTask?(roomId: string, taskId: string, title: string, metadata: Record<string, unknown>): Promise<void>;

  /** Called when the agent starts up */
  onStart?(): Promise<void>;

  /** Called when the agent shuts down */
  onStop?(): Promise<void>;
}
