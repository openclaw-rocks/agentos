import { describe, it, expect, beforeEach } from "vitest";
import {
  PollState,
  PollStore,
  buildPollFallback,
  generateAnswerId,
  type PollStartContent,
} from "./polls";

function makePollStart(
  question: string,
  answers: Array<{ id: string; text: string }>,
  kind: "m.disclosed" | "m.undisclosed" = "m.disclosed",
  maxSelections = 1,
): PollStartContent {
  const pollAnswers = answers.map((a) => ({ id: a.id, "m.text": a.text }));
  return {
    "m.poll": {
      question: { "m.text": question },
      kind,
      max_selections: maxSelections,
      answers: pollAnswers,
    },
    "m.text": buildPollFallback(question, pollAnswers),
  };
}

const MY_USER = "@alice:example.com";

describe("PollState", () => {
  describe("given a poll with votes", () => {
    let state: PollState;

    beforeEach(() => {
      const content = makePollStart("Favorite color?", [
        { id: "a1", text: "Red" },
        { id: "a2", text: "Blue" },
        { id: "a3", text: "Green" },
      ]);
      state = new PollState(content, "@creator:example.com");
    });

    it("should aggregate votes by answer", () => {
      // Given
      state.addResponse("@bob:example.com", ["a1"], 1000);
      state.addResponse("@carol:example.com", ["a1"], 1001);
      state.addResponse("@dave:example.com", ["a2"], 1002);

      // When
      const results = state.getResults(MY_USER);

      // Then
      expect(results.answers[0].count).toBe(2); // Red: 2
      expect(results.answers[1].count).toBe(1); // Blue: 1
      expect(results.answers[2].count).toBe(0); // Green: 0
      expect(results.totalVotes).toBe(3);
    });

    it("should calculate percentages", () => {
      // Given
      state.addResponse("@bob:example.com", ["a1"], 1000);
      state.addResponse("@carol:example.com", ["a1"], 1001);
      state.addResponse("@dave:example.com", ["a2"], 1002);
      state.addResponse("@eve:example.com", ["a2"], 1003);

      // When
      const results = state.getResults(MY_USER);

      // Then
      expect(results.answers[0].percentage).toBe(50); // Red 2/4
      expect(results.answers[1].percentage).toBe(50); // Blue 2/4
      expect(results.answers[2].percentage).toBe(0); // Green 0/4
    });

    it("should handle vote changes (latest vote wins)", () => {
      // Given — bob votes a1 at t=1000, then changes to a2 at t=2000
      state.addResponse("@bob:example.com", ["a1"], 1000);
      state.addResponse("@bob:example.com", ["a2"], 2000);

      // When
      const results = state.getResults(MY_USER);

      // Then
      expect(results.answers[0].count).toBe(0); // Red: 0 (changed away)
      expect(results.answers[1].count).toBe(1); // Blue: 1 (bob's latest)
      expect(results.totalVotes).toBe(1);
    });

    it("should ignore an earlier-timestamped vote after a later one", () => {
      // Given — bob votes a2 at t=2000, then a late-arriving a1 at t=1000
      state.addResponse("@bob:example.com", ["a2"], 2000);
      state.addResponse("@bob:example.com", ["a1"], 1000);

      // When
      const results = state.getResults(MY_USER);

      // Then — a2 wins because t=2000 > t=1000
      expect(results.answers[0].count).toBe(0);
      expect(results.answers[1].count).toBe(1);
    });

    it("should track the current user's vote", () => {
      // Given
      state.addResponse(MY_USER, ["a3"], 1000);

      // When
      const results = state.getResults(MY_USER);

      // Then
      expect(results.myVote).toBe("a3");
    });

    it("should ignore selections referencing unknown answer ids", () => {
      // Given
      state.addResponse("@bob:example.com", ["invalid-id"], 1000);

      // When
      const results = state.getResults(MY_USER);

      // Then
      expect(results.totalVotes).toBe(0);
    });
  });

  describe("given a poll is ended", () => {
    let state: PollState;

    beforeEach(() => {
      const content = makePollStart("Ship it?", [
        { id: "y", text: "Yes" },
        { id: "n", text: "No" },
      ]);
      state = new PollState(content, "@creator:example.com");
      state.addResponse("@bob:example.com", ["y"], 1000);
      state.addResponse("@carol:example.com", ["n"], 1001);
      state.end();
    });

    it("should show final results", () => {
      // When
      const results = state.getResults(MY_USER);

      // Then
      expect(results.ended).toBe(true);
      expect(results.answers[0].count).toBe(1);
      expect(results.answers[1].count).toBe(1);
      expect(results.totalVotes).toBe(2);
    });

    it("should not accept new votes", () => {
      // Given — the poll is ended
      // When — someone tries to vote
      state.addResponse("@dave:example.com", ["y"], 2000);

      // Then — the vote is ignored
      const results = state.getResults(MY_USER);
      expect(results.totalVotes).toBe(2);
      expect(results.answers[0].count).toBe(1);
    });
  });

  describe("given no votes yet", () => {
    it("should show all options with 0 votes", () => {
      // Given
      const content = makePollStart("Pick one", [
        { id: "a", text: "Option A" },
        { id: "b", text: "Option B" },
        { id: "c", text: "Option C" },
      ]);
      const state = new PollState(content, "@creator:example.com");

      // When
      const results = state.getResults(MY_USER);

      // Then
      expect(results.answers).toHaveLength(3);
      expect(results.answers[0]).toEqual({ id: "a", text: "Option A", count: 0, percentage: 0 });
      expect(results.answers[1]).toEqual({ id: "b", text: "Option B", count: 0, percentage: 0 });
      expect(results.answers[2]).toEqual({ id: "c", text: "Option C", count: 0, percentage: 0 });
      expect(results.totalVotes).toBe(0);
      expect(results.myVote).toBeNull();
      expect(results.ended).toBe(false);
    });
  });
});

