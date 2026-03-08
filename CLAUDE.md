# OpenClaw Workspace

Agent-first workspace built on the Matrix protocol.

## Architecture

- `apps/web` — React web client (Vite + TypeScript + Tailwind)
- `apps/agent-service` — Matrix Application Service for agent orchestration
- `packages/matrix-events` — Shared custom Matrix event type definitions
- `packages/agent-sdk` — SDK for building workspace agents
- `packages/ui-components` — Shared UI components for agent A2UI rendering
- `agents/echo` — Example echo agent
- `agents/assistant` — Claude-powered assistant agent

## Tech Stack

- pnpm workspaces + Turborepo
- TypeScript throughout
- matrix-js-sdk for Matrix protocol
- React + Vite + Tailwind for web client
- Node.js for agent service and agents

## Custom Matrix Events

All custom events use the `rocks.openclaw.agent.*` namespace:
- `rocks.openclaw.agent.ui` — Rich UI components (A2UI)
- `rocks.openclaw.agent.status` — Agent status updates
- `rocks.openclaw.agent.task` — Task assignment/completion
- `rocks.openclaw.agent.tool_call` — Tool invocations
- `rocks.openclaw.agent.tool_result` — Tool results

## Commands

- `pnpm dev` — Start all apps in dev mode
- `pnpm build` — Build all packages and apps
- `pnpm lint` — Lint all packages
- `pnpm typecheck` — Type check all packages
