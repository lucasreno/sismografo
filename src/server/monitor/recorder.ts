// Gravação assistida de Fluxo. Abre um navegador visível no perfil persistente
// da Instância (a Sessão) e captura interações do usuário — clique, preenchimento,
// navegação — já no formato de Passo do domínio. Ao fechar o navegador, persiste.
//
// Depois de gravar, o usuário pode marcar o `value` de um `fill` como Parâmetro.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { db } from "../db/index.js";
import { sessionDir } from "./runner.js";

const RECORD_TIMEOUT_MS = 15 * 60 * 1000;

interface RecordedStep {
  kind: string;
  descriptor: Record<string, unknown>;
}

// Roda no navegador: gera um seletor estável e reporta cada interação.
const RECORDER_SCRIPT = `
(() => {
  function sel(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return '#' + CSS.escape(el.id);
    const testid = el.getAttribute('data-testid');
    if (testid) return '[data-testid="' + testid + '"]';
    const name = el.getAttribute('name');
    if (name) return el.tagName.toLowerCase() + '[name="' + name + '"]';
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 4) {
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const sibs = Array.prototype.filter.call(parent.children, (c) => c.tagName === node.tagName);
        if (sibs.length > 1) part += ':nth-of-type(' + (sibs.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }
  document.addEventListener('click', (e) => {
    const s = sel(e.target);
    if (s) window.__sismo_record({ kind: 'click', descriptor: { selector: s } });
  }, true);
  document.addEventListener('change', (e) => {
    const t = e.target;
    const s = sel(t);
    if (s && t && 'value' in t) window.__sismo_record({ kind: 'fill', descriptor: { selector: s, value: t.value } });
  }, true);
})();
`;

export async function recordFlow(instanceId: number, flowName: string): Promise<number> {
  const inst = db.prepare(`SELECT application_id, url FROM instance WHERE id=?`).get(instanceId) as
    | { application_id: number; url: string }
    | undefined;
  if (!inst) throw new Error(`Instância ${instanceId} não encontrada`);

  const dir = sessionDir(instanceId);
  mkdirSync(dir, { recursive: true });

  const context = await chromium.launchPersistentContext(dir, { headless: false });
  const steps: RecordedStep[] = [];

  await context.exposeBinding("__sismo_record", (_source, step: RecordedStep) => {
    steps.push(step);
  });
  await context.addInitScript(RECORDER_SCRIPT);

  const page = context.pages()[0] ?? (await context.newPage());
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) steps.push({ kind: "navigate", descriptor: { url: frame.url() } });
  });

  await page.goto(inst.url, { waitUntil: "domcontentloaded" }).catch(() => {});

  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, RECORD_TIMEOUT_MS);
    context.on("close", () => {
      clearTimeout(t);
      resolve();
    });
  });
  await context.close().catch(() => {});

  return persist(inst.application_id, flowName, steps);
}

function persist(applicationId: number, name: string, recorded: RecordedStep[]): number {
  // Remove navegações duplicadas consecutivas (goto + framenavigated).
  const steps: RecordedStep[] = [];
  for (const s of recorded) {
    const prev = steps[steps.length - 1];
    if (s.kind === "navigate" && prev?.kind === "navigate" && prev.descriptor.url === s.descriptor.url) continue;
    steps.push(s);
  }

  const tx = db.transaction(() => {
    const flowId = db.prepare(`INSERT INTO flow (application_id, name) VALUES (?, ?)`).run(applicationId, name)
      .lastInsertRowid as number;
    steps.forEach((s, i) =>
      db.prepare(`INSERT INTO step (flow_id, ordinal, kind, descriptor) VALUES (?, ?, ?, ?)`)
        .run(flowId, i + 1, s.kind, JSON.stringify(s.descriptor)),
    );
    return flowId;
  });
  return tx();
}
