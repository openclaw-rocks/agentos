import {
  EventTypes,
  type AgentMemoryEventContent,
  type AgentStatusEventContent,
  type AgentTaskEventContent,
  type AgentToolCallEventContent,
  type AgentToolResultEventContent,
  type AgentUIEventContent,
  type AnyUIComponent,
} from "@openclaw/protocol";
import type * as sdk from "matrix-js-sdk";

/**
 * Cast a custom event type string to satisfy the Matrix SDK's type constraints.
 * Matrix SDK expects `keyof TimelineEvents` or `keyof StateEvents`, but our
 * custom `rocks.openclaw.agent.*` types aren't in those maps. This helper
 * provides a single, documented cast point instead of scattering `as` casts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function customEventType(eventType: string): any {
  return eventType;
}

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
  async sendUI(
    components: AnyUIComponent[],
    options?: { threadId?: string; replaces?: string },
  ): Promise<string> {
    const content: AgentUIEventContent = {
      components,
      agent_id: this.agentId,
      thread_id: options?.threadId,
      replaces: options?.replaces,
    };
    const res = await this.client.sendEvent(this.roomId, customEventType(EventTypes.UI), content);
    return res.event_id;
  }

  /** Update agent status in this room */
  async setStatus(status: AgentStatusEventContent): Promise<void> {
    await this.client.sendStateEvent(
      this.roomId,
      customEventType(EventTypes.Status),
      status,
      this.agentId,
    );
  }

  /** Create or update a task */
  async sendTask(task: AgentTaskEventContent): Promise<string> {
    const res = await this.client.sendEvent(this.roomId, customEventType(EventTypes.Task), task);
    return res.event_id;
  }

  /** Log a tool call */
  async logToolCall(
    callId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const content: AgentToolCallEventContent = {
      call_id: callId,
      agent_id: this.agentId,
      tool_name: toolName,
      arguments: args,
      timestamp: Date.now(),
    };
    const res = await this.client.sendEvent(
      this.roomId,
      customEventType(EventTypes.ToolCall),
      content,
    );
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
    const res = await this.client.sendEvent(
      this.roomId,
      customEventType(EventTypes.ToolResult),
      content,
    );
    return res.event_id;
  }

  /** Read room state for a given event type and state key */
  async getState<T>(eventType: string, stateKey?: string): Promise<T | null> {
    try {
      const event = await this.client.getStateEvent(this.roomId, eventType, stateKey ?? "");
      return event as T;
    } catch {
      return null;
    }
  }

  /** Set room state */
  async setState(
    eventType: string,
    content: Record<string, unknown>,
    stateKey?: string,
  ): Promise<void> {
    await this.client.sendStateEvent(
      this.roomId,
      customEventType(eventType),
      content,
      stateKey ?? "",
    );
  }

  // ─── US-2.4: Agent Memory ──────────────────────────────────────────

  /** Get a memory value for this agent in this room */
  async memoryGet(key: string): Promise<unknown | null> {
    const memory = await this.getMemoryState();
    if (!memory) return null;
    return key in memory.entries ? memory.entries[key] : null;
  }

  /** Set a memory value for this agent in this room */
  async memorySet(key: string, value: unknown): Promise<void> {
    const existing = await this.getMemoryState();
    const entries = existing?.entries ?? {};
    entries[key] = value;
    await this.saveMemoryState(entries);
  }

  /** Delete a memory key */
  async memoryDelete(key: string): Promise<boolean> {
    const existing = await this.getMemoryState();
    if (!existing || !(key in existing.entries)) return false;
    const entries = { ...existing.entries };
    delete entries[key];
    await this.saveMemoryState(entries);
    return true;
  }

  /** List all memory keys */
  async memoryList(): Promise<string[]> {
    const memory = await this.getMemoryState();
    if (!memory) return [];
    return Object.keys(memory.entries);
  }

  /** Clear all memory for this agent in this room */
  async memoryClear(): Promise<void> {
    await this.saveMemoryState({});
  }

  private async getMemoryState(): Promise<AgentMemoryEventContent | null> {
    return this.getState<AgentMemoryEventContent>(`${EventTypes.AgentMemory}.${this.agentId}`);
  }

  private async saveMemoryState(entries: Record<string, unknown>): Promise<void> {
    const serialized = JSON.stringify(entries);
    const content: AgentMemoryEventContent = {
      agent_id: this.agentId,
      entries,
      updated_at: new Date().toISOString(),
      size_bytes: new TextEncoder().encode(serialized).length,
    };
    await this.setState(
      `${EventTypes.AgentMemory}.${this.agentId}`,
      content as unknown as Record<string, unknown>,
    );
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
