import { describe, it, expect } from "vitest";
import {
  EventTypes,
  SPACE_NAMESPACE,
  builtInTemplates,
  type SpaceAgentEntry,
  type SpaceConfigEventContent,
  type SpaceAgentsEventContent,
  type AgentMemoryEventContent,
} from "./index.js";

describe("Space Event Types", () => {
  describe("given the space namespace", () => {
    it("then it should be rocks.openclaw.space", () => {
      expect(SPACE_NAMESPACE).toBe("rocks.openclaw.space");
    });
  });

  describe("given the space event type constants", () => {
    it("then SpaceConfig should map to rocks.openclaw.space.config", () => {
      expect(EventTypes.SpaceConfig).toBe("rocks.openclaw.space.config");
    });

    it("then SpaceAgents should map to rocks.openclaw.space.agents", () => {
      expect(EventTypes.SpaceAgents).toBe("rocks.openclaw.space.agents");
    });

    it("then AgentMemory should map to rocks.openclaw.agent.memory", () => {
      expect(EventTypes.AgentMemory).toBe("rocks.openclaw.agent.memory");
    });

    it("then there should be exactly 11 event types", () => {
      expect(Object.keys(EventTypes)).toHaveLength(11);
    });
  });
});

describe("SpaceConfigEventContent", () => {
  describe("given a valid space config object", () => {
    it("then it should satisfy the interface shape", () => {
      const config: SpaceConfigEventContent = {
        template_id: "health",
        template_name: "Health",
        icon: "🏥",
        description: "Track nutrition and fitness",
        layout_mode: "canvas",
      };
      expect(config.template_id).toBe("health");
      expect(config.layout_mode).toBe("canvas");
    });
  });

  describe("given all valid layout modes", () => {
    it("then stream, canvas, and focus should all be valid", () => {
      const modes: SpaceConfigEventContent["layout_mode"][] = ["stream", "canvas", "focus"];
      expect(modes).toHaveLength(3);
    });
  });
});

describe("SpaceAgentsEventContent", () => {
  describe("given a roster with multiple agents", () => {
    it("then each agent should have id, role, capabilities, permissions, and active flag", () => {
      const roster: SpaceAgentsEventContent = {
        agents: [
          {
            id: "assistant",
            role: "primary",
            capabilities: ["chat"],
            permissions: ["read", "write"],
            active: true,
          },
          {
            id: "vision",
            role: "specialist",
            capabilities: ["image-analysis"],
            permissions: ["read"],
            active: false,
          },
        ],
      };
      expect(roster.agents).toHaveLength(2);
      expect(roster.agents[0].role).toBe("primary");
      expect(roster.agents[1].active).toBe(false);
    });
  });

  describe("given all valid agent roles", () => {
    it("then primary, specialist, and background should all be valid", () => {
      const roles: SpaceAgentEntry["role"][] = ["primary", "specialist", "background"];
      expect(roles).toHaveLength(3);
    });
  });
});

describe("AgentMemoryEventContent", () => {
  describe("given agent memory state", () => {
    it("then it should contain agent_id, entries, updated_at, and size_bytes", () => {
      const memory: AgentMemoryEventContent = {
        agent_id: "health-assistant",
        entries: { diet: "vegetarian", goal: "lose weight" },
        updated_at: "2026-03-10T12:00:00Z",
        size_bytes: 42,
      };
      expect(memory.agent_id).toBe("health-assistant");
      expect(memory.entries.diet).toBe("vegetarian");
      expect(memory.size_bytes).toBe(42);
    });
  });
});

describe("builtInTemplates", () => {
  describe("given the built-in template set", () => {
    it("then there should be 7 templates", () => {
      expect(builtInTemplates).toHaveLength(7);
    });

    it("then each template should have required fields", () => {
      for (const template of builtInTemplates) {
        expect(template.id).toBeTruthy();
        expect(template.name).toBeTruthy();
        expect(template.icon).toBeTruthy();
        expect(template.description).toBeTruthy();
        expect(["stream", "canvas", "focus"]).toContain(template.layout_mode);
        expect(Array.isArray(template.default_agents)).toBe(true);
      }
    });

    it("then it should include all expected template IDs", () => {
      const ids = builtInTemplates.map((t) => t.id);
      expect(ids).toEqual([
        "general",
        "health",
        "sales",
        "marketing",
        "finance",
        "project",
        "custom",
      ]);
    });
  });

  describe("given the General template", () => {
    it("then it should have a primary assistant agent", () => {
      const general = builtInTemplates.find((t) => t.id === "general");
      expect(general).toBeDefined();
      expect(general!.default_agents).toHaveLength(1);
      expect(general!.default_agents[0].role).toBe("primary");
    });

    it("then it should suggest general and random channels", () => {
      const general = builtInTemplates.find((t) => t.id === "general");
      expect(general!.suggested_channels).toEqual(["general", "random"]);
    });
  });

  describe("given the Health template", () => {
    it("then it should have a primary and a specialist agent", () => {
      const health = builtInTemplates.find((t) => t.id === "health");
      expect(health).toBeDefined();
      expect(health!.default_agents).toHaveLength(2);
      expect(health!.default_agents[0].role).toBe("primary");
      expect(health!.default_agents[1].role).toBe("specialist");
    });

    it("then it should use canvas layout mode", () => {
      const health = builtInTemplates.find((t) => t.id === "health");
      expect(health!.layout_mode).toBe("canvas");
    });
  });

  describe("given the Custom template", () => {
    it("then it should have no default agents", () => {
      const custom = builtInTemplates.find((t) => t.id === "custom");
      expect(custom).toBeDefined();
      expect(custom!.default_agents).toHaveLength(0);
    });
  });

  describe("given each template's default_agents", () => {
    it("then each agent entry should have valid role values", () => {
      const validRoles = ["primary", "specialist", "background"];
      for (const template of builtInTemplates) {
        for (const agent of template.default_agents) {
          expect(validRoles).toContain(agent.role);
        }
      }
    });
  });
});
