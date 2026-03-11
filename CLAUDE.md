# AgentOS

Agent-first operating system built on Matrix protocol, powered by OpenClaw.

## Architecture

- `apps/shell` — React web client / AgentOS shell (Vite + TypeScript + Tailwind)
- `apps/runtime` — Matrix Application Service for agent orchestration
- `packages/protocol` — Shared custom Matrix event type definitions
- `packages/agent-sdk` — SDK for building workspace agents
- `packages/a2ui` — A2UI component registry and validation
- `agents/echo` — Example echo agent
- `agents/assistant` — Claude-powered assistant agent

## Tech Stack

- pnpm workspaces + Turborepo
- TypeScript throughout (strict mode)
- matrix-js-sdk for Matrix protocol
- React + Vite + Tailwind for shell
- Vitest for testing
- Node.js for runtime and agents

## Custom Matrix Events

Agent events use `rocks.openclaw.agent.*`, space events use `rocks.openclaw.space.*`:
- `rocks.openclaw.agent.ui` — Rich UI components (A2UI, 26 component types)
- `rocks.openclaw.agent.action` — User interactions with A2UI (button clicks, form submits)
- `rocks.openclaw.agent.status` — Agent status updates
- `rocks.openclaw.agent.task` — Task assignment/completion
- `rocks.openclaw.agent.tool_call` — Tool invocations
- `rocks.openclaw.agent.tool_result` — Tool results
- `rocks.openclaw.agent.memory` — Per-agent per-space memory state
- `rocks.openclaw.space.config` — Space template and layout configuration
- `rocks.openclaw.space.agents` — Agent roster per space

## Commands

- `pnpm dev` — Start all apps in dev mode
- `pnpm build` — Build all packages and apps
- `pnpm test` — Run all tests
- `pnpm lint` — Lint all packages
- `pnpm typecheck` — Type check all packages

## Code Standards

- No `any` — use `unknown` and narrow
- Explicit return types on exported functions
- Named exports only (no default exports)
- kebab-case file names
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`
- Hexagonal architecture for core packages (ports/domain/adapters)
- Dependency direction: packages/ never import from apps/
