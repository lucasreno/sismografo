// Relatório em PDF via Playwright (reusa o navegador — ver docs/adr/0003).
// Consolida Incidente(s) com Sintomas, Diagnóstico, Plano de Ação e um
// "sismograma" (sparkline SVG) da métrica afetada. Público interno; sem segredos.

import { chromium } from "playwright";
import { db } from "./db/index.js";

interface IncidentRow {
  id: number;
  application_id: number;
  instance_id: number | null;
  flow_id: number | null;
  step_id: number | null;
  metric: string | null;
  kind: string;
  status: string;
  opened_at: string;
  closed_at: string | null;
  diagnosis: string | null;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Sparkline SVG (o sismograma) da métrica `duration_ms` do combo do Incidente. */
function sparkline(inc: IncidentRow): string {
  if (inc.instance_id === null || inc.flow_id === null || inc.step_id === null) return "";
  const rows = db
    .prepare(
      `SELECT duration_ms AS v FROM measurement
       WHERE instance_id=? AND flow_id=? AND step_id=? AND duration_ms IS NOT NULL
       ORDER BY captured_at DESC LIMIT 60`,
    )
    .all(inc.instance_id, inc.flow_id, inc.step_id) as { v: number }[];
  const vals = rows.map((r) => r.v).reverse();
  if (vals.length < 2) return "<p><em>Sem amostras suficientes para o sismograma.</em></p>";

  const w = 600, h = 120, pad = 8;
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const pts = vals
    .map((v, i) => {
      const x = pad + (i / (vals.length - 1)) * (w - 2 * pad);
      const y = h - pad - ((v - min) / range) * (h - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="border:1px solid #ddd;background:#fafafa">
    <polyline fill="none" stroke="#c0392b" stroke-width="1.5" points="${pts}"/>
  </svg>
  <p style="color:#666;font-size:12px">duration_ms — min ${min.toFixed(0)} / max ${max.toFixed(0)} (últimas ${vals.length} Medições)</p>`;
}

function incidentSection(inc: IncidentRow): string {
  const symptoms = db
    .prepare(
      `SELECT metric, kind, expected_median, expected_mad, observed, deviations, detected_at
       FROM anomaly WHERE incident_id=? ORDER BY detected_at`,
    )
    .all(inc.id) as Record<string, unknown>[];
  const actions = db
    .prepare(`SELECT description, owner, status FROM action WHERE incident_id=? ORDER BY id`)
    .all(inc.id) as Record<string, unknown>[];

  const instName = inc.instance_id
    ? (db.prepare(`SELECT name FROM instance WHERE id=?`).get(inc.instance_id) as { name: string } | undefined)?.name
    : "—";

  const symptomRows = symptoms
    .map(
      (s) => `<tr>
        <td>${esc(s.metric)}</td><td>${esc(s.kind)}</td>
        <td>${s.expected_median != null ? `${Number(s.expected_median).toFixed(0)} ± ${Number(s.expected_mad).toFixed(0)}` : "—"}</td>
        <td>${s.observed != null ? Number(s.observed).toFixed(0) : "—"}</td>
        <td>${s.deviations != null ? Number(s.deviations).toFixed(1) : "—"}</td>
        <td>${esc(s.detected_at)}</td></tr>`,
    )
    .join("");

  const actionRows = actions.length
    ? actions.map((a) => `<tr><td>${esc(a.description)}</td><td>${esc(a.owner)}</td><td>${esc(a.status)}</td></tr>`).join("")
    : `<tr><td colspan="3"><em>Plano de Ação ainda não preenchido.</em></td></tr>`;

  return `
  <section style="margin:24px 0;padding-top:16px;border-top:2px solid #333">
    <h2>Incidente #${inc.id} — ${inc.kind === "environmental" ? "Ambiental" : "Aplicação"}</h2>
    <p><strong>Instância:</strong> ${esc(instName)} ·
       <strong>Status:</strong> ${esc(inc.status)} ·
       <strong>Aberto:</strong> ${esc(inc.opened_at)} ·
       <strong>Recuperado:</strong> ${esc(inc.closed_at ?? "em curso")}</p>

    <h3>Sismograma</h3>
    ${sparkline(inc)}

    <h3>Sintomas</h3>
    <table><thead><tr><th>Métrica</th><th>Tipo</th><th>Esperado</th><th>Observado</th><th>Desvios</th><th>Detectado</th></tr></thead>
      <tbody>${symptomRows || '<tr><td colspan="6"><em>Sem sintomas vinculados.</em></td></tr>'}</tbody></table>

    <h3>Diagnóstico</h3>
    <p>${inc.diagnosis ? esc(inc.diagnosis) : "<em>Pendente de investigação.</em>"}</p>

    <h3>Plano de Ação</h3>
    <table><thead><tr><th>Ação</th><th>Responsável</th><th>Status</th></tr></thead><tbody>${actionRows}</tbody></table>
  </section>`;
}

function wrap(title: string, body: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    body{font-family:system-ui,Arial,sans-serif;color:#222;margin:32px}
    h1{border-bottom:3px solid #c0392b;padding-bottom:8px}
    table{border-collapse:collapse;width:100%;margin:8px 0;font-size:13px}
    th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}
    th{background:#f0f0f0}
  </style></head><body><h1>🌋 ${esc(title)}</h1>${body}</body></html>`;
}

async function htmlToPdf(html: string, outPath: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({ path: outPath, format: "A4", printBackground: true, margin: { top: "1cm", bottom: "1cm" } });
  } finally {
    await browser.close();
  }
  return outPath;
}

export function incidentReportHtml(incidentId: number): string {
  const inc = db.prepare(`SELECT * FROM incident WHERE id=?`).get(incidentId) as IncidentRow | undefined;
  if (!inc) throw new Error(`Incidente ${incidentId} não encontrado`);
  return wrap(`Relatório — Incidente #${inc.id}`, incidentSection(inc));
}

export function applicationReportHtml(applicationId: number, fromISO: string, toISO: string): string {
  const app = db.prepare(`SELECT name FROM application WHERE id=?`).get(applicationId) as { name: string } | undefined;
  const incidents = db
    .prepare(`SELECT * FROM incident WHERE application_id=? AND opened_at BETWEEN ? AND ? ORDER BY opened_at`)
    .all(applicationId, fromISO, toISO) as IncidentRow[];
  const body = incidents.length
    ? incidents.map(incidentSection).join("")
    : "<p>Nenhum Incidente no período. O chão esteve estável. 🌱</p>";
  return wrap(`Relatório — ${app?.name ?? "Aplicação"} (${fromISO} a ${toISO})`, body);
}

async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({ format: "A4", printBackground: true, margin: { top: "1cm", bottom: "1cm" } });
  } finally {
    await browser.close();
  }
}

export const generateIncidentPdf = (id: number, out: string) => htmlToPdf(incidentReportHtml(id), out);
export const generateApplicationPdf = (id: number, from: string, to: string, out: string) =>
  htmlToPdf(applicationReportHtml(id, from, to), out);
export const incidentPdfBuffer = (id: number) => htmlToPdfBuffer(incidentReportHtml(id));
export const applicationPdfBuffer = (id: number, from: string, to: string) =>
  htmlToPdfBuffer(applicationReportHtml(id, from, to));
