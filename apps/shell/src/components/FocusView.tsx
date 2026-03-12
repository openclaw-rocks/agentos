import { EventTypes } from "@openclaw/protocol";
import type { AnyUIComponent } from "@openclaw/protocol";
import React, { useCallback, useSyncExternalStore } from "react";
import { AgentUIRenderer } from "./AgentUIRenderer";
import { useMatrix } from "~/lib/matrix-context";

interface FocusViewProps {
  roomId: string;
}

export function FocusView({ roomId }: FocusViewProps) {
  const { client, eventStore } = useMatrix();

  const messages = useSyncExternalStore(eventStore.subscribe, () =>
    eventStore.getMessagesForRoom(roomId),
  );

  // Find the most recent A2UI component
  const latestUI = [...messages].reverse().find((msg) => msg.type === EventTypes.UI);

  const handleAction = useCallback(
    (action: string, data?: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.sendEvent(roomId, EventTypes.Action as any, { action, data });
    },
    [client, roomId],
  );

  if (!latestUI) {
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
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
              />
            </svg>
          </div>
          <p className="text-sm text-secondary mb-1">No UI component to focus on</p>
          <p className="text-xs text-muted">
            The most recent agent UI component will appear here full-screen
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      {/* Focused component header */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border flex-shrink-0">
        <div className="w-6 h-6 rounded bg-accent/20 flex items-center justify-center">
          <span className="text-[10px] font-bold text-accent">
            {latestUI.senderName.charAt(0).toUpperCase()}
          </span>
        </div>
        <span className="text-xs font-medium text-accent">{latestUI.senderName}</span>
        <span className="text-[10px] text-faint">
          {new Date(latestUI.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* Full-size component rendering */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-3xl mx-auto">
          <AgentUIRenderer
            components={latestUI.content.components as AnyUIComponent[]}
            onAction={handleAction}
          />
        </div>
      </div>
    </div>
  );
}
