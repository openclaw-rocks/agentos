import { describe, it, expect } from "vitest";
import { AgentStatusValues, EVENT_NAMESPACE, EventTypes, TaskStatusValues } from "./constants.js";

describe("EventTypes", () => {
  describe("given the openclaw event namespace", () => {
    it("then it should be rocks.openclaw.agent", () => {
      expect(EVENT_NAMESPACE).toBe("rocks.openclaw.agent");
    });
  });

  describe("given all event type constants", () => {
    it("then each type should be prefixed with the openclaw namespace", () => {
      for (const value of Object.values(EventTypes)) {
        expect(value).toMatch(/^rocks\.openclaw\.(agent|space)\./);
      }
    });

    it("then UI type should map to rocks.openclaw.agent.ui", () => {
      expect(EventTypes.UI).toBe("rocks.openclaw.agent.ui");
    });

    it("then Action type should map to rocks.openclaw.agent.action", () => {
      expect(EventTypes.Action).toBe("rocks.openclaw.agent.action");
    });

    it("then Status type should map to rocks.openclaw.agent.status", () => {
      expect(EventTypes.Status).toBe("rocks.openclaw.agent.status");
    });

    it("then Task type should map to rocks.openclaw.agent.task", () => {
      expect(EventTypes.Task).toBe("rocks.openclaw.agent.task");
    });

    it("then ToolCall type should map to rocks.openclaw.agent.tool_call", () => {
      expect(EventTypes.ToolCall).toBe("rocks.openclaw.agent.tool_call");
    });

    it("then ToolResult type should map to rocks.openclaw.agent.tool_result", () => {
      expect(EventTypes.ToolResult).toBe("rocks.openclaw.agent.tool_result");
    });

    it("then Register type should map to rocks.openclaw.agent.register", () => {
      expect(EventTypes.Register).toBe("rocks.openclaw.agent.register");
    });

    it("then Config type should map to rocks.openclaw.agent.config", () => {
      expect(EventTypes.Config).toBe("rocks.openclaw.agent.config");
    });
  });

  describe("given the complete event type set", () => {
    it("then there should be exactly 11 event types", () => {
      expect(Object.keys(EventTypes)).toHaveLength(11);
    });
  });
});

describe("AgentStatusValues", () => {
  describe("given all possible agent statuses", () => {
    it("then Starting should be 'starting'", () => {
      expect(AgentStatusValues.Starting).toBe("starting");
    });

    it("then Online should be 'online'", () => {
      expect(AgentStatusValues.Online).toBe("online");
    });

    it("then Busy should be 'busy'", () => {
      expect(AgentStatusValues.Busy).toBe("busy");
    });

    it("then Offline should be 'offline'", () => {
      expect(AgentStatusValues.Offline).toBe("offline");
    });

    it("then Error should be 'error'", () => {
      expect(AgentStatusValues.Error).toBe("error");
    });

    it("then there should be exactly 5 statuses", () => {
      expect(Object.keys(AgentStatusValues)).toHaveLength(5);
    });
  });
});

describe("TaskStatusValues", () => {
  describe("given all possible task statuses", () => {
    it("then Pending should be 'pending'", () => {
      expect(TaskStatusValues.Pending).toBe("pending");
    });

    it("then Running should be 'running'", () => {
      expect(TaskStatusValues.Running).toBe("running");
    });

    it("then Completed should be 'completed'", () => {
      expect(TaskStatusValues.Completed).toBe("completed");
    });

    it("then Failed should be 'failed'", () => {
      expect(TaskStatusValues.Failed).toBe("failed");
    });

    it("then Cancelled should be 'cancelled'", () => {
      expect(TaskStatusValues.Cancelled).toBe("cancelled");
    });

    it("then there should be exactly 5 statuses", () => {
      expect(Object.keys(TaskStatusValues)).toHaveLength(5);
    });
  });
});
