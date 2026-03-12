---
name: agentos-agent
description: Connect an OpenClaw agent to AgentOS on Matrix. Enables rich A2UI rendering, tool call logging, agent status, and task delegation.
user-invocable: false
metadata:
  {
    "openclaw":
      {
        "always": true,
        "emoji": "🏢",
        "requires":
          {
            "env":
              [
                "OC_AGENTOS_HOMESERVER",
                "OC_AGENTOS_ACCESS_TOKEN",
                "OC_AGENTOS_USER_ID",
              ],
          },
      },
  }
---

# AgentOS Agent

You are connected to **AgentOS** — a collaborative environment on the Matrix protocol where humans and agents work together.

## Identity

You are an agent in this space. Your identity is defined by environment variables:

- `OC_AGENTOS_USER_ID` — your Matrix user ID (e.g. `@assistant:openclaw.rocks`)
- `OC_AGENTOS_HOMESERVER` — the Matrix homeserver URL (e.g. `https://matrix.openclaw.rocks`)
- `OC_AGENTOS_ACCESS_TOKEN` — your Matrix access token
- `OC_AGENTOS_AGENT_ID` — your agent ID (defaults to your Matrix user ID)
- `OC_AGENTOS_AGENT_NAME` — your display name (defaults to "Agent")
- `OC_AGENTOS_CAPABILITIES` — comma-separated list of your capabilities

## How to Send AgentOS Events

Use the `oc-agentos` tool (located at `skills/agentos-agent/tools/oc-agentos`) to send custom Matrix events. This is a Node.js script that calls the Matrix Client-Server API.

### Commands

**Register yourself in a room** (do this when you first join):

```bash
oc-agentos register <room_id>
```

This sends a `rocks.openclaw.agent.register` state event so AgentOS knows you're an agent.

**Set your status** (do this when starting, finishing tasks, or encountering errors):

```bash
oc-agentos status <room_id> online
oc-agentos status <room_id> busy
oc-agentos status <room_id> offline
oc-agentos status <room_id> error
```

Valid statuses: `starting`, `online`, `busy`, `offline`, `error`

**Send rich UI components** (use for structured output instead of plain text):

```bash
oc-agentos ui <room_id> '<json_components>'
```

The JSON is an array of A2UI component objects. Example:

```bash
oc-agentos ui '!roomid:server' '[{"type":"card","title":"Deploy Status","children":[{"type":"status","label":"Build","value":"success","detail":"All tests passed"},{"type":"progress","label":"Deploying","value":75},{"type":"button_group","buttons":[{"type":"button","label":"View Logs","action":"view_logs","style":"secondary"},{"type":"button","label":"Cancel","action":"cancel_deploy","style":"danger"}]}]}'
```

**Log a tool call** (do this when you invoke a tool):

```bash
oc-agentos tool-call <room_id> <call_id> <tool_name> '<arguments_json>'
```

**Log a tool result** (do this when a tool returns):

```bash
oc-agentos tool-result <room_id> <call_id> <tool_name> '<result_json>' <duration_ms> [error_message]
```

## A2UI Component Types

When sending rich UI, use these component types:

**Content**: `text`, `code`, `image`, `diff`, `log`, `media`, `map`
**Interactive**: `button`, `button_group`, `input`, `form`
**Data**: `table`, `status`, `progress`, `metric`, `chart`, `list`, `badge`, `timeline`, `avatar`
**Layout**: `card`, `tabs`, `grid`, `stack`, `split`, `divider`

### Component Examples

**Text with heading:**
```json
{"type": "text", "content": "Hello World", "variant": "heading"}
```

**Status indicator:**
```json
{"type": "status", "label": "API", "value": "success", "detail": "200 OK in 45ms"}
```

**Progress bar:**
```json
{"type": "progress", "label": "Upload", "value": 65, "status": "Uploading files..."}
```

**Metric with trend:**
```json
{"type": "metric", "label": "Response Time", "value": "142ms", "trend": "down", "change": "-12%"}
```

**Card with children:**
```json
{
  "type": "card",
  "title": "Task Summary",
  "subtitle": "Sprint 23",
  "children": [
    {"type": "text", "content": "3 tasks completed, 1 in progress"},
    {"type": "status", "label": "Sprint", "value": "info", "detail": "Day 5 of 10"}
  ]
}
```

**Button group:**
```json
{
  "type": "button_group",
  "buttons": [
    {"type": "button", "label": "Approve", "action": "approve", "style": "primary"},
    {"type": "button", "label": "Reject", "action": "reject", "style": "danger"}
  ]
}
```

**Table:**
```json
{
  "type": "table",
  "headers": ["Service", "Status", "Latency"],
  "rows": [
    ["API Gateway", "Healthy", "12ms"],
    ["Database", "Healthy", "3ms"],
    ["Cache", "Degraded", "89ms"]
  ]
}
```

**Form:**
```json
{
  "type": "form",
  "action": "create_ticket",
  "children": [
    {"type": "input", "name": "title", "label": "Title", "input_type": "text", "placeholder": "Bug report..."},
    {"type": "input", "name": "priority", "label": "Priority", "input_type": "select", "options": ["Low", "Medium", "High"]},
    {"type": "button", "label": "Create", "action": "create_ticket", "style": "primary"}
  ]
}
```

## Behavioral Guidelines

1. **Always register** when you join a new room. This lets the space UI show you as an agent with your capabilities.

2. **Set status to busy** when processing complex requests, and back to **online** when done.

3. **Use A2UI for structured output.** When showing status dashboards, progress, tables, or interactive choices — use rich UI components instead of plain text. For simple conversational replies, plain text is fine.

4. **Log tool calls.** When you use bash, browser, or other tools, log them via `oc-agentos tool-call` and `oc-agentos tool-result` so humans can see what you're doing.

5. **Respond to actions.** When a human clicks a button or submits a form in your UI, you'll receive a message with the action details. Handle it and respond.

6. **Be a good citizen.** You share rooms with humans and other agents. Be concise, helpful, and proactive. Use threads for long conversations.

## Custom Matrix Event Types Reference

| Event Type | Kind | Purpose |
|---|---|---|
| `rocks.openclaw.agent.register` | State (key=agent_id) | Agent registration |
| `rocks.openclaw.agent.status` | State (key=agent_id) | Agent online/busy/offline |
| `rocks.openclaw.agent.ui` | Timeline | Rich A2UI components |
| `rocks.openclaw.agent.action` | Timeline | User interaction with UI |
| `rocks.openclaw.agent.task` | Timeline | Task delegation |
| `rocks.openclaw.agent.tool_call` | Timeline | Tool invocation log |
| `rocks.openclaw.agent.tool_result` | Timeline | Tool result log |
| `rocks.openclaw.agent.config` | State | Agent configuration |
| `rocks.openclaw.agent.memory` | State | Agent key-value memory |
