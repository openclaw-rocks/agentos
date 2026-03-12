import { EventTypes } from "@openclaw/protocol";
import type { AnyUIComponent } from "@openclaw/protocol";
import React, { useState, useMemo, useCallback, useRef } from "react";
import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AgentUIRenderer } from "./AgentUIRenderer";
import { BridgeIcon } from "./BridgeStatusBadge";
import { EditHistoryModal } from "./EditHistoryModal";
import { EventSourceModal } from "./EventSourceModal";
import { ImageLightbox } from "./ImageLightbox";
import { LinkPreview } from "./LinkPreview";
import { LocationDisplay } from "./LocationDisplay";
import { MessageContextMenu } from "./MessageContextMenu";
import { ReadReceipts } from "./ReadReceipts";
import { SpoilerText } from "./SpoilerText";
import { UserAvatar } from "./UserAvatar";
import { UserProfileCard } from "./UserProfileCard";
import { VoiceMessagePlayer } from "./VoiceMessagePlayer";
import { isBridgedUser, getBridgeProtocol } from "~/lib/bridge-detection";
import type { TimelineMessage } from "~/lib/event-store";
import { formatFileSize } from "~/lib/file-upload";
import { extractUrls } from "~/lib/link-preview";
import { useMatrix } from "~/lib/matrix-context";
import { makePermalink } from "~/lib/permalink";
import { containsSpoiler, parseSpoilers } from "~/lib/spoiler-utils";
import {
  formatMessageTimestamp,
  isEmojiOnly,
  IMAGE_SIZE_CLASSES,
  type MessageLayout,
  type ImageSize,
} from "~/lib/theme";

const QUICK_REACTIONS = [
  "\u{1F44D}",
  "\u{2764}\u{FE0F}",
  "\u{1F602}",
  "\u{1F389}",
  "\u{1F440}",
  "\u{1F680}",
];

interface MessageRowProps {
  msg: TimelineMessage;
  roomId: string;
  userId: string;
  reactions: Map<string, Set<string>>;
  onOpenThread: (eventId: string) => void;
  onSendEvent: (type: string, content: Record<string, unknown>) => void;
  onSendReaction: (eventId: string, emoji: string) => void;
  onRetry?: (failedMsg: { id: string; content: Record<string, unknown> }) => void;
  onEdit?: (eventId: string, currentBody: string) => void;
  onDelete?: (eventId: string) => void;
  onReply?: (eventId: string, senderName: string, body: string) => void;
  onForward?: (
    eventId: string,
    senderName: string,
    body: string,
    msgtype: string,
    content: Record<string, unknown>,
  ) => void;
  onReport?: (eventId: string) => void;
  onNavigateRoom?: (roomId: string) => void;
  mxcToHttp: (mxcUrl: string) => string | null;
  /** When true, avatar and sender name are hidden (continuation message from the same sender). */
  isCollapsed?: boolean;
  /** Whether to show URL link previews. */
  showUrlPreviews?: boolean;
  /** Whether to render emoji-only messages with large font. */
  bigEmoji?: boolean;
  /** Whether to use 24-hour time format. */
  use24HourTime?: boolean;
  /** Whether to show seconds in timestamps. */
  showSeconds?: boolean;
  /** Whether to show read receipt indicators. */
  showReadReceipts?: boolean;
  /** Message layout mode: modern (default), irc, or bubble. */
  messageLayout?: MessageLayout;
  /** Image size in timeline: small, medium (default), or large. */
  imageSize?: ImageSize;
  /** Number of unread messages in this message's thread (for badge on thread button). */
  threadUnreadCount?: number;
}

