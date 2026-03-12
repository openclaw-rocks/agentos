import React, { useMemo, useSyncExternalStore } from "react";
import { useMatrix } from "~/lib/matrix-context";
import { PollEventTypes } from "~/lib/polls";
import type { PollStartContent } from "~/lib/polls";

interface PollHistoryProps {
  roomId: string;
  onJumpToEvent?: (eventId: string) => void;
}

interface PollEntry {
  eventId: string;
  question: string;
  answers: Array<{ id: string; text: string }>;
  creator: string;
  creatorName: string;
  timestamp: number;
  ended: boolean;
  voteCounts: Map<string, number>;
  totalVotes: number;
}

export function PollHistory({ roomId, onJumpToEvent }: PollHistoryProps): React.JSX.Element {
  const { client, eventStore } = useMatrix();

  // Re-render when event store updates
  useSyncExternalStore(eventStore.subscribe, eventStore.getVersion);

  const polls = useMemo((): PollEntry[] => {
    const room = client.getRoom(roomId);
    if (!room) return [];

    const timeline = room.getLiveTimeline().getEvents();
    const pollMap = new Map<string, PollEntry>();
    const responseMap = new Map<string, Map<string, string>>(); // pollId -> (sender -> answerId)
    const endedSet = new Set<string>();

    // Scan all timeline events
    for (const event of timeline) {
      const type = event.getType();

      if (type === PollEventTypes.Start) {
        const content = event.getContent() as unknown as PollStartContent;
        const poll = content["m.poll"];
        if (!poll) continue;

        const sender = event.getSender() ?? "unknown";
        const member = room.getMember(sender);

        pollMap.set(event.getId() ?? "", {
          eventId: event.getId() ?? "",
          question: poll.question["m.text"],
          answers: poll.answers.map((a) => ({ id: a.id, text: a["m.text"] })),
          creator: sender,
          creatorName: member?.name ?? sender,
          timestamp: event.getTs() ?? 0,
          ended: false,
          voteCounts: new Map(),
          totalVotes: 0,
        });
      }

      if (type === PollEventTypes.Response) {
        const content = event.getContent() as Record<string, unknown>;
        const relatesTo = content["m.relates_to"] as
          | { rel_type: string; event_id: string }
          | undefined;
        if (!relatesTo || relatesTo.rel_type !== "m.reference") continue;

        const pollId = relatesTo.event_id;
        const sender = event.getSender() ?? "";
        const selections = content["m.selections"] as string[] | undefined;
        if (!selections || selections.length === 0) continue;

        if (!responseMap.has(pollId)) {
          responseMap.set(pollId, new Map());
        }
        // Latest response wins (we process in chronological order)
        responseMap.get(pollId)!.set(sender, selections[0]);
      }

      if (type === PollEventTypes.End) {
        const content = event.getContent() as Record<string, unknown>;
        const relatesTo = content["m.relates_to"] as
          | { rel_type: string; event_id: string }
          | undefined;
        if (!relatesTo || relatesTo.rel_type !== "m.reference") continue;
        endedSet.add(relatesTo.event_id);
      }
    }

    // Compute vote counts
    for (const [pollId, entry] of pollMap) {
      if (endedSet.has(pollId)) {
        entry.ended = true;
      }

      const responses = responseMap.get(pollId);
      if (responses) {
        const counts = new Map<string, number>();
        for (const a of entry.answers) {
          counts.set(a.id, 0);
        }
        for (const answerId of responses.values()) {
          const cur = counts.get(answerId);
          if (cur !== undefined) {
            counts.set(answerId, cur + 1);
          }
        }
        entry.voteCounts = counts;
        entry.totalVotes = Array.from(counts.values()).reduce((s, v) => s + v, 0);
      }
    }

    // Sort by timestamp descending (most recent first)
    return Array.from(pollMap.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [client, roomId, eventStore]);

  const activePolls = polls.filter((p) => !p.ended);
  const pastPolls = polls.filter((p) => p.ended);

  if (polls.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted">No polls found in this room.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Polls */}
      {activePolls.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">
            Active Polls ({activePolls.length})
          </h4>
          <div className="space-y-3">
            {activePolls.map((poll) => (
              <PollCard key={poll.eventId} poll={poll} onJump={onJumpToEvent} />
            ))}
          </div>
        </div>
      )}

      {/* Past Polls */}
      {pastPolls.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">
            Past Polls ({pastPolls.length})
          </h4>
          <div className="space-y-3">
            {pastPolls.map((poll) => (
              <PollCard key={poll.eventId} poll={poll} onJump={onJumpToEvent} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PollCard({
  poll,
  onJump,
}: {
  poll: PollEntry;
  onJump?: (eventId: string) => void;
}): React.JSX.Element {
  return (
    <div className="bg-surface-2 border border-border rounded-lg p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-primary">{poll.question}</p>
        {poll.ended && (
          <span className="text-[10px] px-1.5 py-0.5 bg-surface-4/30 text-secondary rounded flex-shrink-0">
            Ended
          </span>
        )}
        {!poll.ended && (
          <span className="text-[10px] px-1.5 py-0.5 bg-status-success/20 text-status-success rounded flex-shrink-0">
            Active
          </span>
        )}
      </div>

      {/* Options with vote counts */}
      <div className="space-y-1.5 mb-3">
        {poll.answers.map((answer) => {
          const count = poll.voteCounts.get(answer.id) ?? 0;
          const percentage = poll.totalVotes > 0 ? Math.round((count / poll.totalVotes) * 100) : 0;

          return (
            <div key={answer.id} className="relative">
              <div
                className="absolute inset-0 bg-accent/10 rounded"
                style={{ width: `${percentage}%` }}
              />
              <div className="relative flex items-center justify-between px-2 py-1 text-xs">
                <span className="text-secondary">{answer.text}</span>
                <span className="text-muted flex-shrink-0 ml-2">
                  {count} vote{count !== 1 ? "s" : ""} ({percentage}%)
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>
          by {poll.creatorName} &middot; {new Date(poll.timestamp).toLocaleString()} &middot;{" "}
          {poll.totalVotes} total vote{poll.totalVotes !== 1 ? "s" : ""}
        </span>
        {onJump && (
          <button onClick={() => onJump(poll.eventId)} className="text-accent hover:underline">
            Jump to poll
          </button>
        )}
      </div>
    </div>
  );
}
