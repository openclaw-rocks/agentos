import { EventTypes } from "@openclaw/protocol";
import type * as sdk from "matrix-js-sdk";
import type { AgentRegistry } from "./agent-registry";

export interface TimelineMessage {
  id: string;
  sender: string;
  senderName: string;
  type: string;
  content: Record<string, unknown>;
  timestamp: number;
  isAgent: boolean;
  replyCount: number;
  edited?: boolean;
  redacted?: boolean;
  pending?: boolean;
  failed?: boolean;
}

export interface ThreadMessage {
  id: string;
  sender: string;
  senderName: string;
  type: string;
  content: Record<string, unknown>;
  timestamp: number;
  isAgent: boolean;
  isRoot: boolean;
  edited?: boolean;
  redacted?: boolean;
}

export interface ThreadSummary {
  rootMessage: TimelineMessage;
  replyCount: number;
  lastReply: ThreadMessage | undefined;
  latestActivity: number;
}

const RELEVANT_TYPES = new Set([
  "m.room.message",
  "m.room.tombstone",
  "m.sticker",
  "m.reaction",
  EventTypes.UI,
  EventTypes.Task,
  EventTypes.Status,
  EventTypes.ToolCall,
  EventTypes.ToolResult,
]);

type Listener = () => void;

export class EventStore {
  /** Optional reference to AgentRegistry for proper isAgent detection */
  private agentRegistry: AgentRegistry | null = null;

  setAgentRegistry(registry: AgentRegistry) {
    this.agentRegistry = registry;
  }

  /** room_id -> ordered array of timeline messages (excludes thread children) */
  private roomMessages = new Map<string, TimelineMessage[]>();

  /** event_id -> TimelineMessage (for O(1) lookups) */
  private eventMap = new Map<string, TimelineMessage>();

  /** thread_root_id -> array of thread reply messages */
  private threadReplies = new Map<string, ThreadMessage[]>();

  /** thread_root_id -> reply count */
  private threadCounts = new Map<string, number>();

  /** event IDs that are thread children (to exclude from main timeline) */
  private threadChildIds = new Set<string>();

  /** event IDs we've already processed (dedup) */
  private seenIds = new Set<string>();

  /** Reactions: target_event_id -> emoji_key -> Set<sender_id> */
  private reactions = new Map<string, Map<string, Set<string>>>();

  /** temp_id -> roomId for local echo tracking */
  private localEchoRoomMap = new Map<string, string>();

