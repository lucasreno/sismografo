import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { runCycle } from "../monitor/cycle.js";
import { startScheduler } from "../monitor/scheduler.js";

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

  // --- Incidentes (o livro de registros) ---
  app.get("/api/incidents", async () =>
    db.prepare(`SELECT * FROM incident ORDER BY opened_at DESC`).all(),
  );

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
