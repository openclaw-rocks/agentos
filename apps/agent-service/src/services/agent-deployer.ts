/**
 * Handles deploying agents (joining them to rooms) via the Matrix CS API.
 * Uses the Application Service's ability to act on behalf of managed users.
 */
export class AgentDeployer {
  private deployedRooms = new Map<string, Set<string>>(); // agentUserId -> Set<roomId>

  constructor(
    private homeserverUrl: string,
    private asToken: string,
    private domain: string,
    private agentPrefix: string,
  ) {}

  /** Deploy an agent to a room (join on their behalf) */
  async deployToRoom(agentUserId: string, roomId: string): Promise<void> {
    // Track deployments
    if (!this.deployedRooms.has(agentUserId)) {
      this.deployedRooms.set(agentUserId, new Set());
    }
    const rooms = this.deployedRooms.get(agentUserId)!;
    if (rooms.has(roomId)) return; // Already deployed

    // Ensure the agent user exists
    await this.ensureUser(agentUserId);

    // Join the room on behalf of the agent
    const url = `${this.homeserverUrl}/_matrix/client/v3/join/${encodeURIComponent(roomId)}?user_id=${encodeURIComponent(agentUserId)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.asToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to join room: ${res.status} ${body}`);
    }

    rooms.add(roomId);
    console.log(`[deployer] Deployed ${agentUserId} to ${roomId}`);
  }

  /** Remove an agent from a room */
  async removeFromRoom(agentUserId: string, roomId: string): Promise<void> {
    const url = `${this.homeserverUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/leave?user_id=${encodeURIComponent(agentUserId)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.asToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to leave room: ${res.status} ${body}`);
    }

    this.deployedRooms.get(agentUserId)?.delete(roomId);
    console.log(`[deployer] Removed ${agentUserId} from ${roomId}`);
  }

  /** Ensure an agent user exists on the homeserver */
  private async ensureUser(userId: string): Promise<void> {
    const localpart = userId.split(":")[0].slice(1); // @agent-foo:domain -> agent-foo

    const url = `${this.homeserverUrl}/_matrix/client/v3/register`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.asToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "m.login.application_service",
        username: localpart,
      }),
    });

    // 400 with M_USER_IN_USE means user already exists — that's fine
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if ((body as Record<string, unknown>).errcode !== "M_USER_IN_USE") {
        console.warn(`[deployer] User registration for ${userId}: ${JSON.stringify(body)}`);
      }
    }
  }

  /** Get the Matrix user ID for an agent */
  agentUserId(agentId: string): string {
    return `@${this.agentPrefix}${agentId}:${this.domain}`;
  }
}
