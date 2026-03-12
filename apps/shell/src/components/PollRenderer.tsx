import React, { useMemo, useSyncExternalStore } from "react";
import {
  PollEventTypes,
  type PollResults,
  type PollStore,
  type PollResponseContent,
  type PollEndContent,
} from "~/lib/polls";

interface PollRendererProps {
  pollEventId: string;
  pollStore: PollStore;
  userId: string;
  onSendEvent: (type: string, content: PollResponseContent | PollEndContent) => void;
}

function PollOptionBar({
  id,
  text,
  count,
  percentage,
  isMyVote,
  showResults,
  ended,
  onVote,
}: {
  id: string;
  text: string;
  count: number;
  percentage: number;
  isMyVote: boolean;
  showResults: boolean;
  ended: boolean;
  onVote: (answerId: string) => void;
}) {
  const isClickable = !ended;

  return (
    <button
      type="button"
      onClick={() => {
        if (isClickable) onVote(id);
      }}
      disabled={ended}
      className={`relative w-full text-left rounded-lg border px-3 py-2 transition-colors ${
        isMyVote
          ? "border-accent bg-accent/10"
          : ended
            ? "border-border bg-surface-2 cursor-default"
            : "border-border bg-surface-2 hover:border-surface-4 cursor-pointer"
      }`}
    >
      {/* Background percentage bar */}
      {showResults && (
        <div
          className={`absolute inset-0 rounded-lg transition-all duration-300 ${
            isMyVote ? "bg-accent/15" : "bg-surface-3"
          }`}
          style={{ width: `${percentage}%` }}
        />
      )}

      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Selection indicator */}
          <div
            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
              isMyVote ? "border-accent" : "border-surface-4"
            }`}
          >
            {isMyVote && <div className="w-2 h-2 rounded-full bg-accent" />}
          </div>
          <span
            className={`text-sm truncate ${isMyVote ? "text-primary font-medium" : "text-secondary"}`}
          >
            {text}
          </span>
        </div>

        {showResults && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-secondary">
              {count} {count === 1 ? "vote" : "votes"}
            </span>
            <span className="text-xs text-muted w-8 text-right">{percentage}%</span>
          </div>
        )}
      </div>
    </button>
  );
}

export function PollRenderer({ pollEventId, pollStore, userId, onSendEvent }: PollRendererProps) {
  // Subscribe to poll store changes
  const storeVersion = useSyncExternalStore(pollStore.subscribe, pollStore.getVersion);

  const results: PollResults | null = useMemo(
    () => pollStore.getResults(pollEventId, userId),

    [pollStore, pollEventId, userId, storeVersion],
  );

  if (!results) return null;

  const showResults = results.kind === "m.disclosed" || results.ended;
  const isCreator = results.creatorId === userId;

  const handleVote = (answerId: string) => {
    if (results.ended) return;

    const content: PollResponseContent = {
      "m.relates_to": {
        rel_type: "m.reference",
        event_id: pollEventId,
      },
      "m.selections": [answerId],
    };

    onSendEvent(PollEventTypes.Response, content);
  };

  const handleEndPoll = () => {
    if (results.ended) return;

    // Build results map
    const resultsMap: Record<string, number> = {};
    for (const a of results.answers) {
      resultsMap[a.id] = a.count;
    }

    // Find winner text for fallback
    const sorted = [...results.answers].sort((a, b) => b.count - a.count);
    const winnerText =
      sorted.length > 0 && sorted[0].count > 0
        ? `${sorted[0].text} won with ${sorted[0].count} ${sorted[0].count === 1 ? "vote" : "votes"}.`
        : "No votes were cast.";

    const content: PollEndContent = {
      "m.relates_to": {
        rel_type: "m.reference",
        event_id: pollEventId,
      },
      "m.text": `Poll ended. ${winnerText}`,
      "m.poll.results": resultsMap,
    };

    onSendEvent(PollEventTypes.End, content);
  };

  return (
    <div className="max-w-md">
      {/* Poll icon + question */}
      <div className="flex items-start gap-2 mb-3">
        <svg
          className="w-5 h-5 text-accent flex-shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        <h3 className="text-sm font-semibold text-primary">{results.question}</h3>
      </div>

      {/* Options */}
      <div className="space-y-1.5">
        {results.answers.map((answer) => (
          <PollOptionBar
            key={answer.id}
            id={answer.id}
            text={answer.text}
            count={answer.count}
            percentage={answer.percentage}
            isMyVote={results.myVote === answer.id}
            showResults={showResults}
            ended={results.ended}
            onVote={handleVote}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-muted">
          {results.totalVotes} {results.totalVotes === 1 ? "vote" : "votes"}
          {results.ended && " - Final results"}
          {!results.ended &&
            results.kind === "m.undisclosed" &&
            " - Results hidden until poll ends"}
        </span>

        {/* End poll button — only for the creator, and only when poll is active */}
        {isCreator && !results.ended && (
          <button
            type="button"
            onClick={handleEndPoll}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            End poll
          </button>
        )}
      </div>
    </div>
  );
}
