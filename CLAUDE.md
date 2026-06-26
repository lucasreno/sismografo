# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sismógrafo monitors web apps by replaying recorded browser flows against their deployments, learns each flow's normal behavior with robust statistics, and logs deviations as investigable incidents. It is a **single-process, single-user, local TypeScript monolith** — the stack was deliberately chosen to be LLM-maintainable (one language, mainstream libs, explicit code, no codegen/ORM). See [`docs/adr/0003`](./docs/adr/0003-stack-typescript-monolito.md).

## Commands

```bash
pnpm install
pnpm exec playwright install chromium   # once, before running cycles/sessions/reports

pnpm dev:server   # Fastify API + scheduler, http://127.0.0.1:3000 (tsx watch)
pnpm dev:ui       # Vite UI, http://localhost:5173 (proxies /api -> 3000)

pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run (all *.test.ts)
pnpm vitest run src/server/detection/baseline.test.ts   # a single test file
pnpm vitest run -t "name of test"                        # a single test by name

# production: build the UI, then the server serves it static from dist/ui
pnpm build:ui && pnpm start
```

There is no separate lint step; `typecheck` + `test` is the validation loop.

## Domain language is canonical

The ubiquitous language lives in [`CONTEXT.md`](./CONTEXT.md) and the **code, comments, identifiers, and DB columns are all in Portuguese domain terms** — match this when editing. `src/server/domain/types.ts` and `src/server/db/schema.sql` are intentional 1:1 mirrors of CONTEXT.md; keep all three in sync when the domain changes. Architectural decisions are in [`docs/adr/`](./docs/adr/) — read the relevant ADR before changing detection, auth/session, or the stack.

Core nouns: **Aplicação** (monitored software, owns Flows, has no URL) → **Instância** (a concrete deployment at a URL) → **Fluxo** (recorded browser script, defined once on the Aplicação) → **Passo** (one action, the unit that yields a Measurement) → **Parâmetro**/**Calibração** (variable inputs, valued per Instância). A **Ciclo** runs all Flows × Instances; each Passo yields a **Medição**; deviations from the **Linha de Base** become **Anomalias** that aggregate into **Incidentes**.

## Architecture

Two halves in one repo: `src/server` (Fastify backend) and `src/ui` (React+Vite SPA, `App.tsx` is the whole dashboard). The server serves the built UI static in production; in dev Vite proxies `/api`.

**The monitoring cycle** (`src/server/monitor/cycle.ts`) is the heart and runs this pipeline per Ciclo:
1. `environment.ts` preflight — if no target is reachable, mark the cycle `env_unavailable` and **open no application incidents** (avoids false positives from our own VPN/network loss).
2. For each active Instância × Fluxo: `runner.ts` executes the flow in a Playwright **persistent context** (= the Sessão; cookies reused across cycles), producing one Measurement (duration, TTFB, bytes, request count, status) per Passo.
3. `detection/baseline.ts` evaluates each metric against the recent window with **median + MAD + modified z-score and graduated confidence** (wide tolerance early, tightening as samples grow). Pure functions, unit-tested.
4. `incidents.ts` applies the incident lifecycle.

**Scheduler** (`monitor/scheduler.ts`): in-process `setInterval` per Aplicação at `cycle_interval_min`, honoring pause/auto-resume. No broker. Call `startScheduler()` after adding/changing applications to re-arm timers.

**Incident lifecycle** (`monitor/incidents.ts`): split into a pure state machine (`transition`) and DB glue (`processIncidents`). Rules: a hard failure opens immediately; otherwise open after **2 consecutive anomalous cycles** and close after **2 consecutive normal cycles** (hysteresis). A **correlation guard** — when ≥60% of an Aplicação's Instances are anomalous on the same (Fluxo, Passo) in one cycle — opens a single **environmental** incident instead of N application incidents; its aggregate state uses the sentinel `instance_id = 0`.

**Other server pieces:** `session.ts` (establish/renew a Sessão via a visible browser), `monitor/recorder.ts` (assisted Flow recording — visible browser captures clicks/inputs as Passos), `report.ts` (PDF reports via Playwright HTML→PDF, per incident or per application/period), `notify/index.ts` (Google Chat webhook + desktop notifier), `secrets.ts` (encrypted vault), `routes/index.ts` (the entire REST API, grouped by aggregate).

## Invariants & gotchas

- **ESM with NodeNext:** TypeScript source imports use explicit `.js` extensions (e.g. `import { db } from "../db/index.js"`) even though the files are `.ts`. Keep this convention.
- **Secrets never touch the DB, logs, or reports.** Parameters marked `secret` go only to the encrypted vault (`secrets.ts`, AES-256-GCM keyed from the `SISMOGRAFO_MASTER` env var). `calibration_value.value` holds non-secret values only. A flow whose secret param is missing from the vault is treated as *not calibrated* and silently skipped.
- **The `baseline` table is a display cache**; detection always recomputes median/MAD from the live `measurement` window (`WINDOW_SIZE = 400`). Don't treat the cached baseline as the source of truth for detection.
- **DB is pure SQL, no ORM.** Schema is applied idempotently via `migrate()` (`CREATE ... IF NOT EXISTS`); there are no migration files, so additive schema edits go straight into `schema.sql`. SQLite runs in WAL with foreign keys on.

## Environment & local state

- `SISMOGRAFO_MASTER` — master password for the secrets vault; **required** for any flow using secret parameters (sessions, reports, cycles that need them).
- `PORT` (default 3000), `SISMOGRAFO_DB` (default `data/sismografo.db`), `SISMOGRAFO_VAULT` (default `data/secrets.enc`).
- Local state lives in `data/` (SQLite + encrypted vault) and `sessions/instance-<id>/` (persistent browser profiles). These are machine-local and not committed.
