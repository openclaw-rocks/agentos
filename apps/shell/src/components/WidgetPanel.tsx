import React from "react";
import { useMatrix } from "~/lib/matrix-context";

/** Parsed widget info extracted from a state event. */
export interface WidgetInfo {
  id: string;
  name: string;
  type: string;
  url: string;
}

/**
 * Pure helper: parse `im.vector.modular.widgets` state events into WidgetInfo objects.
 *
 * Accepts an array of objects shaped like Matrix state events with
 * `getStateKey()`, `getContent()`, and `getType()` methods.
 */
export function parseWidgetEvents(
  stateEvents: ReadonlyArray<{
    getStateKey: () => string | undefined;
    getContent: () => Record<string, unknown>;
    getType: () => string;
  }>,
): WidgetInfo[] {
  const widgets: WidgetInfo[] = [];

  for (const event of stateEvents) {
    if (event.getType() !== "im.vector.modular.widgets") continue;

    const content = event.getContent();
    const stateKey = event.getStateKey();

    // Skip cleared/removed widgets (empty content)
    if (!content || Object.keys(content).length === 0) continue;
    if (!stateKey) continue;

    const url = content.url;
    if (typeof url !== "string" || !url) continue;

    widgets.push({
      id: stateKey,
      name: typeof content.name === "string" ? content.name : "Widget",
      type: typeof content.type === "string" ? content.type : "custom",
      url,
    });
  }

  return widgets;
}

interface WidgetPanelProps {
  roomId: string;
  onClose: () => void;
}

export function WidgetPanel({ roomId, onClose }: WidgetPanelProps): React.ReactElement {
  const { client } = useMatrix();

  const room = client.getRoom(roomId);
  const stateEvents = room?.currentState.getStateEvents("im.vector.modular.widgets") ?? [];
  const widgets = parseWidgetEvents(stateEvents);

  return (
    <div className="w-80 flex-shrink-0 border-l border-border flex flex-col h-full bg-surface-1">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
        <h3 className="text-sm font-bold text-primary">Widgets</h3>
        <button
          onClick={onClose}
          className="p-1 text-secondary hover:text-primary hover:bg-surface-3 rounded-lg transition-colors"
          aria-label="Close widgets panel"
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

      {/* Widget list */}
      <div className="flex-1 overflow-y-auto">
        {widgets.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-muted">No widgets in this room</p>
          </div>
        ) : (
          widgets.map((widget) => (
            <div key={widget.id} className="border-b border-border">
              <div className="flex items-center justify-between px-4 py-2 bg-surface-2">
                <span className="text-xs font-medium text-primary truncate">{widget.name}</span>
              </div>
              <iframe
                src={widget.url}
                title={widget.name}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                className="w-full h-64 border-0"
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
