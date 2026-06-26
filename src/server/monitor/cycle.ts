// Orquestração de um Ciclo de Monitoramento (sequencial — ver docs/adr/0003).
// preflight de ambiente -> executar Fluxos x Instâncias (Playwright) -> medir ->
// avaliar contra a Linha de Base -> registrar Anomalias -> processar Incidentes.

import { db } from "../db/index.js";
import { checkEnvironment } from "./environment.js";
import { executeFlow, type StepDef, type StepMeasurement } from "./runner.js";
import { processIncidents } from "./incidents.js";
import { evaluate } from "../detection/baseline.js";
import { METRICS, type Metric, type Measurement } from "../domain/types.js";
import { getSecret, secretKey } from "../secrets.js";

const WINDOW_SIZE = 400; // janela móvel de Medições por combinação

interface InstanceRow {
  id: number;
  url: string;
  paused: number;
  session_status: string;
}

export async function runCycle(applicationId: number, trigger: "scheduled" | "manual"): Promise<number> {
  const instances = db
    .prepare(`SELECT id, url, paused, session_status FROM instance WHERE application_id = ?`)
    .all(applicationId) as InstanceRow[];
  const active = instances.filter((i) => !i.paused && i.session_status !== "expired");

  const cycleId = db
    .prepare(`INSERT INTO monitoring_cycle (application_id, trigger) VALUES (?, ?)`)
    .run(applicationId, trigger).lastInsertRowid as number;

  // Verificação de Ambiente: se nada responde, é problema do nosso lado.
  const env = await checkEnvironment(active.map((i) => i.url));
  if (!env.reachable) {
    db.prepare(`UPDATE monitoring_cycle SET status='env_unavailable', finished_at=datetime('now') WHERE id=?`).run(cycleId);
    return cycleId; // NÃO abre Incidentes de aplicação
  }

  const flows = db.prepare(`SELECT id FROM flow WHERE application_id = ?`).all(applicationId) as { id: number }[];

  for (const instance of active) {
    for (const flow of flows) {
      const steps = loadSteps(flow.id);
      if (steps.length === 0) continue;

      const params = loadCalibration(flow.id, instance.id);
      if (params === null) continue; // Instância não calibrada para este Fluxo

      let measurements: StepMeasurement[];
      try {
        measurements = await executeFlow(instance.id, instance.url, steps, params);
      } catch (err) {
        console.error(`[cycle] Fluxo ${flow.id} na instância ${instance.id} falhou ao iniciar:`, err);
        continue;
      }

      for (const sm of measurements) {
        const measurementId = persistMeasurement(cycleId, instance.id, flow.id, sm.stepId, sm.measurement);
        detect(measurementId, instance.id, flow.id, sm.stepId, sm.measurement);
      }
    }
  }

  processIncidents(applicationId, cycleId);
  db.prepare(`UPDATE monitoring_cycle SET status='ok', finished_at=datetime('now') WHERE id=?`).run(cycleId);
  return cycleId;
}

function loadSteps(flowId: number): StepDef[] {
  const rows = db
    .prepare(`SELECT id, kind, descriptor FROM step WHERE flow_id = ? ORDER BY ordinal`)
    .all(flowId) as { id: number; kind: string; descriptor: string }[];
  return rows.map((r) => ({ id: r.id, kind: r.kind, descriptor: JSON.parse(r.descriptor) }));
}

