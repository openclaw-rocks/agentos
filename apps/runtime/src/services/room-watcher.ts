import type { AgentDeployer } from "./agent-deployer.js";
import type { AgentRegistry } from "./agent-registry.js";

interface MatrixEvent {
  event_id: string;
  type: string;
  room_id: string;
  sender: string;
  content: Record<string, unknown>;
  state_key?: string;
  origin_server_ts: number;
}

/**
 * Watches for room events and triggers agent auto-deployment.
 */
export class RoomWatcher {
  private processedRooms = new Set<string>();

  constructor(
    private registry: AgentRegistry,
    private deployer: AgentDeployer,
  ) {}

  /** Handle an incoming event from the Application Service API */
  async handleEvent(event: MatrixEvent): Promise<void> {
    switch (event.type) {
      case "m.room.create":
        await this.handleRoomCreate(event);
        break;

      case "m.room.name":
        await this.handleRoomName(event);
        break;

      case "m.room.member":
        await this.handleMembership(event);
        break;

      case "m.room.message":
        await this.handleMessage(event);
        break;

      default:
        // Log custom openclaw events for debugging
        if (event.type.startsWith("rocks.openclaw.")) {
          console.log(`[watcher] Custom event: ${event.type} in ${event.room_id}`);
        }
        break;
    }
  }

  /** When a room is created, check auto-join rules */
  private async handleRoomCreate(event: MatrixEvent): Promise<void> {
    const roomId = event.room_id;
    if (this.processedRooms.has(roomId)) return;
    this.processedRooms.add(roomId);

    console.log(`[watcher] New room created: ${roomId}`);
  }

  /** When a room gets a name, match against auto-join rules */
  private async handleRoomName(event: MatrixEvent): Promise<void> {
    const roomId = event.room_id;
    const roomName = event.content.name as string;
    if (!roomName) return;

    console.log(`[watcher] Room named: ${roomName} (${roomId})`);

    const matchingAgents = this.registry.findMatchingAgents(roomName);
    for (const agent of matchingAgents) {
      try {
        await this.deployer.deployToRoom(agent.matrixUserId, roomId);
        console.log(`[watcher] Auto-deployed ${agent.info.displayName} to ${roomName}`);
      } catch (err) {
        console.error(`[watcher] Failed to deploy ${agent.info.id} to ${roomId}:`, err);
      }
    }
  }

  /** Handle membership events (invites to agents) */
  private async handleMembership(event: MatrixEvent): Promise<void> {
    if (event.content.membership !== "invite") return;

    const invitedUser = event.state_key;
    if (!invitedUser) return;

    const agent = this.registry.getAgentByUserId(invitedUser);
    if (!agent) return;

    console.log(`[watcher] Agent ${agent.info.displayName} invited to ${event.room_id}`);

    try {
      await this.deployer.deployToRoom(agent.matrixUserId, event.room_id);
    } catch (err) {
      console.error(`[watcher] Failed to join ${agent.info.id} to ${event.room_id}:`, err);
    }
  }

  /** Forward messages to relevant agents */
  private async handleMessage(event: MatrixEvent): Promise<void> {
    // This is a placeholder — in production, the agent-service would route
    // messages to agent processes. For now, individual agents handle their
    // own message routing via the SDK.
    const content = event.content;
    if (content.msgtype !== "m.text") return;

    const body = content.body as string;

    // Check for @agent mentions
    for (const agent of this.registry.listAgents()) {
      const mention = `@${agent.info.id}`;
      if (body.includes(mention)) {
        console.log(`[watcher] Agent ${agent.info.id} mentioned in ${event.room_id}`);
      }
    }
  }
}
