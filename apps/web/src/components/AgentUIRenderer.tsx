import React from "react";
import type { AnyUIComponent } from "@openclaw/matrix-events";

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
      return <hr className="border-border my-2" />;
    case "image":
      return <img src={component.url} alt={component.alt ?? ""} className="rounded-lg max-w-full" />;
    case "log":
      return <LogRenderer component={component} />;
    case "diff":
      return <DiffRenderer component={component} />;
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
      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 ${
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
    <div className="flex items-center gap-2 py-0.5">
      <div className={`w-2 h-2 rounded-full ${dotColors[component.value]}`} />
      <span className="text-xs font-medium text-gray-300">{component.label}</span>
      {component.detail && (
        <span className="text-xs text-gray-500">{component.detail}</span>
      )}
    </div>
  );
}

function ProgressRenderer({ component }: { component: Extract<AnyUIComponent, { type: "progress" }> }) {
  return (
    <div className="py-1">
      <div className="flex justify-between text-xs mb-1">
        {component.label && <span className="text-gray-400">{component.label}</span>}
        {component.status && <span className="text-gray-500">{component.status}</span>}
      </div>
      <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, component.value))}%` }}
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
              <th key={i} className="text-left py-1 px-2 text-gray-500 font-medium border-b border-border">
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
        {component.subtitle && (
          <p className="text-xs text-gray-500 mt-0.5">{component.subtitle}</p>
        )}
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
  if (component.inputType === "select") {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">{component.label}</label>
        <select className="w-full px-3 py-1.5 bg-surface-3 border border-border rounded-lg text-xs text-white focus:outline-none focus:border-accent">
          {component.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }

  if (component.inputType === "textarea") {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">{component.label}</label>
        <textarea
          placeholder={component.placeholder}
          rows={3}
          className="w-full px-3 py-1.5 bg-surface-3 border border-border rounded-lg text-xs text-white placeholder-gray-500 resize-none focus:outline-none focus:border-accent"
        />
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1">{component.label}</label>
      <input
        type={component.inputType ?? "text"}
        placeholder={component.placeholder}
        required={component.required}
        className="w-full px-3 py-1.5 bg-surface-3 border border-border rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-accent"
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
          <div className="px-3 py-1 bg-surface-4 text-xs font-mono text-gray-500">{hunk.header}</div>
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
