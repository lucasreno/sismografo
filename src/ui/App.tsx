import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { api, ApiError } from "./api.js";
import type { Application, Flow, Incident, Instance } from "./types.js";
import {
  Badge,
  Button,
  Icon,
  Modal,
  Providers,
  useConfirm,
  useToast,
} from "./ui.js";
import { Brand } from "./brand.js";
import {
  fmtDate,
  incidentKindLabel,
  incidentStatusLabel,
  intentColor,
} from "./labels.js";
import { ApplicationDrawer } from "./views/applicationDrawer.js";
import { IncidentDrawer } from "./views/incidentDrawer.js";

// ============================================================= raiz =========
export function App() {
  return (
    <Providers>
      <Dashboard />
    </Providers>
  );
}

function Dashboard() {
  const toast = useToast();
  const [apps, setApps] = useState<Application[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [appOpen, setAppOpen] = useState<Application | null>(null);
  const [incOpen, setIncOpen] = useState<number | null>(null);
  const [newApp, setNewApp] = useState(false);
  const [settings, setSettings] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [a, i] = await Promise.all([
        api<Application[]>("/api/applications"),
        api<Incident[]>("/api/incidents"),
      ]);
      setApps(a);
      setIncidents(i);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Falha ao carregar dados.", "danger");
    }
  }, [toast]);
  useEffect(() => void refresh(), [refresh]);

  const openIncidents = incidents.filter((i) => i.status !== "resolved").length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="container topbar__inner">
          <Brand />
          <div className="topbar__spacer" />
          <Button variant="ghost" iconOnly icon="settings" aria-label="Configurações" onClick={() => setSettings(true)} />
          <Button variant="primary" icon="plus" onClick={() => setNewApp(true)}>
            Nova Aplicação
          </Button>
        </div>
      </header>

      <main className="container page">
        {/* ----------------------------------------------------- Aplicações */}
        <section className="section">
          <div className="section__head">
            <h2 className="section__title">Aplicações</h2>
            {apps.length > 0 && <span className="section__count">{apps.length}</span>}
          </div>

          {apps.length === 0 ? (
            <Onboarding onCreate={() => setNewApp(true)} />
          ) : (
            <div className="cards-grid">
              {apps.map((a) => (
                <AppCard
                  key={a.id}
                  app={a}
                  onOpen={() => setAppOpen(a)}
                  onChanged={refresh}
                />
              ))}
            </div>
          )}
        </section>

        {/* ----------------------------------------------------- Incidentes */}
        <section className="section">
          <div className="section__head">
            <h2 className="section__title">Incidentes</h2>
            {openIncidents > 0 && (
              <Badge intent="danger" dot pulse>
                {openIncidents} em aberto
              </Badge>
            )}
            <div className="section__spacer" />
            <span className="eyebrow">o livro de registros</span>
          </div>

          {incidents.length === 0 ? (
            <div className="empty">
              <div className="empty__icon">
                <Icon name="checkCircle" size={40} />
              </div>
              <h3 className="empty__title">O chão está estável</h3>
              <p className="empty__text">
                Nenhum Incidente registrado. Conforme os Ciclos rodam, qualquer tremor
                fora da Linha de Base aparece aqui.
              </p>
            </div>
          ) : (
            <div className="feed">
              {incidents.map((i) => (
                <IncidentRow key={i.id} incident={i} onOpen={() => setIncOpen(i.id)} />
              ))}
            </div>
          )}
        </section>
      </main>

      {appOpen && (
        <ApplicationDrawer app={appOpen} onClose={() => setAppOpen(null)} onChanged={refresh} />
      )}
      {incOpen !== null && (
        <IncidentDrawer incidentId={incOpen} onClose={() => setIncOpen(null)} onChanged={refresh} />
      )}
      {newApp && <NewAppModal onClose={() => setNewApp(false)} onCreated={refresh} />}
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
    </div>
  );
}