  /** monotonic version counter – bumped on every change */
  private version = 0;

  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify() {
    this.version++;
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Snapshot for useSyncExternalStore – triggers re-render on any change */
  getVersion = (): number => this.version;

  /** Track known room IDs so we can notify when new rooms appear */
  private knownRoomIds = new Set<string>();

  /** Bulk-load existing timeline events for a room (initial sync) */
  loadRoom(room: sdk.Room) {
    const isNewRoom = !this.knownRoomIds.has(room.roomId);
    if (isNewRoom) this.knownRoomIds.add(room.roomId);

    const timeline = room.getLiveTimeline().getEvents();
    let changed = isNewRoom;

    for (const event of timeline) {
      if (this.processEventInternal(event, room)) {
        changed = true;
      }
    }

    if (changed) {
      this.notify();
    }
  }

  /** Process a single new event (from RoomEvent.Timeline callback) */
  processEvent(event: sdk.MatrixEvent, room: sdk.Room | null) {
    if (!room) return;
    if (this.processEventInternal(event, room)) {
      this.notify();
    }
  }

  private processEventInternal(event: sdk.MatrixEvent, room: sdk.Room): boolean {
    const eventId = event.getId();
    if (!eventId) return false;
    // Skip SDK local echoes (status !== null means still sending/queued).
    // The confirmed event will arrive later with status === null.
    if (event.status != null) return false;
    if (this.seenIds.has(eventId)) return false;

    const type = event.getType();
    if (!RELEVANT_TYPES.has(type)) return false;

    this.seenIds.add(eventId);

    const roomId = room.roomId;
    const sender = event.getSender() ?? "";
    const senderName = room.getMember(sender)?.name ?? sender;
    const content = event.getContent() as Record<string, unknown>;
    const timestamp = event.getTs();
    const isAgent = this.agentRegistry?.isAgent(sender) ?? false;

    // Handle reaction events
    if (type === "m.reaction") {
      const relation = content?.["m.relates_to"] as
        | { rel_type?: string; event_id?: string; key?: string }
        | undefined;

      if (relation?.rel_type === "m.annotation" && relation.event_id && relation.key) {
        const targetId = relation.event_id;
        const key = relation.key;

        let emojiMap = this.reactions.get(targetId);
        if (!emojiMap) {
          emojiMap = new Map();
          this.reactions.set(targetId, emojiMap);
        }

        let senders = emojiMap.get(key);
        if (!senders) {
          senders = new Set();
          emojiMap.set(key, senders);
        }

        if (senders.has(sender)) {
          // Already reacted with same emoji — no change
          return false;
        }

        senders.add(sender);
        return true;
      }

      return false;
    }

    // Check for message edit (replacement) or thread reply
    const relation = content?.["m.relates_to"] as
      | { rel_type?: string; event_id?: string }
      | undefined;

    if (relation?.rel_type === "m.replace" && relation.event_id) {
      const targetId = relation.event_id;
      const newContent = content["m.new_content"] as Record<string, unknown> | undefined;

      if (newContent) {
        let found = false;

        // Update in eventMap (main timeline messages)
        const targetMsg = this.eventMap.get(targetId);
        if (targetMsg) {
          targetMsg.content = newContent;
          targetMsg.edited = true;
          found = true;

          // Re-create the room messages array reference for the room that contains this message
          for (const [rid, msgs] of this.roomMessages.entries()) {
            if (msgs.some((m) => m.id === targetId)) {
              this.roomMessages.set(rid, [...msgs]);
              break;
            }
          }
        }

        // Update in thread replies
        for (const [rootId, replies] of this.threadReplies.entries()) {
          const targetReply = replies.find((r) => r.id === targetId);
          if (targetReply) {
            targetReply.content = newContent;
            targetReply.edited = true;
            this.threadReplies.set(rootId, [...replies]);
            found = true;
            break;
          }
        }

        return found;
      }

      return false;
    }

    if (relation?.rel_type === "m.thread" && relation.event_id) {
      const rootId = relation.event_id;
      this.threadChildIds.add(eventId);

      // Update reply count
      const newCount = (this.threadCounts.get(rootId) ?? 0) + 1;
      this.threadCounts.set(rootId, newCount);

      // Update the root message's reply count in the main timeline
      const rootMsg = this.eventMap.get(rootId);
      if (rootMsg) {
        rootMsg.replyCount = newCount;
      }

      // Add to thread replies
      const threadMsg: ThreadMessage = {
        id: eventId,
        sender,
        senderName,
        type,
        content,
        timestamp,
        isAgent,
        isRoot: false,
      };

      let replies = this.threadReplies.get(rootId);
      if (!replies) {
        replies = [];
        this.threadReplies.set(rootId, replies);
      }
      replies.push(threadMsg);

      // Re-create the room messages array reference so useSyncExternalStore detects the change
      const msgs = this.roomMessages.get(roomId);
      if (msgs) {
        this.roomMessages.set(roomId, [...msgs]);
      }

      return true;
    }

    // Main timeline message
    const msg: TimelineMessage = {
      id: eventId,
      sender,
      senderName,
      type,
      content,
      timestamp,
      isAgent,
      replyCount: this.threadCounts.get(eventId) ?? 0,
    };

    this.eventMap.set(eventId, msg);

    let msgs = this.roomMessages.get(roomId);
    if (!msgs) {
      msgs = [];
      this.roomMessages.set(roomId, msgs);
    }

    // Create a new array reference for useSyncExternalStore
    const newMsgs = [...msgs, msg];
    this.roomMessages.set(roomId, newMsgs);

    return true;
  }

  /** Get main timeline messages for a room (stable reference when unchanged) */
  getMessagesForRoom = (roomId: string): TimelineMessage[] => {
    return this.roomMessages.get(roomId) ?? EMPTY_MESSAGES;
  };

  /** Get reactions grouped by emoji key for a given event */
  getReactionsForEvent = (eventId: string): Map<string, Set<string>> => {
    return this.reactions.get(eventId) ?? EMPTY_REACTIONS;
  };

  /** Get thread messages including the root */
  getThreadMessages = (roomId: string, threadRootId: string): ThreadMessage[] => {
    const rootMsg = this.eventMap.get(threadRootId);
    const replies = this.threadReplies.get(threadRootId) ?? [];

    if (!rootMsg) return replies;

    const rootThread: ThreadMessage = {
      id: rootMsg.id,
      sender: rootMsg.sender,
      senderName: rootMsg.senderName,
      type: rootMsg.type,
      content: rootMsg.content,
      timestamp: rootMsg.timestamp,
      isAgent: rootMsg.isAgent,
      isRoot: true,
      edited: rootMsg.edited,
      redacted: rootMsg.redacted,
    };

    return [rootThread, ...replies];
  };

  /** Look up a message by event ID */
  getMessageById = (eventId: string): TimelineMessage | undefined => {
    return this.eventMap.get(eventId);
  };

  /** Get all thread summaries for a given room, sorted by latest activity (newest first). */
  getThreadSummaries = (roomId: string): ThreadSummary[] => {
    const messages = this.roomMessages.get(roomId);
    if (!messages) return EMPTY_THREAD_SUMMARIES;

    const summaries: ThreadSummary[] = [];

    for (const msg of messages) {
      if (msg.replyCount <= 0) continue;

      const replies = this.threadReplies.get(msg.id) ?? [];
      const lastReply = replies.length > 0 ? replies[replies.length - 1] : undefined;
      const latestActivity = lastReply ? lastReply.timestamp : msg.timestamp;

      summaries.push({
        rootMessage: msg,
        replyCount: msg.replyCount,
        lastReply,
        latestActivity,
      });
    }

    // Sort by latest activity, newest first
    summaries.sort((a, b) => b.latestActivity - a.latestActivity);

    return summaries;
  };

  /** Redact a message — mark it as deleted and clear its content */
  redactMessage(eventId: string): void {
    // Check main timeline messages
    const targetMsg = this.eventMap.get(eventId);
    if (targetMsg) {
      targetMsg.redacted = true;
      targetMsg.content = {};

      // Re-create the room messages array reference
      for (const [rid, msgs] of this.roomMessages.entries()) {
        if (msgs.some((m) => m.id === eventId)) {
          this.roomMessages.set(rid, [...msgs]);
          break;
        }
      }

      this.notify();
      return;
    }

    // Check thread replies
    for (const [rootId, replies] of this.threadReplies.entries()) {
      const targetReply = replies.find((r) => r.id === eventId);
      if (targetReply) {
        targetReply.redacted = true;
        targetReply.content = {};
        this.threadReplies.set(rootId, [...replies]);
        this.notify();
        return;
      }
    }
  }

  /** Add a local echo (optimistic) message to a room */
  addLocalEcho(
    roomId: string,
    tempId: string,
    sender: string,
    senderName: string,
    content: Record<string, unknown>,
    timestamp: number,
  ): void {
    const msg: TimelineMessage = {
      id: tempId,
      sender,
      senderName,
      type: "m.room.message",
      content,
      timestamp,
      isAgent: false,
      replyCount: 0,
      pending: true,
    };

    this.localEchoRoomMap.set(tempId, roomId);
    this.eventMap.set(tempId, msg);
    // Mark tempId as seen so processEventInternal won't duplicate
    // (real event will use a different ID and go through resolveLocalEcho)
    this.seenIds.add(tempId);

    let msgs = this.roomMessages.get(roomId);
    if (!msgs) {
      msgs = [];
      this.roomMessages.set(roomId, msgs);
    }
    this.roomMessages.set(roomId, [...msgs, msg]);
    this.notify();
  }

  /** Replace a local echo with the real event once sync delivers it */
  resolveLocalEcho(tempId: string, realEventId: string): void {
    const roomId = this.localEchoRoomMap.get(tempId);
    if (!roomId) return;

    const msgs = this.roomMessages.get(roomId);
    if (!msgs) return;

    const idx = msgs.findIndex((m) => m.id === tempId);
    if (idx === -1) return;

    const resolved: TimelineMessage = { ...msgs[idx], id: realEventId, pending: false };
    const newMsgs = [...msgs];
    newMsgs[idx] = resolved;
    this.roomMessages.set(roomId, newMsgs);

    this.eventMap.delete(tempId);
    this.eventMap.set(realEventId, resolved);
    this.seenIds.add(realEventId);
    this.localEchoRoomMap.delete(tempId);

    this.notify();
  }

  /** Mark a local echo as failed */
  failLocalEcho(tempId: string): void {
    const roomId = this.localEchoRoomMap.get(tempId);
    if (!roomId) return;

    const msgs = this.roomMessages.get(roomId);
    if (!msgs) return;

    const idx = msgs.findIndex((m) => m.id === tempId);
    if (idx === -1) return;

    const failed: TimelineMessage = { ...msgs[idx], pending: false, failed: true };
    const newMsgs = [...msgs];
    newMsgs[idx] = failed;
    this.roomMessages.set(roomId, newMsgs);

    this.eventMap.set(tempId, failed);
    this.notify();
  }

  /** Remove a local echo entirely (used when retrying a failed message) */
  removeLocalEcho(tempId: string): void {
    const roomId = this.localEchoRoomMap.get(tempId);
    if (!roomId) return;

    const msgs = this.roomMessages.get(roomId);
    if (!msgs) return;

    this.roomMessages.set(
      roomId,
      msgs.filter((m) => m.id !== tempId),
    );
    this.eventMap.delete(tempId);
    this.seenIds.delete(tempId);
    this.localEchoRoomMap.delete(tempId);

    this.notify();
  }
}

const EMPTY_MESSAGES: TimelineMessage[] = [];
const EMPTY_REACTIONS: Map<string, Set<string>> = new Map();
const EMPTY_THREAD_SUMMARIES: ThreadSummary[] = [];
