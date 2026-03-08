import type {
  AnyUIComponent,
  ButtonComponent,
  ButtonGroupComponent,
  CardComponent,
  CodeComponent,
  DiffComponent,
  DividerComponent,
  FormComponent,
  ImageComponent,
  InputComponent,
  LogComponent,
  ProgressComponent,
  StatusComponent,
  TableComponent,
  TextComponent,
} from "@openclaw/matrix-events";

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

  card(title: string, builder: (card: UIBuilder) => UIBuilder, options?: Partial<Omit<CardComponent, "type" | "title" | "children">>): this {
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

  input(name: string, label: string, options?: Partial<Omit<InputComponent, "type" | "name" | "label">>): this {
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

  diff(filename: string, additions: number, deletions: number, hunks: DiffComponent["hunks"]): this {
    this.components.push({ type: "diff", filename, additions, deletions, hunks });
    return this;
  }

  /** Build and return the component array */
  build(): AnyUIComponent[] {
    return [...this.components];
  }
}
