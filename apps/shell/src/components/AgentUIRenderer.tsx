import type { AnyUIComponent } from "@openclaw/protocol";
import React, { useState } from "react";

interface AgentUIRendererProps {
  components: AnyUIComponent[];
  onAction: (action: string, data?: Record<string, unknown>) => void;
}

export function AgentUIRenderer({ components, onAction }: AgentUIRendererProps) {
  return (
    <div className="space-y-2 max-w-lg">
      {components.map((component, i) => (
        <UIComponent key={i} component={component} onAction={onAction} />
      ))}
    </div>
  );
}

function UIComponent({
  component,
  onAction,
}: {
  component: AnyUIComponent;
  onAction: (action: string, data?: Record<string, unknown>) => void;
}) {
  switch (component.type) {
    case "text":
      return <TextRenderer component={component} />;
    case "button":
      return <ButtonRenderer component={component} onAction={onAction} />;
    case "button_group":
      return <ButtonGroupRenderer component={component} onAction={onAction} />;
    case "code":
      return <CodeRenderer component={component} />;
    case "status":
      return <StatusRenderer component={component} />;
    case "progress":
      return <ProgressRenderer component={component} />;
    case "table":
      return <TableRenderer component={component} />;
    case "card":
      return <CardRenderer component={component} onAction={onAction} />;
    case "input":
      return <InputRenderer component={component} />;
    case "form":
      return <FormRenderer component={component} onAction={onAction} />;
    case "divider":
      return <hr role="separator" className="border-border my-2" />;
    case "image":
      return (
        <img src={component.url} alt={component.alt ?? ""} className="rounded-lg max-w-full" />
      );
    case "log":
      return <LogRenderer component={component} />;
    case "diff":
      return <DiffRenderer component={component} />;
    case "metric":
      return <MetricRenderer component={component} />;
    case "chart":
      return <ChartRenderer component={component} />;
    case "list":
      return <ListRenderer component={component} onAction={onAction} />;
    case "tabs":
      return <TabsRenderer component={component} onAction={onAction} />;
    case "avatar":
      return <AvatarRenderer component={component} />;
    case "badge":
      return <BadgeRenderer component={component} />;
    case "timeline":
      return <TimelineRenderer component={component} />;
    case "media":
      return <MediaRenderer component={component} />;
    case "map":
      return <MapRenderer component={component} />;
    case "grid":
      return <GridRenderer component={component} onAction={onAction} />;
    case "stack":
      return <StackRenderer component={component} onAction={onAction} />;
    case "split":
      return <SplitRenderer component={component} onAction={onAction} />;
    default:
      return null;
  }
}

function TextRenderer({ component }: { component: Extract<AnyUIComponent, { type: "text" }> }) {
  const variants: Record<string, string> = {
    heading: "text-base font-semibold text-white",
    body: "text-sm text-gray-300",
    caption: "text-xs text-gray-500",
    code: "text-sm font-mono text-gray-300 bg-surface-3 px-1.5 py-0.5 rounded",
  };
  return <p className={variants[component.variant ?? "body"]}>{component.content}</p>;
}

