import type { AnyUIComponent } from "@openclaw/protocol";
import { describe, it, expect } from "vitest";
import { validateComponent, validateComponents } from "./validate.js";

describe("validateComponent", () => {
  describe("given a valid text component", () => {
    it("then it should return no errors", () => {
      const component: AnyUIComponent = { type: "text", content: "Hello" };
      expect(validateComponent(component)).toEqual([]);
    });
  });

  describe("given a valid button component", () => {
    it("then it should return no errors", () => {
      const component: AnyUIComponent = { type: "button", label: "Click", action: "do_thing" };
      expect(validateComponent(component)).toEqual([]);
    });
  });

  describe("given a valid divider component", () => {
    it("then it should return no errors since divider has no required fields", () => {
      expect(validateComponent({ type: "divider" })).toEqual([]);
    });
  });

  describe("given a component with missing required fields", () => {
    it("then it should return an error for each missing field", () => {
      const component = { type: "text" } as AnyUIComponent;
      const errors = validateComponent(component);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("content");
    });
  });

  describe("given a component with unknown type", () => {
    it("then it should return an unknown type error", () => {
      const component = { type: "unknown_widget" } as unknown as AnyUIComponent;
      const errors = validateComponent(component);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("Unknown component type");
    });
  });

  describe("given a card with nested children", () => {
    it("then it should validate children recursively", () => {
      const component: AnyUIComponent = {
        type: "card",
        title: "Test",
        children: [{ type: "text", content: "Valid" }, { type: "text" } as AnyUIComponent],
      };
      const errors = validateComponent(component);
      expect(errors).toHaveLength(1);
      expect(errors[0].path).toBe("root.children[1].content");
    });

    it("then it should return no errors when all children are valid", () => {
      const component: AnyUIComponent = {
        type: "card",
        title: "Test",
        children: [{ type: "text", content: "Hello" }, { type: "divider" }],
      };
      expect(validateComponent(component)).toEqual([]);
    });
  });

  describe("given a button_group with invalid buttons", () => {
    it("then it should validate each button in the group", () => {
      const component: AnyUIComponent = {
        type: "button_group",
        buttons: [
          { type: "button", label: "OK", action: "ok" },
          { type: "button", label: "Cancel" } as AnyUIComponent,
        ],
      };
      const errors = validateComponent(component);
      expect(errors).toHaveLength(1);
      expect(errors[0].path).toContain("buttons[1]");
    });
  });

  // US-1.1: Expanded component validation
  describe("given a valid metric component", () => {
    it("then it should return no errors", () => {
      const component: AnyUIComponent = { type: "metric", label: "Revenue", value: "$42k" };
      expect(validateComponent(component)).toEqual([]);
    });
  });

  describe("given a metric missing required fields", () => {
    it("then it should return errors for label and value", () => {
      const component = { type: "metric" } as AnyUIComponent;
      const errors = validateComponent(component);
      expect(errors).toHaveLength(2);
    });
  });

  describe("given a valid chart component", () => {
    it("then it should return no errors", () => {
      const component: AnyUIComponent = {
        type: "chart",
        chartType: "bar",
        data: { labels: ["A", "B"], datasets: [{ label: "Sales", values: [10, 20] }] },
      };
      expect(validateComponent(component)).toEqual([]);
    });
  });

  describe("given a valid list component", () => {
    it("then it should return no errors", () => {
      const component: AnyUIComponent = {
        type: "list",
        items: [{ text: "Item 1" }, { text: "Item 2", action: "select" }],
      };
      expect(validateComponent(component)).toEqual([]);
    });
  });

  describe("given a valid tabs component", () => {
    it("then it should return no errors", () => {
      const component: AnyUIComponent = {
        type: "tabs",
        tabs: [{ label: "Tab 1", children: [{ type: "text", content: "Content" }] }],
      };
      expect(validateComponent(component)).toEqual([]);
    });
  });

  describe("given tabs with invalid children", () => {
    it("then it should validate tab children recursively", () => {
      const component: AnyUIComponent = {
        type: "tabs",
        tabs: [{ label: "Tab 1", children: [{ type: "text" } as AnyUIComponent] }],
      };
      const errors = validateComponent(component);
      expect(errors).toHaveLength(1);
      expect(errors[0].path).toBe("root.tabs[0].children[0].content");
    });
  });

  describe("given a valid timeline component", () => {
    it("then it should return no errors", () => {
      const component: AnyUIComponent = {
        type: "timeline",
        events: [{ label: "Started", status: "success" }],
      };
      expect(validateComponent(component)).toEqual([]);
    });
  });

  describe("given a valid badge component", () => {
    it("then it should return no errors", () => {
      expect(validateComponent({ type: "badge", label: "New" } as AnyUIComponent)).toEqual([]);
    });
  });

  describe("given a valid avatar component", () => {
    it("then it should return no errors", () => {
      expect(validateComponent({ type: "avatar", name: "Alice" } as AnyUIComponent)).toEqual([]);
    });
  });

  describe("given a valid media component", () => {
    it("then it should return no errors", () => {
      const component: AnyUIComponent = {
        type: "media",
        mediaType: "image",
        url: "https://example.com/img.png",
      };
      expect(validateComponent(component)).toEqual([]);
    });
  });

  describe("given a valid map component", () => {
    it("then it should return no errors", () => {
      const component: AnyUIComponent = {
        type: "map",
        latitude: 52.52,
        longitude: 13.405,
      };
      expect(validateComponent(component)).toEqual([]);
    });
  });

  // US-1.2: Layout component validation
  describe("given a valid grid component", () => {
    it("then it should return no errors", () => {
      const component: AnyUIComponent = {
        type: "grid",
        columns: 2,
        children: [
          { type: "text", content: "A" },
          { type: "text", content: "B" },
        ],
      };
      expect(validateComponent(component)).toEqual([]);
    });

    it("then it should validate children recursively", () => {
      const component: AnyUIComponent = {
        type: "grid",
        columns: 2,
        children: [{ type: "text" } as AnyUIComponent],
      };
      const errors = validateComponent(component);
      expect(errors).toHaveLength(1);
      expect(errors[0].path).toBe("root.children[0].content");
    });
  });

  describe("given a valid stack component", () => {
    it("then it should return no errors", () => {
      const component: AnyUIComponent = {
        type: "stack",
        direction: "horizontal",
        children: [{ type: "text", content: "A" }],
      };
      expect(validateComponent(component)).toEqual([]);
    });
  });

  describe("given a valid split component", () => {
    it("then it should return no errors", () => {
      const component: AnyUIComponent = {
        type: "split",
        left: [{ type: "text", content: "Left" }],
        right: [{ type: "text", content: "Right" }],
      };
      expect(validateComponent(component)).toEqual([]);
    });

    it("then it should validate left and right pane children", () => {
      const component: AnyUIComponent = {
        type: "split",
        left: [{ type: "text" } as AnyUIComponent],
        right: [{ type: "button", label: "X" } as AnyUIComponent],
      };
      const errors = validateComponent(component);
      expect(errors).toHaveLength(2);
      expect(errors[0].path).toBe("root.left[0].content");
      expect(errors[1].path).toBe("root.right[0].action");
    });
  });
});

describe("validateComponents", () => {
  describe("given an array of valid components", () => {
    it("then it should return no errors", () => {
      const components: AnyUIComponent[] = [
        { type: "text", content: "Hello" },
        { type: "divider" },
      ];
      expect(validateComponents(components)).toEqual([]);
    });
  });

  describe("given an array with multiple invalid components", () => {
    it("then it should return errors from each invalid component", () => {
      const components = [
        { type: "text" } as AnyUIComponent,
        { type: "button", label: "X" } as AnyUIComponent,
      ];
      const errors = validateComponents(components);
      expect(errors).toHaveLength(2);
    });
  });
});
