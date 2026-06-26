import { useEffect, useState, useCallback, type CSSProperties } from "react";

// ---------- tipos ----------
interface Application { id: number; name: string; cycle_interval_min: number; paused: number }
interface Instance { id: number; name: string; url: string; session_status: string; paused: number }
interface Flow { id: number; name: string }
interface Step { id: number; ordinal: number; kind: string; descriptor: Record<string, unknown> }
interface Parameter { id: number; name: string; secret: number }
interface Incident { id: number; kind: string; status: string; opened_at: string; closed_at: string | null }
interface IncidentDetail {
  incident: Incident & { diagnosis: string | null };
  symptoms: { id: number; metric: string; observed: number | null; deviations: number | null }[];
  actions: { id: number; description: string; owner: string | null; status: string }[];
}

async function api<T = unknown>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  return r.json() as Promise<T>;
}

// ---------- raiz ----------
export function App() {
  const [apps, setApps] = useState<Application[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [name, setName] = useState("");
  const [appOpen, setAppOpen] = useState<Application | null>(null);
  const [incOpen, setIncOpen] = useState<IncidentDetail | null>(null);

  const refresh = useCallback(async () => {
    setApps(await api("/api/applications"));
    setIncidents(await api("/api/incidents"));
  }, []);
  useEffect(() => void refresh(), [refresh]);

  const createApp = async () => {
    if (!name.trim()) return;
    await api("/api/applications", { method: "POST", body: JSON.stringify({ name }) });
    setName(""); void refresh();
  };
  const run = async (id: number) => { await api(`/api/applications/${id}/run`, { method: "POST", body: "{}" }); void refresh(); };
  const pause = async (id: number, paused: boolean) =>
    { await api(`/api/applications/${id}/${paused ? "resume" : "pause"}`, { method: "POST", body: "{}" }); void refresh(); };
  const openInc = async (id: number) => setIncOpen(await api(`/api/incidents/${id}`));
  const delApp = async (a: Application) => {
    if (!window.confirm(`Excluir a Aplicação "${a.name}"?\n\nRemove em cascata todas as Instâncias, Fluxos, Medições e Incidentes. Não há desfazer.`)) return;
    await api(`/api/applications/${a.id}`, { method: "DELETE" });
    if (appOpen?.id === a.id) setAppOpen(null);
    void refresh();
  };
  const delInc = async (i: Incident) => {
    if (!window.confirm(`Excluir o Incidente #${i.id} do livro?\n\nApaga o Plano de Ação; as Anomalias são preservadas (desvinculadas).`)) return;
    await api(`/api/incidents/${i.id}`, { method: "DELETE" });
    if (incOpen?.incident.id === i.id) setIncOpen(null);
    void refresh();
  };

  return (
    <main style={S.main}>
      <h1>🌋 Sismógrafo</h1>
      <p style={{ color: "#666" }}>Monitoramento de aplicações web — livro de sintomas e diagnósticos.</p>

      <section>
        <h2>Aplicações</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova Aplicação" style={S.input} />
          <button onClick={createApp} style={S.btn}>Adicionar</button>
        </div>
        {apps.length === 0 ? <p>Nenhuma Aplicação ainda.</p> : (
          <table style={S.table}>
            <thead><tr><th>Aplicação</th><th>Ciclo</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id}>
                  <td><button onClick={() => setAppOpen(a)} style={S.link}>{a.name}</button></td>
                  <td>{a.cycle_interval_min} min</td>
                  <td>{a.paused ? "⏸ pausada" : "▶ ativa"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button onClick={() => setAppOpen(a)} style={S.btn}>Gerir / Gravar Fluxo</button>{" "}
                    <button onClick={() => run(a.id)} style={S.btnGhost}>Rodar Ciclo</button>{" "}
                    <button onClick={() => pause(a.id, !!a.paused)} style={S.btnGhost}>{a.paused ? "Retomar" : "Pausar"}</button>{" "}
                    <a href={`/api/applications/${a.id}/report.pdf`} target="_blank" rel="noreferrer">PDF</a>{" "}
                    <button onClick={() => delApp(a)} style={S.btnDanger}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Incidentes</h2>
        {incidents.length === 0 ? <p>Sem Incidentes. O chão está estável. 🌱</p> : (
          <table style={S.table}>
            <thead><tr><th>#</th><th>Tipo</th><th>Status</th><th>Aberto</th><th></th></tr></thead>
            <tbody>
              {incidents.map((i) => (
                <tr key={i.id}>
                  <td>{i.id}</td><td>{i.kind}</td><td>{i.status}</td><td>{i.opened_at}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button onClick={() => openInc(i.id)} style={S.btnGhost}>Abrir</button>{" "}
                    <button onClick={() => delInc(i)} style={S.btnDanger}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {appOpen && <AppDetail app={appOpen} onClose={() => setAppOpen(null)} />}
      {incOpen && <IncidentPanel detail={incOpen} onClose={() => setIncOpen(null)} onChange={() => openInc(incOpen.incident.id)} />}
    </main>
  );
}

// ---------- detalhe da Aplicação: instâncias + fluxos ----------
function AppDetail({ app, onClose }: { app: Application; onClose: () => void }) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [inst, setInst] = useState({ name: "", url: "" });
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setInstances(await api(`/api/applications/${app.id}/instances`));
    setFlows(await api(`/api/applications/${app.id}/flows`));
  }, [app.id]);
  useEffect(() => void load(), [load]);

  const addInstance = async () => {
    if (!inst.name || !inst.url) return;
    await api(`/api/applications/${app.id}/instances`, { method: "POST", body: JSON.stringify(inst) });
    setInst({ name: "", url: "" }); void load();
  };
  const establish = async (id: number) => {
    setBusy("Abrindo navegador para login…");
    await api(`/api/instances/${id}/session/establish`, { method: "POST" });
    setBusy(""); void load();
  };
  const record = async (id: number) => {
    const name = window.prompt("Nome do Fluxo a gravar:");
    if (!name) return;
    setBusy("Gravando… interaja no navegador e feche-o ao terminar.");
    await api(`/api/instances/${id}/record`, { method: "POST", body: JSON.stringify({ name }) });
    setBusy(""); void load();
  };
  const delInstance = async (i: Instance) => {
    if (!window.confirm(`Excluir a Instância "${i.name}"?\n\nRemove suas Calibrações, Medições e a Sessão salva. Não há desfazer.`)) return;
    await api(`/api/instances/${i.id}`, { method: "DELETE" });
    void load();
  };

  return (
    <section style={S.panel}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>Aplicação: {app.name}</h2>
        <button onClick={onClose} style={S.btnGhost}>fechar</button>
      </div>
      {busy && <p style={{ color: "#c0392b" }}>⏳ {busy}</p>}

      <h3>Instâncias</h3>
      {instances.length === 0 && (
        <p style={{ color: "#c0392b" }}>➕ Adicione uma Instância abaixo para liberar <strong>Estabelecer Sessão</strong> e <strong>Gravar Fluxo</strong>.</p>
      )}
      <table style={S.table}>
        <thead><tr><th>Nome</th><th>URL</th><th>Sessão</th><th></th></tr></thead>
        <tbody>
          {instances.map((i) => (
            <tr key={i.id}>
              <td>{i.name}</td><td style={{ fontSize: 12 }}>{i.url}</td><td>{i.session_status}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button onClick={() => establish(i.id)} style={S.btnGhost}>Sessão</button>{" "}
                <button onClick={() => record(i.id)} style={S.btnGhost}>Gravar Fluxo</button>{" "}
                <button onClick={() => delInstance(i)} style={S.btnDanger}>Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input value={inst.name} onChange={(e) => setInst({ ...inst, name: e.target.value })} placeholder="Nome" style={S.input} />
        <input value={inst.url} onChange={(e) => setInst({ ...inst, url: e.target.value })} placeholder="https://…" style={{ ...S.input, flex: 1 }} />
        <button onClick={addInstance} style={S.btn}>Adicionar Instância</button>
      </div>

      <h3 style={{ marginTop: 20 }}>Fluxos</h3>
      {flows.map((f) => <FlowRow key={f.id} flow={f} instances={instances} onDeleted={load} />)}
      <FlowBuilder appId={app.id} onCreated={load} />
    </section>
  );
}

// ---------- linha de Fluxo: ver Passos, promover Parâmetro, calibrar ----------
function FlowRow({ flow, instances, onDeleted }: { flow: Flow; instances: Instance[]; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [params, setParams] = useState<Parameter[]>([]);

  const load = useCallback(async () => {
    const r = await api<{ steps: Step[]; parameters: Parameter[] }>(`/api/flows/${flow.id}/steps`);
    setSteps(r.steps); setParams(r.parameters);
  }, [flow.id]);
  const toggle = async () => { if (!open) await load(); setOpen(!open); };

  const promote = async (stepId: number) => {
    const paramName = window.prompt("Nome do Parâmetro (ex.: competencia):");
    if (!paramName) return;
    const secret = window.confirm("É um segredo (vai para o cofre cifrado)?");
    await api(`/api/flows/${flow.id}/promote`, { method: "POST", body: JSON.stringify({ stepId, paramName, secret }) });
    void load();
  };

  const calibrate = async () => {
    if (params.length === 0) { window.alert("Este Fluxo não tem Parâmetros."); return; }
    const instId = Number(window.prompt(`Instância (id) — ${instances.map((i) => `${i.id}:${i.name}`).join(", ")}`));
    if (!instId) return;
    const values: Record<string, string> = {}; const secrets: Record<string, string> = {};
    for (const p of params) {
      const v = window.prompt(`Valor de "${p.name}"${p.secret ? " (segredo)" : ""}:`);
      if (v === null) return;
      if (p.secret) secrets[p.name] = v; else values[p.name] = v;
    }
    await api(`/api/flows/${flow.id}/calibrations`, { method: "POST", body: JSON.stringify({ instanceId: instId, values, secrets }) });
    window.alert("Calibração salva.");
  };

  const remove = async () => {
    if (!window.confirm(`Excluir o Fluxo "${flow.name}"?\n\nRemove seus Passos, Parâmetros, Calibrações e Medições. Não há desfazer.`)) return;
    await api(`/api/flows/${flow.id}`, { method: "DELETE" });
    onDeleted();
  };

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 6, padding: 8, marginBottom: 6 }}>
      <strong>{flow.name}</strong>{" "}
      <button onClick={toggle} style={S.btnGhost}>{open ? "ocultar" : "Passos"}</button>{" "}
      <button onClick={calibrate} style={S.btnGhost}>Calibrar</button>{" "}
      <button onClick={remove} style={S.btnDanger}>Excluir</button>
      {open && (
        <ol style={{ marginTop: 8, fontSize: 13 }}>
          {steps.map((s) => (
            <li key={s.id}>
              <code>{s.kind}</code> {JSON.stringify(s.descriptor)}{" "}
              {s.kind === "fill" && "value" in s.descriptor && (
                <button onClick={() => promote(s.id)} style={S.linkSmall}>→ Parâmetro</button>
              )}
            </li>
          ))}
          {params.length > 0 && <p>Parâmetros: {params.map((p) => p.name + (p.secret ? "🔒" : "")).join(", ")}</p>}
        </ol>
      )}
    </div>
  );
}

// ---------- construtor manual de Fluxo ----------
function FlowBuilder({ appId, onCreated }: { appId: number; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [rows, setRows] = useState<{ kind: string; field: string }[]>([{ kind: "navigate", field: "" }]);

  const submit = async () => {
    if (!name.trim()) return;
    const steps = rows.map((r) => {
      if (r.kind === "navigate") return { kind: "navigate", descriptor: { url: r.field } };
      if (r.kind === "wait") return { kind: "wait", descriptor: { ms: Number(r.field) || 1000 } };
      return { kind: r.kind, descriptor: { selector: r.field } };
    });
    await api(`/api/applications/${appId}/flows`, { method: "POST", body: JSON.stringify({ name, steps }) });
    setName(""); setRows([{ kind: "navigate", field: "" }]); onCreated();
  };

  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: "pointer" }}>+ Criar Fluxo manualmente</summary>
      <div style={{ marginTop: 8 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do Fluxo" style={S.input} />
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <select value={r.kind} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, kind: e.target.value } : x))} style={S.input}>
              <option value="navigate">navigate</option>
              <option value="click">click</option>
              <option value="fill">fill</option>
              <option value="wait">wait</option>
            </select>
            <input value={r.field} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, field: e.target.value } : x))}
              placeholder={r.kind === "navigate" ? "url" : r.kind === "wait" ? "ms" : "seletor CSS"} style={{ ...S.input, flex: 1 }} />
          </div>
        ))}
        <div style={{ marginTop: 6 }}>
          <button onClick={() => setRows([...rows, { kind: "click", field: "" }])} style={S.btnGhost}>+ Passo</button>{" "}
          <button onClick={submit} style={S.btn}>Criar Fluxo</button>
        </div>
      </div>
    </details>
  );
}

