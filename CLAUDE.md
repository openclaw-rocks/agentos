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

## Design System

The shell follows an Apple-inspired, minimalistic, light-first design with Siri spectrum accents. The app itself is invisible — a canvas for agents and A2UI. Reference: apple.com/siri.

### Philosophy

- **Light by default.** `:root` = light mode, `.dark` class for dark, `.high-contrast` for accessibility.
- **Invisible UI.** The app should never make the user think. Clean, minimal, high "wife acceptance factor."
- **Siri as identity, not decoration.** Siri gradient colors (blue → purple → pink → orange) are used sparingly as accents — on primary buttons, the title, and focus rings. Never as backgrounds or large fills.
- **Frosted glass, Apple-level subtle.** `backdrop-filter: blur(20px)` with semi-transparent backgrounds. Inputs get light blur (8px). Never heavy or gimmicky.

### Theme & Colors

- CSS custom properties in `apps/shell/src/styles/globals.css`, consumed via Tailwind in `tailwind.config.js`
- All colors use space-separated RGB triplets: `--color-accent: 0 113 227;` → `rgb(var(--color-accent) / <alpha>)`
- `@apply` cannot reference custom `textColor` extend values — use `color: rgb(var(--color-text-*))` directly in CSS component classes
- Surfaces: `surface-0` (page bg) through `surface-4` (darkest gray)
- Siri spectrum: `--siri-teal`, `--siri-pink`, `--siri-purple`, `--siri-blue`, `--siri-orange`
- Theme switching: `theme.ts` — `applyTheme()` adds `"dark"` or `"high-contrast"` class to `<html>`, light is the default (no class)

### Component Classes (globals.css)

Use these existing classes — do not invent new patterns:

| Class | Use |
|---|---|
| `.glass` | Frosted card/panel — `blur(20px)`, semi-transparent white/dark bg |
| `.glass-input` | Text inputs — translucent bg, blur, purple focus ring |
| `.btn-primary` | Main CTA — Siri gradient, asymmetric hover/press transitions |
| `.btn-secondary` | Alt actions — transparent, bordered, subtle lift on hover |
| `.siri-text` | Gradient text for titles/branding — `background-clip: text` |
| `.glass-sidebar` | Left sidebar panel |
| `.glass-header` | Top header bar |
| `.login-bg` | Login page ambient background with faint Siri gradient wash |
| `.error-banner` | Error messages — soft red tint, icon, animated entrance |

### Interaction & Animation Rules

All interactions follow the Josh Comeau asymmetric timing principle:

- **Hover in**: 250ms with `cubic-bezier(0.25, 0.46, 0.45, 0.94)` — quick snap
- **Hover out / release**: 600ms with `cubic-bezier(0.3, 0.7, 0.4, 1)` — leisurely return
- **Press / active**: 34ms (near-instant, 2 frames) — feels physical
- **Only animate `transform` and `opacity`** for performance. Use `box-shadow` for focus rings (transitionable, no layout shift).
- **Hover effect**: `translateY(-1px)` + accent glow via `box-shadow` on primary, `translateY(-0.5px)` on secondary
- **Active effect**: `translateY(1px) scale(0.97)` on primary, `scale(0.98)` on secondary
- **Focus rings**: `box-shadow: 0 0 0 3px rgb(var(--siri-purple) / 0.1)` — expand from 0, Siri purple
- **Entrance animations**: `card-enter` (10px slide + fade, 500ms), `tab-fade-in` (6px slide + fade, 250ms)
- **Expand/collapse**: `expand-section` uses `grid-template-rows: 0fr → 1fr` (400ms) with staggered child fade-in (150ms delay, +50ms per child)
- **Tab indicator**: Sliding pill via `translateX` with springy overshoot `cubic-bezier(0.34, 1.3, 0.64, 1)` (300ms)
- **Respect `prefers-reduced-motion`**: all durations → 0.01ms

### Hover Accent Colors

All interactive text links use `hover:text-siri-purple` (not `hover:text-accent` or `hover:text-primary`) for consistency. Transition with `transition-colors duration-200`.

### Error Handling & User Messaging

Never show raw technical errors to the user. All errors must be translated into plain, non-technical language.

- **Error banner**: Use `.error-banner` class — soft red-tinted card with icon, animated entrance. Never a raw red `<p>` tag.
- **`friendlyError(raw)`** in `LoginScreen.tsx` maps Matrix protocol errors (M_FORBIDDEN, M_USER_IN_USE, etc.) to human-readable messages.
- **Tone**: Reassuring, not alarming. Tell the user what happened and what they can do about it. Your mother must understand the message.
- **Examples of mapping**:
  - `"Registration has been disabled. Only m.login.application_service registrations are allowed."` → `"This server doesn't allow new accounts right now. Ask your administrator for an invite, or try a different server."`
  - `"Forbidden"` → `"Incorrect username or password. Please double-check and try again."`
  - `"failed to fetch"` → `"Can't reach the server. Check your internet connection and make sure the server address is correct."`
- **Pattern for new error surfaces**: Store raw error in state, transform with `friendlyError()` at display time, render via `<ErrorBanner message={friendlyError(error)} />`
- **Status messages** (non-error): Use `text-sm text-muted` for informational progress (e.g., "Discovering homeserver...")

### Layout Patterns

- Cards: `glass rounded-2xl p-8 card-enter`
- Full-page centered: `min-h-screen flex justify-center login-bg px-4 pt-[max(2rem,12vh)]` — anchored from top to prevent jump on height changes
- Tab groups: `.tab-group` container with `.tab-group-indicator` (absolute-positioned sliding pill) + `.tab-btn` buttons
- Conditional content that changes height: use `.expand-section` / `.expand-section.open` grid trick, not conditional rendering with `{condition && ...}`, to avoid layout jumps
- Shared form fields between modes: keep in DOM always, only conditionally render what differs
- Labels: `text-xs font-medium text-secondary mb-1.5`
- Divider with text: `flex items-center gap-3 my-5` + `flex-1 h-px bg-border` + `text-xs text-muted`
