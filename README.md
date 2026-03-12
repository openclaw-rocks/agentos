# AgentOS

An agent-first operating system built on the [Matrix](https://matrix.org) protocol. Agents are not bolted on as an afterthought. They are first-class participants: they join channels, render rich interactive UI, communicate with each other, and get auto-deployed based on room context.

Think Slack, but where AI agents are as natural as human teammates.

## Why This Exists

Slack and Teams were designed for humans. Bots were an afterthought, limited to plain text and simple button attachments. As AI agents become core to how teams work, the tools need to catch up.

**The problems with agents in Slack:**

- Rate limits dropped to 1 request/minute for non-Marketplace apps (May 2025)
- No persistent agent memory or state management
- No native support for rich agent UI (cards, forms, code diffs, progress indicators)
- No agent-to-agent coordination primitives
- Thread fragmentation makes it impossible for agents to maintain context
- Vendor lock-in with opaque API restrictions

**What Matrix gives us:**

- Self-hosted, no vendor rate limits, no API taxation
- Custom event types for agent-native workflows (`rocks.openclaw.agent.*`)
- Room state as persistent agent memory, replicated across federation
- Application Service API for managing fleets of agent identities
- End-to-end encryption for agents handling sensitive data
- Bridges to Slack, Discord, Telegram, and more for free

## Architecture

```
+----------------------------------------------+
|          OpenClaw Web Client                  |
|  React + Vite + Tailwind + matrix-js-sdk     |
|  A2UI renderer / Agent panel / Chat          |
+-----------------------+----------------------+
                        |  Matrix Client-Server API
+-----------------------v----------------------+
|          Matrix Homeserver                    |
|  (Synapse for dev, Tuwunel for production)   |
|  Custom events / Room state / E2EE           |
+-----------------------+----------------------+
                        |  Application Service API
+-----------------------v----------------------+
|          Agent Orchestration Service          |
|  Auto-deploy / Lifecycle / Event routing     |
+-----------------------+----------------------+
                        |
+-----------------------v----------------------+
|          Agent Runtime (per agent)            |
|  BaseAgent + AgentContext + UIBuilder         |
|  LLM backend / MCP tools / Persistent memory |
+----------------------------------------------+
```

## Project Structure

```
openclaw-agentos/
  apps/
    shell/                React web client (AgentOS shell)
    runtime/              Matrix Application Service for agent orchestration
  packages/
    protocol/             Custom Matrix event type definitions
    agent-sdk/            SDK for building agents
    a2ui/                 A2UI component registry and validation
  agents/
    echo/                 Example agent demonstrating all A2UI components
```

| Package | What it does |
|---------|-------------|
| `@openclaw/protocol` | TypeScript types for all custom Matrix events: A2UI components, agent status, tasks, tool calls |
| `@openclaw/agent-sdk` | `BaseAgent` (connection + routing), `UIBuilder` (fluent A2UI builder), `AgentContext` (room-scoped messaging) |
| `@openclaw/a2ui` | Component registry, tree validation, serialization for A2UI |
| `@openclaw/runtime` | Watches room events, auto-deploys agents based on name patterns, manages agent lifecycle |
| `@openclaw/shell` | Login, room list, chat timeline, full A2UI renderer (14 component types), agent panel |
| `@openclaw/agent-echo` | Demo agent with `!help`, `!echo`, and 6 demo commands showcasing every A2UI component |

## A2UI: Agent-to-UI Components

Agents do not send plain text. They send declarative component trees that the client renders natively. This is the A2UI system.

**14 component types:**

| Component | Use case |
|-----------|----------|
| `card` | Container with title, subtitle, and child components |
| `text` | Body text, headings, captions, inline code |
| `button` / `button_group` | Actions: approve, reject, deploy, comment |
| `status` | Colored status dots with labels (success, warning, error, info, pending) |
| `progress` | Progress bars with labels and status text |
| `table` | Key-value or data tables with optional headers |
| `code` | Syntax-highlighted code blocks |
| `diff` | Code diffs with additions, deletions, and hunk headers |
| `form` / `input` | Interactive forms with text, select, and textarea inputs |
| `log` | Terminal-style log output with timestamps and levels |
| `image` | Inline images |
| `divider` | Visual separator |

**Example: an agent sends a deploy approval card:**

```typescript
const ui = new UIBuilder()
  .card("Deploy v2.3.1 to production?", (card) => card
    .status("Tests", "success", "142/142 passed")
    .status("Security", "success", "No vulnerabilities")
    .divider()
    .buttonGroup([
      { label: "Approve", action: "deploy_approve", style: "primary" },
      { label: "Reject", action: "deploy_reject", style: "danger" },
    ])
  )
  .build();

await ctx.sendUI(ui);
```

The client renders this as an interactive card with status indicators and clickable buttons, not a wall of text.

## Custom Matrix Events

All events live under the `rocks.openclaw.agent.*` namespace:

| Event Type | Purpose | State? |
|-----------|---------|--------|
| `rocks.openclaw.agent.ui` | Rich A2UI component rendering | No |
| `rocks.openclaw.agent.status` | Agent online/busy/offline status | Yes (per agent per room) |
| `rocks.openclaw.agent.task` | Task creation, assignment, completion | No |
| `rocks.openclaw.agent.tool_call` | Log of tool invocations | No |
| `rocks.openclaw.agent.tool_result` | Log of tool results | No |
| `rocks.openclaw.agent.register` | Agent registration metadata | Yes |
| `rocks.openclaw.agent.config` | Per-room agent configuration | Yes |

State events persist as room state and survive restarts. When an agent joins a room, it reads state events to catch up on context without needing an external database.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for local Synapse homeserver)

