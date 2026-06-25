// Agendador in-process (ver docs/adr/0003). Sem broker: um timer por Aplicação,
// respeitando cycle_interval_min e o estado de pausa.

import { db } from "../db/index.js";
import { runCycle } from "./cycle.js";

const timers = new Map<number, NodeJS.Timeout>();

interface AppRow {
  id: number;
  cycle_interval_min: number;
  paused: number;
  resume_at: string | null;
}

function isPaused(app: AppRow): boolean {
  if (!app.paused) return false;
  if (app.resume_at && new Date(app.resume_at) <= new Date()) {
    db.prepare(`UPDATE application SET paused = 0, pause_reason = NULL, resume_at = NULL WHERE id = ?`).run(app.id);
    return false; // auto-retomar
  }
  return true;
}

async function tick(applicationId: number): Promise<void> {
  const app = db.prepare(`SELECT id, cycle_interval_min, paused, resume_at FROM application WHERE id = ?`)
    .get(applicationId) as AppRow | undefined;
  if (!app || isPaused(app)) return;
  try {
    await runCycle(app.id, "scheduled");
  } catch (err) {
    console.error(`[scheduler] Ciclo da aplicação ${app.id} falhou:`, err);
  }
}

/** Inicia/reinicia o agendamento de todas as Aplicações. */
export function startScheduler(): void {
  for (const t of timers.values()) clearInterval(t);
  timers.clear();

  const apps = db.prepare(`SELECT id, cycle_interval_min, paused, resume_at FROM application`).all() as AppRow[];
  for (const app of apps) {
    const ms = Math.max(1, app.cycle_interval_min) * 60_000;
    timers.set(app.id, setInterval(() => void tick(app.id), ms));
  }
  console.log(`[scheduler] ${apps.length} aplicação(ões) agendada(s).`);
}