// ===================================================== cartão de Aplicação ==
function AppCard({
  app,
  onOpen,
  onChanged,
}: {
  app: Application;
  onOpen: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [instances, setInstances] = useState<Instance[] | null>(null);
  const [flows, setFlows] = useState<Flow[] | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ins, fl] = await Promise.all([
        api<Instance[]>(`/api/applications/${app.id}/instances`),
        api<Flow[]>(`/api/applications/${app.id}/flows`),
      ]);
      setInstances(ins);
      setFlows(fl);
    } catch {
      /* card resiliente: sem contagem, mostra só o essencial */
    }
  }, [app.id]);
  useEffect(() => void load(), [load]);

  const paused = !!app.paused;
  const accent = paused ? intentColor.neutral : intentColor.ok;

  const run = async () => {
    setRunning(true);
    try {
      await api(`/api/applications/${app.id}/run`, { method: "POST", body: "{}" });
      toast("Ciclo executado.", "ok");
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Falha ao rodar o Ciclo.", "danger");
    } finally {
      setRunning(false);
    }
  };

  const togglePause = async () => {
    try {
      await api(`/api/applications/${app.id}/${paused ? "resume" : "pause"}`, {
        method: "POST",
        body: "{}",
      });
      toast(paused ? "Aplicação retomada." : "Aplicação pausada.", "ok");
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Falha na operação.", "danger");
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Excluir "${app.name}"?`,
      body: "Remove em cascata todas as Instâncias, Fluxos, Medições e Incidentes. Não há como desfazer.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/applications/${app.id}`, { method: "DELETE" });
      toast("Aplicação excluída.", "ok");
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Falha ao excluir.", "danger");
    }
  };

  const hint = nextStep(instances, flows);

  return (
    <article className="appcard" style={{ "--accent": accent } as CSSProperties}>
      <div className="appcard__head">
        <div style={{ flex: 1 }}>
          <div className="appcard__title" onClick={onOpen} role="button" tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}>
            {app.name}
          </div>
          <div className="appcard__meta" style={{ marginTop: 6 }}>
            <span><Icon name="clock" size={13} /> Ciclo a cada <b>{app.cycle_interval_min} min</b></span>
            {instances && <span><b>{instances.length}</b> {instances.length === 1 ? "instância" : "instâncias"}</span>}
            {flows && <span><b>{flows.length}</b> {flows.length === 1 ? "fluxo" : "fluxos"}</span>}
          </div>
        </div>
        <Badge intent={paused ? "neutral" : "ok"} dot pulse={!paused}>
          {paused ? "Pausada" : "Ativa"}
        </Badge>
      </div>

      {hint && (
        <div className={hint.ok ? "nexthint nexthint--ok" : "nexthint"}>
          <Icon name={hint.ok ? "checkCircle" : "alert"} size={14} />
          {hint.text}
        </div>
      )}

      <div className="appcard__actions">
        <Button variant="secondary" size="sm" icon="sliders" onClick={onOpen}>
          Gerir
        </Button>
        <Button variant="secondary" size="sm" icon="play" loading={running} onClick={run}>
          Rodar Ciclo
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={paused ? "play" : "pause"}
          aria-label={paused ? "Retomar" : "Pausar"}
          onClick={togglePause}
        />
        <a
          className="btn btn--ghost btn--sm btn--icon"
          href={`/api/applications/${app.id}/report.pdf`}
          target="_blank"
          rel="noreferrer"
          aria-label="Baixar relatório PDF"
        >
          <Icon name="file" size={15} />
        </a>
        <div style={{ flex: 1 }} />
        <Button variant="danger" size="sm" iconOnly icon="trash" aria-label="Excluir Aplicação" onClick={remove} />
      </div>
    </article>
  );
}

// próximo passo no funil de configuração — torna o fluxo de uso óbvio
function nextStep(
  instances: Instance[] | null,
  flows: Flow[] | null,
): { text: string; ok: boolean } | null {
  if (instances === null || flows === null) return null;
  if (instances.length === 0) return { text: "Adicione uma Instância (a URL do alvo).", ok: false };
  if (instances.every((i) => i.session_status !== "active"))
    return { text: "Estabeleça a Sessão de uma Instância.", ok: false };
  if (flows.length === 0) return { text: "Grave ou crie um Fluxo para começar a medir.", ok: false };
  return { text: "Pronta para monitorar.", ok: true };
}

