# Stack: monólito TypeScript otimizado para manutenção por LLM

O Sismógrafo é um monólito em **TypeScript** de ponta a ponta: **Playwright** (automação e gravação de Fluxos via `codegen`, contexto persistente para Sessão, e impressão de Relatório HTML→PDF), **SQLite via better-sqlite3 com SQL puro** (sem ORM), **Fastify** com scheduler in-process, e UI em **React + Vite** servida estática pelo backend. Roda local, num processo só.

**Por quê:** o sistema será mantido pelo Claude Code, então a stack foi escolhida para minimizar consumo de tokens e maximizar confiabilidade do LLM: uma só linguagem (sem alternar Rust/TS por tarefa), bibliotecas mainstream que o modelo conhece de cor, código explícito e sem geração (SQL puro em vez de ORM; sem a mágica de RSC/App-Router do Next.js), tipagem estática para feedback rápido, e poucas partes móveis (monólito, sem broker nem servidor de banco). O loop tsc/lint/test é comprimido pelos filtros RTK existentes.

**Considerado e rejeitado:** Next.js (fronteiras implícitas Server/Client e App Router escondem comportamento e geram código verboso/frágil para uma ferramenta local single-user); Rust (binding de Playwright secundário e split de linguagem); ORM como Prisma (código gerado e round-trips de schema custam mais tokens que SQL transparente).
