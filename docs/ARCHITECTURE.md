# AgentOS Architecture

## Dependency Graph

```
Layer 0 — Foundation
┌─────────────────────┐
│  @openclaw/protocol  │  Event types, constants, shared TypeScript types
└──────────┬──────────┘
           │
Layer 1 — Core Libraries (depend only on protocol)
┌──────────┴──────────┬────────────────┬─────────────────┬──────────────────┐
│  @openclaw/a2ui     │  agent-sdk     │  context-engine  │  input-engine    │
│  Component registry │  Agent helpers │  Query & store   │  Multi-modal     │
│  Validation         │  UIBuilder     │  ports           │  speech, image   │
│  Serialization      │  MatrixContext │                  │                  │
└─────────────────────┴───────┬────────┴──────────────────┴──────────────────┘
                              │        ┌──────────────────┐
                              │        │  personalization  │
                              │        │  Preferences,     │
                              │        │  signals, triggers │
                              │        └──────────────────┘
Layer 2 — Applications & Agents
┌─────────────────────┬───────┴────────┬──────────────────┐
│  @openclaw/shell    │  @openclaw/    │  @openclaw/      │
│  React web client   │  runtime       │  agent-echo      │
│  Depends on:        │  Depends on:   │  Depends on:     │
│    protocol         │    protocol    │    protocol      │
│                     │    agent-sdk   │    agent-sdk     │
└─────────────────────┴────────────────┴──────────────────┘
```

## Package Boundary Rules

1. **`packages/` never imports from `apps/` or `agents/`**
   Packages are reusable libraries. They must not reference application-specific code.

2. **`apps/` never imports from `agents/`**
   Agents are independently deployed units discovered at runtime via Matrix.

3. **All internal packages depend on `@openclaw/protocol` as the shared vocabulary**
   Protocol defines event types, component interfaces, and constants used across the system.

4. **Hexagonal architecture for domain packages**
   `context-engine`, `input-engine`, and `personalization` use ports & adapters:
   - `src/ports/` — interfaces (driven/driving)
   - `src/domain/` — pure business logic
   - `src/adapters/` — concrete implementations (Matrix, SQLite, APIs)

5. **Shell depends only on `protocol`**
   The shell renders A2UI by interpreting protocol types directly. It does not depend on
   `a2ui` or `agent-sdk` — those are agent-side concerns.

6. **Agent SDK is the agent-side boundary**
   All agents depend on `agent-sdk` for Matrix communication, UIBuilder, and context helpers.
   Agents should not use `matrix-js-sdk` directly.

## Enforcing Boundaries

Boundaries are enforced via:
- **TypeScript project references**: each `tsconfig.json` explicitly lists its dependencies
- **Turborepo build graph**: `turbo.json` `dependsOn` ensures correct build order
- **ESLint `import-x` plugin**: prevents reaching into package internals
- **Code review**: CLAUDE.md documents the rules; PRs are checked against them

## Data Flow

```
User Input → Shell (React) → Matrix Room → Runtime (App Service) → Agent
                                                                     │
                                                                     ▼
                                                              OpenClaw Gateway
                                                              (LLM + Tools)
                                                                     │
                                                                     ▼
Agent Response → Matrix Room Event (rocks.openclaw.agent.*) → Shell renders A2UI
```

## Key Design Decisions

See [ADR section in USER_STORIES.md](./USER_STORIES.md) for detailed architectural decision records:
- ADR-001: Matrix as universal transport
- ADR-002: A2UI declarative component model
- ADR-003: Hexagonal architecture for core packages
- ADR-004: OpenClaw for agent intelligence
- ADR-005: Progressive enhancement (web → desktop → mobile)
