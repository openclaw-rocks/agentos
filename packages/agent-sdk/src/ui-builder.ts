import type {
  AnyUIComponent,
  BadgeComponent,
  ButtonComponent,
  ButtonGroupComponent,
  CardComponent,
  ChartComponent,
  DiffComponent,
  FormComponent,
  GridComponent,
  InputComponent,
  ListComponent,
  LogComponent,
  MediaComponent,
  MetricComponent,
  SplitComponent,
  StackComponent,
  StatusComponent,
  TabsComponent,
  TextComponent,
  TimelineComponent,
} from "@openclaw/protocol";

/**
 * Fluent builder for constructing A2UI component trees.
 *
 * Usage:
 * ```ts
 * const ui = new UIBuilder()
 *   .card("Deploy Request", (card) => card
 *     .text("Ready to deploy v2.3.1")
 *     .status("Tests", "success", "All 42 tests passed")
 *     .buttonGroup([
 *       { label: "Approve", action: "approve", style: "primary" },
 *       { label: "Reject", action: "reject", style: "danger" },
 *     ])
 *   )
 *   .build();
 * ```
 */
export class UIBuilder {
  private components: AnyUIComponent[] = [];

  text(content: string, variant?: TextComponent["variant"]): this {
    this.components.push({ type: "text", content, variant });
    return this;
  }

  button(label: string, action: string, style?: ButtonComponent["style"]): this {
    this.components.push({ type: "button", label, action, style });
    return this;
  }

  buttonGroup(buttons: Omit<ButtonComponent, "type">[]): this {
    const group: ButtonGroupComponent = {
      type: "button_group",
      buttons: buttons.map((b) => ({ ...b, type: "button" })),
    };
    this.components.push(group);
    return this;
  }

  code(content: string, language?: string): this {
    this.components.push({ type: "code", content, language });
    return this;
  }

  status(label: string, value: StatusComponent["value"], detail?: string): this {
    this.components.push({ type: "status", label, value, detail });
    return this;
  }

  progress(value: number, label?: string, status?: string): this {
    this.components.push({ type: "progress", value, label, status });
    return this;
  }

  table(rows: string[][], headers?: string[]): this {
    this.components.push({ type: "table", rows, headers });
    return this;
  }

  card(
    title: string,
    builder: (card: UIBuilder) => UIBuilder,
    options?: Partial<Omit<CardComponent, "type" | "title" | "children">>,
  ): this {
    const inner = builder(new UIBuilder());
    const card: CardComponent = {
      type: "card",
      title,
      children: inner.build(),
      ...options,
    };
    this.components.push(card);
    return this;
  }

  input(
    name: string,
    label: string,
    options?: Partial<Omit<InputComponent, "type" | "name" | "label">>,
  ): this {
    this.components.push({ type: "input", name, label, ...options });
    return this;
  }

  form(action: string, builder: (form: UIBuilder) => UIBuilder, submitLabel?: string): this {
    const inner = builder(new UIBuilder());
    const form: FormComponent = {
      type: "form",
      action,
      children: inner.build(),
      submitLabel,
    };
    this.components.push(form);
    return this;
  }

  divider(): this {
    this.components.push({ type: "divider" });
    return this;
  }

  image(url: string, alt?: string): this {
    this.components.push({ type: "image", url, alt });
    return this;
  }

  log(lines: LogComponent["lines"], maxHeight?: number): this {
    this.components.push({ type: "log", lines, maxHeight });
    return this;
  }

  diff(
    filename: string,
    additions: number,
    deletions: number,
    hunks: DiffComponent["hunks"],
  ): this {
    this.components.push({ type: "diff", filename, additions, deletions, hunks });
    return this;
  }

  // ─── US-1.1: Expanded Components ─────────────────────────────────

  metric(
    label: string,
    value: string,
    options?: Partial<Omit<MetricComponent, "type" | "label" | "value">>,
  ): this {
    this.components.push({ type: "metric", label, value, ...options });
    return this;
  }

  chart(
    chartType: ChartComponent["chartType"],
    data: ChartComponent["data"],
    title?: string,
  ): this {
    this.components.push({ type: "chart", chartType, data, title });
    return this;
  }

  list(items: ListComponent["items"], ordered?: boolean): this {
    this.components.push({ type: "list", items, ordered });
    return this;
  }

  tabs(
    tabDefs: { label: string; builder: (tab: UIBuilder) => UIBuilder }[],
    activeTab?: number,
  ): this {
    const tabs: TabsComponent["tabs"] = tabDefs.map((def) => ({
      label: def.label,
      children: def.builder(new UIBuilder()).build(),
    }));
    this.components.push({ type: "tabs", tabs, activeTab });
    return this;
  }

  avatar(name: string, url?: string, size?: "sm" | "md" | "lg"): this {
    this.components.push({ type: "avatar", name, url, size });
    return this;
  }

  badge(label: string, color?: BadgeComponent["color"]): this {
    this.components.push({ type: "badge", label, color });
    return this;
  }

  timeline(events: TimelineComponent["events"]): this {
    this.components.push({ type: "timeline", events });
    return this;
  }

  media(mediaType: MediaComponent["mediaType"], url: string, caption?: string): this {
    this.components.push({ type: "media", mediaType, url, caption });
    return this;
  }

  map(latitude: number, longitude: number, options?: { zoom?: number; label?: string }): this {
    this.components.push({ type: "map", latitude, longitude, ...options });
    return this;
  }

  // ─── US-1.2: Layout Components ───────────────────────────────────

  grid(
    columns: number,
    builder: (grid: UIBuilder) => UIBuilder,
    options?: Partial<Omit<GridComponent, "type" | "columns" | "children">>,
  ): this {
    const inner = builder(new UIBuilder());
    this.components.push({ type: "grid", columns, children: inner.build(), ...options });
    return this;
  }

  stack(
    direction: StackComponent["direction"],
    builder: (stack: UIBuilder) => UIBuilder,
    gap?: number,
  ): this {
    const inner = builder(new UIBuilder());
    this.components.push({ type: "stack", direction, children: inner.build(), gap });
    return this;
  }

  split(
    leftBuilder: (left: UIBuilder) => UIBuilder,
    rightBuilder: (right: UIBuilder) => UIBuilder,
    ratio?: number,
  ): this {
    const left = leftBuilder(new UIBuilder()).build();
    const right = rightBuilder(new UIBuilder()).build();
    const component: SplitComponent = { type: "split", left, right, ratio };
    this.components.push(component);
    return this;
  }

  /** Build and return the component array */
  build(): AnyUIComponent[] {
    return [...this.components];
  }
}
