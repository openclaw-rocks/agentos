import type * as sdk from "matrix-js-sdk";
import {
  EventTypes,
  type AgentUIEventContent,
  type AgentStatusEventContent,
  type AgentTaskEventContent,
  type AgentToolCallEventContent,
  type AgentToolResultEventContent,
  type AnyUIComponent,
  type TaskStatus,
} from "@openclaw/matrix-events";

/**
 * Room-scoped context provided to agent handlers.
 * Wraps Matrix client operations with agent-specific helpers.
 */
export class AgentContext {
  constructor(
    private client: sdk.MatrixClient,
    private agentId: string,
    private roomId: string,
  ) {}

  /** Send a plain text message */
  async sendText(text: string): Promise<string> {
    const res = await this.client.sendTextMessage(this.roomId, text);
    return res.event_id;
  }

  /** Send a notice (non-highlighted message) */
  async sendNotice(text: string): Promise<string> {
    const res = await this.client.sendNotice(this.roomId, text);
    return res.event_id;
  }

  /** Send rich A2UI components */
  async sendUI(components: AnyUIComponent[], options?: { threadId?: string; replaces?: string }): Promise<string> {
    const content: AgentUIEventContent = {
      components,
      agent_id: this.agentId,
      thread_id: options?.threadId,
      replaces: options?.replaces,
    };
    const res = await this.client.sendEvent(this.roomId, EventTypes.UI as any, content);
    return res.event_id;
  }

  /** Update agent status in this room */
  async setStatus(status: AgentStatusEventContent): Promise<void> {
    await this.client.sendStateEvent(
      this.roomId,
      EventTypes.Status as any,
      status,
      this.agentId,
    );
  }

  /** Create or update a task */
  async sendTask(task: AgentTaskEventContent): Promise<string> {
    const res = await this.client.sendEvent(this.roomId, EventTypes.Task as any, task);
    return res.event_id;
  }

  /** Log a tool call */
  async logToolCall(callId: string, toolName: string, args: Record<string, unknown>): Promise<string> {
    const content: AgentToolCallEventContent = {
      call_id: callId,
      agent_id: this.agentId,
      tool_name: toolName,
      arguments: args,
      timestamp: Date.now(),
    };
    const res = await this.client.sendEvent(this.roomId, EventTypes.ToolCall as any, content);
    return res.event_id;
  }

  /** Log a tool result */
  async logToolResult(
    callId: string,
    toolName: string,
    result: unknown,
    durationMs: number,
    error?: string,
  ): Promise<string> {
    const content: AgentToolResultEventContent = {
      call_id: callId,
      agent_id: this.agentId,
      tool_name: toolName,
      result,
      error,
      duration_ms: durationMs,
      timestamp: Date.now(),
    };
    const res = await this.client.sendEvent(this.roomId, EventTypes.ToolResult as any, content);
    return res.event_id;
  }

  /** Read room state for a given event type and state key */
  async getState<T>(eventType: string, stateKey?: string): Promise<T | null> {
    try {
      const event = await this.client.getStateEvent(this.roomId, eventType as any, stateKey ?? "");
      return event as T;
    } catch {
      return null;
    }
  }

  /** Set room state */
  async setState(eventType: string, content: Record<string, unknown>, stateKey?: string): Promise<void> {
    await this.client.sendStateEvent(this.roomId, eventType as any, content, stateKey ?? "");
  }

  /** Get the room ID */
  getRoomId(): string {
    return this.roomId;
  }

  /** Get the agent ID */
  getAgentId(): string {
    return this.agentId;
  }
}
