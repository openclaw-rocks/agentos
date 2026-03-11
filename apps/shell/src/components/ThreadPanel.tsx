import { EventTypes } from "@openclaw/protocol";
import type { AnyUIComponent } from "@openclaw/protocol";
import { useVirtualizer } from "@tanstack/react-virtual";
import React, { useState, useRef, useSyncExternalStore } from "react";
import { AgentUIRenderer } from "./AgentUIRenderer";
import { useMatrix } from "~/lib/matrix-context";

interface ThreadPanelProps {
  roomId: string;
  threadRootId: string;
  onClose: () => void;
}

export function ThreadPanel({ roomId, threadRootId, onClose }: ThreadPanelProps) {
  const { client, eventStore } = useMatrix();
  const [input, setInput] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);
  const _room = client.getRoom(roomId);

  const messages = useSyncExternalStore(eventStore.subscribe, () =>
    eventStore.getThreadMessages(roomId, threadRootId),
  );

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });

  const sendReply = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await client.sendEvent(roomId, "m.room.message" as any, {
      msgtype: "m.text",
      body: text,
      "m.relates_to": {
        rel_type: "m.thread",
        event_id: threadRootId,
        is_falling_back: true,
        "m.in_reply_to": {
          event_id: threadRootId,
        },
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  };

  return (
    <div className="w-96 flex-shrink-0 border-l border-border flex flex-col bg-surface-0">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
        <h3 className="text-sm font-semibold text-white">Thread</h3>
        <button
          onClick={onClose}
          className="p-1 text-gray-500 hover:text-gray-300 hover:bg-surface-3 rounded transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Virtualized thread messages */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const msg = messages[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className={`px-4 py-2 ${msg.isRoot ? "pb-3 border-b border-border" : ""}`}>
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        msg.isAgent ? "bg-accent/20 text-accent" : "bg-surface-3 text-gray-400"
                      }`}
                    >
                      <span className="text-[10px] font-medium">
                        {msg.senderName.charAt(0).toUpperCase()}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span
                          className={`text-xs font-medium ${
                            msg.isAgent ? "text-accent" : "text-white"
                          }`}
                        >
                          {msg.senderName}
                        </span>
                        <span className="text-[10px] text-gray-600">
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      {msg.type === "m.room.message" && (
                        <p className="text-sm text-gray-300 whitespace-pre-wrap">
                          {msg.content.body as string}
                        </p>
                      )}

                      {msg.type === EventTypes.UI && (
                        <AgentUIRenderer
                          components={msg.content.components as AnyUIComponent[]}
                          onAction={(action, data) => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            client.sendEvent(roomId, EventTypes.UI as any, {
                              action,
                              data,
                              agent_id: msg.content.agent_id,
                              source_event: msg.id,
                              "m.relates_to": {
                                rel_type: "m.thread",
                                event_id: threadRootId,
                              },
                            });
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {msg.isRoot && messages.length > 1 && (
                    <p className="text-[10px] text-gray-500 mt-2 ml-9">
                      {messages.length - 1} {messages.length === 2 ? "reply" : "replies"}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Thread reply input */}
      <div className="px-4 pb-4 flex-shrink-0">
        <div className="flex items-end gap-2 bg-surface-1 border border-border rounded-xl px-3 py-2.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply in thread..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 resize-none focus:outline-none"
          />
          <button
            onClick={sendReply}
            disabled={!input.trim()}
            className="px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-30 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Reply
          </button>
        </div>
      </div>
    </div>
  );
}
