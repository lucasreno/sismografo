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

## Estado atual

**Implementado e validado (testes + smokes HTTP/Playwright):**

- Schema do domínio completo em SQLite.
- Detecção robusta (mediana + MAD, z-score modificado, confiança graduada) — com testes.
- **Execução real de Fluxo via Playwright** (contexto persistente = Sessão; captura duração, TTFB, bytes, nº de requisições).
- **Verificação de Ambiente** (preflight anti-VPN) antes de cada Ciclo.
- **Ciclo de vida do Incidente**: regra dos 2 Ciclos + guarda de correlação (Incidente Ambiental) — com testes.
- Agendador in-process (cadência por Aplicação, pausa/auto-retomar).
- **Sessão**: estabelecer/renovar via navegador visível; **cofre de segredos** cifrado (AES-256-GCM).
- **Relatório PDF** via Playwright (com sismograma SVG), por Incidente ou por Aplicação/período.
- API REST de ponta a ponta (Aplicação, Instância, autoria de Fluxo, Calibração, Incidente, Relatório).
- **Gravação assistida de Fluxo**: navegador visível registra cliques/inputs/navegação como Passos; depois um valor pode ser promovido a Parâmetro.
- **UI dashboard completa**: criar/rodar/pausar Aplicações; gerir Instâncias (Sessão, Gravar Fluxo); criar/inspecionar Fluxos, promover Parâmetros e Calibrar; ver Incidentes, preencher Diagnóstico e Plano de Ação, baixar Relatório.
- Notificação via **Google Chat** (webhook) **e desktop do SO** (node-notifier).

**Deliberadamente adiado** (ver conversa de design, não bloqueia o uso): sazonalidade por hora/dia, poda de retenção de Medições, empréstimo de Linha de Base entre instâncias-irmãs.

## Como dirigir pela API

```bash
# 1. Aplicação
curl -X POST localhost:3000/api/applications -H "Content-Type: application/json" -d '{"name":"App A"}'
# 2. Instância
curl -X POST localhost:3000/api/applications/1/instances -H "Content-Type: application/json" -d '{"name":"Cliente X","url":"https://x.exemplo.com"}'
# 3. Fluxo com Passos (e Parâmetros opcionais)
curl -X POST localhost:3000/api/applications/1/flows -H "Content-Type: application/json" \
  -d '{"name":"Consulta","steps":[{"kind":"navigate","descriptor":{"url":"/login"}},{"kind":"fill","descriptor":{"selector":"#comp","param":"competencia"}},{"kind":"click","descriptor":{"selector":"#buscar"}}],"parameters":[{"name":"competencia"}]}'
# 4. Calibração (valores por Instância; segredos vão ao cofre)
curl -X POST localhost:3000/api/flows/1/calibrations -H "Content-Type: application/json" -d '{"instanceId":1,"values":{"competencia":"2025-01"}}'
# 5. Estabelecer Sessão (abre navegador para login) e rodar
curl -X POST localhost:3000/api/instances/1/session/establish
curl -X POST localhost:3000/api/applications/1/run -d '{}'
# 6. Relatório
curl localhost:3000/api/applications/1/report.pdf -o relatorio.pdf
```

> Segredos exigem a variável de ambiente `SISMOGRAFO_MASTER` (senha mestra do cofre).
