# Ego & ID Game

This repository contains the browsable source code for the Ego & ID real-time multiplayer party game.

Start with [DEVELOPER_HANDOVER.md](DEVELOPER_HANDOVER.md) for the architecture, local setup, game rules, testing, deployment constraints, operational limitations, and future-development priorities.

## Quick start

```bash
pnpm install
pnpm dev
```

Run `pnpm check` and `pnpm test` before opening a pull request. The game needs an always-on, WebSocket-capable Node deployment because Socket.io maintains live room connections.

