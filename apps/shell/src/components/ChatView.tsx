import { useVirtualizer } from "@tanstack/react-virtual";
import { RoomMemberEvent } from "matrix-js-sdk";
import type { MatrixClient, MatrixEvent, RoomMember } from "matrix-js-sdk";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from "react";
import { BridgeStatusBadge } from "./BridgeStatusBadge";
import { CallButton } from "./CallButton";
import { CameraCapture } from "./CameraCapture";
import { EmojiAutocomplete, getEmojiKeyHandler } from "./EmojiAutocomplete";
import { EmojiPicker } from "./EmojiPicker";
import { EncryptionIndicator } from "./EncryptionIndicator";
import { ForwardMessageModal } from "./ForwardMessageModal";
import { GifPicker } from "./GifPicker";
import { LocationPicker } from "./LocationPicker";
import { MentionAutocomplete, getMentionKeyHandler } from "./MentionAutocomplete";
import { MessageRow } from "./MessageRow";
import { PinnedMessagesButton } from "./PinnedMessages";
import { PollCreator } from "./PollCreator";
import { ReplyPreviewBar } from "./ReplyPreview";
import { ReportContentModal } from "./ReportContentModal";
import { RoomSettingsPanel } from "./RoomSettingsPanel";
import { SlashCommandHint } from "./SlashCommandHint";
import { StickerPicker } from "./StickerPicker";
import { VoiceMessageRecorder } from "./VoiceMessageRecorder";
import { detectBridgeFromState, detectBridgeFromMembers } from "~/lib/bridge-detection";
import { isCameraAvailable } from "~/lib/camera-capture";
import { formatDateSeparator, isSameDay } from "~/lib/date-utils";
import { parseEmojiQuery, insertEmoji, searchEmoji } from "~/lib/emoji-autocomplete";
import { uploadFile, buildMediaContent, mxcToHttpUrl } from "~/lib/file-upload";
import type { UploadProgress } from "~/lib/file-upload";
import type { GroupCallType } from "~/lib/group-call";
import { useMatrix } from "~/lib/matrix-context";
import { parseMentionQuery, insertMention, formatMentionsForMatrix } from "~/lib/mention-utils";
import { createModerationCommands } from "~/lib/moderation-commands";
import {
  parseCommand,
  COMMANDS,
  registerCommands,
  getCommandCompletions,
  type CommandContext,
} from "~/lib/slash-commands";
import { loadSettings, saveSettings } from "~/lib/theme";
import { createTypingNotifier, formatTypingNames } from "~/lib/typing-utils";
import type { CallType } from "~/lib/webrtc-call";

/** Threshold in milliseconds for collapsing consecutive messages from the same sender. */
const COLLAPSE_THRESHOLD_MS = 5 * 60 * 1000;

interface ChatViewProps {
  roomId: string;
  onOpenThread: (eventId: string) => void;
  onToggleAgentPanel: () => void;
  onLeaveRoom: () => void;
  onOpenSearch?: () => void;
  onOpenThreadList?: () => void;
  onStartCall?: (type: CallType) => void;
  onStartGroupCall?: (type: GroupCallType) => void;
  onNavigateRoom?: (roomId: string) => void;
  /** Ref callback to expose file upload trigger to parent for keyboard shortcut. */
  fileUploadTriggerRef?: React.MutableRefObject<(() => void) | null>;
}

const TYPING_TIMEOUT_MS = 30_000;
const TYPING_DEBOUNCE_MS = 10_000;
const TYPING_IDLE_MS = 3_000;

/**
 * Hook that sends typing notifications to the Matrix server
 * and tracks which other users in the room are currently typing.
 */
function useTypingIndicator(
  client: MatrixClient,
  roomId: string,
): { typingNames: string[]; onInputKeystroke: () => void; onInputSend: () => void } {
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const myUserId = client.getUserId();

  // Create stable notifier that calls client.sendTyping
  const notifier = useMemo(() => {
    return createTypingNotifier({
      sendTyping: (isTyping: boolean) => {
        client.sendTyping(roomId, isTyping, TYPING_TIMEOUT_MS).catch(() => {
          /* best-effort — ignore failures */
        });
      },
      debounceMs: TYPING_DEBOUNCE_MS,
      idleMs: TYPING_IDLE_MS,
    });
  }, [client, roomId]);

  // Destroy notifier on unmount or when roomId/client changes
  useEffect(() => {
    return () => {
      notifier.destroy();
    };
  }, [notifier]);

  // Listen for typing events from other room members
  useEffect(() => {
    const handler = (_event: MatrixEvent, member: RoomMember): void => {
      if (member.roomId !== roomId) return;
      // Re-scan all members of this room
      const room = client.getRoom(roomId);
      if (!room) return;
      const members = room.getMembers();
      const names: string[] = [];
      for (const m of members) {
        if (m.userId !== myUserId && m.typing) {
          names.push(m.name || m.userId);
        }
      }
      setTypingNames(names);
    };

    client.on(RoomMemberEvent.Typing, handler);
    return () => {
      client.removeListener(RoomMemberEvent.Typing, handler);
    };
  }, [client, roomId, myUserId]);

  return {
    typingNames,
    onInputKeystroke: notifier.onKeystroke,
    onInputSend: notifier.stop,
  };
}

