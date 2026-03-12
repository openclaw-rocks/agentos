# agentos-agent skill

Connects an [OpenClaw](https://openclaw.ai) agent to AgentOS on Matrix.

## What it does

- Teaches the agent the AgentOS protocol (`rocks.openclaw.agent.*` events)
- Provides the `oc-agentos` CLI tool for sending custom Matrix events
- Enables rich A2UI rendering, tool call logging, status updates, and task delegation

## Setup

### 1. Create a Matrix account for your agent

Register a user on your Matrix homeserver (e.g. `@assistant:openclaw.rocks`).

### 2. Set environment variables

```bash
export OC_AGENTOS_HOMESERVER="https://matrix.openclaw.rocks"
export OC_AGENTOS_USER_ID="@assistant:openclaw.rocks"
export OC_AGENTOS_ACCESS_TOKEN="syt_..."
export OC_AGENTOS_AGENT_NAME="Assistant"
export OC_AGENTOS_CAPABILITIES="chat,code,tools,search"
```

### 3. Install the skill

Copy or symlink this directory into your OpenClaw skills:

```bash
# Instance-level (for a specific AgentOS instance)
cp -r skills/agentos-agent /path/to/openclaw-agentos/skills/

# Or user-level (shared across all agents)
cp -r skills/agentos-agent ~/.openclaw/skills/
```

### 4. Configure OpenClaw's Matrix channel

In your `openclaw.json`, configure the Matrix channel adapter to connect to the same homeserver:

```json
{
  "channels": {
    "matrix": {
      "enabled": true,
      "homeserver": "https://matrix.openclaw.rocks",
      "userId": "@assistant:openclaw.rocks",
      "accessToken": "syt_..."
    }
  }
}
```

### 5. Start OpenClaw

```bash
openclaw start
```

The agent will connect to Matrix, and the agentos-agent skill will teach it to register itself in rooms, set its status, and use A2UI for rich output.

## Manual testing

You can test the `oc-agentos` tool directly:

```bash
# Register in a room
./tools/oc-agentos register '!roomid:openclaw.rocks'

# Set status
./tools/oc-agentos status '!roomid:openclaw.rocks' online

# Send a UI card
./tools/oc-agentos ui '!roomid:openclaw.rocks' '[{"type":"card","title":"Hello","children":[{"type":"text","content":"Agent connected!"}]}]'
```
