import type { AgentInfo, AutoJoinRule } from "@openclaw/protocol";

interface RegisteredAgent {
  info: AgentInfo;
  matrixUserId: string;
  autoJoinRules: AutoJoinRule[];
}

/**
 * Manages the registry of available agents and their auto-join rules.
 */
export class AgentRegistry {
  private agents = new Map<string, RegisteredAgent>();

  /** Register an agent */
  register(matrixUserId: string, info: AgentInfo, autoJoinRules: AutoJoinRule[] = []): void {
    this.agents.set(info.id, { info, matrixUserId, autoJoinRules });
    console.log(`[registry] Registered agent: ${info.id} (${info.displayName}) as ${matrixUserId}`);
  }

  /** Unregister an agent */
  unregister(agentId: string): void {
    this.agents.delete(agentId);
    console.log(`[registry] Unregistered agent: ${agentId}`);
  }

  /** Get agent by its logical ID */
  getAgent(agentId: string): RegisteredAgent | undefined {
    return this.agents.get(agentId);
  }

  /** Get agent by Matrix user ID */
  getAgentByUserId(userId: string): RegisteredAgent | undefined {
    for (const agent of this.agents.values()) {
      if (agent.matrixUserId === userId) return agent;
    }
    return undefined;
  }

  /** List all registered agents */
  listAgents(): RegisteredAgent[] {
    return Array.from(this.agents.values());
  }

  /** Find agents whose auto-join rules match a room name/alias */
  findMatchingAgents(roomNameOrAlias: string): RegisteredAgent[] {
    const matches: RegisteredAgent[] = [];

    for (const agent of this.agents.values()) {
      for (const rule of agent.autoJoinRules) {
        if (matchGlob(rule.pattern, roomNameOrAlias)) {
          matches.push(agent);
          break;
        }
      }
    }

    return matches;
  }
}

/** Simple glob matching (supports * and ?) */
function matchGlob(pattern: string, str: string): boolean {
  const regex = new RegExp(
    "^" +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".") +
      "$",
    "i",
  );
  return regex.test(str);
}
