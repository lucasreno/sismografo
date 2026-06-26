# Sistema de Design — Sismógrafo

Fonte da verdade visual da UI. Documenta o sistema que **já existe** em
`src/ui/styles.css`, `src/ui/ui.tsx` e `src/ui/brand.tsx`. Ao construir ou
revisar telas, siga este documento; quando o código e este doc divergirem,
atualize ambos no mesmo commit.

> **Estilo:** Dark Mode "instrumento" (fundo quase-preto OLED, sinal azul→ciano,
> cor reservada para estado). Sem framework CSS — tokens CSS + classes
> semânticas explícitas, alinhado ao ethos minimalista/LLM-manutenível do
> [ADR 0003](./adr/0003-stack-typescript-monolito.md).

---

## 1. Princípios

1. **Tokens primeiro, componentes depois.** Nada de valores mágicos no JSX —
   tudo sai de `var(--*)` definido em `:root`.
2. **Cor = significado, não decoração.** Verde = estável, âmbar = atenção,
   vermelho = incidente, violeta = ambiental, azul = marca/interativo. Nunca
   use cor de estado para enfeite.
3. **Cor nunca é o único sinal.** Badges sempre carregam texto (e/ou `dot`);
   ícones acompanham estados. (a11y: daltonismo.)
4. **SVG, nunca emoji.** Ícones vêm do set Lucide-style em `ui.tsx` (`<Icon>`).
5. **Sem `window.alert/confirm/prompt`.** Use `useToast()` e `useConfirm()`.
6. **Movimento é discreto e opcional.** Transições 130–200ms; tudo respeita
   `prefers-reduced-motion`.

---

## 2. Cor

### Superfícies (do fundo ao topo)
| Token | Hex | Uso |
|-------|-----|-----|
| `--bg` | `#0a0e14` | fundo da página (com glow radial azul no topo) |
| `--surface` | `#10161f` | cartões, drawer, modal |
| `--surface-2` | `#151d28` | inputs, linhas (`.row`), blocos internos |
| `--surface-3` | `#1b2533` | botão secundário, toast, `kbd` |
| `--overlay` | `rgba(5,8,12,.66)` | véu sob modal/drawer |

### Bordas e texto
| Token | Hex | Uso |
|-------|-----|-----|
| `--border` | `#243044` | borda padrão |
| `--border-strong` | `#324155` | borda de input, hover, divisores fortes |
| `--text` | `#e6edf5` | texto principal |
| `--text-muted` | `#94a3b5` | secundário (contraste ≥ 4.5:1 sobre surfaces) |
| `--text-faint` | `#647488` | terciário: hints, eyebrows, IDs |

### Marca / interativo
| Token | Hex | Uso |
|-------|-----|-----|
| `--brand` | `#4f8cff` | ação primária, links, foco |
| `--brand-strong` | `#3b7bf5` | hover do primário |
| `--brand-soft` | `rgba(79,140,255,.14)` | fundos suaves, anel de foco em input |
| `--signal` | `#38d9e0` | acento "sinal vivo" do sismograma (passos, traço do logo) |

> **Texto sobre `--brand`:** use `#06101f` (quase-preto), não branco — é o
> contraste que o sistema já adota em `.btn--primary` e `.guide__num`.

### Semântica de estado (cor + variante `-soft` para fundo)
| Estado | Cor | Soft | Significado de domínio |
|--------|-----|------|------------------------|
| `--ok` | `#34d399` | `--ok-soft` | estável / saudável |
| `--warn` | `#f5b34a` | `--warn-soft` | atenção / próximo passo pendente |
| `--danger` | `#fb6f80` (`--danger-strong #f4485e`) | `--danger-soft` | incidente / falha |
| `--env` | `#b69bff` | `--env-soft` | incidente **ambiental** / informativo |

Mapeie enums da API → rótulo PT + intenção de cor **sempre** via
`src/ui/labels.ts` (`incidentStatusLabel`, `sessionLabel`, …). Não renderize
enums crus (`env_unavailable`, `open`).

---

## 3. Tipografia

| Token | Família | Uso |
|-------|---------|-----|
| `--font-sans` | **Inter**, system-ui, … | tudo |
| `--font-mono` | **JetBrains Mono**, ui-monospace, … | métricas, IDs, passos, código, valores |

- Corpo: `15px` / `line-height 1.5`.
- Títulos (`h1–h4`): `font-weight 650`, `line-height 1.25`, `letter-spacing -0.01em`.
- `.eyebrow`: 11px, peso 700, maiúsculas, `letter-spacing .08em`, cor faint.
- Dados sempre em mono (`.mono`, `--font-mono`) — duração, TTFB, desvio, ID de incidente.

