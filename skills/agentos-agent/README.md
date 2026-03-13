# agentos-agent skill

An [OpenClaw](https://openclaw.ai) skill that connects any OpenClaw agent to AgentOS on the Matrix protocol. This is the **only thing you need** to make an OpenClaw instance a first-class AgentOS agent — no custom SDK, no Node.js wrapper, no boilerplate.

## How It Works

```
OpenClaw Instance
├── SOUL.md            ← Agent personality & behavior
├── HEARTBEAT.md       ← Proactive check schedule
├── MEMORY.md          ← Persistent memory
└── skills/
    └── agentos-agent/
        ├── SKILL.md   ← Teaches the agent the AgentOS protocol
        └── tools/
            └── oc-agentos  ← CLI for sending Matrix events
```

When OpenClaw loads the `agentos-agent` skill, the agent learns:
1. **The AgentOS protocol** — custom Matrix event types (`rocks.openclaw.agent.*`)
2. **A2UI** — how to render rich, interactive UI components (26 types)
3. **The `oc-agentos` CLI** — a tool for sending events to Matrix rooms

The agent uses its existing Matrix channel connection to receive messages and the `oc-agentos` CLI to send structured responses (A2UI, status updates, tool call logs, task events).

## Setup

### 1. Create a Matrix account for your agent

Register a user on your Matrix homeserver:

```bash
# Via the Matrix Client-Server API
curl -s http://localhost:8008/_matrix/client/v3/register \
  -H "Content-Type: application/json" \
  -d '{"username": "my-agent", "password": "secret", "auth": {"type": "m.login.dummy"}}'
```

Or use your homeserver's admin API. The agent needs a `user_id` and `access_token`.

### 2. Set environment variables

```bash
# Required
export OC_AGENTOS_HOMESERVER="http://localhost:8008"
export OC_AGENTOS_USER_ID="@my-agent:localhost"
export OC_AGENTOS_ACCESS_TOKEN="syt_..."

# Optional (have sensible defaults)
export OC_AGENTOS_AGENT_ID="my-agent"              # defaults to USER_ID
export OC_AGENTOS_AGENT_NAME="My Agent"             # defaults to "Agent"
export OC_AGENTOS_CAPABILITIES="chat,code,tools"    # defaults to "chat,tools"
```

### 3. Install the skill

Copy or symlink this directory into your OpenClaw skills:

```bash
# Instance-level (for a specific agent)
cp -r skills/agentos-agent /path/to/your-openclaw/skills/

# Or user-level (shared across all agents)
cp -r skills/agentos-agent ~/.openclaw/skills/
```

### 4. Configure OpenClaw's Matrix channel

In your `openclaw.json`, enable the Matrix channel adapter:

```json
{
  "channels": {
    "matrix": {
      "enabled": true,
      "homeserver": "http://localhost:8008",
      "userId": "@my-agent:localhost",
      "accessToken": "syt_..."
    }
  }
}
```

### 5. Give the agent a personality (SOUL.md)

```markdown
You are My Agent. You help users with [specific tasks].

When presenting structured data, always use A2UI components:
- Use `card` for grouped information
- Use `status` for health checks
- Use `table` for data
- Use `button_group` for user choices

Register yourself in every room you join. Set your status to
`busy` when processing and `online` when idle.
```

### 6. Start OpenClaw

```bash
openclaw start
```

## The `oc-agentos` CLI Tool

The skill provides a Node.js CLI script at `tools/oc-agentos` that calls the Matrix Client-Server API directly. The agent invokes it as a tool during its reasoning loop.

### Commands

| Command | Purpose |
|---------|---------|
| `register <room_id>` | Register the agent in a room (sends `rocks.openclaw.agent.register` state event + sets initial `online` status) |
| `status <room_id> <status>` | Update agent status: `starting`, `online`, `busy`, `offline`, `error` |
| `ui <room_id> '<json>'` | Send rich A2UI components to the room |
| `tool-call <room_id> <call_id> <tool_name> '<args_json>'` | Log a tool invocation |
| `tool-result <room_id> <call_id> <tool_name> '<result_json>' <duration_ms> [error]` | Log a tool result |
| `task <room_id> <task_id> <title> <status> [assigned_to]` | Create or update a task |

### Examples

```bash
# Register in a room
oc-agentos register '!abc123:localhost'

# Set status to busy
oc-agentos status '!abc123:localhost' busy

# Send a status dashboard
oc-agentos ui '!abc123:localhost' '[
  {"type": "card", "title": "Cluster Health", "children": [
    {"type": "status", "label": "API Server", "value": "success", "detail": "Healthy"},
    {"type": "status", "label": "etcd", "value": "success", "detail": "3/3 members"},
    {"type": "status", "label": "Ingress", "value": "warning", "detail": "High latency"},
    {"type": "divider"},
    {"type": "metric", "label": "CPU", "value": "42%", "trend": "up", "change": "+5%"},
    {"type": "metric", "label": "Memory", "value": "67%", "trend": "stable"}
  ]}
]'

# Log a tool call
oc-agentos tool-call '!abc123:localhost' 'call-1' 'kubectl' '{"command": "get pods -n production"}'

# Log the result
oc-agentos tool-result '!abc123:localhost' 'call-1' 'kubectl' '{"pods": 12, "ready": 12}' 450
```

## A2UI Component Reference

AgentOS renders 26 component types. Agents send them as JSON arrays via `oc-agentos ui`.

### Content Components

| Type | Key Fields | Example |
|------|-----------|---------|
| `text` | `content`, `variant` (body/heading/caption/code) | `{"type": "text", "content": "Hello", "variant": "heading"}` |
| `code` | `code`, `language` | `{"type": "code", "code": "console.log('hi')", "language": "javascript"}` |
| `diff` | `hunks` (array of additions/deletions) | See protocol types |
| `log` | `entries` (array of `{timestamp, level, message}`) | See protocol types |
| `image` | `url`, `alt`, `width`, `height` | `{"type": "image", "url": "https://...", "alt": "Screenshot"}` |
| `media` | `url`, `media_type`, `caption` | `{"type": "media", "url": "https://...", "media_type": "video"}` |
| `map` | `latitude`, `longitude`, `zoom`, `label` | `{"type": "map", "latitude": 37.7749, "longitude": -122.4194}` |

### Interactive Components

| Type | Key Fields | Example |
|------|-----------|---------|
| `button` | `label`, `action`, `style` (primary/secondary/danger) | `{"type": "button", "label": "Deploy", "action": "deploy", "style": "primary"}` |
| `button_group` | `buttons` (array of button objects) | See examples above |
| `input` | `name`, `label`, `input_type` (text/select/textarea), `options` | `{"type": "input", "name": "env", "label": "Environment", "input_type": "select", "options": ["staging", "prod"]}` |
| `form` | `action`, `children` (inputs + submit button) | See SKILL.md examples |

### Data Components

| Type | Key Fields | Example |
|------|-----------|---------|
| `status` | `label`, `value` (success/warning/error/info/pending), `detail` | `{"type": "status", "label": "Build", "value": "success", "detail": "Passed"}` |
| `progress` | `label`, `value` (0-100), `status` | `{"type": "progress", "label": "Deploy", "value": 75, "status": "Rolling out..."}` |
| `metric` | `label`, `value`, `trend` (up/down/stable), `change` | `{"type": "metric", "label": "Latency", "value": "42ms", "trend": "down", "change": "-8%"}` |
| `table` | `headers`, `rows` | `{"type": "table", "headers": ["Name", "Status"], "rows": [["api", "Running"]]}` |
| `chart` | `chart_type`, `data`, `labels` | See protocol types |
| `list` | `items`, `ordered` | `{"type": "list", "items": [{"text": "Item 1"}], "ordered": false}` |
| `badge` | `label`, `color` | `{"type": "badge", "label": "v2.3.1", "color": "blue"}` |
| `timeline` | `events` (array of `{title, description, timestamp}`) | See protocol types |
| `avatar` | `name`, `url`, `size` | `{"type": "avatar", "name": "Agent", "size": "md"}` |

### Layout Components

| Type | Key Fields | Example |
|------|-----------|---------|
| `card` | `title`, `subtitle`, `children` | See examples above |
| `tabs` | `tabs` (array of `{label, children}`) | See protocol types |
| `grid` | `columns`, `children` | `{"type": "grid", "columns": 2, "children": [...]}` |
| `stack` | `direction` (horizontal/vertical), `children` | `{"type": "stack", "direction": "horizontal", "children": [...]}` |
| `split` | `ratio`, `children` | `{"type": "split", "ratio": "1:2", "children": [...]}` |
| `divider` | — | `{"type": "divider"}` |

## Custom Matrix Event Types

The skill teaches agents to use these event types:

| Event Type | Kind | Purpose |
|---|---|---|
| `rocks.openclaw.agent.register` | State (key=agent_id) | Agent registration — capabilities, display name |
| `rocks.openclaw.agent.status` | State (key=agent_id) | Agent status — online, busy, offline, error |
| `rocks.openclaw.agent.ui` | Timeline | Rich A2UI component rendering |
| `rocks.openclaw.agent.action` | Timeline | User interaction with A2UI (button clicks, form submits) |
| `rocks.openclaw.agent.task` | Timeline | Task creation, assignment, completion |
| `rocks.openclaw.agent.tool_call` | Timeline | Tool invocation log |
| `rocks.openclaw.agent.tool_result` | Timeline | Tool result log |
| `rocks.openclaw.agent.config` | State | Per-room agent configuration |
| `rocks.openclaw.agent.memory` | State | Agent key-value memory |

**State events** persist as Matrix room state — they survive restarts and are available to any client that joins the room. Use them for registration, status, and configuration.

**Timeline events** are messages in the room timeline — they appear in chronological order. Use them for A2UI, tool call logs, and task updates.

## Behavioral Guidelines (from the skill)

The skill instructs agents to:

1. **Register** when joining a new room (`oc-agentos register`)
2. **Set status to busy** when processing, back to **online** when done
3. **Use A2UI for structured output** — status dashboards, tables, forms, interactive choices
4. **Log tool calls** so humans can see what the agent is doing
5. **Respond to actions** — when users click buttons or submit forms
6. **Be a good citizen** — concise, helpful, proactive, use threads for long conversations

## Manual Testing

Test the `oc-agentos` tool directly (requires the env vars to be set):

```bash
# Register in a room
./tools/oc-agentos register '!roomid:localhost'

# Set status
./tools/oc-agentos status '!roomid:localhost' online

# Send a UI card
./tools/oc-agentos ui '!roomid:localhost' '[
  {"type": "card", "title": "Hello", "children": [
    {"type": "text", "content": "Agent connected successfully!"},
    {"type": "status", "label": "Connection", "value": "success", "detail": "Matrix sync active"}
  ]}
]'
```

## Architecture: Why Skills, Not an SDK

AgentOS previously had a custom `@openclaw/agent-sdk` with `BaseAgent`, `UIBuilder`, and `AgentContext` classes. This was replaced with the skill-based approach because:

1. **OpenClaw already handles agent lifecycle** — connection, reconnection, heartbeat, memory, tool execution. Rebuilding this in a custom SDK is redundant.
2. **Skills are the OpenClaw-native extension mechanism** — they teach agents new capabilities through natural language instructions and tools, fitting perfectly with the LLM-driven architecture.
3. **The `oc-agentos` CLI is simpler than an SDK** — it's a single Node.js script that calls Matrix HTTP APIs directly. No build step, no dependencies, no TypeScript compilation.
4. **SOUL.md + HEARTBEAT.md are more flexible than code** — agent personality, behavior, and proactive schedules are defined in markdown, not hardcoded in TypeScript classes.

The skill approach means any OpenClaw instance can become an AgentOS agent by simply adding this skill directory and setting the environment variables.
