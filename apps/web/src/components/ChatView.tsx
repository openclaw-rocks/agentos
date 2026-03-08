import React, { useState, useEffect, useRef, useCallback } from "react";
import * as sdk from "matrix-js-sdk";
import { useMatrix } from "~/lib/matrix-context";
import { AgentUIRenderer } from "./AgentUIRenderer";
import { EventTypes } from "@openclaw/matrix-events";

interface ChatViewProps {
  roomId: string;
  onOpenThread: (eventId: string) => void;
  onToggleAgentPanel: () => void;
}

interface TimelineMessage {
  id: string;
  sender: string;
  senderName: string;
  type: string;
  content: Record<string, unknown>;
  timestamp: number;
  isAgent: boolean;
  threadRootId?: string;
  replyCount: number;
}

export function ChatView({ roomId, onOpenThread, onToggleAgentPanel }: ChatViewProps) {
  const { client } = useMatrix();
  const [messages, setMessages] = useState<TimelineMessage[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const room = client.getRoom(roomId);

  const loadMessages = useCallback(() => {
    if (!room) return;
    const timeline = room.getLiveTimeline().getEvents();

    // Count replies per thread root
    const threadReplyCounts = new Map<string, number>();
    const threadChildIds = new Set<string>();

    for (const e of timeline) {
      const relation = e.getContent()?.["m.relates_to"];
      if (relation?.rel_type === "m.thread" && relation.event_id) {
        const rootId = relation.event_id as string;
        threadReplyCounts.set(rootId, (threadReplyCounts.get(rootId) ?? 0) + 1);
        threadChildIds.add(e.getId()!);
      }
    }

    const msgs: TimelineMessage[] = timeline
      .filter((e) => {
        const type = e.getType();
        const isRelevant =
          type === "m.room.message" ||
          type === EventTypes.UI ||
          type === EventTypes.Task ||
          type === EventTypes.Status;
        if (!isRelevant) return false;

        // Hide thread replies from main timeline
        if (threadChildIds.has(e.getId()!)) return false;

        return true;
      })
      .map((e) => ({
        id: e.getId()!,
        sender: e.getSender()!,
        senderName: room.getMember(e.getSender()!)?.name ?? e.getSender()!,
        type: e.getType(),
        content: e.getContent(),
        timestamp: e.getTs(),
        isAgent: e.getSender()?.includes("agent-") ?? false,
        replyCount: threadReplyCounts.get(e.getId()!) ?? 0,
      }));
    setMessages(msgs);
  }, [room]);

  useEffect(() => {
    loadMessages();

    const onTimeline = () => loadMessages();
    client.on(sdk.RoomEvent.Timeline, onTimeline);

    return () => {
      client.removeListener(sdk.RoomEvent.Timeline, onTimeline);
    };
  }, [client, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await client.sendTextMessage(roomId, text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const roomName = room?.name ?? roomId;

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-white"># {roomName}</h2>
          <p className="text-xs text-gray-500">
            {room?.getJoinedMemberCount() ?? 0} members
          </p>
        </div>
        <button
          onClick={onToggleAgentPanel}
          className="px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-surface-2 hover:bg-surface-3 rounded-lg transition-colors"
        >
          Agents
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.map((msg) => (
          <div key={msg.id} className="group hover:bg-surface-1/50 -mx-2 px-2 py-1.5 rounded-lg transition-colors">
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  msg.isAgent
                    ? "bg-accent/20 text-accent"
                    : "bg-surface-3 text-gray-400"
                }`}
              >
                <span className="text-xs font-medium">
                  {msg.senderName.charAt(0).toUpperCase()}
                </span>
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span
                    className={`text-sm font-medium ${
                      msg.isAgent ? "text-accent" : "text-white"
                    }`}
                  >
                    {msg.senderName}
                  </span>
                  {msg.isAgent && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-accent/10 text-accent rounded font-medium uppercase tracking-wider">
                      Agent
                    </span>
                  )}
                  <span className="text-xs text-gray-600">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                {/* Render based on event type */}
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
                      });
                    }}
                  />
                )}

                {/* Thread indicator */}
                {msg.replyCount > 0 && (
                  <button
                    onClick={() => onOpenThread(msg.id)}
                    className="mt-1.5 flex items-center gap-1.5 text-accent hover:text-accent-hover text-xs transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span>{msg.replyCount} {msg.replyCount === 1 ? "reply" : "replies"}</span>
                  </button>
                )}
              </div>

              {/* Hover actions */}
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity flex-shrink-0">
                <button
                  onClick={() => onOpenThread(msg.id)}
                  className="p-1 text-gray-500 hover:text-gray-300 hover:bg-surface-3 rounded transition-colors"
                  title="Reply in thread"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 flex-shrink-0">
        <div className="flex items-end gap-2 bg-surface-1 border border-border rounded-xl px-4 py-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message #${roomName}...`}
            rows={1}
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 resize-none focus:outline-none"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-30 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
