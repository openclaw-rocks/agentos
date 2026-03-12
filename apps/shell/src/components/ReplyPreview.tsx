import React from "react";

/* -------------------------------------------------------------------------- */
/*  ReplyPreviewBar — shown above the chat input when replying to a message   */
/* -------------------------------------------------------------------------- */

interface ReplyPreviewBarProps {
  senderName: string;
  body: string;
  onCancel: () => void;
}

/**
 * A compact bar displayed above the message input showing a quote of the
 * message being replied to. Includes a cancel button to clear the reply.
 */
export const ReplyPreviewBar = React.memo(function ReplyPreviewBar({
  senderName,
  body,
  onCancel,
}: ReplyPreviewBarProps) {
  // Show only the first line, truncated
  const firstLine = body.split("\n")[0].slice(0, 120);

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-surface-2 border-b border-border rounded-t-xl">
      <div className="w-0.5 h-8 bg-accent rounded-full flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-accent truncate">{senderName}</p>
        <p className="text-xs text-secondary truncate">{firstLine}</p>
      </div>
      <button
        onClick={onCancel}
        className="p-1 text-muted hover:text-primary hover:bg-surface-3 rounded transition-colors flex-shrink-0"
        title="Cancel reply"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/*  InlineReplyQuote — shown above a message that is a reply to another       */
/* -------------------------------------------------------------------------- */

interface InlineReplyQuoteProps {
  senderName: string;
  body: string;
  onClick?: () => void;
}

/**
 * A compact inline quote rendered above a message's body when the message
 * includes `m.relates_to.m.in_reply_to.event_id`. Shows the replied-to
 * message's sender and first line, and optionally scrolls to the original
 * message on click.
 */
export const InlineReplyQuote = React.memo(function InlineReplyQuote({
  senderName,
  body,
  onClick,
}: InlineReplyQuoteProps) {
  const firstLine = body.split("\n")[0].slice(0, 120);

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 mb-1 max-w-md cursor-pointer group"
      title="Click to view original"
    >
      <div className="w-0.5 h-6 bg-surface-4 group-hover:bg-accent rounded-full flex-shrink-0 transition-colors" />
      <div className="min-w-0">
        <span className="text-[11px] font-medium text-muted group-hover:text-accent transition-colors mr-1.5">
          {senderName}
        </span>
        <span className="text-[11px] text-faint truncate">{firstLine}</span>
      </div>
    </button>
  );
});
