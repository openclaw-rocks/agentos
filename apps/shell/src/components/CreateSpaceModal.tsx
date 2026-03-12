import { builtInTemplates, EventTypes, type SpaceTemplate } from "@openclaw/protocol";
import * as sdk from "matrix-js-sdk";
import React, { useState } from "react";
import { useMatrix } from "~/lib/matrix-context";

interface CreateSpaceModalProps {
  onClose: () => void;
  onCreated: (spaceId: string) => void;
  parentSpaceId?: string | null;
}

export function CreateSpaceModal({
  onClose,
  onCreated,
  parentSpaceId,
}: CreateSpaceModalProps): React.ReactElement {
  const { client } = useMatrix();
  const [step, setStep] = useState<"template" | "name">("template");
  const [selectedTemplate, setSelectedTemplate] = useState<SpaceTemplate>(builtInTemplates[0]);
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSelectTemplate = (template: SpaceTemplate) => {
    setSelectedTemplate(template);
    setName(template.name);
    setStep("name");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");

    try {
      // Create the space
      const result = await client.createRoom({
        name: trimmed,
        visibility: isPublic ? sdk.Visibility.Public : sdk.Visibility.Private,
        preset: isPublic ? sdk.Preset.PublicChat : sdk.Preset.PrivateChat,
        creation_content: { type: "m.space" },
        power_level_content_override: {
          events_default: 0,
        },
        initial_state: [
          {
            type: "m.room.history_visibility",
            content: { history_visibility: isPublic ? "world_readable" : "shared" },
          },
        ],
      });

      const spaceId = result.room_id;

      // Store space config as state event
      await client.sendStateEvent(
        spaceId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        EventTypes.SpaceConfig as any,
        {
          template_id: selectedTemplate.id,
          template_name: selectedTemplate.name,
          icon: selectedTemplate.icon,
          description: selectedTemplate.description,
          layout_mode: selectedTemplate.layout_mode,
        },
        "",
      );

      // Store agent roster as state event
      if (selectedTemplate.default_agents.length > 0) {
        await client.sendStateEvent(
          spaceId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          EventTypes.SpaceAgents as any,
          {
            agents: selectedTemplate.default_agents.map((a) => ({ ...a, active: true })),
          },
          "",
        );
      }

      // Create suggested channels
      if (selectedTemplate.suggested_channels) {
        for (const channelName of selectedTemplate.suggested_channels) {
          try {
            const channelResult = await client.createRoom({
              name: channelName,
              visibility: sdk.Visibility.Private,
              preset: sdk.Preset.PrivateChat,
              initial_state: [
                {
                  type: "m.room.history_visibility",
                  content: { history_visibility: "shared" },
                },
              ],
            });

            // Link channel to space
            await client.sendStateEvent(
              spaceId,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              "m.space.child" as any,
              { via: [client.getDomain()!] },
              channelResult.room_id,
            );
            await client.sendStateEvent(
              channelResult.room_id,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              "m.space.parent" as any,
              { canonical: true, via: [client.getDomain()!] },
              spaceId,
            );
          } catch {
            // Continue even if one channel fails
          }
        }
      }

      // If this is a sub-space, link it to the parent space
      if (parentSpaceId) {
        try {
          const domain = client.getDomain()!;
          // Add as child of parent space
          await client.sendStateEvent(
            parentSpaceId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            "m.space.child" as any,
            { via: [domain] },
            spaceId,
          );
          // Set parent reference on the new space
          await client.sendStateEvent(
            spaceId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            "m.space.parent" as any,
            { canonical: true, via: [domain] },
            parentSpaceId,
          );
        } catch {
          // Non-critical: the space was created but parent linking failed
        }
      }

      onCreated(spaceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create space");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-surface-1 border border-border rounded-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "template" ? (
          <>
            <h2 className="text-lg font-bold text-primary mb-1">
              {parentSpaceId ? "Create a sub-space" : "Create a space"}
            </h2>
            <p className="text-sm text-secondary mb-5">
              {parentSpaceId
                ? `Create a sub-space within ${client.getRoom(parentSpaceId)?.name ?? "the parent space"}.`
                : "Choose a template to get started with pre-configured agents."}
            </p>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {builtInTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleSelectTemplate(template)}
                  className="flex items-start gap-3 p-3 bg-surface-2 border border-border rounded-lg hover:border-accent/50 hover:bg-surface-3 transition-all text-left"
                >
                  <span className="text-xl flex-shrink-0">{template.icon}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-primary">{template.name}</div>
                    <div className="text-xs text-muted mt-0.5 line-clamp-2">
                      {template.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-secondary hover:text-primary transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={() => setStep("template")}
                className="text-muted hover:text-primary transition-colors"
                aria-label="Back to templates"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h2 className="text-lg font-bold text-primary">
                {selectedTemplate.icon} {selectedTemplate.name} Space
              </h2>
            </div>
            <p className="text-sm text-secondary mb-5">{selectedTemplate.description}</p>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label
                  htmlFor="space-name"
                  className="block text-xs font-medium text-secondary mb-1.5"
                >
                  Space name
                </label>
                <input
                  id="space-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
                  placeholder={`e.g. ${selectedTemplate.name}`}
                  autoFocus
                  required
                />
              </div>

              {/* Visibility */}
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">
                  Visibility
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPublic(false)}
                    className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                      !isPublic
                        ? "bg-accent/10 border-accent text-inverse"
                        : "bg-surface-2 border-border text-secondary hover:border-surface-4"
                    }`}
                  >
                    <svg
                      className="w-4 h-4 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                    <div className="text-left">
                      <div className="font-medium">Private</div>
                      <div className="text-[10px] text-muted">Invite only</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPublic(true)}
                    className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                      isPublic
                        ? "bg-accent/10 border-accent text-inverse"
                        : "bg-surface-2 border-border text-secondary hover:border-surface-4"
                    }`}
                  >
                    <svg
                      className="w-4 h-4 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div className="text-left">
                      <div className="font-medium">Public</div>
                      <div className="text-[10px] text-muted">Anyone can join</div>
                    </div>
                  </button>
                </div>
              </div>

              {selectedTemplate.default_agents.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-secondary mb-1.5">Agents</p>
                  <div className="space-y-1">
                    {selectedTemplate.default_agents.map((agent) => (
                      <div
                        key={agent.id}
                        className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 rounded-lg"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                        <span className="text-xs text-secondary">{agent.id}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-surface-3 text-muted rounded ml-auto">
                          {agent.role}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedTemplate.suggested_channels &&
                selectedTemplate.suggested_channels.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-secondary mb-1.5">Channels</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTemplate.suggested_channels.map((ch) => (
                        <span
                          key={ch}
                          className="text-xs px-2 py-0.5 bg-surface-2 text-secondary rounded"
                        >
                          # {ch}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              {error && <p className="text-sm text-status-error">{error}</p>}

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-secondary hover:text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !name.trim()}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
                >
                  {loading ? "Creating..." : "Create Space"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
