import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useMatrix } from "~/lib/matrix-context";

type DevToolsTab = "room-state" | "send-event" | "event-explorer";

interface DevToolsProps {
  roomId: string | null;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Room State Browser Tab
// ---------------------------------------------------------------------------

interface StateEventEntry {
  type: string;
  stateKey: string;
  sender: string;
  timestamp: number;
  content: Record<string, unknown>;
  eventId: string;
}

function RoomStateTab({ roomId }: { roomId: string }): React.JSX.Element {
  const { client } = useMatrix();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const groupedEvents = useMemo(() => {
    const room = client.getRoom(roomId);
    if (!room) return new Map<string, StateEventEntry[]>();

    const stateEvents = room.currentState.getStateEvents("");
    const groups = new Map<string, StateEventEntry[]>();

    // getStateEvents("") returns all state events (no type filter)
    // But matrix-js-sdk types are strict, so iterate all known state event keys
    const allEvents: StateEventEntry[] = [];

    // Access all state events through the internal state map
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stateMap = (room.currentState as any).events as
      | Map<string, Map<string, unknown>>
      | undefined;
    if (stateMap) {
      for (const [eventType, stateKeyMap] of stateMap) {
        if (stateKeyMap instanceof Map) {
          for (const [stateKey, matrixEvent] of stateKeyMap) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ev = matrixEvent as any;
            if (ev && typeof ev.getContent === "function") {
              allEvents.push({
                type: eventType,
                stateKey: stateKey as string,
                sender: ev.getSender?.() ?? "unknown",
                timestamp: ev.getTs?.() ?? 0,
                content: ev.getContent?.() ?? {},
                eventId: ev.getId?.() ?? "",
              });
            }
          }
        }
      }
    }

    // Fallback: if the internal approach yields nothing, use the SDK method
    if (allEvents.length === 0 && stateEvents) {
      for (const ev of stateEvents) {
        allEvents.push({
          type: ev.getType(),
          stateKey: ev.getStateKey() ?? "",
          sender: ev.getSender() ?? "unknown",
          timestamp: ev.getTs() ?? 0,
          content: ev.getContent() as Record<string, unknown>,
          eventId: ev.getId() ?? "",
        });
      }
    }

    // Group by event type
    for (const entry of allEvents) {
      const existing = groups.get(entry.type) ?? [];
      existing.push(entry);
      groups.set(entry.type, existing);
    }

    // Sort groups by type name
    return new Map([...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  }, [client, roomId]);

  if (groupedEvents.size === 0) {
    return <p className="text-sm text-muted text-center py-8">No state events found.</p>;
  }

  return (
    <div className="space-y-2">
      {Array.from(groupedEvents.entries()).map(([type, events]) => (
        <div key={type} className="border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setExpandedKey(expandedKey === type ? null : type)}
            className="w-full flex items-center justify-between px-3 py-2 bg-surface-2 hover:bg-surface-3 transition-colors text-left"
          >
            <div className="flex items-center gap-2 min-w-0">
              <code className="text-xs font-mono text-accent truncate">{type}</code>
              <span className="text-[10px] text-muted flex-shrink-0">
                ({events.length} event{events.length !== 1 ? "s" : ""})
              </span>
            </div>
            <svg
              className={`w-4 h-4 text-muted flex-shrink-0 transition-transform ${
                expandedKey === type ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expandedKey === type && (
            <div className="divide-y divide-border">
              {events.map((ev) => (
                <StateEventRow key={`${ev.type}-${ev.stateKey}-${ev.eventId}`} event={ev} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function StateEventRow({ event }: { event: StateEventEntry }): React.JSX.Element {
  const [showContent, setShowContent] = useState(false);

  return (
    <div className="px-3 py-2">
      <button onClick={() => setShowContent(!showContent)} className="w-full text-left">
        <div className="flex items-center gap-2 text-xs">
          {event.stateKey && (
            <span className="text-secondary">
              key: <code className="font-mono text-secondary">{event.stateKey}</code>
            </span>
          )}
          <span className="text-muted">from {event.sender}</span>
          <span className="text-faint ml-auto flex-shrink-0">
            {new Date(event.timestamp).toLocaleString()}
          </span>
        </div>
      </button>

      {showContent && (
        <pre className="mt-2 p-2 bg-surface-3 rounded text-[11px] font-mono text-secondary overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(event.content, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Send Custom Event Tab
// ---------------------------------------------------------------------------

function SendEventTab({ roomId }: { roomId: string }): React.JSX.Element {
  const { client } = useMatrix();
  const [eventType, setEventType] = useState("");
  const [stateKey, setStateKey] = useState("");
  const [isStateEvent, setIsStateEvent] = useState(false);
  const [content, setContent] = useState("{\n  \n}");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleSend = useCallback(async () => {
    if (!eventType.trim()) {
      setResult({ ok: false, message: "Event type is required." });
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      setResult({ ok: false, message: "Invalid JSON content." });
      return;
    }

    setSending(true);
    setResult(null);

    try {
      if (isStateEvent) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await client.sendStateEvent(roomId, eventType as any, parsed, stateKey);
        setResult({ ok: true, message: "State event sent successfully." });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await client.sendEvent(roomId, eventType as any, parsed);
        setResult({ ok: true, message: "Timeline event sent successfully." });
      }
    } catch (err: unknown) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : "Failed to send event.",
      });
    } finally {
      setSending(false);
    }
  }, [client, roomId, eventType, content, isStateEvent, stateKey]);

  return (
    <div className="space-y-4">
      {/* Event type */}
      <div>
        <label className="block text-xs font-medium text-secondary mb-1.5">Event Type</label>
        <input
          type="text"
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          placeholder="e.g. m.room.message or rocks.openclaw.agent.ui"
          className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted font-mono focus:outline-none focus:border-accent"
        />
      </div>

      {/* State event toggle */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isStateEvent}
            onChange={(e) => setIsStateEvent(e.target.checked)}
            className="w-4 h-4 rounded bg-surface-2 border-border text-accent focus:ring-accent"
          />
          <span className="text-xs text-secondary">Send as state event</span>
        </label>
      </div>

      {/* State key */}
      {isStateEvent && (
        <div>
          <label className="block text-xs font-medium text-secondary mb-1.5">State Key</label>
          <input
            type="text"
            value={stateKey}
            onChange={(e) => setStateKey(e.target.value)}
            placeholder="(empty string for default)"
            className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted font-mono focus:outline-none focus:border-accent"
          />
        </div>
      )}

      {/* Content */}
      <div>
        <label className="block text-xs font-medium text-secondary mb-1.5">Content (JSON)</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted font-mono resize-y focus:outline-none focus:border-accent"
          spellCheck={false}
        />
      </div>

      {/* Send button */}
      <button
        onClick={handleSend}
        disabled={sending || !eventType.trim()}
        className="w-full px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
      >
        {sending ? "Sending..." : "Send Event"}
      </button>

      {/* Result */}
      {result && (
        <p className={`text-sm ${result.ok ? "text-status-success" : "text-status-error"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event Explorer Tab
// ---------------------------------------------------------------------------

function EventExplorerTab({ roomId }: { roomId: string }): React.JSX.Element {
  const { client } = useMatrix();
  const [eventId, setEventId] = useState("");
  const [loading, setLoading] = useState(false);
  const [eventData, setEventData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = useCallback(async () => {
    const eid = eventId.trim();
    if (!eid) return;

    setLoading(true);
    setError(null);
    setEventData(null);

    try {
      const result = await client.fetchRoomEvent(roomId, eid);
      setEventData(result as Record<string, unknown>);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch event.");
    } finally {
      setLoading(false);
    }
  }, [client, roomId, eventId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleFetch();
      }
    },
    [handleFetch],
  );

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-secondary mb-1.5">Event ID</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="$eventId"
            className="flex-1 px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted font-mono focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleFetch}
            disabled={loading || !eventId.trim()}
            className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-xs font-medium rounded-lg transition-colors"
          >
            {loading ? "..." : "Fetch"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-status-error">{error}</p>}

      {eventData && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-surface-2 border-b border-border">
            <span className="text-xs font-medium text-secondary">Event JSON</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(eventData, null, 2)).catch(() => {});
              }}
              className="text-[10px] text-muted hover:text-secondary transition-colors"
            >
              Copy
            </button>
          </div>
          <pre className="p-3 text-[11px] font-mono text-secondary overflow-x-auto whitespace-pre-wrap break-all max-h-[50vh]">
            {JSON.stringify(eventData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main DevTools Panel
// ---------------------------------------------------------------------------

export function DevTools({ roomId, onClose }: DevToolsProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<DevToolsTab>("room-state");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-1 border border-border rounded-xl shadow-2xl w-[800px] max-w-[95vw] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-primary">Developer Tools</h3>
            {roomId && <code className="text-[10px] text-muted font-mono">{roomId}</code>}
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

        {/* Tab bar */}
        <div className="flex gap-1 px-4 py-2 border-b border-border flex-shrink-0">
          <button
            onClick={() => setActiveTab("room-state")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === "room-state"
                ? "bg-surface-3 text-primary"
                : "text-muted hover:text-secondary hover:bg-surface-2"
            }`}
          >
            Room State
          </button>
          <button
            onClick={() => setActiveTab("send-event")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === "send-event"
                ? "bg-surface-3 text-primary"
                : "text-muted hover:text-secondary hover:bg-surface-2"
            }`}
          >
            Send Event
          </button>
          <button
            onClick={() => setActiveTab("event-explorer")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === "event-explorer"
                ? "bg-surface-3 text-primary"
                : "text-muted hover:text-secondary hover:bg-surface-2"
            }`}
          >
            Event Explorer
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {!roomId ? (
            <p className="text-sm text-muted text-center py-8">
              Select a room to use Developer Tools.
            </p>
          ) : (
            <>
              {activeTab === "room-state" && <RoomStateTab roomId={roomId} />}
              {activeTab === "send-event" && <SendEventTab roomId={roomId} />}
              {activeTab === "event-explorer" && <EventExplorerTab roomId={roomId} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
