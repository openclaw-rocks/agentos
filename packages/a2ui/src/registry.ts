export interface ComponentMeta {
  type: string;
  displayName: string;
  description: string;
  canContainChildren: boolean;
  requiredFields: string[];
}

const components: ComponentMeta[] = [
  {
    type: "text",
    displayName: "Text",
    description: "Display text content",
    canContainChildren: false,
    requiredFields: ["content"],
  },
  {
    type: "button",
    displayName: "Button",
    description: "Interactive button that triggers an action",
    canContainChildren: false,
    requiredFields: ["label", "action"],
  },
  {
    type: "button_group",
    displayName: "Button Group",
    description: "Group of buttons displayed inline",
    canContainChildren: false,
    requiredFields: ["buttons"],
  },
  {
    type: "code",
    displayName: "Code Block",
    description: "Formatted code with optional syntax highlighting",
    canContainChildren: false,
    requiredFields: ["content"],
  },
  {
    type: "status",
    displayName: "Status Indicator",
    description: "Status dot with label and optional detail",
    canContainChildren: false,
    requiredFields: ["label", "value"],
  },
  {
    type: "progress",
    displayName: "Progress Bar",
    description: "Progress indicator with percentage",
    canContainChildren: false,
    requiredFields: ["value"],
  },
  {
    type: "table",
    displayName: "Table",
    description: "Data table with optional headers",
    canContainChildren: false,
    requiredFields: ["rows"],
  },
  {
    type: "card",
    displayName: "Card",
    description: "Container card with title and child components",
    canContainChildren: true,
    requiredFields: ["title", "children"],
  },
  {
    type: "input",
    displayName: "Input",
    description: "Form input field",
    canContainChildren: false,
    requiredFields: ["name", "label"],
  },
  {
    type: "form",
    displayName: "Form",
    description: "Form container with submit action",
    canContainChildren: true,
    requiredFields: ["action", "children"],
  },
  {
    type: "divider",
    displayName: "Divider",
    description: "Horizontal divider line",
    canContainChildren: false,
    requiredFields: [],
  },
  {
    type: "image",
    displayName: "Image",
    description: "Display an image",
    canContainChildren: false,
    requiredFields: ["url"],
  },
  {
    type: "log",
    displayName: "Log Output",
    description: "Terminal-style log output",
    canContainChildren: false,
    requiredFields: ["lines"],
  },
  {
    type: "diff",
    displayName: "Code Diff",
    description: "Code diff view with additions and deletions",
    canContainChildren: false,
    requiredFields: ["filename", "additions", "deletions", "hunks"],
  },
  // US-1.1: Expanded components
  {
    type: "metric",
    displayName: "Metric",
    description: "KPI-style metric with value and optional trend",
    canContainChildren: false,
    requiredFields: ["label", "value"],
  },
  {
    type: "chart",
    displayName: "Chart",
    description: "Data visualization chart (bar, line, or pie)",
    canContainChildren: false,
    requiredFields: ["chartType", "data"],
  },
  {
    type: "list",
    displayName: "List",
    description: "Ordered or unordered list with optional item actions",
    canContainChildren: false,
    requiredFields: ["items"],
  },
  {
    type: "tabs",
    displayName: "Tabs",
    description: "Tabbed sections with switchable content",
    canContainChildren: true,
    requiredFields: ["tabs"],
  },
  {
    type: "avatar",
    displayName: "Avatar",
    description: "User or agent avatar with image or initials",
    canContainChildren: false,
    requiredFields: ["name"],
  },
  {
    type: "badge",
    displayName: "Badge",
    description: "Small label badge with color",
    canContainChildren: false,
    requiredFields: ["label"],
  },
  {
    type: "timeline",
    displayName: "Timeline",
    description: "Ordered timeline of events",
    canContainChildren: false,
    requiredFields: ["events"],
  },
  {
    type: "media",
    displayName: "Media",
    description: "Rich media display (image or video with caption)",
    canContainChildren: false,
    requiredFields: ["mediaType", "url"],
  },
  {
    type: "map",
    displayName: "Map",
    description: "Static map embed with a pin",
    canContainChildren: false,
    requiredFields: ["latitude", "longitude"],
  },
  // US-1.2: Layout components
  {
    type: "grid",
    displayName: "Grid",
    description: "Grid layout with configurable columns",
    canContainChildren: true,
    requiredFields: ["columns", "children"],
  },
  {
    type: "stack",
    displayName: "Stack",
    description: "Vertical or horizontal stack layout",
    canContainChildren: true,
    requiredFields: ["direction", "children"],
  },
  {
    type: "split",
    displayName: "Split",
    description: "Two-pane split layout with configurable ratio",
    canContainChildren: true,
    requiredFields: ["left", "right"],
  },
];

class ComponentRegistry {
  private registry = new Map<string, ComponentMeta>();

  constructor() {
    for (const meta of components) {
      this.registry.set(meta.type, meta);
    }
  }

  get(type: string): ComponentMeta | undefined {
    return this.registry.get(type);
  }

  has(type: string): boolean {
    return this.registry.has(type);
  }

  all(): ComponentMeta[] {
    return Array.from(this.registry.values());
  }

  types(): string[] {
    return Array.from(this.registry.keys());
  }
}

export const componentRegistry = new ComponentRegistry();