function ToolCallBadge({ content }: { content: Record<string, unknown> }) {
  const toolName = content.tool_name as string;
  const args = content.arguments as Record<string, unknown> | undefined;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 rounded-lg border border-border text-xs">
      <span className="text-muted">Tool call</span>
      <code className="text-accent font-mono">{toolName}</code>
      {args && Object.keys(args).length > 0 && (
        <span className="text-faint truncate max-w-xs">({Object.keys(args).join(", ")})</span>
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
      <span className="text-muted">Result</span>
      <code className={`font-mono ${error ? "text-status-error" : "text-status-success"}`}>
        {toolName}
      </code>
      {error && <span className="text-status-error truncate max-w-xs">{error}</span>}
      {durationMs != null && <span className="text-faint">{durationMs}ms</span>}
    </div>
  );
}

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-xl font-bold text-primary mt-4 mb-2">{children}</h1>,
  h2: ({ children }) => <h2 className="text-lg font-bold text-primary mt-3 mb-1.5">{children}</h2>,
  h3: ({ children }) => (
    <h3 className="text-base font-semibold text-primary mt-2 mb-1">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold text-primary mt-2 mb-1">{children}</h4>
  ),
  p: ({ children }) => <p className="text-sm text-secondary mb-2 last:mb-0">{children}</p>,
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
  strong: ({ children }) => <strong className="font-semibold text-primary">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return <code className={`${className ?? ""} text-xs font-mono`}>{children}</code>;
    }
    return <code className="bg-surface-3 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>;
  },
  pre: ({ children }) => (
    <pre className="bg-surface-3 rounded-lg p-3 overflow-x-auto my-2 text-xs font-mono text-secondary">
      {children}
    </pre>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside text-sm text-secondary mb-2 ml-2 space-y-0.5">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside text-sm text-secondary mb-2 ml-2 space-y-0.5">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="text-sm text-secondary">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-accent/50 pl-3 my-2 text-secondary italic">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="text-sm text-secondary border border-border rounded">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-2 text-primary">{children}</thead>,
  th: ({ children }) => (
    <th className="px-3 py-1.5 text-left text-xs font-semibold border border-border">{children}</th>
  ),
  td: ({ children }) => <td className="px-3 py-1.5 text-xs border border-border">{children}</td>,
  hr: () => <hr className="border-border my-3" />,
  del: ({ children }) => <del className="text-muted line-through">{children}</del>,
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

function ReactionBadge({
  emoji,
  senders,
  userId,
  onReact,
  getDisplayName,
}: {
  emoji: string;
  senders: Set<string>;
  userId: string;
  onReact: (emoji: string) => void;
  getDisplayName: (senderId: string) => string;
}) {
  const [showPopover, setShowPopover] = useState(false);
  const isOwn = senders.has(userId);

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowPopover(true)}
      onMouseLeave={() => setShowPopover(false)}
    >
      <button
        onClick={() => onReact(emoji)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
          isOwn
            ? "bg-accent/15 border-accent/40 text-accent"
            : "bg-surface-2 border-border text-secondary hover:border-surface-4"
        }`}
      >
        <span>{emoji}</span>
        <span>{senders.size}</span>
      </button>

      {showPopover && (
        <div className="absolute bottom-full left-0 mb-1.5 z-50 bg-surface-2 border border-border rounded-lg shadow-lg p-2 text-xs whitespace-nowrap">
          <div className="flex flex-col gap-0.5">
            {Array.from(senders).map((senderId) => {
              const name = getDisplayName(senderId);
              const isSelf = senderId === userId;
              return (
                <span
                  key={senderId}
                  className={isSelf ? "text-accent font-medium" : "text-secondary"}
                >
                  {name}
                </span>
              );
            })}
          </div>
          <div className="text-muted mt-1 border-t border-border pt-1">reacted with {emoji}</div>
        </div>
      )}
    </div>
  );
}

function ReactionBar({
  reactions,
  userId,
  onReact,
  getDisplayName,
}: {
  reactions: Map<string, Set<string>>;
  userId: string;
  onReact: (emoji: string) => void;
  getDisplayName: (senderId: string) => string;
}) {
  if (reactions.size === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {Array.from(reactions.entries()).map(([emoji, senders]) => (
        <ReactionBadge
          key={emoji}
          emoji={emoji}
          senders={senders}
          userId={userId}
          onReact={onReact}
          getDisplayName={getDisplayName}
        />
      ))}
    </div>
  );
}

function ImageMessage({
  content,
  mxcToHttp,
  onOpen,
  imageSizeClass = "max-w-80",
}: {
  content: Record<string, unknown>;
  mxcToHttp: (mxcUrl: string) => string | null;
  onOpen: (
    url: string,
    fileName: string,
    info?: { w?: number; h?: number; size?: number; mimetype?: string },
  ) => void;
  imageSizeClass?: string;
}) {
  const url = content.url as string | undefined;
  const info = content.info as
    | { w?: number; h?: number; size?: number; mimetype?: string }
    | undefined;
  const body = content.body as string;

  if (!url) return <p className="text-sm text-muted">[Image: no URL]</p>;

  const httpUrl = mxcToHttp(url);
  if (!httpUrl) return <p className="text-sm text-muted">[Image: invalid URL]</p>;

  return (
    <button
      type="button"
      onClick={() => onOpen(httpUrl, body, info)}
      className="block mt-1 cursor-pointer text-left"
    >
      <img
        src={httpUrl}
        alt={body}
        className={`rounded-lg border border-border object-contain hover:brightness-90 transition-all ${imageSizeClass}`}
        style={{ maxHeight: 300 }}
        loading="lazy"
      />
      {info?.size != null && (
        <span className="text-[10px] text-faint mt-0.5 block">{formatFileSize(info.size)}</span>
      )}
    </button>
  );
}

function VideoMessage({
  content,
  mxcToHttp,
  onOpen,
}: {
  content: Record<string, unknown>;
  mxcToHttp: (mxcUrl: string) => string | null;
  onOpen: (
    url: string,
    fileName: string,
    info?: { w?: number; h?: number; size?: number; mimetype?: string; duration?: number },
  ) => void;
}) {
  const url = content.url as string | undefined;
  const body = content.body as string;
  const info = content.info as
    | { w?: number; h?: number; mimetype?: string; size?: number; duration?: number }
    | undefined;

  if (!url) return <p className="text-sm text-muted">[Video: no URL]</p>;

  const httpUrl = mxcToHttp(url);
  if (!httpUrl) return <p className="text-sm text-muted">[Video: invalid URL]</p>;

  return (
    <div className="mt-1 relative group/video">
      <video
        src={httpUrl}
        controls
        className="rounded-lg border border-border"
        style={{ maxWidth: 400, maxHeight: 300 }}
        preload="metadata"
      />
      {/* Expand button overlaid on video */}
      <button
        type="button"
        onClick={() => onOpen(httpUrl, body, info)}
        className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg text-primary/80 hover:text-primary hover:bg-black/80 transition-colors opacity-0 group-hover/video:opacity-100"
        title="Open in viewer"
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
            d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9m11.25-5.25v4.5m0-4.5h-4.5m4.5 0L15 9m-11.25 11.25v-4.5m0 4.5h4.5m-4.5 0L9 15m11.25 5.25v-4.5m0 4.5h-4.5m4.5 0L15 15"
          />
        </svg>
      </button>
      {info?.size != null && (
        <span className="text-[10px] text-faint mt-0.5 block">{formatFileSize(info.size)}</span>
      )}
    </div>
  );
}

function AudioMessage({
  content,
  mxcToHttp,
}: {
  content: Record<string, unknown>;
  mxcToHttp: (mxcUrl: string) => string | null;
}) {
  const url = content.url as string | undefined;
  const body = content.body as string;
  const info = content.info as { size?: number } | undefined;

  if (!url) return <p className="text-sm text-muted">[Audio: no URL]</p>;

  const httpUrl = mxcToHttp(url);
  if (!httpUrl) return <p className="text-sm text-muted">[Audio: invalid URL]</p>;

  return (
    <div className="mt-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-secondary">{body}</span>
        {info?.size != null && (
          <span className="text-[10px] text-faint">{formatFileSize(info.size)}</span>
        )}
      </div>
      <audio src={httpUrl} controls className="mt-1 max-w-sm" preload="metadata" />
    </div>
  );
}

function FileMessage({
  content,
  mxcToHttp,
}: {
  content: Record<string, unknown>;
  mxcToHttp: (mxcUrl: string) => string | null;
}) {
  const url = content.url as string | undefined;
  const body = content.body as string;
  const info = content.info as { size?: number; mimetype?: string; filename?: string } | undefined;
  const filename = info?.filename ?? body;

  if (!url) return <p className="text-sm text-muted">[File: no URL]</p>;

  const httpUrl = mxcToHttp(url);
  if (!httpUrl) return <p className="text-sm text-muted">[File: invalid URL]</p>;

  return (
    <a
      href={httpUrl}
      target="_blank"
      rel="noopener noreferrer"
      download={filename}
      className="mt-1 flex items-center gap-2 px-3 py-2 bg-surface-2 border border-border rounded-lg hover:bg-surface-3 transition-colors max-w-sm"
    >
      <svg
        className="w-5 h-5 text-secondary flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-accent truncate">{filename}</p>
        <p className="text-[10px] text-faint">
          {info?.mimetype ?? "file"}
          {info?.size != null && ` - ${formatFileSize(info.size)}`}
        </p>
      </div>
      <svg
        className="w-4 h-4 text-muted flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
        />
      </svg>
    </a>
  );
}

function StickerMessage({
  content,
  mxcToHttp,
}: {
  content: Record<string, unknown>;
  mxcToHttp: (mxcUrl: string) => string | null;
}) {
  const url = content.url as string | undefined;
  const body = content.body as string | undefined;
  const info = content.info as { w?: number; h?: number } | undefined;

  if (!url) return <p className="text-sm text-muted">[Sticker: no URL]</p>;

  const httpUrl = mxcToHttp(url);
  if (!httpUrl) return <p className="text-sm text-muted">[Sticker: invalid URL]</p>;

  // Compute display dimensions, clamping to 128x128 while preserving aspect ratio
  let displayW = 128;
  let displayH = 128;
  if (info?.w && info?.h) {
    const scale = Math.min(128 / info.w, 128 / info.h, 1);
    displayW = Math.round(info.w * scale);
    displayH = Math.round(info.h * scale);
  }

  return (
    <div className="mt-1">
      <img
        src={httpUrl}
        alt={body ?? "sticker"}
        className="object-contain"
        style={{ maxWidth: 128, maxHeight: 128, width: displayW, height: displayH }}
        loading="lazy"
      />
    </div>
  );
}

/** Render message body based on msgtype: text, image, video, audio, or file. */
function MessageBody({
  content,
  mxcToHttp,
  senderName,
  onOpenImage,
  onOpenVideo,
  bigEmoji: bigEmojiEnabled = true,
  imageSizeClass,
}: {
  content: Record<string, unknown>;
  mxcToHttp: (mxcUrl: string) => string | null;
  senderName?: string;
  onOpenImage: (
    url: string,
    fileName: string,
    info?: { w?: number; h?: number; size?: number; mimetype?: string },
  ) => void;
  onOpenVideo: (
    url: string,
    fileName: string,
    info?: { w?: number; h?: number; size?: number; mimetype?: string; duration?: number },
  ) => void;
  bigEmoji?: boolean;
  imageSizeClass?: string;
}) {
  const msgtype = content.msgtype as string | undefined;

  switch (msgtype) {
    case "m.image":
      return (
        <ImageMessage
          content={content}
          mxcToHttp={mxcToHttp}
          onOpen={onOpenImage}
          imageSizeClass={imageSizeClass}
        />
      );
    case "m.video":
      return <VideoMessage content={content} mxcToHttp={mxcToHttp} onOpen={onOpenVideo} />;
    case "m.audio": {
      const isVoice = content["org.matrix.msc3245.voice"] != null;
      if (isVoice) {
        const url = content.url as string | undefined;
        const info = content.info as { duration?: number; size?: number } | undefined;
        const httpUrl = url ? mxcToHttp(url) : null;
        if (httpUrl) {
          return (
            <VoiceMessagePlayer src={httpUrl} durationMs={info?.duration ?? 0} size={info?.size} />
          );
        }
      }
      return <AudioMessage content={content} mxcToHttp={mxcToHttp} />;
    }
    case "m.location":
      return <LocationDisplay content={content} />;
    case "m.file":
      return <FileMessage content={content} mxcToHttp={mxcToHttp} />;
    case "m.emote":
      return (
        <p className="text-sm text-secondary italic">
          * {senderName ?? "Someone"} {content.body as string}
        </p>
      );
    case "m.notice":
      return <p className="text-sm text-muted">{content.body as string}</p>;
    default: {
      // Check for spoiler text in formatted_body
      if (containsSpoiler(content)) {
        const formattedBody = content.formatted_body as string;
        const segments = parseSpoilers(formattedBody);
        return (
          <div className="prose-invert max-w-none text-sm text-secondary">
            {segments.map((seg, i) =>
              seg.type === "spoiler" ? (
                <SpoilerText key={i} text={seg.content} reason={seg.reason} />
              ) : (
                <span key={i} dangerouslySetInnerHTML={{ __html: seg.content }} />
              ),
            )}
          </div>
        );
      }
      const bodyText = content.body as string;
      if (bigEmojiEnabled && isEmojiOnly(bodyText)) {
        return <p className="text-4xl leading-tight">{bodyText}</p>;
      }
      return <MarkdownBody text={bodyText} />;
    }
  }
}

function TextReactionInput({
  onSubmit,
  onCancel,
}: {
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && text.trim()) {
      e.preventDefault();
      onSubmit(text.trim());
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className="absolute bottom-full right-0 mb-1 bg-surface-2 border border-border rounded-lg shadow-lg p-2 z-50">
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type reaction..."
          className="w-28 px-2 py-1 bg-surface-1 border border-border rounded text-xs text-primary placeholder-muted focus:outline-none focus:border-accent"
          maxLength={64}
        />
        <button
          onClick={() => {
            if (text.trim()) onSubmit(text.trim());
          }}
          disabled={!text.trim()}
          className="px-2 py-1 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-[10px] font-medium rounded transition-colors"
        >
          React
        </button>
      </div>
    </div>
  );
}

interface HoverActionsProps {
  msg: TimelineMessage;
  roomId: string;
  userId: string;
  isOwnMessage: boolean;
  isModerator: boolean;
  threadUnreadCount: number;
  onOpenThread: (eventId: string) => void;
  onSendReaction: (eventId: string, emoji: string) => void;
  onReply?: (eventId: string, senderName: string, body: string) => void;
  onForward?: (
    eventId: string,
    senderName: string,
    body: string,
    msgtype: string,
    content: Record<string, unknown>,
  ) => void;
  onEdit?: (eventId: string, currentBody: string) => void;
  onDelete?: (eventId: string) => void;
  onReport?: (eventId: string) => void;
  onViewSource: () => void;
}

function HoverActions({
  msg,
  roomId,
  _userId,
  isOwnMessage,
  isModerator,
  threadUnreadCount,
  onOpenThread,
  onSendReaction,
  onReply,
  onForward,
  onEdit,
  onDelete,
  onReport,
  onViewSource,
}: HoverActionsProps): React.ReactElement {
  const handleCopyText = useCallback(() => {
    const body = msg.content.body as string | undefined;
    if (body) navigator.clipboard.writeText(body);
  }, [msg]);

  const handleCopyLink = useCallback(() => {
    const link = makePermalink(roomId, msg.id);
    navigator.clipboard.writeText(link);
  }, [roomId, msg.id]);

  const btnClass = "p-1 text-muted hover:text-primary transition-colors";

  return (
    <div className="opacity-0 group-hover:opacity-100 absolute -top-3 right-2 flex items-center gap-0.5 bg-surface-2 border border-border rounded-lg shadow-lg px-1 py-0.5 transition-opacity z-10">
      <QuickReactionPicker onReact={(emoji) => onSendReaction(msg.id, emoji)} />
      {onReply && (
        <button
          onClick={() => onReply(msg.id, msg.senderName, (msg.content.body as string) ?? "")}
          className={btnClass}
          title="Reply"
          aria-label="Reply"
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
              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
            />
          </svg>
        </button>
      )}
      <button
        onClick={() => onOpenThread(msg.id)}
        className={`${btnClass} relative`}
        title="Reply in thread"
        aria-label="Reply in thread"
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
        {threadUnreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-accent text-inverse text-[8px] rounded-full flex items-center justify-center">
            {threadUnreadCount}
          </span>
        )}
      </button>
      {onForward && (
        <button
          onClick={() =>
            onForward(
              msg.id,
              msg.senderName,
              (msg.content.body as string) ?? "",
              (msg.content.msgtype as string) ?? "m.text",
              msg.content,
            )
          }
          className={btnClass}
          title="Forward"
          aria-label="Forward"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      )}
      <button
        onClick={handleCopyText}
        className={btnClass}
        title="Copy text"
        aria-label="Copy text"
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
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      </button>
      <button
        onClick={handleCopyLink}
        className={btnClass}
        title="Copy link"
        aria-label="Copy link"
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
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
      </button>
      <button
        onClick={onViewSource}
        className={btnClass}
        title="View source"
        aria-label="View source"
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
            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
          />
        </svg>
      </button>
      {isOwnMessage && onEdit && (
        <button
          onClick={() => onEdit(msg.id, (msg.content.body as string) ?? "")}
          className={btnClass}
          title="Edit"
          aria-label="Edit"
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
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
      )}
      {(isOwnMessage || isModerator) && onDelete && (
        <button
          onClick={() => onDelete(msg.id)}
          className={`${btnClass} hover:text-red-400`}
          title={isModerator && !isOwnMessage ? "Delete (moderator)" : "Delete"}
          aria-label="Delete"
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
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      )}
      {!isOwnMessage && onReport && (
        <button
          onClick={() => onReport(msg.id)}
          className={`${btnClass} hover:text-red-400`}
          title="Report"
          aria-label="Report"
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
              d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

function QuickReactionPicker({ onReact }: { onReact: (emoji: string) => void }) {
  const [showMore, setShowMore] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);

  return (
    <div className="relative flex items-center gap-0.5">
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onReact(emoji)}
          className="p-1 text-sm hover:bg-surface-3 rounded transition-colors"
          title={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}
      <button
        onClick={() => setShowMore(!showMore)}
        className="p-1 text-muted hover:text-secondary hover:bg-surface-3 rounded transition-colors text-xs font-medium"
        title="More reactions"
      >
        +
      </button>
      <button
        onClick={() => setShowTextInput(!showTextInput)}
        className="p-1 text-muted hover:text-secondary hover:bg-surface-3 rounded transition-colors text-[10px] font-medium"
        title="React with text"
      >
        Aa
      </button>
      {showTextInput && (
        <TextReactionInput
          onSubmit={(text) => {
            onReact(text);
            setShowTextInput(false);
          }}
          onCancel={() => setShowTextInput(false)}
        />
      )}
    </div>
  );
}

interface LightboxState {
  mediaUrl: string;
  fileName: string;
  mediaType: "image" | "video";
  info?: { w?: number; h?: number; size?: number; mimetype?: string; duration?: number };
}

export const MessageRow = React.memo(function MessageRow({
  msg,
  roomId: _roomId,
  userId,
  reactions,
  onOpenThread,
  onSendEvent,
  onSendReaction,
  onRetry,
  onEdit,
  onDelete,
  onReply,
  onForward,
  onReport,
  onNavigateRoom,
  mxcToHttp,
  isCollapsed = false,
  showUrlPreviews = true,
  bigEmoji = true,
  use24HourTime = false,
  showSeconds = false,
  showReadReceipts: showReadReceiptsProp = true,
  threadUnreadCount = 0,
  messageLayout = "modern",
  imageSize = "medium",
}: MessageRowProps) {
  const { client, homeserverUrl, agentRegistry } = useMatrix();
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [profileAnchorRect, setProfileAnchorRect] = useState<DOMRect | null>(null);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [showEventSource, setShowEventSource] = useState(false);
  const [showEditHistory, setShowEditHistory] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const nameRef = useRef<HTMLButtonElement>(null);

  // Feature 1: pending opacity; Feature 2: failed red styling
  const isPending = msg.pending === true;
  const isFailed = msg.failed === true;
  const isOwnMessage = msg.sender === userId;

  // Look up room early so it can be used in isModerator and elsewhere
  const room = client.getRoom(_roomId);

  // Moderator detection: user with power level >= required redaction level can delete others' messages
  const isModerator = useMemo(() => {
    if (!room) return false;
    const myUserId = client.getUserId();
    if (!myUserId) return false;
    const myMember = room.getMember(myUserId);
    const myPowerLevel = myMember?.powerLevel ?? 0;
    const plEvent = room.currentState.getStateEvents("m.room.power_levels", "");
    const plContent = plEvent?.getContent() as Record<string, unknown> | undefined;
    const events = plContent?.events as Record<string, number> | undefined;
    const redactLevel = events?.["m.room.redaction"] ?? 50;
    return myPowerLevel >= redactLevel;
  }, [room, client]);

  // Extract URLs for link previews (only for text messages)
  const isTextMessage =
    msg.type === "m.room.message" &&
    ((msg.content.msgtype as string | undefined) === "m.text" ||
      (msg.content.msgtype as string | undefined) === undefined);
  const messageBody = isTextMessage ? (msg.content.body as string) : "";
  const urls = useMemo(() => extractUrls(messageBody), [messageBody]);

  const accessToken = client.getAccessToken() ?? "";
  const member = room?.getMember(msg.sender);
  const senderAvatarMxc = member?.getMxcAvatarUrl() ?? undefined;

  // Look up the actual MatrixEvent for read receipts
  const matrixEvent = useMemo(() => {
    if (!room) return undefined;
    return room.findEventById(msg.id) ?? undefined;
  }, [room, msg.id]);

  // Look up agent info for status dot
  const agentInfo = agentRegistry.getAgentByUserId(msg.sender);

  // Bridge puppet detection
  const senderIsBridged = isBridgedUser(msg.sender);
  const senderBridgeProtocol = senderIsBridged ? getBridgeProtocol(msg.sender) : null;

  // Look up presence for non-agent members
  const user = client.getUser(msg.sender);
  const presence = useMemo((): "online" | "unavailable" | "offline" => {
    if (!user) return "offline";
    const p = user.presence;
    if (p === "online") return "online";
    if (p === "unavailable") return "unavailable";
    return "offline";
  }, [user]);

  const handleNameClick = useCallback(() => {
    if (nameRef.current) {
      setProfileAnchorRect(nameRef.current.getBoundingClientRect());
      setShowProfileCard(true);
    }
  }, []);

  const handleOpenImage = useCallback(
    (
      url: string,
      fileName: string,
      info?: { w?: number; h?: number; size?: number; mimetype?: string },
    ) => {
      setLightbox({ mediaUrl: url, fileName, mediaType: "image", info });
    },
    [],
  );

  const handleOpenVideo = useCallback(
    (
      url: string,
      fileName: string,
      info?: { w?: number; h?: number; size?: number; mimetype?: string; duration?: number },
    ) => {
      setLightbox({ mediaUrl: url, fileName, mediaType: "video", info });
    },
    [],
  );

  // Compute aria-label for accessibility
  const messageTime = new Date(msg.timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const ariaLabel = msg.redacted
    ? `Deleted message from ${msg.senderName} at ${messageTime}`
    : `Message from ${msg.senderName} at ${messageTime}`;

  // Redacted messages render a minimal placeholder
  if (msg.redacted) {
    return (
      <div
        className="group hover:bg-surface-1/50 px-4 py-1.5 transition-colors"
        role="article"
        aria-label={ariaLabel}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <UserAvatar
              displayName={msg.senderName}
              avatarMxcUrl={senderAvatarMxc}
              homeserverUrl={homeserverUrl}
              isAgent={msg.isAgent}
              size="md"
              showStatusDot={true}
              presence={presence}
              agentStatus={agentInfo?.status}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span
                className={`text-sm font-medium ${msg.isAgent ? "text-accent" : "text-primary"}`}
              >
                {msg.senderName}
              </span>
              <span className="text-xs text-faint">
                {formatMessageTimestamp(msg.timestamp, use24HourTime, showSeconds)}
              </span>
            </div>
            <p className="text-sm text-muted italic">[message deleted]</p>
          </div>
        </div>
      </div>
    );
  }

  // Shared message content block used by all layouts
  const messageContentBlock = (
    <>
      {/* Render based on event type */}
      {msg.type === "m.room.message" && (
        <MessageBody
          content={msg.content}
          mxcToHttp={mxcToHttp}
          senderName={msg.senderName}
          onOpenImage={handleOpenImage}
          onOpenVideo={handleOpenVideo}
          bigEmoji={bigEmoji}
          imageSizeClass={IMAGE_SIZE_CLASSES[imageSize]}
        />
      )}

      {msg.type === "m.sticker" && <StickerMessage content={msg.content} mxcToHttp={mxcToHttp} />}

      {/* Link previews for text messages */}
      {showUrlPreviews &&
        urls.length > 0 &&
        urls.map((url) => (
          <LinkPreview
            key={url}
            url={url}
            homeserverUrl={homeserverUrl}
            accessToken={accessToken}
          />
        ))}

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

      {/* Tombstone event: room has been upgraded */}
      {msg.type === "m.room.tombstone" &&
        (() => {
          const body = msg.content.body as string | undefined;
          const replacementRoom = msg.content.replacement_room as string | undefined;
          return (
            <button
              onClick={() => {
                if (replacementRoom && onNavigateRoom) {
                  onNavigateRoom(replacementRoom);
                }
              }}
              className="w-full mt-1 p-3 bg-accent/10 border border-accent/30 rounded-lg text-left hover:bg-accent/20 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-accent flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 10l7-7m0 0l7 7m-7-7v18"
                  />
                </svg>
                <div>
                  <p className="text-sm text-accent font-medium">
                    {body ?? "This room has been upgraded."}
                  </p>
                  {replacementRoom && (
                    <p className="text-xs text-secondary mt-0.5">
                      Click here to go to the new room.
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })()}

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

      {/* Feature 2: Failed message indicator with retry */}
      {isFailed && (
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-red-400">Failed to send</span>
          {onRetry && (
            <button
              onClick={() => onRetry({ id: msg.id, content: msg.content })}
              className="text-xs text-red-400 hover:text-red-300 underline transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Reaction badges */}
      <ReactionBar
        reactions={reactions}
        userId={userId}
        onReact={(emoji) => onSendReaction(msg.id, emoji)}
        getDisplayName={(senderId) => room?.getMember(senderId)?.name ?? senderId}
      />

      {/* Read receipts */}
      {showReadReceiptsProp && matrixEvent && room && (
        <ReadReceipts room={room} event={matrixEvent} client={client} maxVisible={3} />
      )}
    </>
  );

  return (
    <div
      role="article"
      aria-label={ariaLabel}
      className={`group hover:bg-surface-1/50 px-4 transition-colors ${
        isCollapsed ? "py-0.5" : "py-1.5"
      } ${isPending ? "opacity-60" : ""} ${isFailed ? "border-l-2 border-red-500/50" : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      {/* ---- IRC Layout ---- */}
      {messageLayout === "irc" && (
        <div className="flex items-baseline gap-1.5 font-mono text-xs min-w-0">
          <span className="text-faint flex-shrink-0">
            [{formatMessageTimestamp(msg.timestamp, use24HourTime, showSeconds)}]
          </span>
          <button
            ref={nameRef}
            onClick={handleNameClick}
            className={`flex-shrink-0 hover:underline cursor-pointer ${msg.isAgent ? "text-accent" : "text-primary"}`}
          >
            &lt;{msg.senderName}&gt;
          </button>
          <div className="min-w-0 flex-1">{messageContentBlock}</div>
        </div>
      )}

      {/* ---- Bubble Layout ---- */}
      {messageLayout === "bubble" && (
        <div className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}>
          <div
            className={`flex items-end gap-2 max-w-[80%] ${isOwnMessage ? "flex-row-reverse" : ""}`}
          >
            {!isCollapsed && (
              <div className="flex-shrink-0">
                <UserAvatar
                  displayName={msg.senderName}
                  avatarMxcUrl={senderAvatarMxc}
                  homeserverUrl={homeserverUrl}
                  isAgent={msg.isAgent}
                  size="sm"
                  showStatusDot={false}
                />
              </div>
            )}
            <div className={`min-w-0 ${isOwnMessage ? "items-end" : "items-start"} flex flex-col`}>
              {!isCollapsed && (
                <div
                  className={`flex items-baseline gap-1.5 mb-0.5 ${isOwnMessage ? "flex-row-reverse" : ""}`}
                >
                  <button
                    ref={nameRef}
                    onClick={handleNameClick}
                    className={`text-[10px] font-medium hover:underline cursor-pointer ${msg.isAgent ? "text-accent" : "text-secondary"}`}
                  >
                    {msg.senderName}
                  </button>
                  <span className="text-[10px] text-faint">
                    {formatMessageTimestamp(msg.timestamp, use24HourTime, showSeconds)}
                  </span>
                </div>
              )}
              <div
                className={`px-3 py-2 rounded-2xl ${
                  isOwnMessage ? "bg-accent/20 rounded-br-sm" : "bg-surface-2 rounded-bl-sm"
                }`}
              >
                {messageContentBlock}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Modern Layout (default) ---- */}
      {messageLayout === "modern" && (
        <div className="flex items-start gap-3">
          {/* Avatar -- hidden for collapsed (continuation) messages; show timestamp on hover */}
          {isCollapsed ? (
            <div className="mt-0.5 w-8 flex-shrink-0 flex items-center justify-center">
              <span className="text-[10px] text-faint opacity-0 group-hover:opacity-100 transition-opacity">
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          ) : (
            <div className="mt-0.5">
              <UserAvatar
                displayName={msg.senderName}
                avatarMxcUrl={senderAvatarMxc}
                homeserverUrl={homeserverUrl}
                isAgent={msg.isAgent}
                size="md"
                showStatusDot={true}
                presence={presence}
                agentStatus={agentInfo?.status}
              />
            </div>
          )}

          {/* Content */}
          <div className="min-w-0 flex-1">
            {!isCollapsed && (
              <div className="flex items-baseline gap-2 mb-0.5">
                <button
                  ref={nameRef}
                  onClick={handleNameClick}
                  className={`text-sm font-medium hover:underline cursor-pointer ${msg.isAgent ? "text-accent" : "text-primary"}`}
                >
                  {msg.senderName}
                </button>
                {msg.isAgent && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-accent/10 text-accent rounded font-medium uppercase tracking-wider">
                    Agent
                  </span>
                )}
                {senderBridgeProtocol && <BridgeIcon protocol={senderBridgeProtocol} size="xs" />}
                <span className="text-xs text-faint">
                  {formatMessageTimestamp(msg.timestamp, use24HourTime, showSeconds)}
                </span>
                {msg.edited && (
                  <button
                    onClick={() => setShowEditHistory(true)}
                    className="text-[10px] text-muted hover:text-secondary hover:underline cursor-pointer transition-colors"
                    title="View edit history"
                  >
                    (edited)
                  </button>
                )}
              </div>
            )}
            {messageContentBlock}
          </div>

          {/* Hover actions */}
          <HoverActions
            msg={msg}
            roomId={_roomId}
            userId={userId}
            isOwnMessage={isOwnMessage}
            isModerator={isModerator}
            threadUnreadCount={threadUnreadCount}
            onOpenThread={onOpenThread}
            onSendReaction={onSendReaction}
            onReply={onReply}
            onForward={onForward}
            onEdit={onEdit}
            onDelete={onDelete}
            onReport={onReport}
            onViewSource={() => setShowEventSource(true)}
          />
        </div>
      )}

      {/* Hover actions for non-modern layouts */}
      {messageLayout !== "modern" && (
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity mt-1">
          <HoverActions
            msg={msg}
            roomId={_roomId}
            userId={userId}
            isOwnMessage={isOwnMessage}
            isModerator={isModerator}
            threadUnreadCount={threadUnreadCount}
            onOpenThread={onOpenThread}
            onSendReaction={onSendReaction}
            onReply={onReply}
            onForward={onForward}
            onEdit={onEdit}
            onDelete={onDelete}
            onReport={onReport}
            onViewSource={() => setShowEventSource(true)}
          />
        </div>
      )}

      {/* User Profile Card popover */}
      {showProfileCard && profileAnchorRect && (
        <UserProfileCard
          userId={msg.sender}
          displayName={msg.senderName}
          avatarMxcUrl={senderAvatarMxc}
          homeserverUrl={homeserverUrl}
          agentInfo={agentInfo}
          anchorRect={profileAnchorRect}
          onClose={() => setShowProfileCard(false)}
          onSendMessage={() => {
            // Placeholder: would open/create a DM with this user
            setShowProfileCard(false);
          }}
        />
      )}

      {/* Media lightbox overlay */}
      {lightbox && (
        <ImageLightbox
          mediaUrl={lightbox.mediaUrl}
          fileName={lightbox.fileName}
          mediaType={lightbox.mediaType}
          info={lightbox.info}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* Event source modal */}
      {showEventSource && (
        <EventSourceModal
          event={{
            event_id: msg.id,
            type: msg.type,
            sender: msg.sender,
            content: msg.content,
            origin_server_ts: msg.timestamp,
          }}
          onClose={() => setShowEventSource(false)}
        />
      )}

      {/* Edit history modal */}
      {showEditHistory && (
        <EditHistoryModal
          eventId={msg.id}
          roomId={_roomId}
          onClose={() => setShowEditHistory(false)}
        />
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <MessageContextMenu
          msg={msg}
          roomId={_roomId}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
          onReply={onReply}
          onOpenThread={onOpenThread}
          onForward={onForward}
          onEdit={onEdit}
          onDelete={onDelete}
          onReport={onReport}
        />
      )}
    </div>
  );
});