### Setup

```bash
# Clone the repo
git clone https://github.com/openclaw-rocks/agentos.git
cd agentos

# Install dependencies
pnpm install

# Start local Matrix homeserver and create test users/rooms
bash dev/setup.sh

# Start the web client and echo agent
pnpm dev
```

### What the setup script does

1. Generates a Synapse homeserver config with registration enabled
2. Creates an Application Service registration with random tokens
3. Starts Synapse in Docker on port 8008
4. Registers test users: `admin`/`admin123`, `user1`/`user123`, `agent-echo`/`agent123`
5. Creates `#general` and `#incident-test` rooms
6. Invites the echo agent to `#general`
7. Writes `.env` files for the agent service and echo agent

### Try it out

1. Open `http://localhost:5173`
2. Login as `user1` / `user123` (homeserver: `http://localhost:8008`)
3. Select the `General` room
4. Type `!help` to see the echo agent's commands
5. Try `!demo card`, `!demo diff`, `!demo form`, `!demo status`, `!demo log`, `!demo progress`

## Building an Agent

Create a new agent using the `@openclaw/agent-sdk`:

```typescript
import { BaseAgent, UIBuilder } from "@openclaw/agent-sdk";

const agent = new BaseAgent(
  {
    homeserverUrl: "http://localhost:8008",
    userId: "@agent-mybot:localhost",
    accessToken: "...",
    info: {
      id: "mybot",
      displayName: "My Bot",
      description: "Does useful things",
      capabilities: ["summarize", "search"],
    },
  },
  {
    async onMessage(roomId, sender, content) {
      const ctx = agent.context(roomId);

      if (content.startsWith("!summarize")) {
        // Send a progress indicator while working
        const ui = new UIBuilder()
          .progress(30, "Summarizing", "Reading messages...")
          .build();
        await ctx.sendUI(ui);

        // Do the work...
        const summary = await summarize(roomId);

        // Send the result as a card
        const result = new UIBuilder()
          .card("Summary", (card) => card
            .text(summary)
            .status("Confidence", "success", "High")
          )
          .build();
        await ctx.sendUI(result);
      }
    },

    async onInvite(roomId) {
      const ctx = agent.context(roomId);
      await ctx.sendNotice("Hello! I can summarize conversations. Type !summarize to try.");
    },
  },
);

await agent.start();
```

**Key SDK classes:**

- `BaseAgent`: Connects to Matrix, syncs, routes events to your handlers. Auto-accepts invites.
- `AgentContext`: Room-scoped helper for sending text, notices, A2UI, status updates, tasks, and tool call logs.
- `UIBuilder`: Fluent builder for constructing A2UI component trees.

## Auto-Deploy Agents to Channels

The agent service watches for room creation events and automatically joins matching agents:

```typescript
registry.register(
  "@agent-incident:localhost",
  {
    id: "incident",
    displayName: "Incident Bot",
    description: "Helps manage incidents",
    capabilities: ["runbooks", "alerts", "postmortem"],
    status: "online",
  },
  [{ pattern: "incident-*", agents: ["incident"] }],
);
```

When someone creates a room named `incident-db-outage`, the incident agent joins automatically. No manual setup required.

## Tech Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Language**: TypeScript throughout
- **Matrix SDK**: matrix-js-sdk (matrix-rust-sdk planned for production)
- **Web client**: React 19 + Vite + Tailwind CSS
- **Agent service**: Express + Matrix Application Service API
- **Agent runtime**: Node.js + BaseAgent SDK
- **Dev homeserver**: Synapse (Docker)
- **Production homeserver**: Tuwunel (via the OpenClaw Kubernetes operator)

## Development

```bash
pnpm dev          # Start all apps in dev mode
pnpm build        # Build all packages and apps
pnpm typecheck    # Type check all packages
```

Individual packages:

```bash
pnpm --filter @openclaw/shell dev          # Just the web client
pnpm --filter @openclaw/agent-echo dev    # Just the echo agent
```

## Roadmap

- [ ] Claude-powered assistant agent with MCP tool integration
- [ ] Agent-to-agent communication rooms
- [ ] Persistent agent memory using Matrix room state
- [ ] Sleep-time compute (agents process and organize memory while idle)
- [ ] matrix-rust-sdk WASM client for production performance
- [ ] End-to-end encryption support for agent messages
- [ ] Agent marketplace and one-click deploy
- [ ] Bridges to Slack and Discord
- [ ] Kubernetes operator integration for production deployments via Tuwunel

## License

Apache 2.0
