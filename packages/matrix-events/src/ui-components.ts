/** Base interface for all A2UI components */
export interface UIComponent {
  type: string;
  id?: string;
}

/** Text display */
export interface TextComponent extends UIComponent {
  type: "text";
  content: string;
  variant?: "body" | "heading" | "caption" | "code";
}

/** Button */
export interface ButtonComponent extends UIComponent {
  type: "button";
  label: string;
  action: string;
  style?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
}

/** Button group */
export interface ButtonGroupComponent extends UIComponent {
  type: "button_group";
  buttons: ButtonComponent[];
}

/** Code block with optional diff highlighting */
export interface CodeComponent extends UIComponent {
  type: "code";
  language?: string;
  content: string;
  diff?: boolean;
}

/** Status indicator */
export interface StatusComponent extends UIComponent {
  type: "status";
  label: string;
  value: "success" | "warning" | "error" | "info" | "pending";
  detail?: string;
}

/** Progress bar */
export interface ProgressComponent extends UIComponent {
  type: "progress";
  label?: string;
  value: number; // 0-100
  status?: string;
}

/** Key-value table */
export interface TableComponent extends UIComponent {
  type: "table";
  headers?: string[];
  rows: string[][];
}

/** Card container */
export interface CardComponent extends UIComponent {
  type: "card";
  title: string;
  subtitle?: string;
  icon?: string;
  children: AnyUIComponent[];
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

/** Form input */
export interface InputComponent extends UIComponent {
  type: "input";
  name: string;
  label: string;
  placeholder?: string;
  inputType?: "text" | "number" | "select" | "textarea";
  options?: { label: string; value: string }[];
  required?: boolean;
}

/** Form container */
export interface FormComponent extends UIComponent {
  type: "form";
  action: string;
  children: AnyUIComponent[];
  submitLabel?: string;
}

/** Divider */
export interface DividerComponent extends UIComponent {
  type: "divider";
}

/** Image */
export interface ImageComponent extends UIComponent {
  type: "image";
  url: string;
  alt?: string;
  width?: number;
  height?: number;
}

/** Log/terminal output */
export interface LogComponent extends UIComponent {
  type: "log";
  lines: { timestamp?: string; level?: "info" | "warn" | "error" | "debug"; message: string }[];
  maxHeight?: number;
}

/** Diff view for code changes */
export interface DiffComponent extends UIComponent {
  type: "diff";
  filename: string;
  additions: number;
  deletions: number;
  hunks: { header: string; lines: string[] }[];
}

/** Union type of all UI components */
export type AnyUIComponent =
  | TextComponent
  | ButtonComponent
  | ButtonGroupComponent
  | CodeComponent
  | StatusComponent
  | ProgressComponent
  | TableComponent
  | CardComponent
  | InputComponent
  | FormComponent
  | DividerComponent
  | ImageComponent
  | LogComponent
  | DiffComponent;