function ButtonRenderer({
  component,
  onAction,
}: {
  component: Extract<AnyUIComponent, { type: "button" }>;
  onAction: (action: string) => void;
}) {
  const styles: Record<string, string> = {
    primary: "bg-accent hover:bg-accent-hover text-white",
    secondary: "bg-surface-3 hover:bg-surface-4 text-gray-200",
    danger: "bg-status-error/20 hover:bg-status-error/30 text-status-error",
    ghost: "hover:bg-surface-3 text-gray-400",
  };
  return (
    <button
      onClick={() => onAction(component.action)}
      disabled={component.disabled}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        styles[component.style ?? "secondary"]
      }`}
    >
      {component.label}
    </button>
  );
}

function ButtonGroupRenderer({
  component,
  onAction,
}: {
  component: Extract<AnyUIComponent, { type: "button_group" }>;
  onAction: (action: string) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {component.buttons.map((btn, i) => (
        <ButtonRenderer key={i} component={btn} onAction={onAction} />
      ))}
    </div>
  );
}

function CodeRenderer({ component }: { component: Extract<AnyUIComponent, { type: "code" }> }) {
  return (
    <pre className="bg-surface-3 rounded-lg p-3 overflow-x-auto">
      <code className="text-xs font-mono text-gray-300">{component.content}</code>
    </pre>
  );
}

function StatusRenderer({ component }: { component: Extract<AnyUIComponent, { type: "status" }> }) {
  const dotColors: Record<string, string> = {
    success: "bg-status-success",
    warning: "bg-status-warning",
    error: "bg-status-error",
    info: "bg-status-info",
    pending: "bg-status-pending",
  };
  return (
    <div
      role="status"
      aria-label={`${component.label}: ${component.value}`}
      className="flex items-center gap-2 py-0.5"
    >
      <div className={`w-2 h-2 rounded-full ${dotColors[component.value]}`} aria-hidden="true" />
      <span className="text-xs font-medium text-gray-300">{component.label}</span>
      {component.detail && <span className="text-xs text-gray-500">{component.detail}</span>}
    </div>
  );
}

function ProgressRenderer({
  component,
}: {
  component: Extract<AnyUIComponent, { type: "progress" }>;
}) {
  const clamped = Math.min(100, Math.max(0, component.value));
  return (
    <div className="py-1">
      <div className="flex justify-between text-xs mb-1">
        {component.label && <span className="text-gray-400">{component.label}</span>}
        {component.status && <span className="text-gray-500">{component.status}</span>}
      </div>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={component.label ?? "Progress"}
        className="h-1.5 bg-surface-3 rounded-full overflow-hidden"
      >
        <div
          className="h-full bg-accent rounded-full transition-all duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function TableRenderer({ component }: { component: Extract<AnyUIComponent, { type: "table" }> }) {
  return (
    <table className="w-full text-xs">
      {component.headers && (
        <thead>
          <tr>
            {component.headers.map((h, i) => (
              <th
                key={i}
                className="text-left py-1 px-2 text-gray-500 font-medium border-b border-border"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {component.rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j} className="py-1 px-2 text-gray-300 border-b border-border/50">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CardRenderer({
  component,
  onAction,
}: {
  component: Extract<AnyUIComponent, { type: "card" }>;
  onAction: (action: string, data?: Record<string, unknown>) => void;
}) {
  return (
    <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-white">{component.title}</h3>
        {component.subtitle && <p className="text-xs text-gray-500 mt-0.5">{component.subtitle}</p>}
      </div>
      <div className="px-4 py-3 space-y-2">
        {component.children.map((child, i) => (
          <UIComponent key={i} component={child} onAction={onAction} />
        ))}
      </div>
    </div>
  );
}

function InputRenderer({ component }: { component: Extract<AnyUIComponent, { type: "input" }> }) {
  const inputId = component.id ?? `input-${component.name}`;

  if (component.inputType === "select") {
    return (
      <div>
        <label htmlFor={inputId} className="block text-xs font-medium text-gray-400 mb-1">
          {component.label}
        </label>
        <select
          id={inputId}
          name={component.name}
          aria-required={component.required}
          className="w-full px-3 py-1.5 bg-surface-3 border border-border rounded-lg text-xs text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {component.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (component.inputType === "textarea") {
    return (
      <div>
        <label htmlFor={inputId} className="block text-xs font-medium text-gray-400 mb-1">
          {component.label}
        </label>
        <textarea
          id={inputId}
          name={component.name}
          placeholder={component.placeholder}
          aria-required={component.required}
          rows={3}
          className="w-full px-3 py-1.5 bg-surface-3 border border-border rounded-lg text-xs text-white placeholder-gray-500 resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={inputId} className="block text-xs font-medium text-gray-400 mb-1">
        {component.label}
      </label>
      <input
        id={inputId}
        name={component.name}
        type={component.inputType ?? "text"}
        placeholder={component.placeholder}
        required={component.required}
        aria-required={component.required}
        className="w-full px-3 py-1.5 bg-surface-3 border border-border rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
    </div>
  );
}

function FormRenderer({
  component,
  onAction,
}: {
  component: Extract<AnyUIComponent, { type: "form" }>;
  onAction: (action: string, data?: Record<string, unknown>) => void;
}) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries()) as Record<string, unknown>;
    onAction(component.action, data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {component.children.map((child, i) => (
        <UIComponent key={i} component={child} onAction={onAction} />
      ))}
      <button
        type="submit"
        className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-lg transition-colors"
      >
        {component.submitLabel ?? "Submit"}
      </button>
    </form>
  );
}

function LogRenderer({ component }: { component: Extract<AnyUIComponent, { type: "log" }> }) {
  const levelColors: Record<string, string> = {
    info: "text-status-info",
    warn: "text-status-warning",
    error: "text-status-error",
    debug: "text-gray-500",
  };

  return (
    <div
      className="bg-surface-3 rounded-lg p-3 font-mono text-xs overflow-auto"
      style={{ maxHeight: component.maxHeight ? `${component.maxHeight}px` : undefined }}
    >
      {component.lines.map((line, i) => (
        <div key={i} className="flex gap-2 leading-5">
          {line.timestamp && <span className="text-gray-600 flex-shrink-0">{line.timestamp}</span>}
          {line.level && (
            <span className={`flex-shrink-0 w-12 ${levelColors[line.level] ?? "text-gray-400"}`}>
              [{line.level}]
            </span>
          )}
          <span className="text-gray-300">{line.message}</span>
        </div>
      ))}
    </div>
  );
}

function DiffRenderer({ component }: { component: Extract<AnyUIComponent, { type: "diff" }> }) {
  return (
    <div className="bg-surface-3 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs font-mono text-gray-300">{component.filename}</span>
        <span className="text-xs text-gray-500">
          <span className="text-status-success">+{component.additions}</span>{" "}
          <span className="text-status-error">-{component.deletions}</span>
        </span>
      </div>
      {component.hunks.map((hunk, i) => (
        <div key={i}>
          <div className="px-3 py-1 bg-surface-4 text-xs font-mono text-gray-500">
            {hunk.header}
          </div>
          <div className="px-3">
            {hunk.lines.map((line, j) => {
              let className = "text-gray-300";
              let bg = "";
              if (line.startsWith("+")) {
                className = "text-status-success";
                bg = "bg-status-success/5";
              } else if (line.startsWith("-")) {
                className = "text-status-error";
                bg = "bg-status-error/5";
              }
              return (
                <div key={j} className={`text-xs font-mono leading-5 ${className} ${bg}`}>
                  {line}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── US-1.1: Expanded Component Renderers ─────────────────────────────

function MetricRenderer({ component }: { component: Extract<AnyUIComponent, { type: "metric" }> }) {
  const trendIcons: Record<string, { symbol: string; color: string }> = {
    up: { symbol: "\u2191", color: "text-status-success" },
    down: { symbol: "\u2193", color: "text-status-error" },
    flat: { symbol: "\u2192", color: "text-gray-400" },
  };
  const trend = component.trend ? trendIcons[component.trend] : null;
  return (
    <div className="py-1">
      <div className="text-xs text-gray-500">{component.label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-semibold text-white">
          {component.value}
          {component.unit && (
            <span className="text-xs font-normal text-gray-400 ml-0.5">{component.unit}</span>
          )}
        </span>
        {trend && (
          <span className={`text-xs font-medium ${trend.color}`}>
            {trend.symbol} {component.change}
          </span>
        )}
      </div>
    </div>
  );
}

function ChartRenderer({ component }: { component: Extract<AnyUIComponent, { type: "chart" }> }) {
  const maxValue = Math.max(...component.data.datasets.flatMap((ds) => ds.values), 1);

  if (component.chartType === "pie") {
    const total = component.data.datasets[0]?.values.reduce((a, b) => a + b, 0) ?? 1;
    return (
      <div className="bg-surface-2 border border-border rounded-xl p-4">
        {component.title && (
          <h4 className="text-xs font-semibold text-white mb-3">{component.title}</h4>
        )}
        <div className="space-y-1.5">
          {component.data.labels.map((label, i) => {
            const val = component.data.datasets[0]?.values[i] ?? 0;
            const pct = Math.round((val / total) * 100);
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: component.data.datasets[0]?.color ?? "#6366f1" }}
                />
                <span className="text-gray-300 flex-1">{label}</span>
                <span className="text-gray-500">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Bar / Line rendered as horizontal bars
  return (
    <div className="bg-surface-2 border border-border rounded-xl p-4">
      {component.title && (
        <h4 className="text-xs font-semibold text-white mb-3">{component.title}</h4>
      )}
      <div className="space-y-2">
        {component.data.labels.map((label, i) => (
          <div key={i}>
            <div className="flex justify-between text-xs mb-0.5">
              <span className="text-gray-400">{label}</span>
              <span className="text-gray-500">{component.data.datasets[0]?.values[i]}</span>
            </div>
            <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${((component.data.datasets[0]?.values[i] ?? 0) / maxValue) * 100}%`,
                  backgroundColor: component.data.datasets[0]?.color ?? "#6366f1",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListRenderer({
  component,
  onAction,
}: {
  component: Extract<AnyUIComponent, { type: "list" }>;
  onAction: (action: string) => void;
}) {
  const Tag = component.ordered ? "ol" : "ul";
  return (
    <Tag
      className={`text-xs text-gray-300 space-y-1 ${component.ordered ? "list-decimal" : "list-disc"} ml-4`}
    >
      {component.items.map((item, i) => (
        <li key={i} className={item.action ? "cursor-pointer hover:text-white" : ""}>
          {item.action ? (
            <button
              className="text-left hover:text-white transition-colors"
              onClick={() => onAction(item.action!)}
            >
              {item.text}
            </button>
          ) : (
            item.text
          )}
        </li>
      ))}
    </Tag>
  );
}

function TabsRenderer({
  component,
  onAction,
}: {
  component: Extract<AnyUIComponent, { type: "tabs" }>;
  onAction: (action: string, data?: Record<string, unknown>) => void;
}) {
  const [activeTab, setActiveTab] = useState(component.activeTab ?? 0);
  const activeContent = component.tabs[activeTab]?.children ?? [];
  const tabId = component.id ?? "tabs";

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next: number;
    if (e.key === "ArrowRight") next = (index + 1) % component.tabs.length;
    else if (e.key === "ArrowLeft")
      next = (index - 1 + component.tabs.length) % component.tabs.length;
    else return;
    e.preventDefault();
    setActiveTab(next);
    (e.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
  };

  return (
    <div>
      <div role="tablist" className="flex border-b border-border">
        {component.tabs.map((tab, i) => (
          <button
            key={i}
            role="tab"
            id={`${tabId}-tab-${i}`}
            aria-selected={i === activeTab}
            aria-controls={`${tabId}-panel-${i}`}
            tabIndex={i === activeTab ? 0 : -1}
            onClick={() => setActiveTab(i)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              i === activeTab
                ? "text-accent border-b-2 border-accent"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${tabId}-panel-${activeTab}`}
        aria-labelledby={`${tabId}-tab-${activeTab}`}
        className="pt-2 space-y-2"
      >
        {activeContent.map((child, i) => (
          <UIComponent key={i} component={child} onAction={onAction} />
        ))}
      </div>
    </div>
  );
}

function AvatarRenderer({ component }: { component: Extract<AnyUIComponent, { type: "avatar" }> }) {
  const sizes: Record<string, string> = {
    sm: "w-6 h-6 text-xs",
    md: "w-8 h-8 text-sm",
    lg: "w-12 h-12 text-base",
  };
  const sizeClass = sizes[component.size ?? "md"];
  const initials = component.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (component.url) {
    return (
      <img
        src={component.url}
        alt={component.name}
        className={`${sizeClass} rounded-full object-cover`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-accent/20 text-accent flex items-center justify-center font-medium`}
    >
      {initials}
    </div>
  );
}

function BadgeRenderer({ component }: { component: Extract<AnyUIComponent, { type: "badge" }> }) {
  const colors: Record<string, string> = {
    success: "bg-status-success/20 text-status-success",
    warning: "bg-status-warning/20 text-status-warning",
    error: "bg-status-error/20 text-status-error",
    info: "bg-status-info/20 text-status-info",
    neutral: "bg-surface-3 text-gray-400",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        colors[component.color ?? "neutral"]
      }`}
    >
      {component.label}
    </span>
  );
}

function TimelineRenderer({
  component,
}: {
  component: Extract<AnyUIComponent, { type: "timeline" }>;
}) {
  const dotColors: Record<string, string> = {
    success: "bg-status-success",
    warning: "bg-status-warning",
    error: "bg-status-error",
    info: "bg-status-info",
    pending: "bg-status-pending",
  };

  return (
    <div className="space-y-0">
      {component.events.map((event, i) => (
        <div key={i} className="flex gap-3 relative">
          <div className="flex flex-col items-center">
            <div
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 ${
                dotColors[event.status ?? "info"]
              }`}
            />
            {i < component.events.length - 1 && (
              <div className="w-px flex-1 bg-border min-h-[16px]" />
            )}
          </div>
          <div className="pb-3">
            <div className="text-xs font-medium text-gray-300">{event.label}</div>
            {event.timestamp && <div className="text-xs text-gray-500">{event.timestamp}</div>}
            {event.detail && <div className="text-xs text-gray-400 mt-0.5">{event.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function MediaRenderer({ component }: { component: Extract<AnyUIComponent, { type: "media" }> }) {
  return (
    <div>
      {component.mediaType === "video" ? (
        <video
          src={component.url}
          poster={component.thumbnail}
          controls
          className="rounded-lg max-w-full"
        />
      ) : (
        <img src={component.url} alt={component.caption ?? ""} className="rounded-lg max-w-full" />
      )}
      {component.caption && <p className="text-xs text-gray-500 mt-1">{component.caption}</p>}
    </div>
  );
}

function MapRenderer({ component }: { component: Extract<AnyUIComponent, { type: "map" }> }) {
  const zoom = component.zoom ?? 13;
  return (
    <div className="bg-surface-2 border border-border rounded-xl p-4 text-center">
      <div className="text-xs text-gray-500 mb-1">{component.label ?? "Location"}</div>
      <div className="text-xs text-gray-400">
        {component.latitude.toFixed(4)}, {component.longitude.toFixed(4)}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">Zoom: {zoom}</div>
    </div>
  );
}

// ─── US-1.2: Layout Component Renderers ─────────────────────────────

function GridRenderer({
  component,
  onAction,
}: {
  component: Extract<AnyUIComponent, { type: "grid" }>;
  onAction: (action: string, data?: Record<string, unknown>) => void;
}) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${component.columns}, minmax(0, 1fr))` }}
    >
      {component.children.map((child, i) => (
        <UIComponent key={i} component={child} onAction={onAction} />
      ))}
    </div>
  );
}

function StackRenderer({
  component,
  onAction,
}: {
  component: Extract<AnyUIComponent, { type: "stack" }>;
  onAction: (action: string, data?: Record<string, unknown>) => void;
}) {
  const isHorizontal = component.direction === "horizontal";
  return (
    <div
      className={isHorizontal ? "flex items-start" : "flex flex-col"}
      style={{ gap: `${component.gap ?? 8}px` }}
    >
      {component.children.map((child, i) => (
        <UIComponent key={i} component={child} onAction={onAction} />
      ))}
    </div>
  );
}

function SplitRenderer({
  component,
  onAction,
}: {
  component: Extract<AnyUIComponent, { type: "split" }>;
  onAction: (action: string, data?: Record<string, unknown>) => void;
}) {
  const leftPct = component.ratio ?? 50;
  return (
    <div className="flex gap-3">
      <div style={{ width: `${leftPct}%` }} className="space-y-2">
        {component.left.map((child, i) => (
          <UIComponent key={i} component={child} onAction={onAction} />
        ))}
      </div>
      <div style={{ width: `${100 - leftPct}%` }} className="space-y-2">
        {component.right.map((child, i) => (
          <UIComponent key={i} component={child} onAction={onAction} />
        ))}
      </div>
    </div>
  );
}
