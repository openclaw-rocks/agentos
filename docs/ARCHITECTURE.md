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
│  @openclaw/a2ui     │  context-engine │  input-engine    │  personalization │
│  Component registry │  Query & store  │  Multi-modal     │  Preferences,    │
│  Validation         │  ports          │  speech, image   │  signals         │
│  Serialization      │                 │                  │                  │
└─────────────────────┴────────────────┴──────────────────┴──────────────────┘

Layer 2 — Applications
┌─────────────────────┬────────────────┐
│  @openclaw/shell    │  @openclaw/    │
│  React web client   │  runtime       │
│  Depends on:        │  Depends on:   │
│    protocol         │    protocol    │
└─────────────────────┴────────────────┘

Layer 3 — Agent Skills (external to this repo)
┌─────────────────────────────────────────┐
│  agentos-agent skill (OpenClaw)         │
│  Teaches agents: A2UI, status, tasks    │
│  Provides: oc-agentos CLI tool          │
│  Uses: Matrix Client-Server API directly│
└─────────────────────────────────────────┘
```

## Package Boundary Rules

1. **`packages/` never imports from `apps/`**
   Packages are reusable libraries. They must not reference application-specific code.

2. **All internal packages depend on `@openclaw/protocol` as the shared vocabulary**
   Protocol defines event types, component interfaces, and constants used across the system.

3. **Hexagonal architecture for domain packages**
   `context-engine`, `input-engine`, and `personalization` use ports & adapters:
   - `src/ports/` — interfaces (driven/driving)
   - `src/domain/` — pure business logic
   - `src/adapters/` — concrete implementations (Matrix, SQLite, APIs)

4. **Shell depends only on `protocol`**
   The shell renders A2UI by interpreting protocol types directly. It does not depend on
   `a2ui` — that is an agent-side concern.

5. **Agents are OpenClaw instances, not in-repo packages**
   Agents communicate via Matrix events using the `agentos-agent` skill. They are
   independently deployed OpenClaw processes, not TypeScript packages in this monorepo.

## Enforcing Boundaries

Boundaries are enforced via:
- **TypeScript project references**: each `tsconfig.json` explicitly lists its dependencies
- **Turborepo build graph**: `turbo.json` `dependsOn` ensures correct build order
- **ESLint `import-x` plugin**: prevents reaching into package internals
- **Code review**: CLAUDE.md documents the rules; PRs are checked against them

## Data Flow

```
User Input → Shell (React) → Matrix Room → Agent (OpenClaw instance)
                                                    │
                                                    ▼
                                             OpenClaw Brain
                                             (LLM + Skills + Tools)
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