export function ChatView({
  roomId,
  onOpenThread,
  onToggleAgentPanel,
  onLeaveRoom,
  onOpenSearch,
  onOpenThreadList,
  onStartCall,
  onStartGroupCall,
  onNavigateRoom,
  fileUploadTriggerRef,
}: ChatViewProps) {
  const { client, eventStore, dmTracker, unreadTracker, notificationManager } = useMatrix();
  const [input, setInput] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [showRoomMenu, setShowRoomMenu] = useState(false);
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [hasCameraSupport, setHasCameraSupport] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [_editingText, setEditingText] = useState("");
  const [replyingTo, setReplyingTo] = useState<{
    eventId: string;
    senderName: string;
    body: string;
  } | null>(null);
  const [showCommandHint, setShowCommandHint] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<{
    body: string;
    msgtype: string;
    sender: string;
    content: Record<string, unknown>;
  } | null>(null);
  const [reportEventId, setReportEventId] = useState<string | null>(null);
  const room = client.getRoom(roomId);
  const userId = client.getUserId() ?? "";
  const appSettings = useMemo(() => loadSettings(), []);
  const [markdownEnabled, setMarkdownEnabled] = useState(appSettings.markdownEnabled);

  // Per-room URL preview override: check room account data
  const roomUrlPreviewDisabled = useMemo(() => {
    if (!room) return false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (room as any).getAccountData?.("org.matrix.room.preview_urls");
      return data?.getContent()?.disabled === true;
    } catch {
      return false;
    }
  }, [room]);
  const effectiveShowUrlPreviews = appSettings.showUrlPreviews && !roomUrlPreviewDisabled;

  // @-mention autocomplete state
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionPanelRef = useRef<HTMLDivElement>(null);
  const [mentionQuery, setMentionQuery] = useState<{
    query: string;
    start: number;
    end: number;
  } | null>(null);
  const roomMembers = useMemo(() => room?.getJoinedMembers() ?? [], [room]);

  // :emoji: autocomplete state
  const emojiPanelRef = useRef<HTMLDivElement>(null);
  const [emojiQuery, setEmojiQuery] = useState<{
    query: string;
    start: number;
    end: number;
  } | null>(null);

  // Tab-cycling state: tracks matches and current index for repeated Tab presses
  const tabCycleRef = useRef<{
    matches: string[];
    index: number;
    original: string;
    start: number;
    end: number;
    kind: "command" | "mention" | "emoji";
  } | null>(null);

  // Capture the last-read event ID when this room first renders (for "New messages" divider)
  const lastReadEventIdRef = useRef<string | undefined>(undefined);
  const [showJumpToUnread, setShowJumpToUnread] = useState(false);
  useEffect(() => {
    // Reset jump indicators on room change
    setShowJumpToUnread(false);
    setShowJumpToBottom(false);

    unreadTracker.snapshotLastRead(roomId);
    lastReadEventIdRef.current = unreadTracker.getLastReadEventId(roomId);
    // Show the "Jump to new messages" button when there's a read marker and new messages exist after it
    if (lastReadEventIdRef.current) {
      const idx = messages.findIndex((m) => m.id === lastReadEventIdRef.current);
      if (idx >= 0 && idx < messages.length - 1) {
        setShowJumpToUnread(true);
      }
    }
  }, [roomId, unreadTracker]);

  // Mark as read after 1 second delay when the room is selected
  useEffect(() => {
    notificationManager.setSelectedRoom(roomId);

    const timer = setTimeout(() => {
      unreadTracker.markAsRead(roomId, appSettings.sendReadReceipts);
      setShowJumpToUnread(false);
    }, 1000);

    return () => {
      clearTimeout(timer);
    };
  }, [roomId, unreadTracker, notificationManager]);

  const {
    typingNames,
    onInputKeystroke: rawKeystroke,
    onInputSend,
  } = useTypingIndicator(client, roomId);
  const onInputKeystroke = appSettings.sendTypingNotifications ? rawKeystroke : () => {};
  const typingText = appSettings.showTypingNotifications ? formatTypingNames(typingNames) : "";

  // Detect camera support on mount
  useEffect(() => {
    setHasCameraSupport(isCameraAvailable());
  }, []);

  // File upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCountRef = useRef(0);

  // Expose file upload trigger to parent for Ctrl+Shift+U shortcut
  useEffect(() => {
    if (fileUploadTriggerRef) {
      fileUploadTriggerRef.current = () => {
        fileInputRef.current?.click();
      };
      return () => {
        fileUploadTriggerRef.current = null;
      };
    }
  }, [fileUploadTriggerRef]);

  // Stable mxcToHttp callback for MessageRow
  const homeserverUrl = client.getHomeserverUrl();
  const mxcToHttp = useCallback(
    (mxcUrl: string): string | null => {
      return mxcToHttpUrl(mxcUrl, homeserverUrl);
    },
    [homeserverUrl],
  );

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
    setShowJumpToBottom(!wasAtBottomRef.current);
  }, []);

  // Feature 3: Jump to bottom handler
  const handleJumpToBottom = useCallback(() => {
    const el = parentRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    setShowJumpToBottom(false);
  }, []);

  // Jump to first unread message (read marker position)
  const handleJumpToUnread = useCallback(() => {
    const readEventId = lastReadEventIdRef.current;
    if (!readEventId) return;
    const idx = messages.findIndex((m) => m.id === readEventId);
    // Scroll to the message right after the read marker (first unread)
    const targetIdx = idx >= 0 && idx < messages.length - 1 ? idx + 1 : idx;
    if (targetIdx >= 0) {
      virtualizer.scrollToIndex(targetIdx, { align: "start" });
    }
    setShowJumpToUnread(false);
  }, [messages, virtualizer]);

  // Feature 1 & 2: Local echo with failure handling
  const sendMessageWithText = useCallback(
    async (text: string) => {
      const tempId = `~local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const senderName = room?.getMember(userId)?.name ?? userId;

      eventStore.addLocalEcho(
        roomId,
        tempId,
        userId,
        senderName,
        { body: text, msgtype: "m.text" },
        Date.now(),
      );

      try {
        const res = await client.sendTextMessage(roomId, text);
        const realEventId =
          (res as { event_id?: string }).event_id ??
          (res as unknown as Record<string, unknown>)["event_id"];
        if (typeof realEventId === "string") {
          eventStore.resolveLocalEcho(tempId, realEventId);
        }
      } catch {
        eventStore.failLocalEcho(tempId);
      }
    },
    [client, eventStore, roomId, room, userId],
  );

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setShowCommandHint(false);
    setMentionQuery(null);
    onInputSend();

    // Check for slash commands
    const parsed = parseCommand(text);
    if (parsed) {
      const cmd = COMMANDS.get(parsed.command);
      if (cmd) {
        const ctx: CommandContext = {
          client,
          roomId,
          sendText: (t: string) => sendMessageWithText(t),
          sendNotice: (t: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            client.sendEvent(roomId, "m.room.message" as any, {
              msgtype: "m.notice",
              body: t,
            });
          },
          sendEmote: (t: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            client.sendEvent(roomId, "m.room.message" as any, {
              msgtype: "m.emote",
              body: t,
            });
          },
          sendHtml: (plain: string, html: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            client.sendEvent(roomId, "m.room.message" as any, {
              msgtype: "m.text",
              body: plain,
              format: "org.matrix.custom.html",
              formatted_body: html,
            });
          },
          sendHtmlEmote: (plain: string, html: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            client.sendEvent(roomId, "m.room.message" as any, {
              msgtype: "m.emote",
              body: plain,
              format: "org.matrix.custom.html",
              formatted_body: html,
            });
          },
        };
        await cmd.execute(parsed.args, ctx);
        return;
      }
      // Unknown command: send as regular text
    }

    // Format mentions into Matrix HTML pills if present (only when markdown enabled)
    const hasMentions = markdownEnabled && text.includes("[mention:");
    const { body, formatted_body } = hasMentions
      ? formatMentionsForMatrix(text)
      : { body: text, formatted_body: text };

    if (replyingTo) {
      const content: Record<string, unknown> = {
        msgtype: "m.text",
        body,
        "m.relates_to": {
          "m.in_reply_to": {
            event_id: replyingTo.eventId,
          },
        },
      };
      if (hasMentions && markdownEnabled) {
        content.format = "org.matrix.custom.html";
        content.formatted_body = formatted_body;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await client.sendEvent(roomId, "m.room.message" as any, content);
      setReplyingTo(null);
    } else if (hasMentions && markdownEnabled) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await client.sendEvent(roomId, "m.room.message" as any, {
        msgtype: "m.text",
        body,
        format: "org.matrix.custom.html",
        formatted_body,
      });
    } else if (!markdownEnabled) {
      // Plain text mode: send without formatted_body
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await client.sendEvent(roomId, "m.room.message" as any, {
        msgtype: "m.text",
        body: text,
      });
    } else {
      await sendMessageWithText(text);
    }
  };

  // Feature 2: Retry handler for failed messages
  const handleRetry = useCallback(
    (failedMsg: { id: string; content: Record<string, unknown> }) => {
      const text = failedMsg.content.body;
      if (typeof text !== "string") return;
      eventStore.removeLocalEcho(failedMsg.id);
      sendMessageWithText(text);
    },
    [eventStore, sendMessageWithText],
  );

  // Message editing: populate input with original text
  const handleStartEdit = useCallback((eventId: string, currentBody: string) => {
    setEditingMessageId(eventId);
    setEditingText(currentBody);
    setInput(currentBody);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditingText("");
    setInput("");
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const handleReply = useCallback((eventId: string, senderName: string, body: string) => {
    setReplyingTo({ eventId, senderName, body });
  }, []);

  const handleForward = useCallback(
    (
      eventId: string,
      senderName: string,
      body: string,
      msgtype: string,
      content: Record<string, unknown>,
    ) => {
      setForwardMessage({ body, msgtype, sender: senderName, content });
    },
    [],
  );

  const handleReport = useCallback((eventId: string) => {
    setReportEventId(eventId);
  }, []);

  // Register moderation slash commands (/report opens modal for the last message)
  useEffect(() => {
    const moderationCmds = createModerationCommands({
      onOpenReportModal: () => {
        // Find the last message from someone else to report
        for (let i = messages.length - 1; i >= 0; i--) {
          const m = messages[i];
          if (m.sender !== userId && !m.redacted) {
            setReportEventId(m.id);
            return;
          }
        }
      },
    });
    registerCommands(moderationCmds);
  }, [messages, userId]);

  const handleSendSticker = useCallback(
    (content: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.sendEvent(roomId, "m.sticker" as any, content);
      setShowStickerPicker(false);
    },
    [client, roomId],
  );

  // GIF send handler: send selected GIF as m.image message
  const handleSendGif = useCallback(
    (gifUrl: string, _previewUrl: string, width: number, height: number) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.sendEvent(roomId, "m.room.message" as any, {
        msgtype: "m.image",
        body: "GIF",
        url: gifUrl,
        info: {
          w: width,
          h: height,
          mimetype: "image/gif",
        },
      });
      setShowGifPicker(false);
    },
    [client, roomId],
  );

  // Message deletion: redact the event via Matrix and update the store
  const handleDelete = useCallback(
    async (eventId: string) => {
      try {
        await client.redactEvent(roomId, eventId);
        eventStore.redactMessage(eventId);
      } catch (err) {
        console.error("[ChatView] Failed to redact message:", err);
      }
    },
    [client, roomId, eventStore],
  );

  // Submit an edit: send a replacement event
  const submitEdit = useCallback(async () => {
    const text = input.trim();
    if (!text || !editingMessageId) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await client.sendEvent(roomId, "m.room.message" as any, {
      "m.new_content": {
        msgtype: "m.text",
        body: text,
      },
      "m.relates_to": {
        rel_type: "m.replace",
        event_id: editingMessageId,
      },
      msgtype: "m.text",
      body: `* ${text}`,
    });

    setEditingMessageId(null);
    setEditingText("");
    setInput("");
  }, [client, roomId, input, editingMessageId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Delegate to mention autocomplete if it's open
    if (mentionQuery) {
      const mentionHandler = getMentionKeyHandler(mentionPanelRef);
      if (mentionHandler && mentionHandler(e)) {
        return;
      }
    }

    // Delegate to emoji autocomplete if it's open
    if (emojiQuery) {
      const emojiHandler = getEmojiKeyHandler(emojiPanelRef);
      if (emojiHandler && emojiHandler(e)) {
        return;
      }
    }

    // Tab completion: cycle through matches on repeated Tab presses
    if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const ta = e.currentTarget;
      const cursorPos = ta.selectionStart ?? input.length;

      // If a popup is already open (mention/emoji), let the popup handle Tab (already delegated above)
      if (mentionQuery || emojiQuery) {
        // The popup handlers already handle Tab as "accept selection" above
        // If we reach here, the popup didn't handle it — prevent default anyway
        e.preventDefault();
        return;
      }

      // Check if we're continuing a previous tab-cycle
      const cycle = tabCycleRef.current;
      if (cycle && cycle.matches.length > 0) {
        e.preventDefault();
        cycle.index = (cycle.index + 1) % cycle.matches.length;
        const replacement = cycle.matches[cycle.index];
        let newText: string;
        let newCursor: number;

        if (cycle.kind === "command") {
          newText = `/${replacement} ${input.slice(cycle.end)}`;
          newCursor = replacement.length + 2; // /cmd + space
        } else if (cycle.kind === "mention") {
          const before = cycle.original.slice(0, cycle.start);
          const after = input.slice(cycle.end);
          newText = `${before}@${replacement}${after.startsWith(" ") ? after : ` ${after}`}`;
          newCursor = before.length + 1 + replacement.length + 1; // @name + space
        } else {
          // emoji — replacement is the emoji character
          const before = cycle.original.slice(0, cycle.start);
          const after = input.slice(cycle.end);
          newText = `${before}${replacement}${after.startsWith(" ") ? after : ` ${after}`}`;
          newCursor = before.length + replacement.length + 1;
        }
        setInput(newText);
        // Update cycle.end to cover the newly inserted text for next Tab press
        if (cycle.kind === "command") {
          cycle.end = replacement.length + 2;
        } else if (cycle.kind === "mention") {
          cycle.end = cycle.start + 1 + replacement.length;
        } else {
          cycle.end = cycle.start + replacement.length;
        }
        requestAnimationFrame(() => {
          ta.selectionStart = newCursor;
          ta.selectionEnd = newCursor;
        });
        return;
      }

      // Start a new tab-cycle: try slash commands, then @mentions, then :emoji
      const trimmed = input.trimStart();
      if (trimmed.startsWith("/") && !trimmed.includes(" ")) {
        const completions = getCommandCompletions(input);
        if (completions.length > 0) {
          e.preventDefault();
          const matches = completions.map((c) => c.name);
          const first = matches[0];
          const newText = `/${first} ${input.slice(input.indexOf("/") + trimmed.length)}`;
          const newCursor = first.length + 2;
          tabCycleRef.current = {
            matches,
            index: 0,
            original: input,
            start: input.indexOf("/"),
            end: first.length + 2,
            kind: "command",
          };
          setInput(newText);
          requestAnimationFrame(() => {
            ta.selectionStart = newCursor;
            ta.selectionEnd = newCursor;
          });
          return;
        }
      }

      // Check for @mention at cursor
      const mq = parseMentionQuery(input, cursorPos);
      if (mq) {
        const q = mq.query.toLowerCase();
        const memberMatches = roomMembers
          .filter((m) => {
            const name = (m.name || "").toLowerCase();
            const id = m.userId.toLowerCase();
            return name.includes(q) || id.includes(q);
          })
          .slice(0, 10)
          .map((m) => m.name || m.userId);
        if (memberMatches.length > 0) {
          e.preventDefault();
          const first = memberMatches[0];
          const before = input.slice(0, mq.start);
          const after = input.slice(mq.end);
          const newText = `${before}@${first}${after.startsWith(" ") ? after : ` ${after}`}`;
          const newCursor = before.length + 1 + first.length + 1;
          tabCycleRef.current = {
            matches: memberMatches,
            index: 0,
            original: input,
            start: mq.start,
            end: mq.start + 1 + first.length,
            kind: "mention",
          };
          setInput(newText);
          requestAnimationFrame(() => {
            ta.selectionStart = newCursor;
            ta.selectionEnd = newCursor;
          });
          return;
        }
      }

      // Check for :emoji at cursor
      const eq = parseEmojiQuery(input, cursorPos);
      if (eq) {
        const emojiMatches = searchEmoji(eq.query, 10);
        if (emojiMatches.length > 0) {
          e.preventDefault();
          const emojiChars = emojiMatches.map((em) => em.emoji);
          const first = emojiChars[0];
          const before = input.slice(0, eq.start);
          const after = input.slice(eq.end);
          const newText = `${before}${first}${after.startsWith(" ") ? after : ` ${after}`}`;
          const newCursor = before.length + first.length + 1;
          tabCycleRef.current = {
            matches: emojiChars,
            index: 0,
            original: input,
            start: eq.start,
            end: eq.start + first.length,
            kind: "emoji",
          };
          setInput(newText);
          requestAnimationFrame(() => {
            ta.selectionStart = newCursor;
            ta.selectionEnd = newCursor;
          });
          return;
        }
      }

      // If slash command hint is showing but no specific match, prevent losing focus
      if (showCommandHint) {
        e.preventDefault();
        return;
      }
    }

    // Any non-Tab key press resets the tab-cycle
    if (e.key !== "Tab") {
      tabCycleRef.current = null;
    }

    // Ctrl+B — wrap selection in bold markdown markers
    if (e.ctrlKey && e.key === "b") {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      if (start !== end) {
        const before = input.slice(0, start);
        const selected = input.slice(start, end);
        const after = input.slice(end);
        const newValue = `${before}**${selected}**${after}`;
        setInput(newValue);
        requestAnimationFrame(() => {
          ta.selectionStart = start + 2;
          ta.selectionEnd = end + 2;
        });
      }
      return;
    }

    // Ctrl+I — wrap selection in italic markdown markers
    if (e.ctrlKey && e.key === "i") {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      if (start !== end) {
        const before = input.slice(0, start);
        const selected = input.slice(start, end);
        const after = input.slice(end);
        const newValue = `${before}_${selected}_${after}`;
        setInput(newValue);
        requestAnimationFrame(() => {
          ta.selectionStart = start + 1;
          ta.selectionEnd = end + 1;
        });
      }
      return;
    }

    if (e.key === "Escape" && editingMessageId) {
      e.preventDefault();
      handleCancelEdit();
      return;
    }
    if (e.key === "Escape" && replyingTo) {
      e.preventDefault();
      handleCancelReply();
      return;
    }
    // enterToSend: true  => Enter sends, Shift+Enter newline
    // enterToSend: false => Ctrl/Cmd+Enter sends, Enter newline
    const shouldSend = appSettings.enterToSend
      ? e.key === "Enter" && !e.shiftKey
      : e.key === "Enter" && (e.ctrlKey || e.metaKey);
    if (shouldSend) {
      e.preventDefault();
      if (editingMessageId) {
        submitEdit();
      } else {
        sendMessage();
      }
      return;
    }
    // Up arrow to edit last own message when textarea is empty
    if (
      e.key === "ArrowUp" &&
      !editingMessageId &&
      input === "" &&
      e.currentTarget.selectionStart === 0
    ) {
      // Find the last message sent by the current user
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.sender === userId && m.type === "m.room.message" && !m.redacted && !m.failed) {
          e.preventDefault();
          handleStartEdit(m.id, (m.content.body as string) ?? "");
          return;
        }
      }
    }
  };

  const handleSendEvent = useCallback(
    (type: string, content: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.sendEvent(roomId, type as any, content);
    },
    [client, roomId],
  );

  const handleSendReaction = useCallback(
    (eventId: string, emoji: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.sendEvent(roomId, "m.reaction" as any, {
        "m.relates_to": {
          rel_type: "m.annotation",
          event_id: eventId,
          key: emoji,
        },
      });
    },
    [client, roomId],
  );

  // Feature 6: Leave room
  const handleLeaveRoom = useCallback(async () => {
    setShowRoomMenu(false);
    try {
      await client.leave(roomId);
      onLeaveRoom();
    } catch {
      // best-effort
    }
  }, [client, roomId, onLeaveRoom]);

  // Voice message recording handler
  const handleVoiceRecorded = useCallback(
    async (blob: Blob, durationMs: number) => {
      setUploading(true);
      try {
        const file = new File([blob], "voice-message.ogg", { type: "audio/ogg" });
        const result = await uploadFile(client, file, (progress) => setUploadProgress(progress));
        const content = buildMediaContent(result);
        // Override msgtype to be m.audio with voice flag
        content.msgtype = "m.audio";
        content.info = {
          ...((content.info as Record<string, unknown>) ?? {}),
          duration: durationMs,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (content as any)["org.matrix.msc3245.voice"] = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await client.sendEvent(roomId, "m.room.message" as any, content);
      } catch (err) {
        console.error("[ChatView] Voice upload failed:", err);
      } finally {
        setUploading(false);
        setUploadProgress(null);
      }
    },
    [client, roomId],
  );

  // Camera capture handler — upload the JPEG blob as an m.image message
  const handleCameraCapture = useCallback(
    async (blob: Blob) => {
      setUploading(true);
      try {
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
        const result = await uploadFile(client, file, (progress) => setUploadProgress(progress));
        const content = buildMediaContent(result);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await client.sendEvent(roomId, "m.room.message" as any, content);
      } catch (err) {
        console.error("[ChatView] Camera upload failed:", err);
      } finally {
        setUploading(false);
        setUploadProgress(null);
      }
    },
    [client, roomId],
  );

  // Upload one or more files and send as media messages
  const handleUploadAndSend = useCallback(
    async (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        setUploading(true);
        setUploadProgress({ loaded: 0, total: file.size });
        try {
          const result = await uploadFile(client, file, (progress) => {
            setUploadProgress(progress);
          });
          const content = buildMediaContent(result);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await client.sendEvent(roomId, "m.room.message" as any, content);
        } catch (err) {
          console.error("[ChatView] File upload failed:", err);
        } finally {
          setUploading(false);
          setUploadProgress(null);
        }
      }
    },
    [client, roomId],
  );

  // File input change handler
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleUploadAndSend(files);
      }
      // Reset the input so the same file can be re-selected
      e.target.value = "";
    },
    [handleUploadAndSend],
  );

  // Drag-and-drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current += 1;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDraggingOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current -= 1;
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0;
      setIsDraggingOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCountRef.current = 0;
      setIsDraggingOver(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleUploadAndSend(files);
      }
    },
    [handleUploadAndSend],
  );

  // Clipboard paste handler for images/files
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        handleUploadAndSend(files);
      }
    },
    [handleUploadAndSend],
  );

  // Subscribe to event store version so reaction updates trigger re-renders.
  // The messages snapshot uses array identity which doesn't change for reaction-only updates,
  // so we need this additional subscription to re-render when reactions arrive.
  void useSyncExternalStore(eventStore.subscribe, eventStore.getVersion);

  // DM detection: resolve display name for DM rooms
  const isDM = dmTracker.isDM(roomId);
  const dmTargetUserId = dmTracker.getDMTarget(roomId);
  const dmDisplayName = (() => {
    if (!isDM || !dmTargetUserId || !room) return null;
    const member = room.getMember(dmTargetUserId);
    return member?.name ?? dmTargetUserId.replace(/^@/, "").split(":")[0];
  })();

  const roomName = isDM && dmDisplayName ? dmDisplayName : (room?.name ?? roomId);

  // Multi-party DM detection: DM room with more than 2 joined members
  const joinedMemberCount = room?.getJoinedMemberCount() ?? 0;
  const isMultiPartyDM = isDM && joinedMemberCount > 2;
  const multiPartyMembers = useMemo(() => {
    if (!isMultiPartyDM || !room) return [];
    return room
      .getJoinedMembers()
      .filter((m: RoomMember) => m.userId !== userId)
      .slice(0, 5)
      .map((m: RoomMember) => ({
        userId: m.userId,
        name: m.name || m.userId.replace(/^@/, "").split(":")[0],
        initial: (m.name || m.userId.replace(/^@/, ""))[0].toUpperCase(),
      }));
  }, [isMultiPartyDM, room, userId]);

  // Feature 5: Room topic
  const roomTopic = room?.currentState.getStateEvents("m.room.topic", "")?.getContent()?.topic as
    | string
    | undefined;

  // Encryption detection
  const isEncrypted =
    room?.currentState.getStateEvents("m.room.encryption", "")?.getContent()?.algorithm != null;

  // Bridge detection: check room state events and members
  const bridgeInfo = useMemo(() => {
    if (!room) return null;
    // First try state-event-based detection (MSC2346)
    const allStateEvents = [
      ...room.currentState.getStateEvents("m.bridge"),
      ...room.currentState.getStateEvents("uk.half-shot.bridge"),
    ];
    const fromState = detectBridgeFromState(allStateEvents);
    if (fromState) return fromState;
    // Fallback: detect from member list
    return detectBridgeFromMembers(room.getJoinedMembers());
  }, [room, messages]);

  return (
    <div className="flex-1 flex flex-row min-h-0">
      <div
        className="flex-1 flex flex-col min-h-0 relative min-w-0 overflow-hidden"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag-and-drop overlay */}
        {isDraggingOver && (
          <div className="absolute inset-0 z-50 bg-surface-0/80 border-2 border-dashed border-accent rounded-lg flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <svg
                className="w-10 h-10 text-accent mx-auto mb-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
              <p className="text-sm text-accent font-medium">Drop files to upload</p>
            </div>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />

        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
          <div className="min-w-0 flex-1 flex items-center gap-3">
            {/* Multi-party DM overlapping avatars */}
            {isMultiPartyDM && multiPartyMembers.length > 0 && (
              <div
                className="flex -space-x-2 flex-shrink-0"
                title={`Group DM: ${joinedMemberCount} members`}
              >
                {multiPartyMembers.slice(0, 3).map((m, idx) => (
                  <div
                    key={m.userId}
                    className="w-7 h-7 rounded-full bg-accent/30 border-2 border-surface-1 flex items-center justify-center text-[10px] font-semibold text-inverse"
                    style={{ zIndex: 3 - idx }}
                    title={m.name}
                  >
                    {m.initial}
                  </div>
                ))}
                {joinedMemberCount > 4 && (
                  <div
                    className="w-7 h-7 rounded-full bg-surface-3 border-2 border-surface-1 flex items-center justify-center text-[10px] font-semibold text-secondary"
                    style={{ zIndex: 0 }}
                  >
                    +{joinedMemberCount - 3}
                  </div>
                )}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold text-primary">
                  {isDM ? roomName : `# ${roomName}`}
                </h2>
                <EncryptionIndicator status={isEncrypted ? "encrypted" : "unencrypted"} />
                {bridgeInfo && <BridgeStatusBadge bridgeInfo={bridgeInfo} />}
                {isMultiPartyDM && (
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-accent/15 text-accent rounded">
                    Group DM
                  </span>
                )}
              </div>
              {isMultiPartyDM ? (
                <p className="text-xs text-muted">{joinedMemberCount} members</p>
              ) : isDM ? (
                <p className="text-xs text-muted">Direct Message</p>
              ) : roomTopic ? (
                <p className="text-xs text-muted truncate">{roomTopic}</p>
              ) : (
                <p className="text-xs text-muted">{room?.getJoinedMemberCount() ?? 0} members</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {onOpenSearch && (
              <button
                onClick={onOpenSearch}
                className="p-1.5 text-secondary hover:text-primary hover:bg-surface-3 rounded-lg transition-colors"
                title="Search messages"
                aria-label="Search messages"
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
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                  />
                </svg>
              </button>
            )}
            {onOpenThreadList && (
              <button
                onClick={onOpenThreadList}
                className="p-1.5 text-secondary hover:text-primary hover:bg-surface-3 rounded-lg transition-colors"
                title="View all threads"
                aria-label="View all threads"
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
            )}
            <PinnedMessagesButton client={client} room={room} roomId={roomId} />
            {onStartCall && <CallButton roomId={roomId} onStartCall={onStartCall} />}
            {onStartGroupCall && !isDM && (
              <button
                onClick={() => onStartGroupCall("video")}
                className="p-1.5 text-secondary hover:text-primary hover:bg-surface-3 rounded-lg transition-colors"
                title="Group call"
                aria-label="Start group call"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
                  />
                </svg>
              </button>
            )}
            <button
              onClick={onToggleAgentPanel}
              className="px-3 py-1.5 text-xs text-secondary hover:text-primary bg-surface-2 hover:bg-surface-3 rounded-lg transition-colors"
              aria-label="Toggle agent panel"
            >
              Agents
            </button>
            {/* Feature 6: Room menu */}
            <div className="relative">
              <button
                onClick={() => setShowRoomMenu(!showRoomMenu)}
                className="p-1.5 text-secondary hover:text-primary hover:bg-surface-3 rounded-lg transition-colors"
                title="Room options"
                aria-label="Room options"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>
              {showRoomMenu && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-surface-2 border border-border rounded-lg shadow-lg z-50">
                  <button
                    onClick={() => {
                      setShowRoomMenu(false);
                      setShowRoomSettings(true);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-secondary hover:bg-surface-3 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    Room Settings
                  </button>
                  <button
                    onClick={handleLeaveRoom}
                    className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-surface-3 rounded-lg transition-colors"
                  >
                    Leave Room
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Jump to new messages button (top of message area) */}
        {showJumpToUnread && (
          <div className="flex justify-center py-1 relative z-10">
            <button
              onClick={handleJumpToUnread}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-inverse text-xs font-medium rounded-full shadow-lg transition-all flex items-center gap-1.5"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              Jump to new messages
            </button>
          </div>
        )}

        {/* Virtualized messages */}
        <div
          ref={parentRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto relative"
          role="log"
          aria-live="polite"
          aria-label="Message history"
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const msg = messages[virtualRow.index];
              const prevMsg = virtualRow.index > 0 ? messages[virtualRow.index - 1] : undefined;

              // Day separator: show when the previous message is on a different day (or this is the first message)
              const msgDate = new Date(msg.timestamp);
              const showDateSeparator =
                virtualRow.index === 0 ||
                (prevMsg != null && !isSameDay(new Date(prevMsg.timestamp), msgDate));

              // Show "New messages" divider after the last-read event
              const showNewDivider =
                lastReadEventIdRef.current != null &&
                virtualRow.index > 0 &&
                prevMsg != null &&
                prevMsg.id === lastReadEventIdRef.current;

              // Collapsed (continuation) message: same sender within 5 minutes
              const isCollapsed =
                prevMsg != null &&
                !showDateSeparator &&
                prevMsg.sender === msg.sender &&
                msg.timestamp - prevMsg.timestamp < COLLAPSE_THRESHOLD_MS;

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
                  {showDateSeparator && (
                    <div className="flex items-center gap-3 px-4 py-2">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-text-muted text-xs">
                        {formatDateSeparator(msgDate)}
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  )}
                  {showNewDivider && (
                    <div className="flex items-center gap-3 px-4 py-2">
                      <div className="flex-1 h-px bg-red-500/50" />
                      <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wider">
                        New
                      </span>
                      <div className="flex-1 h-px bg-red-500/50" />
                    </div>
                  )}
                  <MessageRow
                    msg={msg}
                    roomId={roomId}
                    userId={userId}
                    reactions={eventStore.getReactionsForEvent(msg.id)}
                    onOpenThread={onOpenThread}
                    onSendEvent={handleSendEvent}
                    onSendReaction={handleSendReaction}
                    onRetry={handleRetry}
                    onEdit={handleStartEdit}
                    onDelete={handleDelete}
                    onReply={handleReply}
                    onForward={handleForward}
                    onReport={handleReport}
                    onNavigateRoom={onNavigateRoom}
                    mxcToHttp={mxcToHttp}
                    isCollapsed={isCollapsed}
                    showUrlPreviews={effectiveShowUrlPreviews}
                    bigEmoji={appSettings.bigEmoji}
                    use24HourTime={appSettings.use24HourTime}
                    showSeconds={appSettings.showSeconds}
                    showReadReceipts={appSettings.showReadReceipts}
                    threadUnreadCount={unreadTracker.getThreadUnreadCount(roomId, msg.id)}
                  />
                </div>
              );
            })}
          </div>

          {/* Feature 3: Jump to bottom button */}
          <button
            onClick={handleJumpToBottom}
            className={`sticky bottom-4 left-1/2 -translate-x-1/2 w-9 h-9 flex items-center justify-center bg-surface-2 border border-border rounded-full shadow-lg text-secondary hover:text-primary hover:bg-surface-3 transition-all duration-200 ${
              showJumpToBottom ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none"
            }`}
            title="Jump to bottom"
            aria-label="Jump to bottom"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        </div>

        {/* Input */}
        <div className="px-4 pb-2 flex-shrink-0">
          {/* Upload progress */}
          {uploading && uploadProgress && (
            <div className="mb-2">
              <div className="flex items-center gap-2 text-xs text-secondary mb-1">
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>
                  Uploading...{" "}
                  {uploadProgress.total > 0
                    ? `${Math.round((uploadProgress.loaded / uploadProgress.total) * 100)}%`
                    : ""}
                </span>
              </div>
              <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-200"
                  style={{
                    width:
                      uploadProgress.total > 0
                        ? `${Math.round((uploadProgress.loaded / uploadProgress.total) * 100)}%`
                        : "0%",
                  }}
                />
              </div>
            </div>
          )}

          {/* Editing indicator */}
          {editingMessageId && (
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs text-accent font-medium">Editing message</span>
              <button
                onClick={handleCancelEdit}
                className="text-xs text-muted hover:text-secondary transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Reply preview bar */}
          {replyingTo && (
            <ReplyPreviewBar
              senderName={replyingTo.senderName}
              body={replyingTo.body}
              onCancel={handleCancelReply}
            />
          )}

          <div
            className={`relative flex items-end gap-2 bg-surface-1 border rounded-xl px-4 py-3 ${editingMessageId ? "border-accent/50" : replyingTo ? "border-accent/50" : "border-border"}`}
          >
            {/* Slash command autocomplete hint */}
            {showCommandHint && (
              <SlashCommandHint
                input={input}
                onSelect={(cmd) => {
                  setInput(cmd);
                  setShowCommandHint(false);
                }}
                onClose={() => setShowCommandHint(false)}
              />
            )}

            {/* Emoji picker floating panel */}
            {showEmojiPicker && (
              <div className="absolute bottom-full left-0 mb-2 z-50">
                <EmojiPicker
                  onSelect={(emoji) => {
                    setInput((prev) => prev + emoji);
                    setShowEmojiPicker(false);
                  }}
                  onClose={() => setShowEmojiPicker(false)}
                />
              </div>
            )}

            {/* GIF picker floating panel */}
            {showGifPicker && (
              <div className="absolute bottom-full left-0 mb-2 z-50">
                <GifPicker onSelectGif={handleSendGif} onClose={() => setShowGifPicker(false)} />
              </div>
            )}

            {/* Attachment button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="p-1 text-muted hover:text-secondary disabled:opacity-30 transition-colors flex-shrink-0"
              title="Attach file"
              aria-label="Attach file"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
                />
              </svg>
            </button>

            {/* Camera button — only shown when getUserMedia is available */}
            {hasCameraSupport && (
              <button
                onClick={() => setShowCamera(true)}
                disabled={uploading}
                className="p-1 text-muted hover:text-secondary disabled:opacity-30 transition-colors flex-shrink-0"
                title="Take photo"
                aria-label="Take photo"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
                  />
                </svg>
              </button>
            )}

            {/* Emoji button */}
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-1 text-muted hover:text-secondary transition-colors flex-shrink-0"
              title="Add emoji"
              aria-label="Add emoji"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z"
                />
              </svg>
            </button>

            {/* Sticker button */}
            <button
              onClick={() => setShowStickerPicker(!showStickerPicker)}
              className="p-1 text-muted hover:text-secondary transition-colors flex-shrink-0"
              title="Send sticker"
              aria-label="Send sticker"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z"
                />
              </svg>
            </button>

            {/* GIF button */}
            <button
              onClick={() => setShowGifPicker(!showGifPicker)}
              className="p-1 text-muted hover:text-secondary transition-colors flex-shrink-0"
              title="Search GIFs"
              aria-label="Search GIFs"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12.75 8.25v7.5m-6-3.75h12M3.75 6.75h16.5c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125H3.75c-.621 0-1.125-.504-1.125-1.125v-8.25c0-.621.504-1.125 1.125-1.125z"
                />
              </svg>
            </button>

            {/* Location button */}
            <button
              onClick={() => setShowLocationPicker(true)}
              className="p-1 text-muted hover:text-secondary transition-colors flex-shrink-0"
              title="Share location"
              aria-label="Share location"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                />
              </svg>
            </button>

            {/* Poll button */}
            <button
              onClick={() => setShowPollCreator(true)}
              className="p-1 text-muted hover:text-secondary transition-colors flex-shrink-0"
              title="Create poll"
              aria-label="Create poll"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                />
              </svg>
            </button>

            {/* @-mention autocomplete popup */}
            {mentionQuery && (
              <MentionAutocomplete
                ref={mentionPanelRef}
                query={mentionQuery.query}
                members={roomMembers}
                homeserverUrl={homeserverUrl}
                onSelect={(selectedUserId, displayName) => {
                  const newText = insertMention(
                    input,
                    mentionQuery.start,
                    mentionQuery.end,
                    selectedUserId,
                    displayName,
                  );
                  setInput(newText);
                  setMentionQuery(null);
                  // Re-focus the textarea after selection
                  requestAnimationFrame(() => {
                    textareaRef.current?.focus();
                  });
                }}
                onClose={() => setMentionQuery(null)}
              />
            )}

            {/* :emoji: autocomplete popup */}
            {emojiQuery && (
              <EmojiAutocomplete
                ref={emojiPanelRef}
                query={emojiQuery.query}
                onSelect={(emoji) => {
                  const newText = insertEmoji(input, emojiQuery.start, emojiQuery.end, emoji);
                  setInput(newText);
                  setEmojiQuery(null);
                  // Re-focus the textarea after selection
                  requestAnimationFrame(() => {
                    textareaRef.current?.focus();
                  });
                }}
                onClose={() => setEmojiQuery(null)}
              />
            )}

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                const val = e.target.value;
                setInput(val);
                onInputKeystroke();
                // Reset tab-cycle on manual text input
                tabCycleRef.current = null;
                // Show slash command hint when input starts with / and has no space yet (typing a command name)
                const trimmed = val.trimStart();
                setShowCommandHint(
                  trimmed.startsWith("/") && !trimmed.includes(" ") && trimmed.length > 0,
                );
                // Detect @-mention query at cursor position
                const cursorPos = e.target.selectionStart ?? val.length;
                const mq = parseMentionQuery(val, cursorPos);
                setMentionQuery(mq);
                // Detect :emoji: query at cursor position
                const eq = parseEmojiQuery(val, cursorPos);
                setEmojiQuery(eq);
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onClick={(e) => {
                // Re-check mention query on click (cursor position may change)
                const ta = e.currentTarget;
                const cursorPos = ta.selectionStart ?? ta.value.length;
                const mq = parseMentionQuery(ta.value, cursorPos);
                setMentionQuery(mq);
                // Re-check emoji query on click
                const eq = parseEmojiQuery(ta.value, cursorPos);
                setEmojiQuery(eq);
              }}
              placeholder={isDM ? `Message ${roomName}...` : `Message #${roomName}...`}
              aria-label="Message composer"
              rows={1}
              className="flex-1 bg-transparent text-sm text-primary placeholder-muted resize-none focus:outline-none"
            />
            {/* Markdown toggle */}
            <button
              onClick={() => {
                const next = !markdownEnabled;
                setMarkdownEnabled(next);
                const s = loadSettings();
                s.markdownEnabled = next;
                saveSettings(s);
              }}
              className={`px-1.5 py-1 text-[10px] font-bold rounded transition-colors flex-shrink-0 ${
                markdownEnabled ? "bg-accent/20 text-accent" : "bg-surface-2 text-muted"
              }`}
              title={
                markdownEnabled
                  ? "Markdown enabled (click to disable)"
                  : "Markdown disabled (click to enable)"
              }
              aria-label="Toggle markdown"
            >
              Md
            </button>
            {input.trim() ? (
              <button
                onClick={editingMessageId ? submitEdit : sendMessage}
                className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-inverse text-xs font-medium rounded-lg transition-colors"
                aria-label={editingMessageId ? "Save edit" : "Send message"}
              >
                {editingMessageId ? "Save" : "Send"}
              </button>
            ) : (
              <VoiceMessageRecorder onRecorded={handleVoiceRecorded} disabled={uploading} />
            )}
          </div>
          {/* Typing indicator */}
          <div className="h-5 px-1 pt-1">
            {typingText && (
              <p className="text-xs text-muted truncate">
                {typingText}
                <span className="typing-dots" />
              </p>
            )}
          </div>
        </div>

        {/* Camera capture modal */}
        {showCamera && (
          <CameraCapture onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />
        )}

        {/* Location picker modal */}
        {showLocationPicker && (
          <LocationPicker roomId={roomId} onClose={() => setShowLocationPicker(false)} />
        )}

        {/* Poll creator modal */}
        {showPollCreator && (
          <PollCreator
            roomId={roomId}
            onClose={() => setShowPollCreator(false)}
            onSendEvent={(rid, type, content) =>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              client.sendEvent(rid, type as any, content)
            }
          />
        )}

        {/* Sticker picker modal */}
        {showStickerPicker && (
          <StickerPicker
            onSendSticker={handleSendSticker}
            onClose={() => setShowStickerPicker(false)}
            homeserverUrl={homeserverUrl}
          />
        )}

        {/* Forward message modal */}
        {forwardMessage && (
          <ForwardMessageModal
            message={forwardMessage}
            onClose={() => setForwardMessage(null)}
            onForwarded={() => setForwardMessage(null)}
          />
        )}

        {/* Report content modal */}
        {reportEventId && (
          <ReportContentModal
            roomId={roomId}
            eventId={reportEventId}
            onClose={() => setReportEventId(null)}
          />
        )}
      </div>

      {/* Room settings side panel */}
      {showRoomSettings && (
        <div className="w-80 border-l border-border flex-shrink-0 h-full overflow-y-auto">
          <RoomSettingsPanel
            roomId={roomId}
            onClose={() => setShowRoomSettings(false)}
            onNavigateRoom={onNavigateRoom}
            onLeaveRoom={handleLeaveRoom}
          />
        </div>
      )}
    </div>
  );
}
