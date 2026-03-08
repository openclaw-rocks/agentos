import React, { useState } from "react";
import { useMatrix } from "~/lib/matrix-context";
import { RoomList } from "~/components/RoomList";
import { ChatView } from "~/components/ChatView";
import { AgentPanel } from "~/components/AgentPanel";

interface WorkspaceProps {
  onLogout: () => void;
}

export function Workspace({ onLogout }: WorkspaceProps) {
  const { client, ready } = useMatrix();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [showAgentPanel, setShowAgentPanel] = useState(true);

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
      {/* Sidebar — Room list */}
      <div className="w-64 flex-shrink-0 border-r border-border flex flex-col">
        <div className="h-14 flex items-center justify-between px-4 border-b border-border">
          <h1 className="text-sm font-semibold text-white">OpenClaw</h1>
          <button
            onClick={onLogout}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Logout
          </button>
        </div>
        <RoomList
          selectedRoomId={selectedRoomId}
          onSelectRoom={setSelectedRoomId}
        />
      </div>

      {/* Main content — Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedRoomId ? (
          <ChatView
            roomId={selectedRoomId}
            onToggleAgentPanel={() => setShowAgentPanel(!showAgentPanel)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-medium text-gray-400 mb-1">Welcome to OpenClaw</p>
              <p className="text-sm text-gray-500">Select a room to start</p>
            </div>
          </div>
        )}
      </div>

      {/* Right panel — Agent info */}
      {showAgentPanel && selectedRoomId && (
        <div className="w-72 flex-shrink-0 border-l border-border">
          <AgentPanel roomId={selectedRoomId} />
        </div>
      )}
    </div>
  );
}
