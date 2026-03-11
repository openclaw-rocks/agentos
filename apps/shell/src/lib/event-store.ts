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
}

const RELEVANT_TYPES = new Set([
  "m.room.message",
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

    // Check if this is a thread reply
    const relation = content?.["m.relates_to"] as
      | { rel_type?: string; event_id?: string }
      | undefined;

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
    };

    return [rootThread, ...replies];
  };
}

const EMPTY_MESSAGES: TimelineMessage[] = [];
