import { EventTypes } from "@openclaw/protocol";
import type { AgentRegisterEventContent, AgentStatusEventContent } from "@openclaw/protocol";
import type * as sdk from "matrix-js-sdk";

export interface AgentInfo {
  agentId: string;
  userId: string;
  displayName: string;
  description: string;
  capabilities: string[];
  status: "starting" | "online" | "busy" | "offline" | "error";
  avatarUrl?: string;
  lastActive?: number;
}

type Listener = () => void;

/**
 * Tracks which room members are agents by reading `rocks.openclaw.agent.register`
 * and `rocks.openclaw.agent.status` state events from rooms.
 *
 * Falls back to checking if the userId was used as an agent_id in any state event.
 */
export class AgentRegistry {
  /** agentId -> AgentInfo (global, across all rooms) */
  private agents = new Map<string, AgentInfo>();

  /** userId -> agentId mapping (an agent's Matrix userId maps to its agentId) */
  private userIdToAgentId = new Map<string, string>();

  private version = 0;
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  private notify() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  /** Check if a userId belongs to a known agent */
  isAgent(userId: string): boolean {
    return this.userIdToAgentId.has(userId);
  }

  /** Get agent info by userId */
  getAgentByUserId(userId: string): AgentInfo | undefined {
    const agentId = this.userIdToAgentId.get(userId);
    if (!agentId) return undefined;
    return this.agents.get(agentId);
  }

  /** Get all known agents */
  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  /** Get agents present in a specific room */
  getAgentsInRoom(room: sdk.Room): AgentInfo[] {
    const members = room.getJoinedMembers();
    const result: AgentInfo[] = [];
    for (const m of members) {
      const info = this.getAgentByUserId(m.userId);
      if (info) result.push(info);
    }
    return result;
  }

  /** Get human (non-agent) members of a room */
  getHumansInRoom(room: sdk.Room): sdk.RoomMember[] {
    return room.getJoinedMembers().filter((m) => !this.isAgent(m.userId));
  }

  /** Scan a room's state events for agent registrations and statuses */
  loadRoom(room: sdk.Room) {
    let changed = false;

    // Look for rocks.openclaw.agent.register state events
    const registerEvents = room.currentState.getStateEvents(EventTypes.Register as string);
    for (const ev of registerEvents) {
      const content = ev.getContent() as unknown as AgentRegisterEventContent;
      if (!content.agent_id) continue;

      const sender = ev.getSender() ?? "";
      if (this.registerAgent(sender, content)) changed = true;
    }

    // Look for rocks.openclaw.agent.status state events
    const statusEvents = room.currentState.getStateEvents(EventTypes.Status as string);
    for (const ev of statusEvents) {
      const content = ev.getContent() as unknown as AgentStatusEventContent;
      if (!content.agent_id) continue;

      const sender = ev.getSender() ?? "";
      if (this.updateStatus(sender, content)) changed = true;
    }

    if (changed) this.notify();
  }

  private registerAgent(userId: string, content: AgentRegisterEventContent): boolean {
    const existing = this.agents.get(content.agent_id);
    if (
      existing &&
      existing.displayName === content.display_name &&
      existing.description === content.description
    ) {
      return false;
    }

    const info: AgentInfo = {
      agentId: content.agent_id,
      userId,
      displayName: content.display_name,
      description: content.description,
      capabilities: content.capabilities ?? [],
      status: existing?.status ?? "offline",
      avatarUrl: content.avatar_url,
      lastActive: existing?.lastActive,
    };

    this.agents.set(content.agent_id, info);
    this.userIdToAgentId.set(userId, content.agent_id);
    return true;
  }

  private updateStatus(userId: string, content: AgentStatusEventContent): boolean {
    const agentId = content.agent_id;
    let info = this.agents.get(agentId);

    if (!info) {
      // Agent sent status but we haven't seen a register event yet — create a stub
      info = {
        agentId,
        userId,
        displayName: content.display_name ?? userId,
        description: "",
        capabilities: content.capabilities ?? [],
        status: content.status,
        avatarUrl: content.avatar_url,
        lastActive: content.last_active,
      };
      this.agents.set(agentId, info);
      this.userIdToAgentId.set(userId, agentId);
      return true;
    }

    if (info.status === content.status && info.lastActive === content.last_active) {
      return false;
    }

    info.status = content.status;
    info.lastActive = content.last_active;
    if (content.display_name) info.displayName = content.display_name;
    if (content.capabilities) info.capabilities = content.capabilities;
    return true;
  }
}
