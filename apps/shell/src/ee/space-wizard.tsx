import React, { useState } from "react";

const HOSTED_API_URL = import.meta.env.VITE_HOSTED_API_URL || "/api";

/** Error banner with icon -- soft, non-alarming presentation */
function ErrorBanner({ message }: { message: string }): React.ReactElement {
  return (
    <div className="error-banner" role="alert">
      <svg
        className="error-icon w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
        />
      </svg>
      <span className="error-text">{message}</span>
    </div>
  );
}

function friendlyError(raw: string): string {
  const lower = raw.toLowerCase();

  if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("timeout")) {
    return "Can't reach the server. Check your internet connection and try again.";
  }
  if (lower.includes("limit") || lower.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (lower.includes("unauthorized") || lower.includes("forbidden")) {
    return "Your session has expired. Please sign in again.";
  }
  if (raw.length > 120 || lower.includes("m.") || lower.includes("errcode")) {
    return "Something went wrong creating your space. Please try again.";
  }
  return raw;
}

type SpacePurpose = "team" | "project" | "personal";

interface SpacePurposeOption {
  id: SpacePurpose;
  title: string;
  description: string;
  iconPath: string;
}

const SPACE_PURPOSES: SpacePurposeOption[] = [
  {
    id: "team",
    title: "Team",
    description: "Collaborate with your team, share updates, and coordinate work",
    iconPath:
      "M18 21a8 8 0 00-16 0M10 14a6 6 0 100-12 6 6 0 000 12zm12 7a6 6 0 00-6-6m0-5a4 4 0 100-8 4 4 0 000 8z",
  },
  {
    id: "project",
    title: "Project",
    description: "Organize tasks, track progress, and manage a specific project",
    iconPath:
      "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  },
  {
    id: "personal",
    title: "Personal",
    description: "A private space for notes, tasks, and your own AI assistants",
    iconPath:
      "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
  },
];

interface AgentOption {
  id: string;
  name: string;
  description: string;
  iconPath: string;
  defaultEnabled: boolean;
}

const AVAILABLE_AGENTS: AgentOption[] = [
  {
    id: "assistant",
    name: "AI Assistant",
    description:
      "General-purpose AI powered by Claude. Answers questions, writes content, and helps with tasks.",
    iconPath:
      "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z",
    defaultEnabled: true,
  },
  {
    id: "echo",
    name: "Echo Bot",
    description: "Simple bot that echoes messages back. Useful for testing and debugging.",
    iconPath:
      "M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25h2.24z",
    defaultEnabled: false,
  },
];

// SVG icon paths for space icons
const SPACE_ICONS = [
  {
    label: "Star",
    path: "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z",
  },
  { label: "Bolt", path: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" },
  {
    label: "Heart",
    path: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z",
  },
  {
    label: "Cube",
    path: "M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9",
  },
  {
    label: "Globe",
    path: "M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418",
  },
  {
    label: "Rocket",
    path: "M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.63 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z",
  },
];

interface SpaceWizardProps {
  onClose: () => void;
  onCreated: (spaceId: string) => void;
  accessToken: string;
}

type WizardStep = 1 | 2 | 3 | 4;

export function SpaceWizard({
  onClose,
  onCreated,
  accessToken,
}: SpaceWizardProps): React.ReactElement {
  const [step, setStep] = useState<WizardStep>(1);
  const [purpose, setPurpose] = useState<SpacePurpose | null>(null);
  const [spaceName, setSpaceName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState(0);
  const [inviteEmails, setInviteEmails] = useState("");
  const [enabledAgents, setEnabledAgents] = useState<Set<string>>(
    () => new Set(AVAILABLE_AGENTS.filter((a) => a.defaultEnabled).map((a) => a.id)),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const totalSteps = purpose === "personal" ? 3 : 4;

  const toggleAgent = (agentId: string): void => {
    setEnabledAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };

  const handleNext = (): void => {
    if (step === 1 && purpose) {
      setStep(2);
    } else if (step === 2 && spaceName.trim()) {
      // Personal spaces skip the invite step
      if (purpose === "personal") {
        setStep(4);
      } else {
        setStep(3);
      }
    } else if (step === 3) {
      setStep(4);
    }
  };

  const handleBack = (): void => {
    if (step === 4 && purpose === "personal") {
      setStep(2);
    } else if (step > 1) {
      setStep((step - 1) as WizardStep);
    }
    setError("");
  };

  const handleCreate = async (): Promise<void> => {
    setError("");
    setLoading(true);
    try {
      const emails = inviteEmails
        .split(/[,\n]+/)
        .map((e) => e.trim())
        .filter((e) => e.length > 0);

      const res = await fetch(`${HOSTED_API_URL}/spaces`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: spaceName.trim(),
          purpose,
          icon: SPACE_ICONS[selectedIcon].label.toLowerCase(),
          invite_emails: emails,
          agents: Array.from(enabledAgents),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed to create space" }));
        throw new Error((body as Record<string, string>).error ?? "Failed to create space");
      }

      const data: { space_id: string } = await res.json();
      onCreated(data.space_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create space");
    } finally {
      setLoading(false);
    }
  };

  const currentStepLabel = purpose === "personal" ? (step === 1 ? 1 : step === 2 ? 2 : 3) : step;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg glass rounded-2xl p-6 card-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-6">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i < currentStepLabel ? "bg-accent" : "bg-surface-3"
              }`}
            />
          ))}
        </div>

        {/* Step 1: Choose purpose */}
        {step === 1 && (
          <div className="tab-fade-in">
            <h2 className="text-lg font-semibold text-primary mb-1">What is this space for?</h2>
            <p className="text-sm text-muted mb-5">
              This helps us set up the right defaults for you.
            </p>
            <div className="space-y-2 mb-6">
              {SPACE_PURPOSES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setPurpose(option.id);
                    if (!spaceName.trim()) {
                      setSpaceName(option.id === "personal" ? "My Space" : "");
                    }
                  }}
                  className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-200 ${
                    purpose === option.id
                      ? "border-accent bg-accent/5"
                      : "border-border bg-surface-1 hover:border-surface-4 hover:bg-surface-2/60"
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      purpose === option.id ? "bg-accent/10" : "bg-surface-2"
                    }`}
                  >
                    <svg
                      className={`w-5 h-5 ${purpose === option.id ? "text-accent" : "text-muted"}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d={option.iconPath} />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-primary">{option.title}</div>
                    <div className="text-xs text-muted mt-0.5">{option.description}</div>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-muted hover:text-siri-purple transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!purpose}
                className="btn-primary !w-auto px-6"
              >
                <span className="btn-text-enter">Continue</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Name and icon */}
        {step === 2 && (
          <div className="tab-fade-in">
            <h2 className="text-lg font-semibold text-primary mb-1">Name your space</h2>
            <p className="text-sm text-muted mb-5">Give your space a name and pick an icon.</p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">
                  Space name
                </label>
                <input
                  type="text"
                  value={spaceName}
                  onChange={(e) => setSpaceName(e.target.value)}
                  className="glass-input w-full"
                  placeholder={
                    purpose === "team"
                      ? "e.g. Engineering"
                      : purpose === "project"
                        ? "e.g. Website Redesign"
                        : "e.g. My Space"
                  }
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">Icon</label>
                <div className="flex gap-2 flex-wrap">
                  {SPACE_ICONS.map((icon, i) => (
                    <button
                      key={icon.label}
                      type="button"
                      onClick={() => setSelectedIcon(i)}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all duration-200 ${
                        selectedIcon === i
                          ? "border-accent bg-accent/10"
                          : "border-border bg-surface-1 hover:border-surface-4 hover:bg-surface-2/60"
                      }`}
                      aria-label={icon.label}
                    >
                      <svg
                        className={`w-5 h-5 ${selectedIcon === i ? "text-accent" : "text-muted"}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d={icon.path} />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2 text-sm text-muted hover:text-siri-purple transition-colors duration-200"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!spaceName.trim()}
                className="btn-primary !w-auto px-6"
              >
                <span className="btn-text-enter">Continue</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Invite people */}
        {step === 3 && (
          <div className="tab-fade-in">
            <h2 className="text-lg font-semibold text-primary mb-1">Invite people</h2>
            <p className="text-sm text-muted mb-5">
              Add team members by email. You can always invite more people later.
            </p>
            <div className="mb-6">
              <label className="block text-xs font-medium text-secondary mb-1.5">
                Email addresses
              </label>
              <textarea
                value={inviteEmails}
                onChange={(e) => setInviteEmails(e.target.value)}
                className="glass-input w-full min-h-[100px] resize-y"
                placeholder={"alice@example.com\nbob@example.com"}
                autoFocus
              />
              <p className="text-xs text-muted mt-1.5">
                Separate multiple addresses with commas or new lines.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2 text-sm text-muted hover:text-siri-purple transition-colors duration-200"
              >
                Back
              </button>
              <button type="button" onClick={handleNext} className="btn-primary !w-auto px-6">
                <span className="btn-text-enter">{inviteEmails.trim() ? "Continue" : "Skip"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Choose agents */}
        {step === 4 && (
          <div className="tab-fade-in">
            <h2 className="text-lg font-semibold text-primary mb-1">Choose your AI agents</h2>
            <p className="text-sm text-muted mb-5">
              Agents live in your space and help with specific tasks. You can add or remove them
              anytime.
            </p>
            <div className="space-y-2 mb-6">
              {AVAILABLE_AGENTS.map((agent) => {
                const enabled = enabledAgents.has(agent.id);
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => toggleAgent(agent.id)}
                    className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-200 ${
                      enabled
                        ? "border-accent bg-accent/5"
                        : "border-border bg-surface-1 hover:border-surface-4 hover:bg-surface-2/60"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        enabled ? "bg-accent/10" : "bg-surface-2"
                      }`}
                    >
                      <svg
                        className={`w-5 h-5 ${enabled ? "text-accent" : "text-muted"}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d={agent.iconPath} />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-primary">{agent.name}</span>
                        {enabled && (
                          <svg
                            className="w-4 h-4 text-accent flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4.5 12.75l6 6 9-13.5"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="text-xs text-muted mt-0.5">{agent.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            {error && <ErrorBanner message={friendlyError(error)} />}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2 text-sm text-muted hover:text-siri-purple transition-colors duration-200"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={loading}
                className="btn-primary !w-auto px-6"
              >
                <span key={String(loading)} className="btn-text-enter">
                  {loading ? "Creating..." : "Create Space"}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
