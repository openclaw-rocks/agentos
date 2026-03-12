import { EventTypes } from "@openclaw/protocol";
import type { AnyUIComponent } from "@openclaw/protocol";
import React, { useCallback, useSyncExternalStore } from "react";
import { AgentUIRenderer } from "./AgentUIRenderer";
import { useMatrix } from "~/lib/matrix-context";

interface CanvasViewProps {
  roomId: string;
}

export function CanvasView({ roomId }: CanvasViewProps) {
  const { client, eventStore } = useMatrix();

  const messages = useSyncExternalStore(eventStore.subscribe, () =>
    eventStore.getMessagesForRoom(roomId),
  );

  // Filter to only A2UI events for the canvas grid
  const uiMessages = messages.filter((msg) => msg.type === EventTypes.UI);

  const handleAction = useCallback(
    (action: string, data?: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.sendEvent(roomId, EventTypes.Action as any, { action, data });
    },
    [client, roomId],
  );

  if (uiMessages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-surface-2 flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-6 h-6 text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
              />
            </svg>
          </div>
          <p className="text-sm text-secondary mb-1">No UI components yet</p>
          <p className="text-xs text-muted">
            Agent UI components will appear here as cards in a grid layout
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {uiMessages.map((msg) => (
          <div
            key={msg.id}
            className="bg-surface-1 border border-border rounded-xl p-4 overflow-hidden"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded bg-accent/20 flex items-center justify-center">
                <span className="text-[9px] font-bold text-accent">
                  {msg.senderName.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-xs font-medium text-accent truncate">{msg.senderName}</span>
              <span className="text-[10px] text-faint ml-auto">
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <AgentUIRenderer
              components={msg.content.components as AnyUIComponent[]}
              onAction={handleAction}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
