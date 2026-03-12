import { describe, it, expect } from "vitest";
import { parseWidgetEvents, type WidgetInfo } from "./WidgetPanel";

function createMockStateEvent(
  type: string,
  stateKey: string | undefined,
  content: Record<string, unknown>,
) {
  return {
    getType: () => type,
    getStateKey: () => stateKey,
    getContent: () => content,
  };
}

describe("parseWidgetEvents", () => {
  describe("Given valid widget state events", () => {
    describe("When parsing a single widget event", () => {
      it("Then it should extract widget info with correct fields", () => {
        const events = [
          createMockStateEvent("im.vector.modular.widgets", "widget_1", {
            type: "customwidget",
            url: "https://example.com/widget",
            name: "My Widget",
            data: {},
          }),
        ];

        const result = parseWidgetEvents(events);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          id: "widget_1",
          name: "My Widget",
          type: "customwidget",
          url: "https://example.com/widget",
        } satisfies WidgetInfo);
      });
    });

    describe("When parsing multiple widget events", () => {
      it("Then it should return all widgets", () => {
        const events = [
          createMockStateEvent("im.vector.modular.widgets", "widget_1", {
            type: "customwidget",
            url: "https://example.com/a",
            name: "Widget A",
          }),
          createMockStateEvent("im.vector.modular.widgets", "widget_2", {
            type: "jitsi",
            url: "https://meet.jit.si/room",
            name: "Jitsi",
          }),
        ];

        const result = parseWidgetEvents(events);

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe("widget_1");
        expect(result[1].id).toBe("widget_2");
      });
    });

    describe("When a widget event has no name", () => {
      it("Then it should default the name to 'Widget'", () => {
        const events = [
          createMockStateEvent("im.vector.modular.widgets", "widget_1", {
            type: "custom",
            url: "https://example.com",
          }),
        ];

        const result = parseWidgetEvents(events);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("Widget");
      });
    });

    describe("When a widget event has no type", () => {
      it("Then it should default the type to 'custom'", () => {
        const events = [
          createMockStateEvent("im.vector.modular.widgets", "widget_1", {
            url: "https://example.com",
            name: "Test",
          }),
        ];

        const result = parseWidgetEvents(events);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("custom");
      });
    });
  });

  describe("Given invalid or empty widget state events", () => {
    describe("When the event has empty content (removed widget)", () => {
      it("Then it should be skipped", () => {
        const events = [createMockStateEvent("im.vector.modular.widgets", "widget_1", {})];

        const result = parseWidgetEvents(events);

        expect(result).toHaveLength(0);
      });
    });

    describe("When the event has no URL", () => {
      it("Then it should be skipped", () => {
        const events = [
          createMockStateEvent("im.vector.modular.widgets", "widget_1", {
            type: "custom",
            name: "Broken Widget",
          }),
        ];

        const result = parseWidgetEvents(events);

        expect(result).toHaveLength(0);
      });
    });

    describe("When the event has no state key", () => {
      it("Then it should be skipped", () => {
        const events = [
          createMockStateEvent("im.vector.modular.widgets", undefined, {
            type: "custom",
            url: "https://example.com",
            name: "No Key",
          }),
        ];

        const result = parseWidgetEvents(events);

        expect(result).toHaveLength(0);
      });
    });

    describe("When the event type is not a widget type", () => {
      it("Then it should be skipped", () => {
        const events = [
          createMockStateEvent("m.room.name", "widget_1", {
            url: "https://example.com",
            name: "Not a widget",
          }),
        ];

        const result = parseWidgetEvents(events);

        expect(result).toHaveLength(0);
      });
    });

    describe("When the URL is an empty string", () => {
      it("Then it should be skipped", () => {
        const events = [
          createMockStateEvent("im.vector.modular.widgets", "widget_1", {
            type: "custom",
            url: "",
            name: "Empty URL",
          }),
        ];

        const result = parseWidgetEvents(events);

        expect(result).toHaveLength(0);
      });
    });

    describe("When there are no events", () => {
      it("Then it should return an empty array", () => {
        const result = parseWidgetEvents([]);

        expect(result).toHaveLength(0);
      });
    });
  });

  describe("Given mixed valid and invalid events", () => {
    describe("When some events are valid and some are not", () => {
      it("Then it should only return the valid widgets", () => {
        const events = [
          createMockStateEvent("im.vector.modular.widgets", "good_1", {
            type: "customwidget",
            url: "https://example.com/good",
            name: "Good Widget",
          }),
          createMockStateEvent("im.vector.modular.widgets", "bad_1", {}),
          createMockStateEvent("m.room.name", "irrelevant", {
            name: "room name",
          }),
          createMockStateEvent("im.vector.modular.widgets", "good_2", {
            type: "jitsi",
            url: "https://meet.jit.si/test",
            name: "Jitsi",
          }),
        ];

        const result = parseWidgetEvents(events);

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe("good_1");
        expect(result[1].id).toBe("good_2");
      });
    });
  });
});
