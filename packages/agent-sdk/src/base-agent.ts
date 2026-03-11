import {
  EventTypes,
  AgentStatusValues,
  type AgentAction,
  type AgentStatusEventContent,
} from "@openclaw/protocol";
import * as sdk from "matrix-js-sdk";
import { AgentContext } from "./context.js";
import type { AgentConfig, AgentHandler, ToolDefinition, ToolHandler } from "./types.js";

/**
 * Base class for AgentOS agents.
 * Handles Matrix connection, event routing, and lifecycle management.
 *
 * Usage:
 * ```ts
 * const agent = new BaseAgent(config, {
 *   async onMessage(roomId, sender, content, event) {
 *     const ctx = agent.context(roomId);
 *     await ctx.sendText(`Echo: ${content}`);
 *   }
 * });
 * await agent.start();
 * ```
 */
export class BaseAgent {
  private client: sdk.MatrixClient;
  private config: AgentConfig;
  private handler: AgentHandler;
  private tools = new Map<string, { definition: ToolDefinition; handler: ToolHandler }>();
  private running = false;

  constructor(config: AgentConfig, handler: AgentHandler) {
    this.config = config;
    this.handler = handler;
    this.client = sdk.createClient({
      baseUrl: config.homeserverUrl,
      userId: config.userId,
      accessToken: config.accessToken,
    });
  }

  /** Register a tool that can be invoked by name */
  registerTool(definition: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
  }

  /** Get a room-scoped context for sending messages and UI */
  context(roomId: string): AgentContext {
    return new AgentContext(this.client, this.config.info.id, roomId);
  }

  /** Start the agent: connect to Matrix, sync, and listen for events */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.setupEventHandlers();

    await this.client.startClient({ initialSyncLimit: 0 });

    // Wait for initial sync
    await new Promise<void>((resolve) => {
      this.client.once(sdk.ClientEvent.Sync, (state: string) => {
        if (state === "PREPARED") resolve();
      });
    });

    console.log(`[${this.config.info.displayName}] Agent started as ${this.config.userId}`);

    if (this.handler.onStart) {
      await this.handler.onStart();
    }
  }

  /** Stop the agent gracefully */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    if (this.handler.onStop) {
      await this.handler.onStop();
    }

    this.client.stopClient();
    console.log(`[${this.config.info.displayName}] Agent stopped`);
  }

  /** Get registered tool definitions (for advertising capabilities) */
  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /** Execute a registered tool by name */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    context: { roomId: string; senderId: string },
  ): Promise<unknown> {
    const tool = this.tools.get(toolName);
    if (!tool) throw new Error(`Unknown tool: ${toolName}`);
    return tool.handler(args, context);
  }

  private setupEventHandlers(): void {
    // Handle timeline events (messages, custom events)
    this.client.on(sdk.RoomEvent.Timeline, (event: sdk.MatrixEvent, room: sdk.Room | undefined) => {
      if (!room) return;
      // Ignore own events
      if (event.getSender() === this.config.userId) return;
      // Ignore events from before sync
      if (!event.getDate()) return;

      const roomId = room.roomId;
      const sender = event.getSender()!;
      const eventType = event.getType();

      // Route text messages
      if (eventType === "m.room.message" && this.handler.onMessage) {
        const msgContent = event.getContent();
        if (msgContent.msgtype === "m.text") {
          this.handler
            .onMessage(roomId, sender, msgContent.body, event)
            .catch((err) =>
              console.error(`[${this.config.info.displayName}] Error handling message:`, err),
            );
        }
      }

      // Route UI actions (from dedicated action events or legacy UI events with action field)
      if (
        (eventType === EventTypes.Action || eventType === EventTypes.UI) &&
        this.handler.onAction
      ) {
        const content = event.getContent();
        if (content.action && content.agent_id === this.config.info.id) {
          const action: AgentAction = {
            action: content.action,
            agent_id: this.config.info.id,
            room_id: roomId,
            event_id: event.getId()!,
            data: content.data,
          };
          this.handler
            .onAction(action)
            .catch((err) =>
              console.error(`[${this.config.info.displayName}] Error handling action:`, err),
            );
        }
      }

      // Route task assignments
      if (eventType === EventTypes.Task && this.handler.onTask) {
        const content = event.getContent();
        if (content.assigned_to === this.config.info.id && content.status === "pending") {
          this.handler
            .onTask(roomId, content.task_id, content.title, content.metadata ?? {})
            .catch((err) =>
              console.error(`[${this.config.info.displayName}] Error handling task:`, err),
            );
        }
      }
    });

    // Handle invites — auto-accept
    this.client.on(
      sdk.RoomMemberEvent.Membership,
      (_event: sdk.MatrixEvent, member: sdk.RoomMember) => {
        if (member.userId !== this.config.userId) return;
        if (member.membership !== "invite") return;

        const roomId = member.roomId;

        this.client
          .joinRoom(roomId)
          .then(() => {
            console.log(`[${this.config.info.displayName}] Joined room ${roomId}`);

            if (this.handler.onInvite) {
              this.handler
                .onInvite(roomId, _event.getSender()!)
                .catch((err) =>
                  console.error(`[${this.config.info.displayName}] Error handling invite:`, err),
                );
            }

            // Announce agent presence in room
            const ctx = this.context(roomId);
            const status: AgentStatusEventContent = {
              agent_id: this.config.info.id,
              display_name: this.config.info.displayName,
              avatar_url: this.config.info.avatarUrl,
              status: AgentStatusValues.Online,
              capabilities: this.config.info.capabilities,
              description: this.config.info.description,
            };
            ctx
              .setStatus(status)
              .catch((err) =>
                console.error(`[${this.config.info.displayName}] Error setting status:`, err),
              );
          })
          .catch((err) =>
            console.error(`[${this.config.info.displayName}] Error joining room:`, err),
          );
      },
    );
  }
}