// ---------- painel de Incidente ----------
function IncidentPanel({ detail, onClose, onChange }: { detail: IncidentDetail; onClose: () => void; onChange: () => void }) {
  const { incident } = detail;
  const [diagnosis, setDiagnosis] = useState(incident.diagnosis ?? "");
  const [action, setAction] = useState("");

  const saveDiag = async () => {
    await api(`/api/incidents/${incident.id}/diagnosis`, { method: "POST", body: JSON.stringify({ diagnosis, status: "diagnosed" }) });
    onChange();
  };
  const addAction = async () => {
    if (!action.trim()) return;
    await api(`/api/incidents/${incident.id}/actions`, { method: "POST", body: JSON.stringify({ description: action }) });
    setAction(""); onChange();
  };
  const delAction = async (actionId: number) => {
    await api(`/api/actions/${actionId}`, { method: "DELETE" });
    onChange();
  };

  return (
    <section style={S.panel}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>Incidente #{incident.id} ({incident.kind})</h2>
        <button onClick={onClose} style={S.btnGhost}>fechar</button>
      </div>
      <h3>Sintomas</h3>
      <ul>{detail.symptoms.map((s) => (
        <li key={s.id}>{s.metric}: observado {s.observed?.toFixed?.(0) ?? "—"} ({s.deviations?.toFixed?.(1) ?? "—"} desvios)</li>
      ))}</ul>
      <h3>Diagnóstico</h3>
      <textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} style={{ ...S.input, width: "100%", height: 60 }} />
      <button onClick={saveDiag} style={S.btn}>Salvar diagnóstico</button>
      <h3>Plano de Ação</h3>
      <ul>{detail.actions.map((a) => (
        <li key={a.id}>
          {a.description} — {a.owner ?? "—"} [{a.status}]{" "}
          <button onClick={() => delAction(a.id)} style={S.linkSmall}>excluir</button>
        </li>
      ))}</ul>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Nova ação" style={S.input} />
        <button onClick={addAction} style={S.btn}>Adicionar</button>
      </div>
      <p style={{ marginTop: 12 }}><a href={`/api/incidents/${incident.id}/report.pdf`} target="_blank" rel="noreferrer">⬇ Baixar Relatório PDF</a></p>
    </section>
  );
}

const S: Record<string, CSSProperties> = {
  main: { fontFamily: "system-ui", maxWidth: 920, margin: "2rem auto", padding: "0 1rem" },
  table: { borderCollapse: "collapse", width: "100%" },
  input: { padding: "6px 8px", border: "1px solid #ccc", borderRadius: 4 },
  btn: { padding: "6px 10px", background: "#c0392b", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" },
  btnGhost: { padding: "6px 10px", background: "#fff", color: "#333", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" },
  btnDanger: { padding: "6px 10px", background: "#fff", color: "#c0392b", border: "1px solid #e0b4b0", borderRadius: 4, cursor: "pointer" },
  link: { background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontWeight: 600, padding: 0 },
  linkSmall: { background: "none", border: "none", color: "#2980b9", cursor: "pointer", fontSize: 12, padding: 0 },
  panel: { marginTop: 24, padding: 16, border: "2px solid #c0392b", borderRadius: 8, background: "#fff8f7" },
};
