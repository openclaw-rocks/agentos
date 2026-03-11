import { EventTypes } from "@openclaw/protocol";
import type { AnyUIComponent } from "@openclaw/protocol";
import React from "react";
import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AgentUIRenderer } from "./AgentUIRenderer";
import type { TimelineMessage } from "~/lib/event-store";

interface MessageRowProps {
  msg: TimelineMessage;
  roomId: string;
  onOpenThread: (eventId: string) => void;
  onSendEvent: (type: string, content: Record<string, unknown>) => void;
}

function ToolCallBadge({ content }: { content: Record<string, unknown> }) {
  const toolName = content.tool_name as string;
  const args = content.arguments as Record<string, unknown> | undefined;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 rounded-lg border border-border text-xs">
      <span className="text-gray-500">Tool call</span>
      <code className="text-accent font-mono">{toolName}</code>
      {args && Object.keys(args).length > 0 && (
        <span className="text-gray-600 truncate max-w-xs">({Object.keys(args).join(", ")})</span>
      )}
    </div>
  );
}

function ToolResultBadge({ content }: { content: Record<string, unknown> }) {
  const toolName = content.tool_name as string;
  const error = content.error as string | undefined;
  const durationMs = content.duration_ms as number | undefined;
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${
        error
          ? "bg-status-error/10 border-status-error/30"
          : "bg-status-success/10 border-status-success/30"
      }`}
    >
      <span className="text-gray-500">Result</span>
      <code className={`font-mono ${error ? "text-status-error" : "text-status-success"}`}>
        {toolName}
      </code>
      {error && <span className="text-status-error truncate max-w-xs">{error}</span>}
      {durationMs != null && <span className="text-gray-600">{durationMs}ms</span>}
    </div>
  );
}

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-xl font-bold text-white mt-4 mb-2">{children}</h1>,
  h2: ({ children }) => <h2 className="text-lg font-bold text-white mt-3 mb-1.5">{children}</h2>,
  h3: ({ children }) => (
    <h3 className="text-base font-semibold text-white mt-2 mb-1">{children}</h3>
  ),
  h4: ({ children }) => <h4 className="text-sm font-semibold text-white mt-2 mb-1">{children}</h4>,
  p: ({ children }) => <p className="text-sm text-gray-300 mb-2 last:mb-0">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-accent hover:underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return <code className={`${className ?? ""} text-xs font-mono`}>{children}</code>;
    }
    return <code className="bg-surface-3 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>;
  },
  pre: ({ children }) => (
    <pre className="bg-surface-3 rounded-lg p-3 overflow-x-auto my-2 text-xs font-mono text-gray-300">
      {children}
    </pre>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside text-sm text-gray-300 mb-2 ml-2 space-y-0.5">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside text-sm text-gray-300 mb-2 ml-2 space-y-0.5">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="text-sm text-gray-300">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-accent/50 pl-3 my-2 text-gray-400 italic">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="text-sm text-gray-300 border border-border rounded">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-2 text-white">{children}</thead>,
  th: ({ children }) => (
    <th className="px-3 py-1.5 text-left text-xs font-semibold border border-border">{children}</th>
  ),
  td: ({ children }) => <td className="px-3 py-1.5 text-xs border border-border">{children}</td>,
  hr: () => <hr className="border-border my-3" />,
  del: ({ children }) => <del className="text-gray-500 line-through">{children}</del>,
};

function MarkdownBody({ text }: { text: string }) {
  return (
    <div className="prose-invert max-w-none">
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </Markdown>
    </div>
  );
}

export const MessageRow = React.memo(function MessageRow({
  msg,
  roomId: _roomId,
  onOpenThread,
  onSendEvent,
}: MessageRowProps) {
  return (
    <div className="group hover:bg-surface-1/50 px-4 py-1.5 transition-colors">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
            msg.isAgent ? "bg-accent/20 text-accent" : "bg-surface-3 text-gray-400"
          }`}
        >
          <span className="text-xs font-medium">{msg.senderName.charAt(0).toUpperCase()}</span>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className={`text-sm font-medium ${msg.isAgent ? "text-accent" : "text-white"}`}>
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
          {msg.type === "m.room.message" && <MarkdownBody text={msg.content.body as string} />}

          {msg.type === EventTypes.UI && (
            <AgentUIRenderer
              components={msg.content.components as AnyUIComponent[]}
              onAction={(action, data) => {
                onSendEvent(EventTypes.Action, {
                  action,
                  data,
                  agent_id: msg.content.agent_id,
                  source_event_id: msg.id,
                });
              }}
            />
          )}

          {msg.type === EventTypes.ToolCall && <ToolCallBadge content={msg.content} />}
          {msg.type === EventTypes.ToolResult && <ToolResultBadge content={msg.content} />}

          {/* Thread indicator */}
          {msg.replyCount > 0 && (
            <button
              onClick={() => onOpenThread(msg.id)}
              className="mt-1.5 flex items-center gap-1.5 text-accent hover:text-accent-hover text-xs transition-colors"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <span>
                {msg.replyCount} {msg.replyCount === 1 ? "reply" : "replies"}
              </span>
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
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
});