// ====================================================== linha de Incidente ==
function IncidentRow({ incident, onOpen }: { incident: Incident; onOpen: () => void }) {
  const status = incidentStatusLabel[incident.status];
  const kind = incidentKindLabel[incident.kind];
  const accent = intentColor[status.intent];
  return (
    <div
      className="incident"
      style={{ "--accent": accent } as CSSProperties}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
    >
      <span className="incident__id">#{incident.id}</span>
      <div className="incident__body">
        <div className="incident__title">
          Incidente {kind.text.toLowerCase()}
        </div>
        <div className="incident__sub">
          Aberto {fmtDate(incident.opened_at)}
          {incident.closed_at && ` · fechado ${fmtDate(incident.closed_at)}`}
        </div>
      </div>
      <Badge intent={kind.intent}>{kind.text}</Badge>
      <Badge intent={status.intent} dot>{status.text}</Badge>
      <Icon name="chevronRight" size={16} className="faint" />
    </div>
  );
}

// ============================================================ onboarding ====
function Onboarding({ onCreate }: { onCreate: () => void }) {
  const steps = [
    { t: "Crie uma Aplicação", d: "O software que você monitora — os Fluxos vivem aqui." },
    { t: "Adicione uma Instância", d: "Uma implantação concreta numa URL (cliente A, B, C…)." },
    { t: "Estabeleça a Sessão", d: "Faça login uma vez num navegador; os Ciclos reusam." },
    { t: "Grave um Fluxo", d: "Uma jornada de navegador que exercita uma funcionalidade." },
    { t: "Deixe rodar", d: "O Sismógrafo aprende o normal e registra os tremores." },
  ];
  return (
    <div className="empty">
      <div className="empty__icon">
        <Icon name="activity" size={40} />
      </div>
      <h3 className="empty__title">Bem-vindo ao Sismógrafo</h3>
      <p className="empty__text">
        Monitore aplicações web replayando jornadas gravadas, aprenda o comportamento
        normal e registre desvios como Incidentes investigáveis. Comece em 5 passos:
      </p>
      <div className="guide">
        {steps.map((s, n) => (
          <div className="guide__step" key={n}>
            <span className="guide__num">{n + 1}</span>
            <span className="guide__txt">
              <b>{s.t}</b>
              <span>{s.d}</span>
            </span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 24 }}>
        <Button variant="primary" icon="plus" onClick={onCreate}>
          Criar primeira Aplicação
        </Button>
      </div>
    </div>
  );
}

// ===================================================== modal: nova Aplicação =
function NewAppModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [interval, setInterval] = useState(60);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api("/api/applications", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), cycleIntervalMin: interval }),
      });
      toast("Aplicação criada.", "ok");
      onCreated();
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Falha ao criar.", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Nova Aplicação"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon="plus" loading={busy} onClick={submit}>Criar</Button>
        </>
      }
    >
      <div className="field">
        <label className="field__label" htmlFor="app-name">Nome</label>
        <input
          id="app-name"
          className="input"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="ex.: Portal do Cliente"
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="app-interval">Intervalo do Ciclo (minutos)</label>
        <input
          id="app-interval"
          className="input input--mono"
          type="number"
          min={1}
          value={interval}
          onChange={(e) => setInterval(Math.max(1, Number(e.target.value) || 1))}
        />
        <span className="field__hint">Com que frequência o agendador roda todos os Fluxos contra as Instâncias.</span>
      </div>
    </Modal>
  );
}

// ====================================================== modal: configurações =
function SettingsModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [webhook, setWebhook] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!webhook.trim()) return;
    setBusy(true);
    try {
      await api("/api/settings/gchat", {
        method: "PUT",
        body: JSON.stringify({ webhook: webhook.trim() }),
      });
      toast("Webhook salvo.", "ok");
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Falha ao salvar.", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Configurações"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          <Button variant="primary" icon="check" loading={busy} onClick={save}>Salvar</Button>
        </>
      }
    >
      <div className="field">
        <label className="field__label" htmlFor="gchat">
          <Icon name="bell" size={14} /> Webhook do Google Chat
        </label>
        <input
          id="gchat"
          className="input input--mono"
          value={webhook}
          onChange={(e) => setWebhook(e.target.value)}
          placeholder="https://chat.googleapis.com/v1/spaces/…"
        />
        <span className="field__hint">
          Notificações de novos Incidentes são enviadas a este espaço do Google Chat.
        </span>
      </div>
    </Modal>
  );
}
