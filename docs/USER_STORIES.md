# AgentOS — User Stories & Implementation Plan

> An agent-first operating system built on Matrix protocol and powered by OpenClaw.
> A new way to interact with a computing device — naturally, adaptively, intelligently.

---

## Table of Contents

1. [Vision](#vision)
2. [Architectural Principles](#architectural-principles)
3. [System Architecture](#system-architecture)
4. [OpenClaw Integration Strategy](#openclaw-integration-strategy)
5. [Code Standards](#code-standards)
6. [Epics & User Stories](#epics--user-stories)
7. [Architectural Decision Records](#architectural-decision-records)

---

## Vision

AgentOS replaces the app-centric model of computing with **context spaces** — adaptive
environments where AI agents handle tasks, render rich UI, and learn from the user over
time. Whether you are tracking your health, managing a sales pipeline, or searching for an
apartment, the interaction model is the same: you enter a context space, agents understand
what you need, and the interface adapts.

Matrix provides the distributed, encrypted, federated substrate. OpenClaw provides the
agent runtime, skill ecosystem, and production deployment infrastructure. We build the
**shell** — the intelligent layer that connects users to agents through adaptive UI.

---

## Architectural Principles

### 1. Lean on the Platform

Matrix gives us: rooms, spaces, state events, E2EE, federation, sync, multi-device.
OpenClaw gives us: agent runtime, skill platform, 20+ channel integrations, k8s operator.
**Do not rebuild what the platform provides.** Extend, compose, integrate.

### 2. Events as the Universal Interface

Every interaction — user input, agent output, UI component, status update, tool call —
is a Matrix event. This gives us persistence, sync, offline support, and auditability
for free. No separate database for application state unless performance demands it.

### 3. Agents Are Processes, Not Plugins

Agents are independent, long-running processes with their own identity, state, and
capabilities. They communicate via Matrix events (IPC), can delegate to each other,
and are managed by the runtime. They are not callbacks or hooks — they are first-class
participants.

### 4. A2UI: Agent-Rendered, User-Controlled

Agents emit declarative UI components. The shell renders them. The user interacts.
Actions flow back to agents as events. The agent decides what UI to show based on
context — the shell never makes domain decisions.

### 5. Local-First, Cloud-Optional

User data lives on-device by default (Matrix sync + local storage). The semantic
index runs locally. Cloud features (federation, shared spaces, hosted agents)
are opt-in additions, not requirements.

### 6. Progressive Disclosure

Start simple. A new user sees a clean chat interface. As they use the system, agents
surface richer UI, proactive suggestions, and cross-space intelligence. Complexity
is earned, not imposed.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER SURFACES                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │ Desktop  │  │  Mobile  │  │  Watch/  │  │  Voice-Only   │   │
│  │  Shell   │  │  Shell   │  │  Widget  │  │    Mode       │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬────────┘   │
│       └──────────────┴─────────────┴───────────────┘            │
│                            │                                     │
│  ┌─────────────────────────┴────────────────────────────────┐   │
│  │                    A2UI ENGINE                             │   │
│  │  Component Registry · Layout Engine · Multi-Surface       │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                            │                                     │
│  ┌─────────────────────────┴────────────────────────────────┐   │
│  │                    INPUT LAYER                             │   │
│  │  Text · Voice · Camera · Files · Sensors · Gestures       │   │
│  └─────────────────────────┬────────────────────────────────┘   │
└────────────────────────────┼────────────────────────────────────┘
                             │
┌────────────────────────────┼────────────────────────────────────┐
│                    INTELLIGENCE LAYER                            │
│                            │                                     │
│  ┌─────────────────────────┴────────────────────────────────┐   │
│  │                  AGENT RUNTIME                             │   │
│  │  Intent Router · Agent Lifecycle · Permission Model       │   │
│  │  Agent Registry · Agent IPC · Resource Management         │   │
│  └──────┬──────────────────┬──────────────────┬─────────────┘   │
│         │                  │                  │                   │
│  ┌──────┴──────┐  ┌───────┴───────┐  ┌───────┴──────────────┐  │
│  │   Context   │  │    Agent      │  │   Personalization    │  │
│  │   Engine    │  │   Instances   │  │       Engine         │  │
│  │             │  │               │  │                      │  │
│  │  Semantic   │  │  System │     │  │  Implicit signals    │  │
│  │  Index      │  │  Space  │     │  │  Explicit prefs      │  │
│  │  Entity     │  │  Ephemeral    │  │  Adaptive behavior   │  │
│  │  Graph      │  │               │  │                      │  │
│  └─────────────┘  └───────────────┘  └──────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                OPENCLAW INTEGRATION                        │   │
│  │  Gateway API · Skills Platform · Channel Bridges          │   │
│  │  K8s Operator (production) · Self-Config CRD              │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────┼────────────────────────────────────┐
│                    PROTOCOL LAYER                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  MATRIX PROTOCOL                          │   │
│  │  Rooms · Spaces · State Events · E2EE · Federation       │   │
│  │  Sync · Custom Events (rocks.openclaw.agent.*)            │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## OpenClaw Integration Strategy

### What OpenClaw Provides (Do Not Reinvent)

| Capability | OpenClaw Component | How We Use It |
|---|---|---|
| Agent runtime & tool execution | OpenClaw Gateway + Pi Runtime | Agent instances use OpenClaw internally for LLM calls, tool streaming, multi-turn reasoning |
| Skill ecosystem | ClawHub + Skills Platform | Agents install domain skills (web search, code execution, APIs) via OpenClaw |
| Production deployment | K8s Operator (`OpenClawInstance` CRD) | One CR per agent → StatefulSet, RBAC, NetworkPolicy, PDB, monitoring |
| Agent self-modification | `OpenClawSelfConfig` CRD | Agents install new skills, patch their own config at runtime |
| Security hardening | Operator defaults | Non-root, seccomp, dropped caps, read-only FS, default-deny network |
| Observability | Operator + ServiceMonitor | Prometheus metrics, Grafana dashboards, structured logging |
| Browser automation | Chromium sidecar | Agents that need web access get headless browser via operator config |
| Local LLM fallback | Ollama sidecar | On-device inference for privacy-sensitive operations |
| Channel bridges | 20+ channel plugins | Bridge WhatsApp, Telegram, Slack messages into AgentOS |

### What We Build (Unique to AgentOS)

| Capability | Our Component | Why It's Ours |
|---|---|---|
| A2UI component system | `packages/a2ui` | Declarative agent UI — no equivalent in OpenClaw |
| Custom Matrix event protocol | `packages/protocol` | `rocks.openclaw.agent.*` namespace — our IPC fabric |
| Agent orchestration over Matrix | `apps/runtime` | Agent roster, intent routing, cross-space coordination |
| Context Engine | `packages/context-engine` | Semantic index, entity graph, cross-space queries |
| Multi-modal input processing | `packages/input-engine` | Camera → agent, voice → intent, sensor ingestion |
| The shell (web/mobile client) | `apps/shell` | Adaptive UI rendering, space navigation, multi-surface |
| Personalization engine | `packages/personalization` | Implicit learning, adaptive behavior, proactive agents |

### Integration Architecture

```
┌─────────────────────────────────────────────────────┐
│                  AGENT INSTANCE                       │
│                                                       │
│  ┌─────────────────────┐  ┌───────────────────────┐  │
│  │   Matrix Interface  │  │   OpenClaw Gateway    │  │
│  │   (@openclaw/       │  │   (ws://127.0.0.1:    │  │
│  │    agent-sdk)       │  │    18789)              │  │
│  │                     │  │                        │  │
│  │  Receives events    │  │  LLM calls            │  │
│  │  Sends A2UI         │  │  Tool execution       │  │
│  │  Status updates     │  │  Skill management     │  │
│  │  Cross-agent IPC    │  │  Session state        │  │
│  └─────────┬───────────┘  └───────────┬───────────┘  │
│            │      Agent Logic          │              │
│            │    ┌──────────┐          │              │
│            └────┤  Domain  ├──────────┘              │
│                 │  Handler │                          │
│                 └──────────┘                          │
│                                                       │
│  Deployed via: OpenClaw K8s Operator (production)     │
│                Docker Compose (development)            │
└─────────────────────────────────────────────────────┘
```

Each agent instance has two interfaces:
- **Matrix interface** (`@openclaw/agent-sdk`): for receiving user events, emitting A2UI,
  communicating with other agents, reading/writing state.
- **OpenClaw Gateway** (internal): for LLM reasoning, tool execution, skill access.
  This is internal to the agent container — the user and shell never talk to the Gateway
  directly.

---

## Code Standards

### TypeScript

- **Strict mode** everywhere (`strict: true` in tsconfig)
- **No `any`** — use `unknown` and narrow, or define proper types
- **Explicit return types** on exported functions and public methods
- **Interface-first design** — define contracts before implementations
- **Barrel exports** — each package exposes a clean `index.ts` public API
- **No default exports** — named exports only, for consistent imports

### Project Structure

- **Feature-based modules** — group by domain, not by technical layer
- **Dependency direction** — packages/ never import from apps/; apps/ import from packages/
- **Shared types in `packages/protocol`** — single source of truth for event types
- **No circular dependencies** — enforce via Turborepo build graph

### Testing

- **Unit tests** for pure logic (context engine, event parsing, validation)
- **Integration tests** for Matrix interactions (against local Synapse)
- **Component tests** for A2UI rendering (React Testing Library)
- **Contract tests** for agent SDK (ensure event schema compliance)
- **Test naming**: `describe("ClassName")` → `it("should [behavior] when [condition]")`

### Error Handling

- **Typed errors** — domain-specific error classes extending `Error`
- **Fail at boundaries** — validate at Matrix event ingestion, trust internal types
- **No silent swallowing** — catch blocks must log or rethrow
- **Graceful degradation** — agent failure shows status in UI, does not crash the shell

### Naming Conventions

- **Files**: `kebab-case.ts` (e.g., `agent-runtime.ts`, `context-engine.ts`)
- **Types/Interfaces**: `PascalCase` (e.g., `AgentRoster`, `ContextQuery`)
- **Functions/Variables**: `camelCase` (e.g., `resolveIntent`, `spaceConfig`)
- **Constants**: `SCREAMING_SNAKE_CASE` (e.g., `MAX_RETRY_COUNT`)
- **Event types**: `rocks.openclaw.agent.<domain>` namespace
- **Matrix state keys**: `rocks.openclaw.<domain>.<key>`

### Git

- **Conventional commits**: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- **One concern per commit** — atomic, reviewable changes
- **Branch naming**: `feat/<epic>/<short-description>`, `fix/<short-description>`

### Architecture

- **Hexagonal / Ports & Adapters** — core logic has no framework dependencies
  - **Port**: interface defining what the domain needs (e.g., `EventStore`, `AgentRegistry`)
  - **Adapter**: implementation against a specific technology (Matrix, SQLite, REST)
  - **Core**: pure domain logic, tested without infrastructure
- **Event-driven** — components communicate via events, not direct calls
- **CQRS where appropriate** — separate read models (context engine queries) from
  write models (event emission)

---

## Epics & User Stories

### Epic 0: Foundation & Code Quality

> Establish the project foundation with proper tooling, testing infrastructure,
> and architectural patterns before building features.

---

#### US-0.1: Project Restructure

**As a** developer,
**I want** the project structure to reflect the AgentOS architecture,
**so that** new code has a clear home and dependencies flow in one direction.

**Acceptance Criteria:**
- [ ] Rename `apps/web` → `apps/shell` in workspace config
- [ ] Rename `apps/agent-service` → `apps/runtime`
- [ ] Rename `packages/matrix-events` → `packages/protocol`
- [ ] Create `packages/context-engine` (empty scaffold with types)
- [ ] Create `packages/input-engine` (empty scaffold with types)
- [ ] Create `packages/personalization` (empty scaffold with types)
- [ ] Update all import paths and Turborepo config
- [ ] Update CLAUDE.md to reflect new structure
- [ ] All packages build and lint cleanly

---

#### US-0.2: Testing Infrastructure

**As a** developer,
**I want** a testing setup with clear patterns,
**so that** every new module ships with tests from day one.

**Acceptance Criteria:**
- [ ] Vitest configured for all packages (shared config via workspace)
- [ ] React Testing Library configured for `apps/shell`
- [ ] Test scripts added to Turborepo pipeline (`pnpm test`, `pnpm test:watch`)
- [ ] CI-ready: `pnpm test` runs all tests, exits non-zero on failure
- [ ] At least one example test per existing package demonstrating the pattern
- [ ] Coverage reporting configured (threshold: 80% for packages/, no threshold for apps/)

---

#### US-0.3: Linting & Formatting

**As a** developer,
**I want** consistent code style enforced automatically,
**so that** reviews focus on logic, not formatting.

**Acceptance Criteria:**
- [ ] ESLint with `@typescript-eslint` strict config
- [ ] Prettier for formatting (single config at root)
- [ ] `no-explicit-any` rule enforced
- [ ] `explicit-function-return-type` on exported functions
- [ ] Import ordering enforced (external → internal → relative)
- [ ] Pre-commit hook via Husky + lint-staged
- [ ] All existing code passes lint (fix violations)

---

#### US-0.4: Architectural Boundary Enforcement

**As a** developer,
**I want** dependency boundaries enforced between packages,
**so that** the architecture remains clean as the codebase grows.

**Acceptance Criteria:**
- [ ] `packages/protocol` has zero internal dependencies
- [ ] `packages/a2ui` depends only on `packages/protocol`
- [ ] `packages/agent-sdk` depends only on `packages/protocol`
- [ ] `packages/context-engine` depends only on `packages/protocol`
- [ ] No package imports from `apps/`
- [ ] Turborepo build graph reflects these constraints
- [ ] Document dependency graph in `docs/ARCHITECTURE.md`

---

### Epic 1: A2UI Component System

> Expand the agent UI system from 14 basic components to a rich, composable,
> theme-aware component library that makes agent output feel like native app UI.

---

#### US-1.1: A2UI Component Expansion

**As an** agent developer,
**I want** a richer set of UI components to emit,
**so that** agents can render domain-appropriate interfaces (dashboards, trackers, cards).

**Acceptance Criteria:**
- [ ] New components: `metric` (label + value + trend), `chart` (bar/line/pie via data),
  `list` (ordered/unordered with item actions), `tabs` (switchable sections),
  `avatar` (image/initials), `badge` (label + color), `timeline` (ordered events),
  `media` (image/video with caption), `map` (static map embed with pin)
- [ ] Each component has TypeScript type in `packages/protocol`
- [ ] Each component has validation in `packages/a2ui`
- [ ] Each component has a React renderer in `apps/shell`
- [ ] UIBuilder updated with fluent methods for each new component
- [ ] Storybook or equivalent for visual testing of all components

---

#### US-1.2: Composite Layouts

**As an** agent,
**I want** to emit layout-level components that arrange children spatially,
**so that** I can render dashboards and multi-section views, not just linear cards.

**Acceptance Criteria:**
- [ ] New layout components: `grid` (columns + children), `stack` (vertical/horizontal),
  `split` (left/right or top/bottom with ratio)
- [ ] Layouts are nestable (grid inside a card inside a stack)
- [ ] Responsive behavior: grid collapses on narrow viewport
- [ ] Agent can specify layout mode hint: `stream` (chat-like), `canvas` (spatial),
  `focus` (single component, full width)
- [ ] Layout mode persists as user preference per space

---

#### US-1.3: Interactive Components & Action Flow

**As a** user,
**I want** to interact with agent-rendered UI (tap buttons, submit forms, select items),
**so that** my input flows back to the agent naturally.

**Acceptance Criteria:**
- [ ] Button clicks emit `rocks.openclaw.agent.action` events with component ID + payload
- [ ] Form submissions emit action events with all field values
- [ ] List item selection emits action events
- [ ] Tab switches are local (no event) unless agent opts into notification
- [ ] Actions are delivered to the originating agent (routed by agent_id in the event)
- [ ] Agent SDK `onAction` handler receives typed action payloads
- [ ] Optimistic UI: button shows loading state until agent responds

---

#### US-1.4: A2UI Theming & Accessibility

**As a** user,
**I want** agent UI to respect my theme preferences and be accessible,
**so that** the experience is visually consistent and usable by everyone.

**Acceptance Criteria:**
- [ ] Design token system: colors, spacing, radii, typography defined as CSS custom properties
- [ ] Dark and light theme support (follows system preference, user-overridable)
- [ ] All interactive components have focus states and keyboard navigation
- [ ] ARIA roles and labels on all A2UI components
- [ ] Minimum contrast ratios meet WCAG 2.1 AA
- [ ] Agent-specified accent colors are constrained to accessible ranges

---

### Epic 2: Context Spaces

> Evolve channels from simple chat rooms into adaptive context spaces with
> configurable agent rosters, domain awareness, and rich state management.

---

#### US-2.1: Space Configuration & Templates

**As a** user,
**I want** to create context spaces from templates (Health, Sales, Finance, etc.),
**so that** I get a pre-configured environment with relevant agents and UI.

**Acceptance Criteria:**
- [ ] Space templates defined as JSON configs: name, icon, description, default agent roster,
  suggested A2UI layout mode, initial state
- [ ] Built-in templates: General, Health, Sales, Marketing, Finance, Project, Custom
- [ ] "Create Space" flow: pick template → name it → agents auto-configured
- [ ] Template config stored as Matrix state event (`rocks.openclaw.space.config`)
- [ ] Custom template: user picks agents from registry, no pre-configuration
- [ ] Templates are extensible (users/orgs can define their own)

---

#### US-2.2: Agent Roster per Space

**As a** user,
**I want** each space to have its own set of agents with defined roles,
**so that** the right agents handle my inputs in each context.

**Acceptance Criteria:**
- [ ] Agent roster stored as state event: `rocks.openclaw.space.agents`
  ```
  { agents: [{ id, role, capabilities, permissions, active }] }
  ```
- [ ] UI to view/manage roster: see active agents, add/remove, configure
- [ ] Agent role defines behavior: `primary` (handles general input),
  `specialist` (handles specific capabilities), `background` (proactive, no direct chat)
- [ ] Runtime routes messages to agents based on role and intent
- [ ] Multiple agents can coexist — runtime arbitrates who responds

---

#### US-2.3: Space Navigation & Switching

**As a** user,
**I want** fast, intuitive navigation between my spaces,
**so that** context-switching is effortless.

**Acceptance Criteria:**
- [ ] Space rail shows all spaces with icons and unread indicators
- [ ] Keyboard shortcut: `Cmd+K` opens quick-switch (fuzzy search over spaces)
- [ ] Recent spaces shown first in rail
- [ ] Each space remembers scroll position and last-viewed thread
- [ ] Swipe gestures on mobile for space switching
- [ ] Space rail collapses to icons on narrow viewport

---

#### US-2.4: Space State & Agent Memory

**As an** agent,
**I want** persistent, per-space state that I can read and write,
**so that** I remember user context across sessions (e.g., "she tracks macros").

**Acceptance Criteria:**
- [ ] Agent memory stored as state events: `rocks.openclaw.agent.memory.<agent_id>`
- [ ] Agent SDK provides `memory.get(key)`, `memory.set(key, value)`, `memory.list()`
- [ ] Memory is scoped: per-space (default) or global (opt-in with user permission)
- [ ] Memory is readable by user: "What do you know about me in this space?"
- [ ] Memory is deletable by user: "Forget everything about my diet"
- [ ] Memory size bounded per agent per space (e.g., 100KB state event limit)

---

### Epic 3: Agent Runtime Evolution

> Transform the agent service from a simple message relay into a proper
> orchestration runtime with intent routing, lifecycle management, and IPC.

---

#### US-3.1: Intent-Based Message Routing

**As a** user,
**I want** my message to reach the right agent based on what I'm asking,
**so that** I don't have to manually @-mention or switch agents.

**Acceptance Criteria:**
- [ ] Runtime analyzes incoming message against space's agent roster
- [ ] Routing strategies: keyword match (fast, rule-based), capability match
  (agent declares what it handles), LLM-based classification (fallback for ambiguous)
- [ ] Primary agent receives all unrouted messages
- [ ] User can override: `@nutrition log my lunch` forces routing to nutrition agent
- [ ] Routing decision is logged (debug-level) for transparency
- [ ] Latency budget: routing decision in <100ms for rule-based, <500ms for LLM

---

#### US-3.2: Agent Lifecycle Management

**As an** operator,
**I want** agents to be started, stopped, health-checked, and restarted automatically,
**so that** the system is reliable without manual intervention.

**Acceptance Criteria:**
- [ ] Agent states: `starting` → `online` → `busy` → `offline` → `error`
- [ ] Health check: agent must respond to a ping event within 10s or be marked unhealthy
- [ ] Auto-restart: unhealthy agents are restarted (with backoff: 5s, 15s, 60s, 300s)
- [ ] Status broadcast: state changes emitted as `rocks.openclaw.agent.status` events
- [ ] Shell shows agent status in space header and roster panel
- [ ] Dev mode: `pnpm dev` starts all agents locally with hot-reload via tsx

---

#### US-3.3: Agent-to-Agent Delegation (IPC)

**As an** agent,
**I want** to delegate subtasks to other agents and receive results,
**so that** I can compose capabilities (e.g., nutrition agent delegates to vision agent).

**Acceptance Criteria:**
- [ ] Delegation via `rocks.openclaw.agent.task` event: task_id, target_agent, input
- [ ] Target agent processes and responds via `rocks.openclaw.agent.tool_result`
- [ ] Agent SDK: `agent.delegate(targetAgentId, task)` returns `Promise<Result>`
- [ ] Timeout: delegation times out after configurable period (default 30s)
- [ ] Delegation is logged: shell can show "Nutrition Agent asked Vision Agent to identify food"
- [ ] Circular delegation detected and rejected

---

#### US-3.4: OpenClaw Gateway Integration

**As an** agent developer,
**I want** my agent to use the OpenClaw Gateway for LLM calls and tool execution,
**so that** I get streaming, skills, and session management without reinventing them.

**Acceptance Criteria:**
- [ ] Agent SDK provides `openclawClient` for Gateway WebSocket communication
- [ ] `agent.reason(prompt, tools?)` → streams LLM response via Gateway
- [ ] `agent.executeTool(name, args)` → executes via Gateway's tool runtime
- [ ] `agent.installSkill(skillId)` → installs skill from ClawHub
- [ ] Gateway connection is internal to agent container (not exposed to user)
- [ ] Fallback: if Gateway unavailable, agent can make direct LLM API calls
- [ ] Dev mode: local OpenClaw instance via Docker Compose

---

### Epic 4: Multi-Modal Input

> Enable users to interact with agents through text, voice, camera, and file
> uploads — making the experience feel like a natural assistant, not a chat app.

---

#### US-4.1: Camera Input Pipeline

**As a** user,
**I want** to take a photo in a space and have the agent process it,
**so that** I can log food, scan documents, capture receipts, etc.

**Acceptance Criteria:**
- [ ] Camera button in input bar (next to text input)
- [ ] Capture flow: tap → native camera (mobile) or file picker (desktop) → preview → send
- [ ] Photo uploaded as Matrix media (`m.image`)
- [ ] Agent receives image event with media URL
- [ ] Agent SDK: `event.getImageUrl()` returns accessible URL for vision model
- [ ] Agent processes image and responds with appropriate A2UI
  (e.g., food photo → nutrition card with macros)
- [ ] Loading state while agent processes image

---

#### US-4.2: Voice Input Pipeline

**As a** user,
**I want** to speak to the system and have agents respond,
**so that** I can interact hands-free (Siri-like experience).

**Acceptance Criteria:**
- [ ] Microphone button in input bar
- [ ] Push-to-talk (hold) and toggle (tap) modes
- [ ] Speech-to-text via Web Speech API (browser) or Whisper (self-hosted)
- [ ] Transcribed text sent as regular message with `voice_input: true` metadata
- [ ] Agent can opt into voice-specific handling (shorter responses, confirmation-oriented)
- [ ] Visual feedback: waveform animation while recording
- [ ] Voice response (optional): agent can mark response as TTS-eligible,
  shell speaks it via Web Speech Synthesis API

---

#### US-4.3: File & Document Input

**As a** user,
**I want** to drop files into a space and have agents process them,
**so that** I can analyze documents, import data, share media.

**Acceptance Criteria:**
- [ ] Drag-and-drop file upload in chat area
- [ ] File type detection: image, PDF, CSV, spreadsheet, code, plain text
- [ ] Files uploaded as Matrix media with appropriate `m.file` / `m.image` type
- [ ] Agent receives file event with media URL and MIME type
- [ ] Agent SDK: `event.getFileContent()` returns file content for processing
- [ ] Agent can respond with summary, extracted data, or follow-up questions
- [ ] File size limit: configurable, default 50MB

---

### Epic 5: Cross-Space Intelligence (Context Engine)

> Enable agents to access information across spaces — the "consider recent
> marketing interactions in my sales conversation" capability.

---

#### US-5.1: Semantic Index

**As a** system,
**I want** all events across all spaces indexed for semantic search,
**so that** agents can find relevant context regardless of where it was discussed.

**Acceptance Criteria:**
- [ ] Events indexed on ingestion: text messages, A2UI content (extracted text),
  agent responses, file descriptions
- [ ] Vector embeddings stored locally (SQLite + vector extension, or in-memory for MVP)
- [ ] Query API: `contextEngine.search(query, { spaces?, types?, timeRange?, limit? })`
- [ ] Results ranked by semantic relevance + recency
- [ ] Index is per-user (not shared across users)
- [ ] Index rebuilds from Matrix sync on new device
- [ ] Incremental updates: new events indexed within 1s of arrival

---

#### US-5.2: Entity Graph

**As an** agent,
**I want** to know that "Alex" mentioned in Sales is the same person in Marketing,
**so that** I can provide cross-space context about entities.

**Acceptance Criteria:**
- [ ] Entities extracted from events: people, companies, projects, products, dates
- [ ] Entity resolution: merge references to the same entity across spaces
- [ ] Entity storage: `rocks.openclaw.entity.<type>.<id>` state events
- [ ] Query API: `contextEngine.getEntity(type, name)` → entity with all references
- [ ] Agent SDK: `context.mentionEntity(type, name)` to create/link entities
- [ ] User can view entities: "Show me everything about Alex"

---

#### US-5.3: Cross-Space Context Injection

**As a** user,
**I want** to ask an agent in one space about something from another space,
**so that** I can connect information across domains naturally.

**Acceptance Criteria:**
- [ ] Agent can request cross-space context via Context Engine
- [ ] Permission model: agent must be granted `cross_space_read` in its roster config
- [ ] User consents to cross-space access per-agent (one-time prompt)
- [ ] Agent SDK: `context.query({ spaces: ["Marketing"], query: "Alex interactions" })`
  returns relevant events from Marketing space
- [ ] Results include source space and thread links for traceability
- [ ] Rate-limited: max 10 cross-space queries per agent per minute

---

### Epic 6: Personalization

> Enable the system to adapt to individual users — learning preferences
> implicitly, honoring explicit configuration, and driving proactive behavior.

---

#### US-6.1: User Preferences & Profile

**As a** user,
**I want** to set preferences that affect how agents and the shell behave,
**so that** the experience is tailored to me.

**Acceptance Criteria:**
- [ ] Preference storage: `rocks.openclaw.user.preferences` state event (global space)
- [ ] Preferences include: theme (dark/light/system), default layout mode, notification
  level, voice response enabled, proactive suggestions enabled
- [ ] Settings UI accessible from system rail
- [ ] Agents can read user preferences to adjust behavior
- [ ] Preferences sync across devices via Matrix state events

---

#### US-6.2: Implicit Signal Collection

**As a** system,
**I want** to observe user behavior patterns (anonymized, local-only),
**so that** personalization agents can adapt the experience over time.

**Acceptance Criteria:**
- [ ] Signals collected locally: space visit frequency, time-of-day patterns,
  component interaction rates, dismissed suggestions
- [ ] Signal storage: local-only (never sent to server), in-memory or local DB
- [ ] Signal API: `personalization.getSignals(userId)` returns aggregated patterns
- [ ] Retention: rolling 30-day window, aggregated (not raw events)
- [ ] User can view: "What patterns have you noticed?"
- [ ] User can reset: "Clear my usage patterns"
- [ ] Opt-out: user can disable implicit signal collection entirely

---

#### US-6.3: Proactive Agent Behavior

**As a** user,
**I want** agents to proactively surface relevant information or actions,
**so that** I don't have to remember to check things myself.

**Acceptance Criteria:**
- [ ] Proactive triggers: time-based (morning summary), pattern-based
  (you usually log lunch now), event-based (new deal added, follow up needed)
- [ ] Proactive messages rendered as dismissable A2UI cards, not intrusive alerts
- [ ] Frequency capping: max 3 proactive messages per space per day (configurable)
- [ ] User can snooze: "Don't remind me about this today"
- [ ] User can disable per agent: "Stop proactive messages from nutrition agent"
- [ ] Agent SDK: `agent.proactive(roomId, condition, component)` registers a trigger

---

### Epic 7: Shell UX

> Elevate the shell from a basic chat client to an adaptive interface that
> supports multiple view modes, responsive layouts, and polished interactions.

---

#### US-7.1: Adaptive View Modes

**As a** user,
**I want** different ways to view a space — chat-like, dashboard, or focused,
**so that** the interface fits the current task.

**Acceptance Criteria:**
- [ ] Three view modes per space:
  - **Stream**: sequential chat, current behavior (default)
  - **Canvas**: spatial layout, agents emit grid/dashboard components
  - **Focus**: single A2UI component fills the view (e.g., a form, a report)
- [ ] Toggle between modes via space header control
- [ ] Agents can suggest a mode: `ui.setLayoutHint("canvas")` in their A2UI events
- [ ] Mode preference persists per space
- [ ] Transition between modes is animated (smooth, not jarring)

---

#### US-7.2: Quick Switcher & Global Search

**As a** user,
**I want** to find anything across all spaces with a keyboard shortcut,
**so that** I can navigate and retrieve information instantly.

**Acceptance Criteria:**
- [ ] `Cmd+K` (Mac) / `Ctrl+K` (Win) opens quick switcher overlay
- [ ] Search across: space names, recent messages, entities, agent names
- [ ] Results grouped by type: Spaces, Messages, Entities, Agents
- [ ] Selecting a result navigates to the space/thread/message
- [ ] Recent searches shown on empty state
- [ ] Keyboard navigation: arrow keys to select, Enter to go, Esc to close
- [ ] Search backed by Context Engine semantic index

---

#### US-7.3: Responsive & Mobile Layout

**As a** user on mobile,
**I want** the shell to work well on small screens,
**so that** I can use AgentOS on my phone naturally.

**Acceptance Criteria:**
- [ ] Breakpoints: mobile (<640px), tablet (640-1024px), desktop (>1024px)
- [ ] Mobile: single-panel view — space list OR chat, not both
- [ ] Mobile: swipe left/right between space list and active space
- [ ] Mobile: bottom navigation bar (spaces, search, settings)
- [ ] A2UI components reflow for narrow viewports (grid → stack)
- [ ] Touch targets minimum 44x44px
- [ ] No horizontal scrolling on any viewport

---

#### US-7.4: Onboarding & Empty States

**As a** new user,
**I want** a guided first experience that shows me what AgentOS can do,
**so that** I understand the value without reading documentation.

**Acceptance Criteria:**
- [ ] First-run flow: login → "What are you interested in?" (select 2-3 topics)
- [ ] System creates initial spaces based on selection with template agents
- [ ] Each new space shows a welcome message from the primary agent explaining
  what it can do and inviting first interaction
- [ ] Empty space shows suggested actions: "Try asking me...", "Take a photo of..."
- [ ] Help agent available in every space: "What can you do here?"
- [ ] Dismissable tips for first few interactions (thread creation, voice input, etc.)

---

### Epic 8: Production & Deployment

> Prepare the system for real users with proper deployment, monitoring,
> and operational tooling — leveraging the OpenClaw K8s operator.

---

#### US-8.1: OpenClaw Operator Agent Deployment

**As an** operator,
**I want** to deploy agents via `OpenClawInstance` CRDs,
**so that** each agent gets production-grade infra automatically.

**Acceptance Criteria:**
- [ ] Agent Docker images built with our custom `@openclaw/agent-sdk` + OpenClaw Gateway
- [ ] Helm chart for the full stack: Synapse, Runtime, shell (static), agent CRDs
- [ ] Each agent deployed via one `OpenClawInstance` CR
- [ ] Operator handles: StatefulSet, RBAC, NetworkPolicy, PDB, health probes
- [ ] Agent config injected via CRD spec (Matrix credentials, space assignments)
- [ ] Scaling: HPA on agent pods based on message queue depth
- [ ] Zero-downtime deploy: rolling updates with health checks

---

#### US-8.2: Development Environment

**As a** developer,
**I want** a one-command local dev setup,
**so that** I can develop and test the full stack locally.

**Acceptance Criteria:**
- [ ] `pnpm dev:setup` — provision Synapse + create users/spaces/agents (idempotent)
- [ ] `pnpm dev` — start all apps + agents with hot-reload
- [ ] Local OpenClaw Gateway instance in Docker Compose
- [ ] Seed data: example spaces with template configs, demo agents active
- [ ] Reset: `pnpm dev:reset` — wipe Synapse state and re-provision
- [ ] Documentation: `docs/DEVELOPMENT.md` with prerequisites and troubleshooting

---

#### US-8.3: Observability

**As an** operator,
**I want** metrics, logs, and traces from all components,
**so that** I can monitor health and debug issues.

**Acceptance Criteria:**
- [ ] Runtime exports Prometheus metrics: message count, routing latency,
  agent health, delegation success/failure
- [ ] Agents export Prometheus metrics via OpenClaw operator's ServiceMonitor
- [ ] Structured JSON logging (pino) across all Node.js services
- [ ] Correlation ID propagated through event chain (message → routing → agent → response)
- [ ] Grafana dashboard template for: system overview, per-agent health, per-space activity
- [ ] Alerting rules: agent unhealthy >5m, routing latency >1s, error rate >5%

---

### Epic 9: Security & Privacy

> Protect user data with encryption, access control, and privacy-respecting
> personalization — critical for a B2C product handling personal information.

---

#### US-9.1: End-to-End Encryption for Agent Communication

**As a** user,
**I want** my conversations with agents to be encrypted,
**so that** even the homeserver operator cannot read them.

**Acceptance Criteria:**
- [ ] E2EE enabled by default for all context spaces
- [ ] Agent SDK supports Olm/Megolm key exchange
- [ ] Key backup: user can export/import keys for multi-device
- [ ] Agents verify device trust on first interaction
- [ ] Semantic index operates on decrypted events locally (never sends plaintext to server)
- [ ] Clear documentation of encryption boundaries (what is/isn't encrypted)

---

#### US-9.2: Agent Permission Model

**As a** user,
**I want** to control what each agent can access and do,
**so that** I trust the system with personal data.

**Acceptance Criteria:**
- [ ] Permission scopes: `read_messages`, `send_messages`, `read_state`,
  `write_state`, `cross_space_read`, `proactive`, `camera_access`, `voice_access`
- [ ] Permissions configured per-agent per-space in roster
- [ ] User prompted on first use of a new permission (one-time consent)
- [ ] User can revoke permissions at any time via settings
- [ ] Agent SDK enforces permissions: unauthorized actions throw, not silently fail
- [ ] Audit log: all agent actions logged with timestamp and permission used

---

#### US-9.3: Data Portability & Deletion

**As a** user,
**I want** to export my data and delete my account,
**so that** I own my data and can leave at any time.

**Acceptance Criteria:**
- [ ] Export: full Matrix event history + agent memory + entity graph + preferences
- [ ] Export format: standard Matrix room export (JSON) + AgentOS-specific supplement
- [ ] Delete account: removes all state events, agent memory, personalization data
- [ ] Delete space: removes space, all agent memory within it, entity references
- [ ] "Forget me" per agent: wipes that agent's memory about the user
- [ ] GDPR-compliant: deletion is complete within 30 days, including backups

---

## Architectural Decision Records

### ADR-001: Matrix as the Universal Event Bus

**Status:** Accepted

**Context:** We need a real-time, persistent, encrypted communication layer between
users, agents, and the shell.

**Decision:** Use Matrix for all communication. Every interaction is a Matrix event.
No separate message queue, no custom WebSocket protocol.

**Consequences:**
- (+) Persistence, sync, multi-device, E2EE for free
- (+) Federation enables cross-organization agent interaction
- (+) Existing ecosystem (clients, bridges, bots)
- (-) Matrix event size limits (64KB default) constrain large A2UI payloads
- (-) Matrix sync can be slow for initial load with many rooms
- (-) Custom event types require careful schema evolution

**Mitigations:**
- Large A2UI: split into multiple events or reference external media
- Slow sync: use lazy loading, sliding sync (MSC3575) when available
- Schema evolution: version events, maintain backwards compatibility

---

### ADR-002: OpenClaw as Agent Internal Runtime

**Status:** Accepted

**Context:** Agents need LLM reasoning, tool execution, skill management.
We can build this ourselves or use an existing runtime.

**Decision:** Each agent instance runs an OpenClaw Gateway internally for LLM
and tool operations. Matrix interface handles external communication. These
are two separate interfaces inside one container.

**Consequences:**
- (+) Leverage OpenClaw's mature tool runtime, streaming, session management
- (+) Access to ClawHub skill ecosystem
- (+) K8s operator for production deployment
- (-) Agent container size increases (OpenClaw + our SDK)
- (-) Two communication protocols per agent (Matrix + Gateway WebSocket)
- (-) Version coupling with OpenClaw releases

**Mitigations:**
- Container size: multi-stage builds, shared base image
- Dual protocols: clear separation in agent SDK (MatrixInterface + OpenClawClient)
- Version coupling: pin OpenClaw version, test upgrades explicitly

---

### ADR-003: Local-First Context Engine

**Status:** Accepted

**Context:** The semantic index and entity graph contain sensitive personal data.
Users need fast queries. We need to decide where this lives.

**Decision:** Context Engine runs locally (on-device for B2C, on-premises for B2B).
No user data leaves the device for indexing. Cloud-hosted is an opt-in option
for team features.

**Consequences:**
- (+) Privacy by default — critical for B2C trust
- (+) Fast queries — no network latency
- (+) Works offline
- (-) Limited by device resources (storage, compute)
- (-) No cross-device index sync (must rebuild from Matrix sync)
- (-) Embedding model must run locally or use pre-computed embeddings

**Mitigations:**
- Resource limits: bounded index size, LRU eviction of old embeddings
- Cross-device: rebuild is incremental, warm up on first sync
- Embeddings: use lightweight model (e.g., all-MiniLM-L6) or server-side
  embedding API with privacy guarantees

---

### ADR-004: Hexagonal Architecture for Core Packages

**Status:** Accepted

**Context:** We need core logic (context engine, personalization, agent routing)
that is testable, portable, and not coupled to Matrix or React specifics.

**Decision:** Core packages use hexagonal (ports & adapters) architecture.
Domain logic defines ports (interfaces). Adapters implement against
specific technologies.

**Example:**
```
packages/context-engine/
├── src/
│   ├── ports/           ← interfaces
│   │   ├── event-store.ts
│   │   ├── vector-index.ts
│   │   └── entity-store.ts
│   ├── domain/          ← pure logic, depends only on ports
│   │   ├── indexer.ts
│   │   ├── searcher.ts
│   │   └── entity-resolver.ts
│   └── adapters/        ← implementations
│       ├── matrix-event-store.ts
│       ├── sqlite-vector-index.ts
│       └── matrix-entity-store.ts
```

**Consequences:**
- (+) Core logic testable with in-memory adapters
- (+) Can swap implementations (SQLite → Postgres) without touching domain
- (+) Clear dependency boundaries
- (-) More files and indirection for simple operations
- (-) Risk of over-abstraction if not disciplined

**Mitigations:**
- Only use hexagonal for packages with real swappable concerns
- Apps (shell, runtime) can use simpler patterns where appropriate

---

### ADR-005: A2UI Event Schema Versioning

**Status:** Accepted

**Context:** A2UI components will evolve. Agents built at different times will
emit different component versions. The shell must render all of them.

**Decision:** A2UI events include a `schema_version` field. The shell renderer
handles all known versions. Unknown components render a graceful fallback
(text representation of the component data).

**Consequences:**
- (+) Backwards compatibility — old agents work with new shell
- (+) Forward compatibility — old shell shows fallback for new components
- (-) Shell must carry renderers for all historical versions
- (-) Schema evolution requires careful planning

**Mitigations:**
- Major versions only — additive changes don't bump version
- Deprecation policy: support N-2 versions, warn on older
- Component fallback is always readable (extracted text content)

---

## Appendix: Event Type Reference

### Existing Events (keep)

| Event Type | Purpose |
|---|---|
| `rocks.openclaw.agent.ui` | A2UI component rendering |
| `rocks.openclaw.agent.status` | Agent status updates |
| `rocks.openclaw.agent.task` | Task assignment and completion |
| `rocks.openclaw.agent.tool_call` | Tool invocation logging |
| `rocks.openclaw.agent.tool_result` | Tool result logging |
| `rocks.openclaw.agent.register` | Agent self-registration |
| `rocks.openclaw.agent.config` | Per-agent configuration |

### New Events (to add)

| Event Type | Purpose |
|---|---|
| `rocks.openclaw.agent.action` | User interaction with A2UI (button click, form submit) |
| `rocks.openclaw.agent.memory` | Per-agent persistent memory (state event) |
| `rocks.openclaw.space.config` | Space template and configuration (state event) |
| `rocks.openclaw.space.agents` | Agent roster for a space (state event) |
| `rocks.openclaw.entity` | Entity graph entries (state event) |
| `rocks.openclaw.user.preferences` | User preferences (state event) |
| `rocks.openclaw.user.signals` | Personalization signals (local-only, not a Matrix event) |
