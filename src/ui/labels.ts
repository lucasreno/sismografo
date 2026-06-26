// Traduz os valores crus da API (enums em inglês) para rótulos humanos em
// português + intenção de cor. Centralizado para manter consistência visual.
import type { Intent } from "./ui.js";
import type {
  ActionStatus,
  IncidentKind,
  IncidentStatus,
  SessionStatus,
} from "./types.js";

export interface Label {
  text: string;
  intent: Intent;
}

export const sessionLabel: Record<SessionStatus, Label> = {
  none: { text: "Sem sessão", intent: "neutral" },
  active: { text: "Sessão ativa", intent: "ok" },
  expired: { text: "Reautenticar", intent: "warn" },
};

export const incidentStatusLabel: Record<IncidentStatus, Label> = {
  open: { text: "Aberto", intent: "danger" },
  investigating: { text: "Em investigação", intent: "warn" },
  diagnosed: { text: "Diagnosticado", intent: "brand" },
  resolved: { text: "Resolvido", intent: "ok" },
};

export const incidentKindLabel: Record<IncidentKind, Label> = {
  application: { text: "Aplicação", intent: "danger" },
  environmental: { text: "Ambiental", intent: "env" },
};

export const actionStatusLabel: Record<ActionStatus, Label> = {
  todo: { text: "A fazer", intent: "neutral" },
  doing: { text: "Em curso", intent: "warn" },
  done: { text: "Concluída", intent: "ok" },
};

// Métricas de Medição → nome legível + unidade.
export const metricLabel: Record<string, string> = {
  duration_ms: "Duração",
  ttfb_ms: "TTFB",
  bytes: "Bytes",
  request_count: "Nº de requisições",
  status: "Status HTTP",
};

export function prettyMetric(metric: string): string {
  return metricLabel[metric] ?? metric;
}

// Mapa de cor (CSS var) por intenção — para faixas/acentos inline.
export const intentColor: Record<Intent, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  env: "var(--env)",
  neutral: "var(--border-strong)",
  brand: "var(--brand)",
};

// "2026-06-25 14:03:00" → "25/06 14:03". Tolerante a formatos parciais.
export function fmtDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return `${m[3]}/${m[2]} ${m[4]}:${m[5]}`;
  return raw;
}

export function fmtNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}