describe("PollStore", () => {
  let store: PollStore;

  beforeEach(() => {
    store = new PollStore();
  });

  describe("given a poll is registered", () => {
    it("should return results after adding responses", () => {
      // Given
      const content = makePollStart("Release name?", [
        { id: "a1", text: "Alpha" },
        { id: "a2", text: "Beta" },
      ]);
      store.addPoll("$poll1", content, "@creator:example.com");

      // When
      store.addResponse("$poll1", "@bob:example.com", ["a1"], 1000);
      store.addResponse("$poll1", "@carol:example.com", ["a2"], 1001);

      // Then
      const results = store.getResults("$poll1", MY_USER);
      expect(results).not.toBeNull();
      expect(results!.totalVotes).toBe(2);
      expect(results!.answers[0].count).toBe(1);
      expect(results!.answers[1].count).toBe(1);
    });

    it("should end a poll", () => {
      // Given
      const content = makePollStart("Done?", [
        { id: "y", text: "Yes" },
        { id: "n", text: "No" },
      ]);
      store.addPoll("$poll2", content, "@creator:example.com");
      store.addResponse("$poll2", "@bob:example.com", ["y"], 1000);

      // When
      store.endPoll("$poll2");

      // Then
      const results = store.getResults("$poll2", MY_USER);
      expect(results!.ended).toBe(true);
    });

    it("should not duplicate a poll when addPoll is called twice", () => {
      // Given
      const content = makePollStart("Q?", [{ id: "a", text: "A" }]);
      store.addPoll("$poll3", content, "@creator:example.com");
      store.addResponse("$poll3", "@bob:example.com", ["a"], 1000);

      // When — add same poll id again
      store.addPoll("$poll3", content, "@creator:example.com");

      // Then — original vote is preserved
      const results = store.getResults("$poll3", MY_USER);
      expect(results!.totalVotes).toBe(1);
    });
  });

  describe("given no poll is registered", () => {
    it("should return null for unknown poll id", () => {
      // When
      const results = store.getResults("$nonexistent", MY_USER);

      // Then
      expect(results).toBeNull();
    });

    it("should silently ignore responses for unknown polls", () => {
      // When / Then — no error
      store.addResponse("$nonexistent", "@bob:example.com", ["a1"], 1000);
    });

    it("should silently ignore end for unknown polls", () => {
      // When / Then — no error
      store.endPoll("$nonexistent");
    });
  });

  describe("subscribe / notify", () => {
    it("should bump version when a poll is added", () => {
      // Given
      const v1 = store.getVersion();

      // When
      const content = makePollStart("Q?", [{ id: "a", text: "A" }]);
      store.addPoll("$p", content, "@c:x.com");

      // Then
      expect(store.getVersion()).toBeGreaterThan(v1);
    });

    it("should bump version when a response is added", () => {
      // Given
      const content = makePollStart("Q?", [{ id: "a", text: "A" }]);
      store.addPoll("$p", content, "@c:x.com");
      const v1 = store.getVersion();

      // When
      store.addResponse("$p", "@b:x.com", ["a"], 1000);

      // Then
      expect(store.getVersion()).toBeGreaterThan(v1);
    });
  });
});

describe("buildPollFallback", () => {
  it("should create a plain-text fallback", () => {
    // When
    const text = buildPollFallback("Favorite?", [
      { id: "a1", "m.text": "Red" },
      { id: "a2", "m.text": "Blue" },
    ]);

    // Then
    expect(text).toBe("Favorite?\n1. Red\n2. Blue");
  });
});

describe("generateAnswerId", () => {
  it("should produce unique ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateAnswerId()));
    expect(ids.size).toBe(50);
  });
});
