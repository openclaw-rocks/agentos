# Development Guide

## Prerequisites
- Node.js 20+
- pnpm 9+
- Docker Desktop

## Quick Start
1. Clone the repo
2. `pnpm install`
3. `pnpm dev:setup` — Provisions local Synapse, creates users/spaces
4. `pnpm dev` — Starts all apps + agents with hot-reload

## Users (Local Dev)
| User | Password | Purpose |
|------|----------|---------|
| admin | admin123 | Admin account |
| user1 | user123 | Primary test user |
| testuser | testuser123 | Additional test user |
| agent-echo | agent123 | Echo bot |

## Spaces & Rooms
- OpenClaw HQ (#openclaw-hq) — general, incident-test
- Side Projects (#side-projects) — random

## Architecture
[link to docs/ARCHITECTURE.md]

## Running Tests
`pnpm test` — runs all tests across all packages

## Troubleshooting
- **Synapse won't start**: `docker compose logs synapse`
- **Stale session**: Clear browser localStorage
- **Port conflict**: Check if port 8008 (Synapse) or 5173 (Vite) is in use
