// Espelha as formas retornadas pela API REST (src/server/routes/index.ts).
// Termos do domínio em português, alinhados a CONTEXT.md.

export interface Application {
  id: number;
  name: string;
  cycle_interval_min: number;
  paused: number;
  pause_reason?: string | null;
  resume_at?: string | null;
}

export type SessionStatus = "none" | "active" | "expired";

export interface Instance {
  id: number;
  name: string;
  url: string;
  session_status: SessionStatus;
  paused: number;
}

export interface Flow {
  id: number;
  name: string;
}

export interface Step {
  id: number;
  ordinal: number;
  kind: string;
  descriptor: Record<string, unknown>;
}

export interface Parameter {
  id: number;
  name: string;
  secret: number;
}

export type IncidentKind = "application" | "environmental";
export type IncidentStatus = "open" | "investigating" | "diagnosed" | "resolved";

export interface Incident {
  id: number;
  kind: IncidentKind;
  status: IncidentStatus;
  opened_at: string;
  closed_at: string | null;
}

export interface Symptom {
  id: number;
  metric: string;
  observed: number | null;
  deviations: number | null;
}

export type ActionStatus = "todo" | "doing" | "done";

export interface ActionItem {
  id: number;
  description: string;
  owner: string | null;
  status: ActionStatus;
}

export interface IncidentDetail {
  incident: Incident & { diagnosis: string | null };
  symptoms: Symptom[];
  actions: ActionItem[];
}
