# Sismógrafo

Monitora aplicações web executando **Fluxos** gravados contra suas **Instâncias**, aprende o comportamento normal (**Linha de Base**) e registra anomalias como um livro de **Sintomas** e **Diagnósticos** para investigação e ação.

A linguagem ubíqua do projeto está em [`CONTEXT.md`](./CONTEXT.md). As decisões arquiteturais em [`docs/adr/`](./docs/adr/).

## Stack

Monólito TypeScript (ver [ADR 0003](./docs/adr/0003-stack-typescript-monolito.md)):

- **Playwright** — gravação e execução de Fluxos; contexto persistente = Sessão.
- **SQLite** (better-sqlite3, SQL puro) — armazenamento local.
- **Fastify** — API + scheduler in-process.
- **React + Vite** — UI servida estática.

## Como rodar

```bash
pnpm install
pnpm exec playwright install chromium   # baixa o navegador (uma vez)

pnpm dev:server   # backend em http://127.0.0.1:3000
pnpm dev:ui       # UI em http://localhost:5173 (proxy /api -> 3000)

pnpm test         # testes (detecção de anomalia)
pnpm typecheck    # checagem de tipos
```

Para produção: `pnpm build:ui` e depois `pnpm start` (o Fastify serve a UI de `dist/ui`).

## Estado atual (scaffold)

Implementado: schema do domínio, detecção robusta (mediana + MAD, confiança graduada) com testes, Verificação de Ambiente, orquestração do Ciclo, agendador, esqueleto de API e UI, notificação via Google Chat.

Próximas peças (marcadas com `TODO` no código):

- Execução real do Fluxo via Playwright (captura de duração/TTFB/bytes/requisições).
- Gravação de Fluxo (Playwright codegen) e marcação de Parâmetros.
- Abertura/fechamento de Incidente (regra dos 2 Ciclos) + guarda de correlação.
- Estabelecer/renovar Sessão e chaveiro de segredos.
- Geração de Relatório em PDF.
- Notificação de desktop do SO.
