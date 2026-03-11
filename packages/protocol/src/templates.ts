import type { SpaceTemplate } from "./spaces.js";

export const builtInTemplates: SpaceTemplate[] = [
  {
    id: "general",
    name: "General",
    icon: "💬",
    description: "General-purpose workspace with a conversational assistant",
    layout_mode: "stream",
    default_agents: [
      {
        id: "assistant",
        role: "primary",
        capabilities: ["chat", "search", "summarize"],
        permissions: ["read", "write"],
      },
    ],
    suggested_channels: ["general", "random"],
  },
  {
    id: "health",
    name: "Health",
    icon: "🏥",
    description: "Track nutrition, fitness, sleep, and wellness",
    layout_mode: "canvas",
    default_agents: [
      {
        id: "health-assistant",
        role: "primary",
        capabilities: ["nutrition", "fitness", "health-tracking"],
        permissions: ["read", "write"],
      },
      {
        id: "vision",
        role: "specialist",
        capabilities: ["food-recognition", "image-analysis"],
        permissions: ["read"],
      },
    ],
    suggested_channels: ["nutrition", "fitness", "wellness"],
  },
  {
    id: "sales",
    name: "Sales",
    icon: "💰",
    description: "Pipeline management, lead tracking, and deal analysis",
    layout_mode: "canvas",
    default_agents: [
      {
        id: "sales-assistant",
        role: "primary",
        capabilities: ["crm", "pipeline", "forecasting"],
        permissions: ["read", "write"],
      },
      {
        id: "research",
        role: "specialist",
        capabilities: ["company-research", "lead-enrichment"],
        permissions: ["read"],
      },
    ],
    suggested_channels: ["pipeline", "leads", "deals"],
  },
  {
    id: "marketing",
    name: "Marketing",
    icon: "📣",
    description: "Campaign planning, content creation, and analytics",
    layout_mode: "stream",
    default_agents: [
      {
        id: "marketing-assistant",
        role: "primary",
        capabilities: ["content", "analytics", "campaigns"],
        permissions: ["read", "write"],
      },
    ],
    suggested_channels: ["campaigns", "content", "analytics"],
  },
  {
    id: "finance",
    name: "Finance",
    icon: "📊",
    description: "Budgeting, expense tracking, and financial analysis",
    layout_mode: "canvas",
    default_agents: [
      {
        id: "finance-assistant",
        role: "primary",
        capabilities: ["budgeting", "expenses", "analysis"],
        permissions: ["read", "write"],
      },
    ],
    suggested_channels: ["budget", "expenses", "reports"],
  },
  {
    id: "project",
    name: "Project",
    icon: "📋",
    description: "Task management, sprint planning, and team coordination",
    layout_mode: "stream",
    default_agents: [
      {
        id: "project-assistant",
        role: "primary",
        capabilities: ["tasks", "sprints", "planning"],
        permissions: ["read", "write"],
      },
    ],
    suggested_channels: ["tasks", "standup", "retrospective"],
  },
  {
    id: "custom",
    name: "Custom",
    icon: "⚙️",
    description: "Start from scratch and configure your own agents",
    layout_mode: "stream",
    default_agents: [],
    suggested_channels: ["general"],
  },
];
