// Estabelecer/renovar a Sessão de uma Instância (ver docs/adr/0002).
// Abre um navegador VISÍVEL no perfil persistente da Instância para o usuário
// logar (SSO/Keycloak, etc.). Ao fechar o navegador, a Sessão fica salva.

import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { db } from "./db/index.js";
import { sessionDir } from "./monitor/runner.js";

const ESTABLISH_TIMEOUT_MS = 10 * 60 * 1000; // 10 min para o usuário concluir o login

export async function establishSession(instanceId: number): Promise<void> {
  const inst = db.prepare(`SELECT url FROM instance WHERE id=?`).get(instanceId) as { url: string } | undefined;
  if (!inst) throw new Error(`Instância ${instanceId} não encontrada`);

  const dir = sessionDir(instanceId);
  mkdirSync(dir, { recursive: true });

  const context = await chromium.launchPersistentContext(dir, { headless: false });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(inst.url, { waitUntil: "domcontentloaded" }).catch(() => {});

  // Espera o usuário logar e fechar o navegador (ou expira o tempo).
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ESTABLISH_TIMEOUT_MS);
    context.on("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  await context.close().catch(() => {});

  db.prepare(`UPDATE instance SET session_status='active' WHERE id=?`).run(instanceId);
}

/** Marca a Sessão como expirada — pausa o monitoramento da Instância (não é Anomalia). */
export function markSessionExpired(instanceId: number): void {
  db.prepare(`UPDATE instance SET session_status='expired' WHERE id=?`).run(instanceId);
}

/** Apaga o perfil persistente da Instância em disco. Usado ao excluir a Instância. */
export function removeSessionDir(instanceId: number): void {
  rmSync(sessionDir(instanceId), { recursive: true, force: true });
}
