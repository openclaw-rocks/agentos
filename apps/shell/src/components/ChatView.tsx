import { useVirtualizer } from "@tanstack/react-virtual";
import React, { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { MessageRow } from "./MessageRow";
import { useMatrix } from "~/lib/matrix-context";

interface ChatViewProps {
  roomId: string;
  onOpenThread: (eventId: string) => void;
  onToggleAgentPanel: () => void;
}

export function ChatView({ roomId, onOpenThread, onToggleAgentPanel }: ChatViewProps) {
  const { client, eventStore } = useMatrix();
  const [input, setInput] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);
  const room = client.getRoom(roomId);

  // Subscribe to the event store for this room's messages
  const messages = useSyncExternalStore(eventStore.subscribe, () =>
    eventStore.getMessagesForRoom(roomId),
  );

  // Virtualizer with dynamic measurement
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 15,
  });

  // Auto-scroll to bottom when new messages arrive (if user was already at bottom)
  useEffect(() => {
    if (messages.length === 0) return;
    if (wasAtBottomRef.current) {
      requestAnimationFrame(() => {
        const el = parentRef.current;
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      });
    }
  }, [messages.length]);

  // Track whether user is scrolled to bottom
  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    const threshold = 100;
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

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

  const handleSendEvent = useCallback(
    (type: string, content: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.sendEvent(roomId, type as any, content);
    },
    [client, roomId],
  );

  const roomName = room?.name ?? roomId;

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-white"># {roomName}</h2>
          <p className="text-xs text-gray-500">{room?.getJoinedMemberCount() ?? 0} members</p>
        </div>
        <button
          onClick={onToggleAgentPanel}
          className="px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-surface-2 hover:bg-surface-3 rounded-lg transition-colors"
        >
          Agents
        </button>
      </div>

      {/* Virtualized messages */}
      <div ref={parentRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => (
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
              <MessageRow
                msg={messages[virtualRow.index]}
                roomId={roomId}
                onOpenThread={onOpenThread}
                onSendEvent={handleSendEvent}
              />
            </div>
          ))}
        </div>
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
