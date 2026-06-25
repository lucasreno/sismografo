// Orquestração de um Ciclo de Monitoramento (sequencial — ver docs/adr/0003).
// Fluxo: preflight de ambiente -> executar Fluxos x Instâncias -> medir ->
// avaliar contra a Linha de Base -> registrar Anomalias -> abrir/fechar Incidentes.
//
// A execução real do Fluxo via Playwright (runFlow) é um stub marcado com TODO:
// é a próxima grande peça. O esqueleto abaixo já fixa a forma da orquestração.

import { db } from "../db/index.js";
import { checkEnvironment } from "./environment.js";
import { evaluate } from "../detection/baseline.js";
import { METRICS, type Metric, type Measurement } from "../domain/types.js";

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

  const cycleId = (
    db
      .prepare(`INSERT INTO monitoring_cycle (application_id, trigger) VALUES (?, ?)`)
      .run(applicationId, trigger).lastInsertRowid as number
  );

  // Verificação de Ambiente: se nada responde, é problema do nosso lado.
  const env = await checkEnvironment(active.map((i) => i.url));
  if (!env.reachable) {
    db.prepare(`UPDATE monitoring_cycle SET status = 'env_unavailable', finished_at = datetime('now') WHERE id = ?`)
      .run(cycleId);
    return cycleId; // NÃO abre Incidentes de aplicação
  }

  const flows = db
    .prepare(`SELECT id FROM flow WHERE application_id = ?`)
    .all(applicationId) as { id: number }[];

  for (const instance of active) {
    for (const flow of flows) {
      const steps = db
        .prepare(`SELECT id FROM step WHERE flow_id = ? ORDER BY ordinal`)
        .all(flow.id) as { id: number }[];

      for (const step of steps) {
        const m = await runFlowStep(instance.id, flow.id, step.id);
        const measurementId = persistMeasurement(cycleId, instance.id, flow.id, step.id, m);
        detect(measurementId, instance.id, flow.id, step.id, m);
      }
    }
  }

  db.prepare(`UPDATE monitoring_cycle SET status = 'ok', finished_at = datetime('now') WHERE id = ?`).run(cycleId);
  return cycleId;
}

// TODO(playwright): executar o Passo no contexto persistente (Sessão) da Instância,
// capturando duração, TTFB, bytes, nº de requisições e status. Stub determinístico por ora.
async function runFlowStep(_instanceId: number, _flowId: number, _stepId: number): Promise<Measurement> {
  return {
    durationMs: 200 + Math.random() * 40,
    ttfbMs: 50 + Math.random() * 10,
    bytes: 10_000 + Math.floor(Math.random() * 500),
    requestCount: 3,
    status: "ok",
    declaredSignals: {},
  };
}

function persistMeasurement(
  cycleId: number,
  instanceId: number,
  flowId: number,
  stepId: number,
  m: Measurement,
): number {
  return db
    .prepare(
      `INSERT INTO measurement
        (cycle_id, instance_id, flow_id, step_id, duration_ms, ttfb_ms, bytes, request_count, status, declared_signals)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      cycleId,
      instanceId,
      flowId,
      stepId,
      m.durationMs,
      m.ttfbMs,
      m.bytes,
      m.requestCount,
      m.status,
      JSON.stringify(m.declaredSignals),
    ).lastInsertRowid as number;
}

function detect(measurementId: number, instanceId: number, flowId: number, stepId: number, m: Measurement): void {
  // Falha dura = Anomalia imediata, independente de estatística.
  if (m.status === "hard_failure") {
    recordAnomaly(measurementId, "duration_ms", "hard_failure", null, null, null, null);
    return;
  }

  for (const metric of METRICS) {
    const observed = metricValue(m, metric);
    if (observed === null) continue;

    const window = recentValues(instanceId, flowId, stepId, metric, measurementId);
    const e = evaluate(observed, window);
    upsertBaseline(instanceId, flowId, stepId, metric, window.length, e.median, e.mad);

    if (e.isAnomaly) {
      recordAnomaly(measurementId, metric, "statistical", e.median, e.mad, observed, e.deviations);
    }
  }
  // TODO: guarda de correlação + abertura/fechamento de Incidente (regra dos 2 ciclos).
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
  const col = metric; // nomes de coluna == nomes de métrica
  const rows = db
    .prepare(
      `SELECT ${col} AS v FROM measurement
       WHERE instance_id = ? AND flow_id = ? AND step_id = ? AND id <> ? AND ${col} IS NOT NULL
       ORDER BY captured_at DESC LIMIT ?`,
    )
    .all(instanceId, flowId, stepId, exclude, WINDOW_SIZE) as { v: number }[];
  return rows.map((r) => r.v);
}

function upsertBaseline(
  instanceId: number, flowId: number, stepId: number, metric: Metric,
  count: number, median: number, mad: number,
): void {
  db.prepare(
    `INSERT INTO baseline (instance_id, flow_id, step_id, metric, sample_count, median, mad, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(instance_id, flow_id, step_id, metric)
     DO UPDATE SET sample_count = excluded.sample_count, median = excluded.median,
                   mad = excluded.mad, updated_at = excluded.updated_at`,
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
