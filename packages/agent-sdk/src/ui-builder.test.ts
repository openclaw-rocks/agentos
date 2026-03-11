import { describe, it, expect } from "vitest";
import { UIBuilder } from "./ui-builder.js";

describe("UIBuilder", () => {
  describe("given a new empty builder", () => {
    it("then build() should return an empty array", () => {
      expect(new UIBuilder().build()).toEqual([]);
    });
  });

  describe("given a text component is added", () => {
    it("then the built array should contain one text component", () => {
      const ui = new UIBuilder().text("Hello").build();
      expect(ui).toHaveLength(1);
      expect(ui[0]).toMatchObject({ type: "text", content: "Hello" });
    });

    it("then the variant should be set when provided", () => {
      const ui = new UIBuilder().text("Title", "heading").build();
      expect(ui[0]).toMatchObject({ type: "text", content: "Title", variant: "heading" });
    });
  });

  describe("given a button is added", () => {
    it("then the built array should contain one button with label, action, and style", () => {
      const ui = new UIBuilder().button("Click", "do_it", "primary").build();
      expect(ui[0]).toMatchObject({
        type: "button",
        label: "Click",
        action: "do_it",
        style: "primary",
      });
    });
  });

  describe("given a button group is added", () => {
    it("then each button should have type: 'button' injected", () => {
      const ui = new UIBuilder()
        .buttonGroup([
          { label: "Yes", action: "yes" },
          { label: "No", action: "no", style: "danger" },
        ])
        .build();
      expect(ui[0]).toMatchObject({
        type: "button_group",
        buttons: [
          { type: "button", label: "Yes", action: "yes" },
          { type: "button", label: "No", action: "no", style: "danger" },
        ],
      });
    });
  });

  describe("given a card with nested children is added", () => {
    it("then the card should contain the children from the builder callback", () => {
      const ui = new UIBuilder()
        .card("My Card", (card) => card.text("Body text").status("Build", "success", "Passed"))
        .build();

      expect(ui).toHaveLength(1);
      expect(ui[0]).toMatchObject({ type: "card", title: "My Card" });
      const card = ui[0] as { children: unknown[] };
      expect(card.children).toHaveLength(2);
    });
  });

  describe("given a form with inputs is added", () => {
    it("then the form should contain the input children and submit label", () => {
      const ui = new UIBuilder()
        .form(
          "submit_form",
          (form) =>
            form
              .input("name", "Name", { placeholder: "Enter name" })
              .input("email", "Email", { inputType: "text" }),
          "Submit",
        )
        .build();

      expect(ui).toHaveLength(1);
      expect(ui[0]).toMatchObject({
        type: "form",
        action: "submit_form",
        submitLabel: "Submit",
      });
      const form = ui[0] as { children: unknown[] };
      expect(form.children).toHaveLength(2);
    });
  });

  describe("given multiple components are chained fluently", () => {
    it("then they should appear in the order they were added", () => {
      const ui = new UIBuilder()
        .text("Intro")
        .divider()
        .progress(75, "Loading", "Almost done")
        .code("const x = 1;", "typescript")
        .image("https://example.com/img.png", "Logo")
        .build();

      expect(ui).toHaveLength(5);
      expect(ui.map((c) => c.type)).toEqual(["text", "divider", "progress", "code", "image"]);
    });
  });

  describe("given a diff component is added", () => {
    it("then it should contain filename, additions, deletions, and hunks", () => {
      const ui = new UIBuilder()
        .diff("main.ts", 3, 1, [{ header: "@@ -1,4 +1,6 @@", lines: ["+new line"] }])
        .build();

      expect(ui[0]).toMatchObject({
        type: "diff",
        filename: "main.ts",
        additions: 3,
        deletions: 1,
      });
    });
  });

  describe("given a log component is added", () => {
    it("then it should contain the log lines", () => {
      const ui = new UIBuilder()
        .log([
          { message: "Started", level: "info" },
          { message: "Error!", level: "error", timestamp: "12:00" },
        ])
        .build();

      expect(ui[0]).toMatchObject({ type: "log" });
      const log = ui[0] as { lines: unknown[] };
      expect(log.lines).toHaveLength(2);
    });
  });

  describe("given build() is called multiple times", () => {
    it("then each call should return a new copy, not a shared reference", () => {
      const builder = new UIBuilder().text("Hello");
      const first = builder.build();
      const second = builder.build();
      expect(first).toEqual(second);
      expect(first).not.toBe(second);
    });
  });

  describe("given a status component is added", () => {
    it("then it should contain label, value, and optional detail", () => {
      const ui = new UIBuilder().status("Tests", "success", "142/142 passed").build();
      expect(ui[0]).toMatchObject({
        type: "status",
        label: "Tests",
        value: "success",
        detail: "142/142 passed",
      });
    });
  });

  describe("given a table component is added", () => {
    it("then it should contain rows and optional headers", () => {
      const ui = new UIBuilder()
        .table(
          [
            ["Alice", "Admin"],
            ["Bob", "User"],
          ],
          ["Name", "Role"],
        )
        .build();
      expect(ui[0]).toMatchObject({
        type: "table",
        headers: ["Name", "Role"],
        rows: [
          ["Alice", "Admin"],
          ["Bob", "User"],
        ],
      });
    });
  });

  // ─── US-1.1: Expanded Components ─────────────────────────────────

  describe("given a metric component is added", () => {
    it("then it should contain label, value, and optional trend", () => {
      const ui = new UIBuilder()
        .metric("Revenue", "$42k", { trend: "up", change: "+12%", unit: "USD" })
        .build();
      expect(ui[0]).toMatchObject({
        type: "metric",
        label: "Revenue",
        value: "$42k",
        trend: "up",
        change: "+12%",
        unit: "USD",
      });
    });

    it("then it should work with just label and value", () => {
      const ui = new UIBuilder().metric("Users", "1,234").build();
      expect(ui[0]).toMatchObject({ type: "metric", label: "Users", value: "1,234" });
    });
  });

  describe("given a chart component is added", () => {
    it("then it should contain chartType, data, and optional title", () => {
      const data = {
        labels: ["Jan", "Feb"],
        datasets: [{ label: "Sales", values: [10, 20] }],
      };
      const ui = new UIBuilder().chart("bar", data, "Monthly Sales").build();
      expect(ui[0]).toMatchObject({
        type: "chart",
        chartType: "bar",
        data,
        title: "Monthly Sales",
      });
    });
  });

  describe("given a list component is added", () => {
    it("then it should contain items and optional ordered flag", () => {
      const items = [{ text: "First" }, { text: "Second", action: "select" }];
      const ui = new UIBuilder().list(items, true).build();
      expect(ui[0]).toMatchObject({ type: "list", items, ordered: true });
    });
  });

  describe("given a tabs component is added", () => {
    it("then each tab should contain children from the builder callback", () => {
      const ui = new UIBuilder()
        .tabs([
          { label: "Overview", builder: (t) => t.text("Hello") },
          { label: "Details", builder: (t) => t.status("Build", "success") },
        ])
        .build();
      expect(ui).toHaveLength(1);
      expect(ui[0]).toMatchObject({ type: "tabs" });
      const tabs = ui[0] as { tabs: { label: string; children: unknown[] }[] };
      expect(tabs.tabs).toHaveLength(2);
      expect(tabs.tabs[0].label).toBe("Overview");
      expect(tabs.tabs[0].children).toHaveLength(1);
      expect(tabs.tabs[1].label).toBe("Details");
    });
  });

  describe("given an avatar component is added", () => {
    it("then it should contain name, optional url, and size", () => {
      const ui = new UIBuilder().avatar("Alice", "https://img.com/alice.png", "lg").build();
      expect(ui[0]).toMatchObject({
        type: "avatar",
        name: "Alice",
        url: "https://img.com/alice.png",
        size: "lg",
      });
    });
  });

  describe("given a badge component is added", () => {
    it("then it should contain label and optional color", () => {
      const ui = new UIBuilder().badge("New", "success").build();
      expect(ui[0]).toMatchObject({ type: "badge", label: "New", color: "success" });
    });
  });

  describe("given a timeline component is added", () => {
    it("then it should contain the list of events", () => {
      const events = [
        { label: "Created", timestamp: "10:00", status: "success" as const },
        { label: "In Progress", status: "info" as const },
      ];
      const ui = new UIBuilder().timeline(events).build();
      expect(ui[0]).toMatchObject({ type: "timeline" });
      const tl = ui[0] as { events: unknown[] };
      expect(tl.events).toHaveLength(2);
    });
  });

  describe("given a media component is added", () => {
    it("then it should contain mediaType, url, and optional caption", () => {
      const ui = new UIBuilder()
        .media("video", "https://example.com/clip.mp4", "Demo video")
        .build();
      expect(ui[0]).toMatchObject({
        type: "media",
        mediaType: "video",
        url: "https://example.com/clip.mp4",
        caption: "Demo video",
      });
    });
  });

  describe("given a map component is added", () => {
    it("then it should contain latitude, longitude, and optional zoom/label", () => {
      const ui = new UIBuilder().map(52.52, 13.405, { zoom: 15, label: "Berlin" }).build();
      expect(ui[0]).toMatchObject({
        type: "map",
        latitude: 52.52,
        longitude: 13.405,
        zoom: 15,
        label: "Berlin",
      });
    });
  });

  // ─── US-1.2: Layout Components ───────────────────────────────────

  describe("given a grid component is added", () => {
    it("then it should contain columns and children from the builder callback", () => {
      const ui = new UIBuilder().grid(3, (g) => g.text("A").text("B").text("C")).build();
      expect(ui).toHaveLength(1);
      expect(ui[0]).toMatchObject({ type: "grid", columns: 3 });
      const grid = ui[0] as { children: unknown[] };
      expect(grid.children).toHaveLength(3);
    });
  });

  describe("given a stack component is added", () => {
    it("then it should contain direction, children, and optional gap", () => {
      const ui = new UIBuilder().stack("horizontal", (s) => s.badge("A").badge("B"), 12).build();
      expect(ui[0]).toMatchObject({
        type: "stack",
        direction: "horizontal",
        gap: 12,
      });
      const stack = ui[0] as { children: unknown[] };
      expect(stack.children).toHaveLength(2);
    });
  });

  describe("given a split component is added", () => {
    it("then it should contain left and right panes with ratio", () => {
      const ui = new UIBuilder()
        .split(
          (left) => left.text("Left content"),
          (right) => right.text("Right content"),
          60,
        )
        .build();
      expect(ui[0]).toMatchObject({ type: "split", ratio: 60 });
      const split = ui[0] as { left: unknown[]; right: unknown[] };
      expect(split.left).toHaveLength(1);
      expect(split.right).toHaveLength(1);
    });
  });

  describe("given all 26 component types are chained", () => {
    it("then they should appear in the correct order", () => {
      const ui = new UIBuilder()
        .text("Hello")
        .button("Click", "do")
        .buttonGroup([{ label: "A", action: "a" }])
        .code("x = 1", "python")
        .status("OK", "success")
        .progress(50)
        .table([["a"]])
        .card("Card", (c) => c.divider())
        .input("name", "Name")
        .form("submit", (f) => f.input("x", "X"))
        .divider()
        .image("url")
        .log([{ message: "hi" }])
        .diff("f.ts", 1, 0, [{ header: "@@", lines: ["+a"] }])
        .metric("M", "1")
        .chart("pie", { labels: ["a"], datasets: [{ label: "d", values: [1] }] })
        .list([{ text: "item" }])
        .tabs([{ label: "T", builder: (t) => t.text("x") }])
        .avatar("Bob")
        .badge("New")
        .timeline([{ label: "E" }])
        .media("image", "url")
        .map(0, 0)
        .grid(2, (g) => g.text("a"))
        .stack("vertical", (s) => s.text("a"))
        .split(
          (l) => l.text("L"),
          (r) => r.text("R"),
        )
        .build();

      expect(ui).toHaveLength(26);
      expect(ui.map((c) => c.type)).toEqual([
        "text",
        "button",
        "button_group",
        "code",
        "status",
        "progress",
        "table",
        "card",
        "input",
        "form",
        "divider",
        "image",
        "log",
        "diff",
        "metric",
        "chart",
        "list",
        "tabs",
        "avatar",
        "badge",
        "timeline",
        "media",
        "map",
        "grid",
        "stack",
        "split",
      ]);
    });
  });
});
