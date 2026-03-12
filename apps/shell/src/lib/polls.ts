/**
 * MSC3381-compatible poll types and vote aggregation for the AgentOS shell.
 *
 * Event types:
 *   m.poll.start    — creates a poll
 *   m.poll.response — casts / changes a vote
 *   m.poll.end      — closes the poll (only creator should send)
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PollEventTypes = {
  Start: "m.poll.start",
  Response: "m.poll.response",
  End: "m.poll.end",
} as const;

export type PollKind = "m.disclosed" | "m.undisclosed";

// ---------------------------------------------------------------------------
// Content shapes (MSC3381)
// ---------------------------------------------------------------------------

export interface PollAnswer {
  id: string;
  "m.text": string;
}

export interface PollStartContent {
  "m.poll": {
    question: { "m.text": string };
    kind: PollKind;
    max_selections: number;
    answers: PollAnswer[];
  };
  /** Plain-text fallback for clients that don't support polls. */
  "m.text": string;
}

export interface PollResponseContent {
  "m.relates_to": {
    rel_type: "m.reference";
    event_id: string;
  };
  "m.selections": string[];
}

export interface PollEndContent {
  "m.relates_to": {
    rel_type: "m.reference";
    event_id: string;
  };
  "m.text": string;
  "m.poll.results"?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Aggregation result
// ---------------------------------------------------------------------------

export interface PollAnswerResult {
  id: string;
  text: string;
  count: number;
  percentage: number;
}

export interface PollResults {
  question: string;
  kind: PollKind;
  maxSelections: number;
  answers: PollAnswerResult[];
  totalVotes: number;
  myVote: string | null;
  ended: boolean;
  creatorId: string;
}

// ---------------------------------------------------------------------------
// PollState — aggregates responses for a single poll
// ---------------------------------------------------------------------------

export class PollState {
  private question: string;
  private kind: PollKind;
  private maxSelections: number;
  private answers: PollAnswer[];
  private creatorId: string;

  /** sender -> latest selected answer id (only single-selection for now) */
  private votes = new Map<string, string>();

  /** Track response ordering per sender so "latest wins" is deterministic */
  private responseTimestamps = new Map<string, number>();

  private ended = false;

  constructor(startContent: PollStartContent, creatorId: string) {
    const poll = startContent["m.poll"];
    this.question = poll.question["m.text"];
    this.kind = poll.kind;
    this.maxSelections = poll.max_selections;
    this.answers = poll.answers;
    this.creatorId = creatorId;
  }

  /**
   * Record a vote. If the sender already voted, only the latest response
   * (by timestamp) wins.
   */
  addResponse(sender: string, selections: string[], timestamp: number): void {
    if (this.ended) return;

    const prev = this.responseTimestamps.get(sender);
    if (prev !== undefined && timestamp < prev) return;

    this.responseTimestamps.set(sender, timestamp);

    // Validate: only keep selections that reference known answer ids
    const validIds = new Set(this.answers.map((a) => a.id));
    const valid = selections.filter((s) => validIds.has(s));

    if (valid.length === 0) {
      this.votes.delete(sender);
      return;
    }

    // MSC3381: respect max_selections — take the first N
    const selected = valid.slice(0, this.maxSelections);
    // For simplicity we store only the first selection (max_selections = 1 is standard)
    this.votes.set(sender, selected[0]);
  }

  /** Mark the poll as ended. */
  end(): void {
    this.ended = true;
  }

  /** Build the aggregated results snapshot. */
  getResults(myUserId: string): PollResults {
    const countMap = new Map<string, number>();
    for (const a of this.answers) {
      countMap.set(a.id, 0);
    }

    for (const answerId of this.votes.values()) {
      const cur = countMap.get(answerId);
      if (cur !== undefined) {
        countMap.set(answerId, cur + 1);
      }
    }

    const totalVotes = Array.from(countMap.values()).reduce((s, v) => s + v, 0);

    const answers: PollAnswerResult[] = this.answers.map((a) => {
      const count = countMap.get(a.id) ?? 0;
      return {
        id: a.id,
        text: a["m.text"],
        count,
        percentage: totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0,
      };
    });

    const myVote = this.votes.get(myUserId) ?? null;

    return {
      question: this.question,
      kind: this.kind,
      maxSelections: this.maxSelections,
      answers,
      totalVotes,
      myVote,
      ended: this.ended,
      creatorId: this.creatorId,
    };
  }
}

// ---------------------------------------------------------------------------
// PollStore — manages PollState instances across multiple polls in a room
// ---------------------------------------------------------------------------

type Listener = () => void;

export class PollStore {
  private polls = new Map<string, PollState>();
  private version = 0;
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  private notify(): void {
    this.version++;
    for (const fn of this.listeners) {
      fn();
    }
  }

  /** Register a new poll from a m.poll.start event. */
  addPoll(eventId: string, content: PollStartContent, creatorId: string): void {
    if (this.polls.has(eventId)) return;
    this.polls.set(eventId, new PollState(content, creatorId));
    this.notify();
  }

  /** Record a vote from a m.poll.response event. */
  addResponse(pollEventId: string, sender: string, selections: string[], timestamp: number): void {
    const state = this.polls.get(pollEventId);
    if (!state) return;
    state.addResponse(sender, selections, timestamp);
    this.notify();
  }

  /** End a poll from a m.poll.end event. */
  endPoll(pollEventId: string): void {
    const state = this.polls.get(pollEventId);
    if (!state) return;
    state.end();
    this.notify();
  }

  /** Retrieve computed results for a given poll. */
  getResults(pollEventId: string, myUserId: string): PollResults | null {
    const state = this.polls.get(pollEventId);
    if (!state) return null;
    return state.getResults(myUserId);
  }

  /** Check whether a poll exists in the store. */
  hasPoll(eventId: string): boolean {
    return this.polls.has(eventId);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the plain-text fallback for a poll start event. */
export function buildPollFallback(question: string, answers: PollAnswer[]): string {
  const lines = [question, ...answers.map((a, i) => `${i + 1}. ${a["m.text"]}`)];
  return lines.join("\n");
}

/** Generate a short random id for poll answers. */
export function generateAnswerId(): string {
  return `a${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
