import React, { useState, useMemo, useSyncExternalStore } from "react";
import type { ThreadSummary } from "~/lib/event-store";
import { useMatrix } from "~/lib/matrix-context";

type ThreadTab = "all" | "my";

interface ThreadListPanelProps {
  roomId: string;
  onOpenThread: (threadRootId: string) => void;
  onClose: () => void;
}

function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

function ThreadItem({
  summary,
  onOpenThread,
  unreadCount,
}: {
  summary: ThreadSummary;
  onOpenThread: (threadRootId: string) => void;
  unreadCount: number;
}) {
  const rootBody = (summary.rootMessage.content.body as string) ?? "";
  const lastReplyBody = summary.lastReply ? ((summary.lastReply.content.body as string) ?? "") : "";

  return (
    <button
      onClick={() => onOpenThread(summary.rootMessage.id)}
      className="w-full text-left px-4 py-3 hover:bg-surface-1/50 transition-colors border-b border-border"
    >
      {/* Root message preview */}
      <div className="flex items-start gap-2 mb-1.5">
        <div
          className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
            summary.rootMessage.isAgent ? "bg-accent/20 text-accent" : "bg-surface-3 text-secondary"
          }`}
        >
          <span className="text-[9px] font-medium">
            {summary.rootMessage.senderName.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-xs font-medium ${
                summary.rootMessage.isAgent ? "text-accent" : "text-primary"
              }`}
            >
              {summary.rootMessage.senderName}
            </span>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-semibold bg-accent text-inverse rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <p className="text-xs text-secondary mt-0.5 line-clamp-2">
            {truncateText(rootBody, 120)}
          </p>
        </div>
      </div>

      {/* Latest reply preview */}
      {summary.lastReply && (
        <div className="ml-8 flex items-start gap-2 mb-1">
          <div
            className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
              summary.lastReply.isAgent ? "bg-accent/15 text-accent" : "bg-surface-3 text-muted"
            }`}
          >
            <span className="text-[8px] font-medium">
              {summary.lastReply.senderName.charAt(0).toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-secondary line-clamp-1 min-w-0 flex-1">
            <span className="text-secondary font-medium">{summary.lastReply.senderName}</span>
            {": "}
            {truncateText(lastReplyBody, 80)}
          </p>
        </div>
      )}

      {/* Thread meta */}
      <div className="ml-8 flex items-center gap-3 text-[10px] text-muted">
        <span>
          {summary.replyCount} {summary.replyCount === 1 ? "reply" : "replies"}
        </span>
        <span>{formatRelativeTime(summary.latestActivity)}</span>
      </div>
    </button>
  );
}

export function ThreadListPanel({ roomId, onOpenThread, onClose }: ThreadListPanelProps) {
  const { client, eventStore, unreadTracker } = useMatrix();
  const [activeTab, setActiveTab] = useState<ThreadTab>("all");
  const userId = client.getUserId() ?? "";

  // Subscribe to unread tracker changes so badges re-render
  useSyncExternalStore(unreadTracker.subscribe, unreadTracker.getVersion);

  const totalThreadUnreads = unreadTracker.getTotalThreadUnreadCount(roomId);

  const summaries = useSyncExternalStore(eventStore.subscribe, () =>
    eventStore.getThreadSummaries(roomId),
  );

  const filteredSummaries = useMemo((): ThreadSummary[] => {
    if (activeTab === "all") return summaries;
    return summaries.filter(
      (s) => s.rootMessage.sender === userId || (s.lastReply && s.lastReply.sender === userId),
    );
  }, [summaries, activeTab, userId]);

  return (
    <div className="w-80 flex-shrink-0 border-l border-border flex flex-col bg-surface-0">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-primary">Threads</h3>
          {totalThreadUnreads > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-semibold bg-accent text-inverse rounded-full">
              {totalThreadUnreads}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 text-muted hover:text-secondary hover:bg-surface-3 rounded transition-colors"
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

      {/* Tabs */}
      <div className="flex border-b border-border flex-shrink-0">
        <button
          onClick={() => setActiveTab("all")}
          className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "all"
              ? "text-accent border-b-2 border-accent"
              : "text-secondary hover:text-secondary"
          }`}
        >
          All Threads
        </button>
        <button
          onClick={() => setActiveTab("my")}
          className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "my"
              ? "text-accent border-b-2 border-accent"
              : "text-secondary hover:text-secondary"
          }`}
        >
          My Threads
        </button>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {filteredSummaries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <svg
              className="w-10 h-10 text-faint mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <p className="text-sm text-muted">
              {activeTab === "my"
                ? "You haven't participated in any threads yet."
                : "No threads in this channel yet."}
            </p>
            <p className="text-xs text-faint mt-1">
              Threads will appear here when someone replies in a thread.
            </p>
          </div>
        ) : (
          filteredSummaries.map((summary) => (
            <ThreadItem
              key={summary.rootMessage.id}
              summary={summary}
              onOpenThread={onOpenThread}
              unreadCount={unreadTracker.getThreadUnreadCount(roomId, summary.rootMessage.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
