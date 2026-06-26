// Ciclo de vida do Incidente. Duas partes:
//  1) `transition` — máquina de estados pura (regra dos 2 Ciclos), testável.
//  2) `processIncidents` — aplica a máquina sobre o banco e a guarda de correlação.

import { db } from "../db/index.js";
import { notify } from "../notify/index.js";

/** Fração de Instâncias anômalas no mesmo (Fluxo, Passo) que indica causa ambiental. */
export const CORRELATION_FRACTION = 0.6;

export interface StepState {
  consecAnom: number;
  consecNormal: number;
  openIncidentId: number | null;
}

export interface Transition {
  open: boolean; // deve abrir Incidente
  close: boolean; // deve fechar (recuperar) Incidente
  state: StepState;
}

/**
 * Regra pura: falha dura abre na hora; caso contrário, abre após 2 Ciclos
 * anômalos consecutivos. Fecha após 2 Ciclos normais consecutivos (histerese).
 */
export function transition(s: StepState, anomalous: boolean, hardFailure: boolean): Transition {
  if (anomalous) {
    const consecAnom = s.consecAnom + 1;
    const open = s.openIncidentId === null && (hardFailure || consecAnom >= 2);
    return { open, close: false, state: { consecAnom, consecNormal: 0, openIncidentId: s.openIncidentId } };
  }
  const consecNormal = s.consecNormal + 1;
  const close = s.openIncidentId !== null && consecNormal >= 2;
  return { open: false, close, state: { consecAnom: 0, consecNormal, openIncidentId: s.openIncidentId } };
}

// --- Cola com o banco ---

interface Combo {
  instance_id: number;
  flow_id: number;
  step_id: number;
}

function loadState(instanceId: number, flowId: number, stepId: number): StepState {
  const row = db
    .prepare(`SELECT consec_anom, consec_normal, open_incident_id FROM step_state WHERE instance_id=? AND flow_id=? AND step_id=?`)
    .get(instanceId, flowId, stepId) as
    | { consec_anom: number; consec_normal: number; open_incident_id: number | null }
    | undefined;
  return {
    consecAnom: row?.consec_anom ?? 0,
    consecNormal: row?.consec_normal ?? 0,
    openIncidentId: row?.open_incident_id ?? null,
  };
}

function saveState(instanceId: number, flowId: number, stepId: number, s: StepState): void {
  db.prepare(
    `INSERT INTO step_state (instance_id, flow_id, step_id, consec_anom, consec_normal, open_incident_id)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(instance_id, flow_id, step_id) DO UPDATE SET
       consec_anom = excluded.consec_anom,
       consec_normal = excluded.consec_normal,
       open_incident_id = excluded.open_incident_id`,
  ).run(instanceId, flowId, stepId, s.consecAnom, s.consecNormal, s.openIncidentId);
}

function linkAnomalies(cycleId: number, combo: Combo | { flow_id: number; step_id: number }, incidentId: number): void {
  const hasInstance = "instance_id" in combo;
  const sql =
    `UPDATE anomaly SET incident_id = @inc
     WHERE incident_id IS NULL AND measurement_id IN (
       SELECT m.id FROM measurement m
       WHERE m.cycle_id = @cycle AND m.flow_id = @flow AND m.step_id = @step` +
    (hasInstance ? " AND m.instance_id = @inst" : "") +
    `)`;
  const params: Record<string, number> = { inc: incidentId, cycle: cycleId, flow: combo.flow_id, step: combo.step_id };
  if (hasInstance) params.inst = (combo as Combo).instance_id;
  db.prepare(sql).run(params);
}

function isAnomalous(cycleId: number, c: Combo): { anom: boolean; hard: boolean } {
  const anom = !!db
    .prepare(
      `SELECT 1 FROM anomaly a JOIN measurement m ON a.measurement_id = m.id
       WHERE m.cycle_id=? AND m.instance_id=? AND m.flow_id=? AND m.step_id=? LIMIT 1`,
    )
    .get(cycleId, c.instance_id, c.flow_id, c.step_id);
  const hard = !!db
    .prepare(
      `SELECT 1 FROM measurement WHERE cycle_id=? AND instance_id=? AND flow_id=? AND step_id=? AND status='hard_failure' LIMIT 1`,
    )
    .get(cycleId, c.instance_id, c.flow_id, c.step_id);
  return { anom: anom || hard, hard };
}

