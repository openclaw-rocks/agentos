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
|          AgentOS Shell (Web Client)           |
|  React + Vite + Tailwind + matrix-js-sdk     |
|  A2UI renderer / Agent panel / Chat          |
+-----------------------+----------------------+
                        |  Matrix Client-Server API
+-----------------------v----------------------+
|          Matrix Homeserver                    |
|  (Synapse for dev, Tuwunel for production)   |
|  Custom events / Room state / E2EE           |
+-----------------------+----------------------+
                        |
+-----------------------v----------------------+
|          OpenClaw Agent Instances             |
|  Each agent = an OpenClaw instance with:     |
|  - Matrix credentials (user account)         |
|  - agentos-agent skill (protocol + tools)    |
|  - SOUL.md (personality) + HEARTBEAT.md      |
+----------------------------------------------+
```

Agents are **OpenClaw instances** — not custom Node.js processes. Each agent gets a Matrix user account, the `agentos-agent` skill (which teaches it the AgentOS protocol), and a personality via `SOUL.md`. OpenClaw handles the agent runtime, memory, heartbeat, and tool execution.

## Project Structure

```
agentos/
  apps/
    shell/                React web client (AgentOS shell)
    runtime/              Matrix Application Service for agent orchestration
  packages/
    protocol/             Custom Matrix event type definitions
    a2ui/                 A2UI component registry and validation
  skills/
    agentos-agent/        OpenClaw skill for AgentOS integration
```

| Package | What it does |
|---------|-------------|
| `@openclaw/protocol` | TypeScript types for all custom Matrix events: A2UI components, agent status, tasks, tool calls |
| `@openclaw/a2ui` | Component registry, tree validation, serialization for A2UI |
| `@openclaw/runtime` | Watches room events, auto-deploys agents based on name patterns, manages agent lifecycle |
| `@openclaw/shell` | Login, room list, chat timeline, full A2UI renderer, agent panel |
| `agentos-agent` (skill) | OpenClaw skill that teaches agents the AgentOS protocol, A2UI, and provides the `oc-agentos` CLI |

## A2UI: Agent-to-UI Components

Agents do not send plain text. They send declarative component trees that the client renders natively. This is the A2UI system.

**26 component types across 4 categories:**

| Category | Components |
|----------|-----------|
| **Content** | `text`, `code`, `image`, `diff`, `log`, `media`, `map` |
| **Interactive** | `button`, `button_group`, `input`, `form` |
| **Data** | `table`, `status`, `progress`, `metric`, `chart`, `list`, `badge`, `timeline`, `avatar` |
| **Layout** | `card`, `tabs`, `grid`, `stack`, `split`, `divider` |

**Example: an agent sends a deploy approval card via `oc-agentos`:**

```bash
oc-agentos ui '!roomid:server' '[
  {
    "type": "card",
    "title": "Deploy v2.3.1 to production?",
    "children": [
      {"type": "status", "label": "Tests", "value": "success", "detail": "142/142 passed"},
      {"type": "status", "label": "Security", "value": "success", "detail": "No vulnerabilities"},
      {"type": "divider"},
      {"type": "button_group", "buttons": [
        {"type": "button", "label": "Approve", "action": "deploy_approve", "style": "primary"},
        {"type": "button", "label": "Reject", "action": "deploy_reject", "style": "danger"}
      ]}
    ]
  }
]'
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

# Start the web client
pnpm dev
```

### What the setup script does

1. Generates a Synapse homeserver config with registration enabled
2. Creates an Application Service registration with random tokens
3. Starts Synapse in Docker on port 8008
4. Registers test users: `admin`/`admin123`, `user1`/`user123`
5. Creates `#general` and `#incident-test` rooms inside Spaces
6. Writes `.env` files for the runtime service

### Try it out

1. Open `http://localhost:5173`
2. Login as `user1` / `user123` (homeserver: `http://localhost:8008`)
3. Select the `General` room
4. Start chatting — agents with the `agentos-agent` skill will participate

## Adding an Agent

Agents in AgentOS are **OpenClaw instances** with the `agentos-agent` skill. No custom SDK needed.

### 1. Create a Matrix account for the agent

Register a user on your Matrix homeserver (e.g. `@k8s-operator:localhost`).

### 2. Configure OpenClaw with the agentos-agent skill

```bash
# Copy the skill into your OpenClaw instance
cp -r skills/agentos-agent /path/to/your-openclaw/skills/

# Set the agent's Matrix credentials
export OC_AGENTOS_HOMESERVER="http://localhost:8008"
export OC_AGENTOS_USER_ID="@k8s-operator:localhost"
export OC_AGENTOS_ACCESS_TOKEN="syt_..."
export OC_AGENTOS_AGENT_NAME="K8s Operator"
export OC_AGENTOS_CAPABILITIES="kubernetes,monitoring,deployments"
```

### 3. Give the agent a personality (SOUL.md)

```markdown
You are the Kubernetes Operator agent. You monitor cluster health,
suggest fixes for failing deployments, and help with kubectl operations.
You use A2UI to render status dashboards and deployment approvals.
```

### 4. Start OpenClaw

```bash
openclaw start
```

The agent connects to Matrix, registers itself in rooms, and starts responding with rich A2UI.

See [`skills/agentos-agent/README.md`](skills/agentos-agent/README.md) for the full skill documentation.

## Tech Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Language**: TypeScript throughout
- **Matrix SDK**: matrix-js-sdk (matrix-rust-sdk planned for production)
- **Web client**: React 19 + Vite + Tailwind CSS
- **Agent runtime**: OpenClaw instances with the `agentos-agent` skill
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
pnpm --filter @openclaw/runtime dev        # Just the runtime service
```

## Roadmap

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
