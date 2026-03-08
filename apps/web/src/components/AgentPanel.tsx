import React, { useMemo } from "react";
import { useMatrix } from "~/lib/matrix-context";

interface AgentPanelProps {
  roomId: string;
}

export function AgentPanel({ roomId }: AgentPanelProps) {
  const { client } = useMatrix();
  const room = client.getRoom(roomId);

  const { agents, humans } = useMemo(() => {
    if (!room) return { agents: [], humans: [] };
    const members = room.getJoinedMembers();
    const agentList = members.filter((m) => m.userId.includes("agent-"));
    const humanList = members.filter((m) => !m.userId.includes("agent-"));
    return { agents: agentList, humans: humanList };
  }, [room]);

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 flex items-center px-4 border-b border-border">
        <h3 className="text-sm font-semibold text-white">Members</h3>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        {/* Agents section */}
        {agents.length > 0 && (
          <div className="mb-4">
            <p className="px-4 mb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              Agents — {agents.length}
            </p>
            {agents.map((agent) => (
              <div
                key={agent.userId}
                className="flex items-center gap-3 px-4 py-1.5 hover:bg-surface-2 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-accent">
                    {(agent.name ?? agent.userId).charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-accent truncate">
                    {agent.name ?? agent.userId}
                  </p>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-status-success" />
                    <span className="text-[10px] text-gray-500">Online</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Humans section */}
        <div>
          <p className="px-4 mb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            People — {humans.length}
          </p>
          {humans.map((human) => (
            <div
              key={human.userId}
              className="flex items-center gap-3 px-4 py-1.5 hover:bg-surface-2 transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-surface-3 flex items-center justify-center">
                <span className="text-[10px] font-bold text-gray-400">
                  {(human.name ?? human.userId).charAt(0).toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-gray-300 truncate">
                {human.name ?? human.userId}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
