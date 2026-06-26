import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { runCycle } from "../monitor/cycle.js";
import { startScheduler } from "../monitor/scheduler.js";
import { establishSession, removeSessionDir } from "../session.js";
import { recordFlow } from "../monitor/recorder.js";
import { setSecret, secretKey, deleteSecretsWhere } from "../secrets.js";
import { incidentPdfBuffer, applicationPdfBuffer } from "../report.js";

// API REST mínima (esqueleto). Expande por agregado conforme a UI cresce.
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => ({ ok: true }));

  // --- Aplicações ---
  app.get("/api/applications", async () =>
    db.prepare(`SELECT * FROM application ORDER BY name`).all(),
  );

  const newApp = z.object({ name: z.string().min(1), cycleIntervalMin: z.number().int().positive().default(60) });
  app.post("/api/applications", async (req, reply) => {
    const body = newApp.parse(req.body);
    const id = db
      .prepare(`INSERT INTO application (name, cycle_interval_min) VALUES (?, ?)`)
      .run(body.name, body.cycleIntervalMin).lastInsertRowid;
    startScheduler();
    return reply.code(201).send({ id });
  });

  // Pausar / retomar (Instância/Aplicação/global é o mesmo verbo em escopos distintos).
  const pause = z.object({ reason: z.string().optional(), resumeAt: z.string().optional() });
  app.post("/api/applications/:id/pause", async (req) => {
    const { id } = req.params as { id: string };
    const body = pause.parse(req.body ?? {});
    db.prepare(`UPDATE application SET paused = 1, pause_reason = ?, resume_at = ? WHERE id = ?`)
      .run(body.reason ?? null, body.resumeAt ?? null, id);
    return { ok: true };
  });
  app.post("/api/applications/:id/resume", async (req) => {
    const { id } = req.params as { id: string };
    db.prepare(`UPDATE application SET paused = 0, pause_reason = NULL, resume_at = NULL WHERE id = ?`).run(id);
    return { ok: true };
  });

  // Disparo manual de Ciclo.
  app.post("/api/applications/:id/run", async (req) => {
    const { id } = req.params as { id: string };
    const cycleId = await runCycle(Number(id), "manual");
    return { cycleId };
  });

  // Excluir Aplicação: o banco cascateia (Instâncias, Fluxos, Medições, Incidentes…).
  // Fora do cascade: step_state (sem FK de propósito), cofre e perfis de Sessão em disco.
  app.delete("/api/applications/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const appId = Number(id);
    const exists = db.prepare(`SELECT 1 FROM application WHERE id=?`).get(appId);
    if (!exists) return reply.code(404).send({ error: "Aplicação não encontrada" });

    const instances = db.prepare(`SELECT id FROM instance WHERE application_id=?`).all(appId) as { id: number }[];
    const flows = db.prepare(`SELECT id FROM flow WHERE application_id=?`).all(appId) as { id: number }[];
    db.transaction(() => {
      for (const f of flows) db.prepare(`DELETE FROM step_state WHERE flow_id=?`).run(f.id);
      db.prepare(`DELETE FROM application WHERE id=?`).run(appId);
    })();
    for (const f of flows) deleteSecretsWhere((k) => k.startsWith(`flow:${f.id}:`));
    for (const i of instances) removeSessionDir(i.id);
    startScheduler(); // descarta o timer da Aplicação removida
    return { ok: true };
  });

  // --- Instâncias ---
  app.get("/api/applications/:id/instances", async (req) => {
    const { id } = req.params as { id: string };
    return db.prepare(`SELECT * FROM instance WHERE application_id = ? ORDER BY name`).all(id);
  });

  const newInstance = z.object({ name: z.string().min(1), url: z.string().url() });
  app.post("/api/applications/:id/instances", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = newInstance.parse(req.body);
    const insId = db
      .prepare(`INSERT INTO instance (application_id, name, url) VALUES (?, ?, ?)`)
      .run(id, body.name, body.url).lastInsertRowid;
    return reply.code(201).send({ id: insId });
  });

  // Excluir Instância: cascateia Calibrações/Medições/Linhas de Base; Incidentes ficam
  // com instance_id = NULL (preserva o livro). Fora do cascade: step_state, cofre, Sessão.
  app.delete("/api/instances/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const insId = Number(id);
    const exists = db.prepare(`SELECT 1 FROM instance WHERE id=?`).get(insId);
    if (!exists) return reply.code(404).send({ error: "Instância não encontrada" });

    db.transaction(() => {
      db.prepare(`DELETE FROM step_state WHERE instance_id=?`).run(insId);
      db.prepare(`DELETE FROM instance WHERE id=?`).run(insId);
    })();
    deleteSecretsWhere((k) => k.includes(`:instance:${insId}:`));
    removeSessionDir(insId);
    return { ok: true };
  });

  // --- Incidentes (o livro de registros) ---
  app.get("/api/incidents", async () =>
    db.prepare(`SELECT * FROM incident ORDER BY opened_at DESC`).all(),
  );

  // --- Fluxos (autoria) ---
  app.get("/api/applications/:id/flows", async (req) => {
    const { id } = req.params as { id: string };
    return db.prepare(`SELECT * FROM flow WHERE application_id = ? ORDER BY name`).all(id);
  });

  const newFlow = z.object({
    name: z.string().min(1),
    steps: z.array(z.object({ kind: z.string(), descriptor: z.record(z.unknown()).default({}) })).min(1),
    parameters: z.array(z.object({ name: z.string(), secret: z.boolean().default(false) })).default([]),
  });
  app.post("/api/applications/:id/flows", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = newFlow.parse(req.body);
    const tx = db.transaction(() => {
      const flowId = db.prepare(`INSERT INTO flow (application_id, name) VALUES (?, ?)`).run(id, body.name)
        .lastInsertRowid as number;
      body.steps.forEach((s, i) =>
        db.prepare(`INSERT INTO step (flow_id, ordinal, kind, descriptor) VALUES (?, ?, ?, ?)`)
          .run(flowId, i + 1, s.kind, JSON.stringify(s.descriptor)),
      );
      for (const p of body.parameters)
        db.prepare(`INSERT INTO parameter (flow_id, name, secret) VALUES (?, ?, ?)`).run(flowId, p.name, p.secret ? 1 : 0);
      return flowId;
    });
    return reply.code(201).send({ id: tx() });
  });

  // Excluir Fluxo: cascateia Passos/Parâmetros/Calibrações/Medições/Linhas de Base;
  // Incidentes ficam com flow_id = NULL. Fora do cascade: step_state e cofre.
  app.delete("/api/flows/:flowId", async (req, reply) => {
    const { flowId } = req.params as { flowId: string };
    const fid = Number(flowId);
    const exists = db.prepare(`SELECT 1 FROM flow WHERE id=?`).get(fid);
    if (!exists) return reply.code(404).send({ error: "Fluxo não encontrado" });

    db.transaction(() => {
      db.prepare(`DELETE FROM step_state WHERE flow_id=?`).run(fid);
      db.prepare(`DELETE FROM flow WHERE id=?`).run(fid);
    })();
    deleteSecretsWhere((k) => k.startsWith(`flow:${fid}:`));
    return { ok: true };
  });

  app.get("/api/flows/:flowId/steps", async (req) => {
    const { flowId } = req.params as { flowId: string };
    const steps = db.prepare(`SELECT id, ordinal, kind, descriptor FROM step WHERE flow_id=? ORDER BY ordinal`).all(flowId) as {
      id: number; ordinal: number; kind: string; descriptor: string;
    }[];
    const parameters = db.prepare(`SELECT id, name, secret FROM parameter WHERE flow_id=?`).all(flowId);
    return { steps: steps.map((s) => ({ ...s, descriptor: JSON.parse(s.descriptor) })), parameters };
  });

  // Gravação assistida: abre navegador visível e registra as interações como Passos.
  const record = z.object({ name: z.string().min(1) });
  app.post("/api/instances/:id/record", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = record.parse(req.body);
    const flowId = await recordFlow(Number(id), body.name);
    return reply.code(201).send({ flowId });
  });

  // Promove o valor literal de um Passo `fill` a Parâmetro (declaração + reescrita do Passo).
  const promote = z.object({ stepId: z.number().int(), paramName: z.string().min(1), secret: z.boolean().default(false) });
  app.post("/api/flows/:flowId/promote", async (req, reply) => {
    const { flowId } = req.params as { flowId: string };
    const body = promote.parse(req.body);
    const step = db.prepare(`SELECT descriptor FROM step WHERE id=? AND flow_id=?`).get(body.stepId, flowId) as
      | { descriptor: string }
      | undefined;
    if (!step) return reply.code(404).send({ error: "passo não encontrado" });

    db.transaction(() => {
      db.prepare(`INSERT OR IGNORE INTO parameter (flow_id, name, secret) VALUES (?, ?, ?)`)
        .run(flowId, body.paramName, body.secret ? 1 : 0);
      const d = JSON.parse(step.descriptor) as Record<string, unknown>;
      delete d.value;
      d.param = body.paramName;
      db.prepare(`UPDATE step SET descriptor=? WHERE id=?`).run(JSON.stringify(d), body.stepId);
    })();
    return { ok: true };
  });

  // --- Calibração (valores de Parâmetro por Instância; segredos vão ao cofre) ---
  const calib = z.object({
    instanceId: z.number().int(),
    values: z.record(z.string()).default({}),
    secrets: z.record(z.string()).default({}),
  });
  app.post("/api/flows/:flowId/calibrations", async (req) => {
    const { flowId } = req.params as { flowId: string };
    const body = calib.parse(req.body);
    const fid = Number(flowId);

    const calibId = db
      .prepare(
        `INSERT INTO calibration (flow_id, instance_id) VALUES (?, ?)
         ON CONFLICT(flow_id, instance_id) DO UPDATE SET created_at = created_at RETURNING id`,
      )
      .get(fid, body.instanceId) as { id: number };

    for (const [name, value] of Object.entries(body.values)) {
      const p = db.prepare(`SELECT id FROM parameter WHERE flow_id=? AND name=?`).get(fid, name) as { id: number } | undefined;
      if (!p) continue;
      db.prepare(
        `INSERT INTO calibration_value (calibration_id, parameter_id, value) VALUES (?, ?, ?)
         ON CONFLICT(calibration_id, parameter_id) DO UPDATE SET value = excluded.value`,
      ).run(calibId.id, p.id, value);
    }
    for (const [name, value] of Object.entries(body.secrets)) {
      setSecret(secretKey(fid, body.instanceId, name), value); // cofre cifrado, nunca no banco
    }
    return { ok: true };
  });

  // --- Sessão (estabelecer/renovar — abre navegador visível) ---
  app.post("/api/instances/:id/session/establish", async (req) => {
    const { id } = req.params as { id: string };
    await establishSession(Number(id));
    return { ok: true, status: "active" };
  });

  // --- Incidentes (detalhe, diagnóstico, plano de ação) ---
  app.get("/api/incidents/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const incident = db.prepare(`SELECT * FROM incident WHERE id=?`).get(id);
    if (!incident) return reply.code(404).send({ error: "não encontrado" });
    const symptoms = db.prepare(`SELECT * FROM anomaly WHERE incident_id=? ORDER BY detected_at`).all(id);
    const actions = db.prepare(`SELECT * FROM action WHERE incident_id=? ORDER BY id`).all(id);
    return { incident, symptoms, actions };
  });

  // Excluir Incidente do livro: cascateia o Plano de Ação; as Anomalias ficam com
  // incident_id = NULL (preserva o sismograma). Solta o vínculo em step_state para
  // que o detector possa abrir um novo Incidente se o sinal persistir.
  app.delete("/api/incidents/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const incId = Number(id);
    const exists = db.prepare(`SELECT 1 FROM incident WHERE id=?`).get(incId);
    if (!exists) return reply.code(404).send({ error: "Incidente não encontrado" });

    db.transaction(() => {
      db.prepare(`UPDATE step_state SET open_incident_id=NULL WHERE open_incident_id=?`).run(incId);
      db.prepare(`DELETE FROM incident WHERE id=?`).run(incId);
    })();
    return { ok: true };
  });

  const diag = z.object({
    diagnosis: z.string().optional(),
    status: z.enum(["open", "investigating", "diagnosed", "resolved"]).optional(),
  });
  app.post("/api/incidents/:id/diagnosis", async (req) => {
    const { id } = req.params as { id: string };
    const body = diag.parse(req.body);
    if (body.diagnosis !== undefined) db.prepare(`UPDATE incident SET diagnosis=? WHERE id=?`).run(body.diagnosis, id);
    if (body.status !== undefined) db.prepare(`UPDATE incident SET status=? WHERE id=?`).run(body.status, id);
    return { ok: true };
  });

  const newAction = z.object({ description: z.string().min(1), owner: z.string().optional() });
  app.post("/api/incidents/:id/actions", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = newAction.parse(req.body);
    const actionId = db.prepare(`INSERT INTO action (incident_id, description, owner) VALUES (?, ?, ?)`)
      .run(id, body.description, body.owner ?? null).lastInsertRowid;
    return reply.code(201).send({ id: actionId });
  });

  const actionPatch = z.object({ status: z.enum(["todo", "doing", "done"]) });
  app.patch("/api/actions/:id", async (req) => {
    const { id } = req.params as { id: string };
    const body = actionPatch.parse(req.body);
    db.prepare(`UPDATE action SET status=? WHERE id=?`).run(body.status, id);
    return { ok: true };
  });

  // Excluir uma Ação do Plano de Ação.
  app.delete("/api/actions/:id", async (req) => {
    const { id } = req.params as { id: string };
    db.prepare(`DELETE FROM action WHERE id=?`).run(id);
    return { ok: true };
  });

  // --- Relatórios (PDF via Playwright) ---
  app.get("/api/incidents/:id/report.pdf", async (req, reply) => {
    const { id } = req.params as { id: string };
    const pdf = await incidentPdfBuffer(Number(id));
    return reply.type("application/pdf").send(pdf);
  });

  app.get("/api/applications/:id/report.pdf", async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { from?: string; to?: string };
    const from = q.from ?? "0000-01-01";
    const to = q.to ?? "9999-12-31";
    const pdf = await applicationPdfBuffer(Number(id), from, to);
    return reply.type("application/pdf").send(pdf);
  });

  // --- Configuração de notificação (Google Chat) ---
  const gchat = z.object({ webhook: z.string().url() });
  app.put("/api/settings/gchat", async (req) => {
    const body = gchat.parse(req.body);
    db.prepare(
      `INSERT INTO setting (key, value) VALUES ('gchat_webhook', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(body.webhook);
    return { ok: true };
  });
}