> A sugestão genérica do gerador (Fira Code/Sans) foi descartada: Inter +
> JetBrains Mono já estão implementados e têm a mesma vocação "dashboard
> técnico", sem custo de migração.

---

## 4. Espaço, raio, elevação, movimento

- **Espaço** (escala `--sp-1..7`): 4 · 8 · 12 · 16 · 24 · 32 · 48 px. Use a
  escala; não invente gaps.
- **Raio** (`--r-*`): sm 6 · md 10 · lg 14 · xl 20 · pill 999.
- **Sombra** (`--shadow-*`): sm (linha) · md (hover de card) · lg (drawer/modal).
- **Transição:** `--t-fast 130ms` (botões, inputs, hover de linha) ·
  `--t-base 200ms` (cards, overlays, entradas de drawer/modal/toast).
- **Z-index escalonado:** topbar 20 · overlay 40 · drawer/modal 50 · toast 60.
  Não use z-index fora dessa escala.

---

## 5. Componentes (classes canônicas)

Primitivas React em `src/ui/ui.tsx`: `Button`, `Badge`, `Modal`, `Drawer`,
`Icon`, `Spinner`, `Providers`, `useToast`, `useConfirm`, `cx`.

| Componente | Classe base | Variantes |
|------------|-------------|-----------|
| Botão | `.btn` | `--primary` `--secondary` `--ghost` `--danger` · tamanho `--sm` · `--icon` `--block` |
| Link-botão | `.linkbtn` | `--muted` |
| Badge | `.badge` | `--ok` `--warn` `--danger` `--env` `--neutral` `--brand` (+ `.badge__dot`, `.pulse`) |
| Card | `.card` / `.appcard` | faixa de estado via `--accent` na borda esquerda |
| Lista | `.row` (`__main`/`__name`/`__sub`/`__actions`) | |
| Form | `.field` `.input` `.select` `.textarea` `.checkbox` `.inline-form` | |
| Modal | `.modal` `.modal__card` | `--wide` |
| Drawer | `.drawer` (`__head`/`__body`) | direita, `min(680px,100vw)` |
| Feed | `.feed` `.incident` | |
| Passos | `.steps` `.step` (`__num`/`__kind`/`__desc`) | |
| Sintoma | `.symptom` (`__metric`/`__val`/`__dev`) | |
| Vazio | `.empty` · onboarding `.guide` | |
| Toast | `.toast` | `--ok` `--danger` `--info` |
| Banner | `.banner` | processo em curso (navegador visível) |

**Convenção de acento:** componentes com faixa/borda colorida leem a cor de uma
custom property local `--accent` (ex.: `.toast--ok { --accent: var(--ok) }`,
`appcard` define `--accent` conforme o estado da Aplicação). Reutilize esse
padrão em vez de criar novas classes de cor.

---

## 6. Acessibilidade (não-negociável)

- Foco visível global: `:focus-visible` → anel `--brand-ring` 2px, offset 2px.
- Botões só-ícone precisam de `aria-label` (já no `<Button icon>` de `ui.tsx`).
- Inputs sempre com `.field__label` associado.
- Alvos de toque ≥ alturas definidas (btn 36px, btn--sm 30px) — não reduza.
- `prefers-reduced-motion: reduce` zera animações/transições (já global).
- Estados nunca dependem só de cor (ver §2.3).

### Gotcha de render (SQLite)
Booleanos vêm como `number` 0/1. No JSX use **ternário**
(`p.secret ? <X/> : null`), **nunca** `p.secret && <X/>` — `0 && …` renderiza um
literal `"0"`. (Ver memória `ui-redesign`.)

---

## 7. Checklist pré-entrega de UI

- [ ] Tokens em vez de valores fixos; espaços na escala `--sp-*`.
- [ ] Cor de estado pela semântica certa (ok/warn/danger/env), nunca decorativa.
- [ ] Enums renderizados via `labels.ts`.
- [ ] Ícones SVG (`<Icon>`), zero emoji.
- [ ] `cursor: pointer` + hover com feedback em tudo clicável.
- [ ] Foco de teclado visível; `aria-label` em botões só-ícone.
- [ ] Booleanos 0/1 via ternário no JSX.
- [ ] Responsivo (breakpoint `640px`: grid 1 coluna, drawer full-width).
- [ ] `prefers-reduced-motion` respeitado.
- [ ] Validação: `pnpm typecheck` + `pnpm build:ui`.
