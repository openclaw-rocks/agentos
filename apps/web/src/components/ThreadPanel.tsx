import React, { useState, useEffect, useRef, useCallback } from "react";
import * as sdk from "matrix-js-sdk";
import { useMatrix } from "~/lib/matrix-context";
import { AgentUIRenderer } from "./AgentUIRenderer";
import { EventTypes } from "@openclaw/matrix-events";

interface ThreadPanelProps {
  roomId: string;
  threadRootId: string;
  onClose: () => void;
}

interface ThreadMessage {
  id: string;
  sender: string;
  senderName: string;
  type: string;
  content: Record<string, unknown>;
  timestamp: number;
  isAgent: boolean;
  isRoot: boolean;
}

export function ThreadPanel({ roomId, threadRootId, onClose }: ThreadPanelProps) {
  const { client } = useMatrix();
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const room = client.getRoom(roomId);

  const loadThread = useCallback(() => {
    if (!room) return;
    const timeline = room.getLiveTimeline().getEvents();

    const threadMessages: ThreadMessage[] = [];

    for (const e of timeline) {
      const eventId = e.getId()!;
      const type = e.getType();
      const isRelevant = type === "m.room.message" || type === EventTypes.UI;
      if (!isRelevant) continue;

      // Include the root message
      if (eventId === threadRootId) {
        threadMessages.push({
          id: eventId,
          sender: e.getSender()!,
          senderName: room.getMember(e.getSender()!)?.name ?? e.getSender()!,
          type,
          content: e.getContent(),
          timestamp: e.getTs(),
          isAgent: e.getSender()?.includes("agent-") ?? false,
          isRoot: true,
        });
        continue;
      }

      // Include replies to this thread
      const relation = e.getContent()?.["m.relates_to"];
      if (relation?.rel_type === "m.thread" && relation.event_id === threadRootId) {
        threadMessages.push({
          id: eventId,
          sender: e.getSender()!,
          senderName: room.getMember(e.getSender()!)?.name ?? e.getSender()!,
          type,
          content: e.getContent(),
          timestamp: e.getTs(),
          isAgent: e.getSender()?.includes("agent-") ?? false,
          isRoot: false,
        });
      }
    }

    threadMessages.sort((a, b) => a.timestamp - b.timestamp);
    setMessages(threadMessages);
  }, [room, threadRootId]);

  useEffect(() => {
    loadThread();

    const onTimeline = () => loadThread();
    client.on(sdk.RoomEvent.Timeline, onTimeline);

    return () => {
      client.removeListener(sdk.RoomEvent.Timeline, onTimeline);
    };
  }, [client, loadThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendReply = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");

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
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Thread messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={msg.isRoot ? "pb-3 border-b border-border" : ""}
          >
            <div className="flex items-start gap-2.5">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  msg.isAgent
                    ? "bg-accent/20 text-accent"
                    : "bg-surface-3 text-gray-400"
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
                    components={msg.content.components as import("@openclaw/matrix-events").AnyUIComponent[]}
                    onAction={(action, data) => {
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
        ))}
        <div ref={messagesEndRef} />
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
