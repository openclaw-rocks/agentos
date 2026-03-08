import React, { useState, useEffect, useRef, useCallback } from "react";
import * as sdk from "matrix-js-sdk";
import { useMatrix } from "~/lib/matrix-context";
import { AgentUIRenderer } from "./AgentUIRenderer";
import { EventTypes } from "@openclaw/matrix-events";

interface ChatViewProps {
  roomId: string;
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
}

export function ChatView({ roomId, onToggleAgentPanel }: ChatViewProps) {
  const { client } = useMatrix();
  const [messages, setMessages] = useState<TimelineMessage[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const room = client.getRoom(roomId);

  const loadMessages = useCallback(() => {
    if (!room) return;
    const timeline = room.getLiveTimeline().getEvents();
    const msgs: TimelineMessage[] = timeline
      .filter(
        (e) =>
          e.getType() === "m.room.message" ||
          e.getType() === EventTypes.UI ||
          e.getType() === EventTypes.Task ||
          e.getType() === EventTypes.Status,
      )
      .map((e) => ({
        id: e.getId()!,
        sender: e.getSender()!,
        senderName: room.getMember(e.getSender()!)?.name ?? e.getSender()!,
        type: e.getType(),
        content: e.getContent(),
        timestamp: e.getTs(),
        isAgent: e.getSender()?.includes("agent-") ?? false,
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
          <h2 className="text-sm font-semibold text-white">{roomName}</h2>
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
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className="group">
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
            placeholder="Message..."
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