/** Aplica a transição e cria/fecha Incidentes. Retorna o id aberto, se houver. */
function applyTransition(
  applicationId: number,
  cycleId: number,
  stateKey: { instance_id: number; flow_id: number; step_id: number },
  combo: Combo | { flow_id: number; step_id: number },
  anomalous: boolean,
  hardFailure: boolean,
  kind: "application" | "environmental",
): void {
  const s = loadState(stateKey.instance_id, stateKey.flow_id, stateKey.step_id);
  const t = transition(s, anomalous, hardFailure);

  if (t.open) {
    const instanceId = "instance_id" in combo ? combo.instance_id : null;
    const id = db
      .prepare(
        `INSERT INTO incident (application_id, instance_id, flow_id, step_id, kind, status)
         VALUES (?, ?, ?, ?, ?, 'open')`,
      )
      .run(applicationId, instanceId, combo.flow_id, combo.step_id, kind).lastInsertRowid as number;
    t.state.openIncidentId = id;
    linkAnomalies(cycleId, combo, id);
    void notify({ type: "incident_opened", incidentId: id, summary: incidentSummary(kind, instanceId, combo) });
  } else if (t.state.openIncidentId !== null) {
    // Incidente aberto continua: engrossa com as novas Anomalias deste Ciclo.
    if (anomalous) linkAnomalies(cycleId, combo, t.state.openIncidentId);
    if (t.close) {
      db.prepare(`UPDATE incident SET closed_at = datetime('now') WHERE id = ?`).run(t.state.openIncidentId);
      t.state.openIncidentId = null;
    }
  }

  saveState(stateKey.instance_id, stateKey.flow_id, stateKey.step_id, t.state);
}

function incidentSummary(kind: string, instanceId: number | null, combo: { flow_id: number; step_id: number }): string {
  const scope = kind === "environmental" ? "Ambiental" : `Instância ${instanceId}`;
  return `${scope} — Fluxo ${combo.flow_id}/Passo ${combo.step_id}`;
}

/**
 * Processa Incidentes ao fim de um Ciclo: aplica a guarda de correlação
 * (causa ambiental) e a máquina de estados por (Instância, Fluxo, Passo).
 */
export function processIncidents(applicationId: number, cycleId: number): void {
  const combos = db
    .prepare(`SELECT DISTINCT instance_id, flow_id, step_id FROM measurement WHERE cycle_id = ?`)
    .all(cycleId) as Combo[];

  const statusByCombo = new Map<string, { anom: boolean; hard: boolean }>();
  for (const c of combos) statusByCombo.set(`${c.instance_id}:${c.flow_id}:${c.step_id}`, isAnomalous(cycleId, c));

  // Agrupa por (Fluxo, Passo) para a guarda de correlação.
  const groups = new Map<string, Combo[]>();
  for (const c of combos) {
    const k = `${c.flow_id}:${c.step_id}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(c);
  }

  const environmental = new Set<string>(); // chaves "flow:step" tratadas como ambientais
  for (const [k, members] of groups) {
    const anomCount = members.filter((c) => statusByCombo.get(`${c.instance_id}:${c.flow_id}:${c.step_id}`)!.anom).length;
    const isCorrelated = members.length >= 2 && anomCount / members.length >= CORRELATION_FRACTION;
    const [flowId, stepId] = k.split(":").map(Number) as [number, number];

    // Estado ambiental agregado usa instance_id = 0.
    applyTransition(
      applicationId, cycleId,
      { instance_id: 0, flow_id: flowId, step_id: stepId },
      { flow_id: flowId, step_id: stepId },
      isCorrelated, isCorrelated, "environmental",
    );
    if (isCorrelated) environmental.add(k);
  }

  // Incidentes de aplicação para os combos NÃO absorvidos pela causa ambiental.
  for (const c of combos) {
    if (environmental.has(`${c.flow_id}:${c.step_id}`)) continue;
    const st = statusByCombo.get(`${c.instance_id}:${c.flow_id}:${c.step_id}`)!;
    applyTransition(
      applicationId, cycleId,
      { instance_id: c.instance_id, flow_id: c.flow_id, step_id: c.step_id },
      c, st.anom, st.hard, "application",
    );
  }
}
