// Execução real de Fluxo via Playwright. Usa um contexto persistente por
// Instância (= Sessão: cookies/login reusados entre Ciclos) e captura, por
// Passo, os sinais universais da Medição: duração, TTFB, bytes, nº de requisições.

import { chromium, type Page, type Response } from "playwright";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import type { Measurement } from "../domain/types.js";

const SESSIONS_DIR = join(process.cwd(), "sessions");

export interface StepDef {
  id: number;
  kind: string; // navigate | click | fill | wait
  descriptor: {
    selector?: string;
    url?: string;
    value?: string;
    param?: string; // referência a um Parâmetro (valor vem da Calibração)
    ms?: number;
  };
}

export interface StepMeasurement {
  stepId: number;
  measurement: Measurement;
}

export function sessionDir(instanceId: number): string {
  return join(SESSIONS_DIR, `instance-${instanceId}`);
}

/** Substitui {{param}} e referências `param` pelos valores da Calibração. */
function resolveValue(d: StepDef["descriptor"], params: Record<string, string>): string {
  if (d.param) return params[d.param] ?? "";
  const raw = d.value ?? "";
  return raw.replace(/\{\{(\w+)\}\}/g, (_, k: string) => params[k] ?? "");
}

async function runStep(page: Page, step: StepDef, baseUrl: string, params: Record<string, string>): Promise<void> {
  const d = step.descriptor;
  switch (step.kind) {
    case "navigate": {
      const target = resolveValue({ value: d.url ?? baseUrl }, params);
      const url = target.startsWith("http") ? target : new URL(target, baseUrl).toString();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      break;
    }
    case "click":
      await page.click(d.selector!, { timeout: 15_000 });
      break;
    case "fill":
      await page.fill(d.selector!, resolveValue(d, params), { timeout: 15_000 });
      break;
    case "wait":
      if (d.selector) await page.waitForSelector(d.selector, { timeout: 15_000 });
      else await page.waitForTimeout(d.ms ?? 1000);
      break;
    default:
      throw new Error(`Passo desconhecido: ${step.kind}`);
  }
}

/**
 * Executa um Fluxo inteiro num único contexto (a Sessão), produzindo uma
 * Medição por Passo. Para no primeiro Passo que falhar (fluxo quebrado).
 */
export async function executeFlow(
  instanceId: number,
  baseUrl: string,
  steps: StepDef[],
  params: Record<string, string>,
): Promise<StepMeasurement[]> {
  const userDataDir = sessionDir(instanceId);
  mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, { headless: true });
  const page = context.pages()[0] ?? (await context.newPage());

  // Acumuladores de rede, zerados a cada Passo.
  let bytes = 0;
  let requestCount = 0;
  let firstTtfb: number | null = null;

  const onResponse = async (res: Response) => {
    requestCount++;
    try {
      const t = res.request().timing();
      const ttfb = t.responseStart - t.requestStart;
      if (firstTtfb === null && ttfb >= 0) firstTtfb = ttfb;
    } catch {
      /* timing indisponível */
    }
    const cl = res.headers()["content-length"];
    if (cl) bytes += Number.parseInt(cl, 10) || 0;
    else bytes += await res.body().then((b) => b.length).catch(() => 0);
  };
  context.on("response", onResponse);

  const results: StepMeasurement[] = [];
  try {
    for (const step of steps) {
      bytes = 0;
      requestCount = 0;
      firstTtfb = null;
      const start = performance.now();
      let status: "ok" | "hard_failure" = "ok";
      try {
        await runStep(page, step, baseUrl, params);
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      } catch {
        status = "hard_failure";
      }
      const durationMs = performance.now() - start;
      results.push({
        stepId: step.id,
        measurement: { durationMs, ttfbMs: firstTtfb, bytes, requestCount, status, declaredSignals: {} },
      });
      if (status === "hard_failure") break;
    }
  } finally {
    context.off("response", onResponse);
    await context.close();
  }
  return results;
}