/** Valores de Parâmetro da Calibração (Fluxo x Instância). Null se faltar valor. */
function loadCalibration(flowId: number, instanceId: number): Record<string, string> | null {
  const declared = db.prepare(`SELECT id, name, secret FROM parameter WHERE flow_id = ?`).all(flowId) as {
    id: number;
    name: string;
    secret: number;
  }[];
  if (declared.length === 0) return {};

  const values = db
    .prepare(
      `SELECT p.name AS name, cv.value AS value
       FROM calibration c
       JOIN calibration_value cv ON cv.calibration_id = c.id
       JOIN parameter p ON p.id = cv.parameter_id
       WHERE c.flow_id = ? AND c.instance_id = ?`,
    )
    .all(flowId, instanceId) as { name: string; value: string | null }[];

  const map: Record<string, string> = {};
  for (const v of values) if (v.value !== null) map[v.name] = v.value;

  for (const d of declared) {
    if (d.secret) {
      // Parâmetros secretos vêm do cofre cifrado, nunca do banco.
      const s = getSecret(secretKey(flowId, instanceId, d.name));
      if (s === undefined) return null; // não calibrada
      map[d.name] = s;
    } else if (!(d.name in map)) {
      return null; // não calibrada
    }
  }
  return map;
}

function persistMeasurement(
  cycleId: number, instanceId: number, flowId: number, stepId: number, m: Measurement,
): number {
  return db
    .prepare(
      `INSERT INTO measurement
        (cycle_id, instance_id, flow_id, step_id, duration_ms, ttfb_ms, bytes, request_count, status, declared_signals)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(cycleId, instanceId, flowId, stepId, m.durationMs, m.ttfbMs, m.bytes, m.requestCount, m.status, JSON.stringify(m.declaredSignals))
    .lastInsertRowid as number;
}

function detect(measurementId: number, instanceId: number, flowId: number, stepId: number, m: Measurement): void {
  if (m.status === "hard_failure") {
    recordAnomaly(measurementId, "duration_ms", "hard_failure", null, null, null, null);
    return;
  }
  for (const metric of METRICS) {
    const observed = metricValue(m, metric);
    if (observed === null) continue;
    const window = recentValues(instanceId, flowId, stepId, metric, measurementId);
    const e = evaluate(observed, window);
    // Sem janela ainda (primeira Medição) a mediana/MAD são NaN: nada a salvar.
    if (Number.isFinite(e.median) && Number.isFinite(e.mad)) {
      upsertBaseline(instanceId, flowId, stepId, metric, window.length, e.median, e.mad);
    }
    if (e.isAnomaly) recordAnomaly(measurementId, metric, "statistical", e.median, e.mad, observed, e.deviations);
  }
}

function metricValue(m: Measurement, metric: Metric): number | null {
  switch (metric) {
    case "duration_ms": return m.durationMs;
    case "ttfb_ms": return m.ttfbMs;
    case "bytes": return m.bytes;
    case "request_count": return m.requestCount;
  }
}

function recentValues(instanceId: number, flowId: number, stepId: number, metric: Metric, exclude: number): number[] {
  const rows = db
    .prepare(
      `SELECT ${metric} AS v FROM measurement
       WHERE instance_id=? AND flow_id=? AND step_id=? AND id<>? AND ${metric} IS NOT NULL
       ORDER BY captured_at DESC LIMIT ?`,
    )
    .all(instanceId, flowId, stepId, exclude, WINDOW_SIZE) as { v: number }[];
  return rows.map((r) => r.v);
}

function upsertBaseline(
  instanceId: number, flowId: number, stepId: number, metric: Metric, count: number, median: number, mad: number,
): void {
  db.prepare(
    `INSERT INTO baseline (instance_id, flow_id, step_id, metric, sample_count, median, mad, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(instance_id, flow_id, step_id, metric)
     DO UPDATE SET sample_count=excluded.sample_count, median=excluded.median, mad=excluded.mad, updated_at=excluded.updated_at`,
  ).run(instanceId, flowId, stepId, metric, count, median, mad);
}

function recordAnomaly(
  measurementId: number, metric: string, kind: "statistical" | "hard_failure",
  median: number | null, mad: number | null, observed: number | null, deviations: number | null,
): void {
  db.prepare(
    `INSERT INTO anomaly (measurement_id, metric, kind, expected_median, expected_mad, observed, deviations)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(measurementId, metric, kind, median, mad, observed, deviations);
}
