// Espelho em TypeScript dos termos do CONTEXT.md. Mantém o domínio explícito.

/** Métricas universais capturadas por Passo (a Medição). */
export type Metric = "duration_ms" | "ttfb_ms" | "bytes" | "request_count";
export const METRICS: Metric[] = ["duration_ms", "ttfb_ms", "bytes", "request_count"];

export type SessionStatus = "none" | "active" | "expired";
export type AuthMethod = "sessao-de-navegador" | "usuario-senha";

export type CycleStatus = "running" | "ok" | "env_unavailable";

export type IncidentKind = "application" | "environmental";
export type IncidentStatus = "open" | "investigating" | "diagnosed" | "resolved";

export type AnomalyKind = "statistical" | "hard_failure";
export type ActionStatus = "todo" | "doing" | "done";

/** Sinais capturados ao executar um Passo contra uma Instância. */
export interface Measurement {
  durationMs: number | null;
  ttfbMs: number | null;
  bytes: number | null;
  requestCount: number | null;
  status: "ok" | "hard_failure";
  declaredSignals: Record<string, number>;
}
