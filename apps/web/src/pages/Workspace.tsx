import React, { useState } from "react";
import { useMatrix } from "~/lib/matrix-context";
import { WorkspaceRail } from "~/components/WorkspaceRail";
import { ChannelList } from "~/components/ChannelList";
import { ChatView } from "~/components/ChatView";
import { ThreadPanel } from "~/components/ThreadPanel";
import { AgentPanel } from "~/components/AgentPanel";

interface WorkspaceProps {
  onLogout: () => void;
}

export function Workspace({ onLogout }: WorkspaceProps) {
  const { ready } = useMatrix();
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showAgentPanel, setShowAgentPanel] = useState(false);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-0">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Syncing with homeserver...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-surface-0">
      {/* Workspace rail */}
      <WorkspaceRail
        selectedSpaceId={selectedSpaceId}
        onSelectSpace={(id) => {
          setSelectedSpaceId(id);
          setSelectedRoomId(null);
          setActiveThreadId(null);
        }}
        onLogout={onLogout}
      />

      {/* Channel list */}
      <ChannelList
        spaceId={selectedSpaceId}
        selectedRoomId={selectedRoomId}
        onSelectRoom={(id) => {
          setSelectedRoomId(id);
          setActiveThreadId(null);
        }}
      />

      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedRoomId ? (
          <ChatView
            roomId={selectedRoomId}
            onOpenThread={setActiveThreadId}
            onToggleAgentPanel={() => setShowAgentPanel(!showAgentPanel)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-medium text-gray-400 mb-1">Welcome to OpenClaw</p>
              <p className="text-sm text-gray-500">Select a channel to start</p>
            </div>
          </div>
        )}
      </div>

      {/* Thread panel */}
      {activeThreadId && selectedRoomId && (
        <ThreadPanel
          roomId={selectedRoomId}
          threadRootId={activeThreadId}
          onClose={() => setActiveThreadId(null)}
        />
      )}

      {/* Agent panel */}
      {showAgentPanel && selectedRoomId && (
        <div className="w-72 flex-shrink-0 border-l border-border">
          <AgentPanel roomId={selectedRoomId} />
        </div>
      )}
    </div>
  );
}
