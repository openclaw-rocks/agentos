import React, { useMemo, useSyncExternalStore } from "react";
import { UserAvatar } from "./UserAvatar";
import type { AgentInfo } from "~/lib/agent-registry";
import { useMatrix } from "~/lib/matrix-context";

interface AgentPanelProps {
  roomId: string;
}

const STATUS_LABELS: Record<string, string> = {
  online: "Online",
  busy: "Busy",
  starting: "Starting",
  error: "Error",
  offline: "Offline",
};

export function AgentPanel({ roomId }: AgentPanelProps): React.ReactElement {
  const { client, homeserverUrl, agentRegistry } = useMatrix();
  const room = client.getRoom(roomId);

  // Re-render when agent registry changes
  useSyncExternalStore(agentRegistry.subscribe, agentRegistry.getVersion);

  const { agents, humans } = useMemo(() => {
    if (!room)
      return {
        agents: [] as AgentInfo[],
        humans: [] as { userId: string; name: string; avatarMxc?: string }[],
      };

    const roomAgents = agentRegistry.getAgentsInRoom(room);
    const roomHumans = agentRegistry.getHumansInRoom(room).map((m) => ({
      userId: m.userId,
      name: m.name ?? m.userId,
      avatarMxc: m.getMxcAvatarUrl() ?? undefined,
    }));

    return { agents: roomAgents, humans: roomHumans };
  }, [room, agentRegistry]);

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 flex items-center px-4 border-b border-border">
        <h3 className="text-sm font-semibold text-primary">Members</h3>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        {/* Agents section */}
        {agents.length > 0 && (
          <div className="mb-4">
            <p className="px-4 mb-2 text-[10px] font-semibold text-muted uppercase tracking-wider">
              Agents — {agents.length}
            </p>
            {agents.map((agent) => (
              <div
                key={agent.agentId}
                className="flex items-center gap-3 px-4 py-1.5 hover:bg-surface-2 transition-colors"
              >
                <UserAvatar
                  displayName={agent.displayName}
                  avatarMxcUrl={agent.avatarUrl}
                  homeserverUrl={homeserverUrl}
                  isAgent={true}
                  size="sm"
                  showStatusDot={true}
                  agentStatus={agent.status}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-accent truncate">{agent.displayName}</p>
                  <p className="text-[10px] text-muted truncate">
                    {STATUS_LABELS[agent.status] ?? agent.status}
                    {agent.capabilities.length > 0 && (
                      <> · {agent.capabilities.slice(0, 3).join(", ")}</>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Humans section */}
        <div>
          <p className="px-4 mb-2 text-[10px] font-semibold text-muted uppercase tracking-wider">
            People — {humans.length}
          </p>
          {humans.map((human) => {
            // Get presence for this human
            const user = client.getUser(human.userId);
            const presence =
              user?.presence === "online"
                ? ("online" as const)
                : user?.presence === "unavailable"
                  ? ("unavailable" as const)
                  : ("offline" as const);

            return (
              <div
                key={human.userId}
                className="flex items-center gap-3 px-4 py-1.5 hover:bg-surface-2 transition-colors"
              >
                <UserAvatar
                  displayName={human.name}
                  avatarMxcUrl={human.avatarMxc}
                  homeserverUrl={homeserverUrl}
                  size="sm"
                  showStatusDot={true}
                  presence={presence}
                />
                <p className="text-xs text-secondary truncate">{human.name}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
