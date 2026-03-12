import React, { useState, useCallback } from "react";
import {
  PollEventTypes,
  buildPollFallback,
  generateAnswerId,
  type PollStartContent,
  type PollKind,
} from "~/lib/polls";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 20;

interface PollCreatorProps {
  roomId: string;
  onClose: () => void;
  onSendEvent: (roomId: string, type: string, content: PollStartContent) => void;
}

export function PollCreator({ roomId, onClose, onSendEvent }: PollCreatorProps) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<Array<{ id: string; text: string }>>([
    { id: generateAnswerId(), text: "" },
    { id: generateAnswerId(), text: "" },
  ]);
  const [kind, setKind] = useState<PollKind>("m.disclosed");

  const canCreate =
    question.trim().length > 0 &&
    options.filter((o) => o.text.trim().length > 0).length >= MIN_OPTIONS;

  const handleAddOption = useCallback(() => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, { id: generateAnswerId(), text: "" }]);
  }, [options.length]);

  const handleRemoveOption = useCallback((id: string) => {
    setOptions((prev) => {
      if (prev.length <= MIN_OPTIONS) return prev;
      return prev.filter((o) => o.id !== id);
    });
  }, []);

  const handleOptionChange = useCallback((id: string, text: string) => {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, text } : o)));
  }, []);

  const handleCreate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!canCreate) return;

      const trimmedQuestion = question.trim();
      const validOptions = options
        .filter((o) => o.text.trim().length > 0)
        .map((o) => ({ id: o.id, "m.text": o.text.trim() }));

      const content: PollStartContent = {
        "m.poll": {
          question: { "m.text": trimmedQuestion },
          kind,
          max_selections: 1,
          answers: validOptions,
        },
        "m.text": buildPollFallback(trimmedQuestion, validOptions),
      };

      onSendEvent(roomId, PollEventTypes.Start, content);
      onClose();
    },
    [canCreate, question, options, kind, roomId, onSendEvent, onClose],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-surface-1 border border-border rounded-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-primary mb-1">Create a poll</h2>
        <p className="text-sm text-secondary mb-5">Ask a question and let people vote.</p>

        <form onSubmit={handleCreate} className="space-y-4">
          {/* Question */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Question</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
              placeholder="What should we name the release?"
              autoFocus
            />
          </div>

          {/* Options */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Options</label>
            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <span className="text-xs text-muted w-5 text-right flex-shrink-0">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={opt.text}
                    onChange={(e) => handleOptionChange(opt.id, e.target.value)}
                    className="flex-1 px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
                    placeholder={`Option ${idx + 1}`}
                  />
                  {options.length > MIN_OPTIONS && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(opt.id)}
                      className="p-1.5 text-muted hover:text-red-400 hover:bg-surface-3 rounded-lg transition-colors flex-shrink-0"
                      title="Remove option"
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
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < MAX_OPTIONS && (
              <button
                type="button"
                onClick={handleAddOption}
                className="mt-2 text-xs text-accent hover:text-accent-hover transition-colors"
              >
                + Add option
              </button>
            )}
          </div>

          {/* Poll type */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Poll type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="poll-kind"
                  checked={kind === "m.disclosed"}
                  onChange={() => setKind("m.disclosed")}
                  className="accent-accent"
                />
                <span className="text-sm text-secondary">Disclosed</span>
                <span className="text-xs text-muted">(results visible while voting)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="poll-kind"
                  checked={kind === "m.undisclosed"}
                  onChange={() => setKind("m.undisclosed")}
                  className="accent-accent"
                />
                <span className="text-sm text-secondary">Undisclosed</span>
                <span className="text-xs text-muted">(hidden until ended)</span>
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-secondary hover:text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canCreate}
              className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
            >
              Create Poll
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
