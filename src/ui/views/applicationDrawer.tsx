// Drawer de detalhe da Aplicação: Instâncias (sessão, gravação, exclusão) e
// Fluxos (passos, promoção de parâmetro, calibração, criação manual).
// Substitui todos os window.prompt/confirm/alert por formulários e modais reais.
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api.js";
import type { Application, Flow, Instance, Parameter, Step } from "../types.js";
import {
  Badge,
  Button,
  Drawer,
  Icon,
  Modal,
  Spinner,
  useConfirm,
  useToast,
} from "../ui.js";
import { sessionLabel } from "../labels.js";

type Toast = (msg: string, intent?: "ok" | "danger" | "info") => void;

function failWith(toast: Toast) {
  return (e: unknown) =>
    toast(e instanceof ApiError ? e.message : "Algo deu errado. Tente novamente.", "danger");
}

export function ApplicationDrawer({
  app,
  onClose,
  onChanged,
}: {
  app: Application;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const fail = failWith(toast);

  const [instances, setInstances] = useState<Instance[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [inst, setInst] = useState({ name: "", url: "" });
  const [adding, setAdding] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [recordFor, setRecordFor] = useState<Instance | null>(null);

  const load = useCallback(async () => {
    try {
      setInstances(await api(`/api/applications/${app.id}/instances`));
      setFlows(await api(`/api/applications/${app.id}/flows`));
    } catch (e) {
      fail(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id]);
  useEffect(() => void load(), [load]);

  const addInstance = async () => {
    if (!inst.name.trim() || !inst.url.trim()) return;
    setAdding(true);
    try {
      await api(`/api/applications/${app.id}/instances`, {
        method: "POST",
        body: JSON.stringify(inst),
      });
      setInst({ name: "", url: "" });
      await load();
      onChanged();
    } catch (e) {
      fail(e);
    } finally {
      setAdding(false);
    }
  };

  const establish = async (i: Instance) => {
    setBanner(`Abrindo navegador para autenticar “${i.name}”. Faça login e feche a janela ao terminar.`);
    try {
      await api(`/api/instances/${i.id}/session/establish`, { method: "POST" });
      toast("Sessão estabelecida.", "ok");
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBanner(null);
    }
  };

  const startRecord = async (i: Instance, name: string) => {
    setRecordFor(null);
    setBanner("Gravando… interaja no navegador aberto e feche-o ao terminar.");
    try {
      await api(`/api/instances/${i.id}/record`, { method: "POST", body: JSON.stringify({ name }) });
      toast("Fluxo gravado.", "ok");
      await load();
      onChanged();
    } catch (e) {
      fail(e);
    } finally {
      setBanner(null);
    }
  };

  const delInstance = async (i: Instance) => {
    const ok = await confirm({
      title: `Excluir a Instância “${i.name}”?`,
      body: "Remove suas Calibrações, Medições e a Sessão salva. Não há desfazer.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/instances/${i.id}`, { method: "DELETE" });
      await load();
      onChanged();
    } catch (e) {
      fail(e);
    }
  };

  return (
    <Drawer
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon name="monitor" /> {app.name}
        </span>
      }
      subtitle={`Ciclo a cada ${app.cycle_interval_min} min`}
      onClose={onClose}
    >
      {banner && (
        <div className="banner" style={{ marginBottom: 20 }}>
          <Spinner />
          <span>{banner}</span>
        </div>
      )}

      {/* ---------------------------------------------------------- Instâncias */}
      <section className="block">
        <div className="block__head">
          <Icon name="globe" size={16} />
          <span className="block__title">Instâncias</span>
          <span className="block__spacer" />
          <span className="faint" style={{ fontSize: 13 }}>{instances.length}</span>
        </div>

        {instances.length === 0 ? (
          <div className="nexthint" style={{ marginBottom: 12 }}>
            <Icon name="alert" size={15} />
            Adicione uma Instância para liberar Sessão e Fluxos.
          </div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            {instances.map((i) => {
              const sl = sessionLabel[i.session_status] ?? sessionLabel.none;
              return (
                <div className="row" key={i.id}>
                  <div className="row__main">
                    <div className="row__name">{i.name}</div>
                    <div className="row__sub mono">{i.url}</div>
                  </div>
                  <Badge intent={sl.intent} dot>
                    {sl.text}
                  </Badge>
                  <div className="row__actions">
                    <Button size="sm" variant="secondary" icon="signal" onClick={() => establish(i)}>
                      Sessão
                    </Button>
                    <Button size="sm" variant="secondary" icon="video" onClick={() => setRecordFor(i)}>
                      Gravar Fluxo
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      iconOnly
                      icon="trash"
                      aria-label={`Excluir Instância ${i.name}`}
                      onClick={() => delInstance(i)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="inline-form">
          <div className="field">
            <label className="field__label" htmlFor="inst-name">Nome</label>
            <input
              id="inst-name"
              className="input"
              value={inst.name}
              onChange={(e) => setInst({ ...inst, name: e.target.value })}
              placeholder="ex.: Cliente X"
            />
          </div>
          <div className="field" style={{ flex: 2 }}>
            <label className="field__label" htmlFor="inst-url">URL</label>
            <input
              id="inst-url"
              className="input input--mono"
              value={inst.url}
              onChange={(e) => setInst({ ...inst, url: e.target.value })}
              placeholder="https://…"
              onKeyDown={(e) => e.key === "Enter" && void addInstance()}
            />
          </div>
          <Button variant="primary" icon="plus" loading={adding} onClick={() => void addInstance()}>
            Adicionar
          </Button>
        </div>
      </section>

      <hr className="divider" />

      {/* --------------------------------------------------------------- Fluxos */}
      <section className="block">
        <div className="block__head">
          <Icon name="layers" size={16} />
          <span className="block__title">Fluxos</span>
          <span className="block__spacer" />
          <span className="faint" style={{ fontSize: 13 }}>{flows.length}</span>
        </div>

        {flows.length === 0 && instances.length > 0 && (
          <div className="nexthint" style={{ marginBottom: 12 }}>
            <Icon name="alert" size={15} />
            Grave ou crie um Fluxo para começar a medir.
          </div>
        )}

        {flows.map((f) => (
          <FlowRow
            key={f.id}
            flow={f}
            instances={instances}
            onDeleted={() => {
              void load();
              onChanged();
            }}
          />
        ))}

        <FlowBuilder
          appId={app.id}
          onCreated={() => {
            void load();
            onChanged();
          }}
        />
      </section>

      {recordFor && (
        <RecordModal
          instance={recordFor}
          onClose={() => setRecordFor(null)}
          onSubmit={(name) => void startRecord(recordFor, name)}
        />
      )}
    </Drawer>
  );
}

/* ---------------------------------------------------------------- FlowRow --- */
function FlowRow({
  flow,
  instances,
  onDeleted,
}: {
  flow: Flow;
  instances: Instance[];
  onDeleted: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const fail = failWith(toast);

  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [params, setParams] = useState<Parameter[]>([]);
  const [calibrate, setCalibrate] = useState(false);
  const [promote, setPromote] = useState<Step | null>(null);

  const loadSteps = useCallback(async () => {
    try {
      const r = await api<{ steps: Step[]; parameters: Parameter[] }>(`/api/flows/${flow.id}/steps`);
      setSteps(r.steps);
      setParams(r.parameters);
      setLoaded(true);
    } catch (e) {
      fail(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.id]);

  const toggle = async () => {
    if (!loaded) await loadSteps();
    setOpen((o) => !o);
  };

  const openCalibrate = async () => {
    if (!loaded) await loadSteps();
    setCalibrate(true);
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Excluir o Fluxo “${flow.name}”?`,
      body: "Remove Passos, Parâmetros, Calibrações e Medições. Não há desfazer.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/flows/${flow.id}`, { method: "DELETE" });
      onDeleted();
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="layers" size={15} />
        <span className="row__name" style={{ flex: 1 }}>{flow.name}</span>
        <Button size="sm" variant="ghost" icon={open ? "chevronDown" : "chevronRight"} onClick={() => void toggle()}>
          Passos
        </Button>
        <Button size="sm" variant="secondary" icon="sliders" onClick={() => void openCalibrate()}>
          Calibrar
        </Button>
        <Button
          size="sm"
          variant="danger"
          iconOnly
          icon="trash"
          aria-label={`Excluir Fluxo ${flow.name}`}
          onClick={() => void remove()}
        />
      </div>

      {open && (
        <div>
          {params.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {params.map((p) => (
                <Badge key={p.id} intent={p.secret ? "warn" : "brand"}>
                  {p.secret ? <Icon name="lock" size={12} /> : null}
                  {p.name}
                </Badge>
              ))}
            </div>
          )}
          <ol className="steps">
            {steps.map((s) => {
              const promotable = s.kind === "fill" && "value" in s.descriptor;
              return (
                <li className="step" key={s.id}>
                  <span className="step__num">{s.ordinal}</span>
                  <span className="step__kind">{s.kind}</span>
                  <span className="step__desc">{JSON.stringify(s.descriptor)}</span>
                  {promotable && (
                    <button className="linkbtn" style={{ flex: "none" }} onClick={() => setPromote(s)}>
                      <Icon name="promote" size={13} /> Parâmetro
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {calibrate && (
        <CalibrateModal
          flowId={flow.id}
          instances={instances}
          parameters={params}
          onClose={() => setCalibrate(false)}
        />
      )}
      {promote && (
        <PromoteModal
          flowId={flow.id}
          step={promote}
          onClose={() => setPromote(null)}
          onDone={() => {
            setPromote(null);
            void loadSteps();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ FlowBuilder --- */
type BuildRow = { kind: string; field: string };

function FlowBuilder({ appId, onCreated }: { appId: number; onCreated: () => void }) {
  const toast = useToast();
  const fail = failWith(toast);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<BuildRow[]>([{ kind: "navigate", field: "" }]);
  const [saving, setSaving] = useState(false);

  const placeholderFor = (kind: string) =>
    kind === "navigate" ? "https://… (url)" : kind === "wait" ? "ms (ex.: 1000)" : "seletor CSS";

  const submit = async () => {
    if (!name.trim()) return;
    const steps = rows.map((r) => {
      if (r.kind === "navigate") return { kind: "navigate", descriptor: { url: r.field } };
      if (r.kind === "wait") return { kind: "wait", descriptor: { ms: Number(r.field) || 1000 } };
      return { kind: r.kind, descriptor: { selector: r.field } };
    });
    setSaving(true);
    try {
      await api(`/api/applications/${appId}/flows`, {
        method: "POST",
        body: JSON.stringify({ name, steps }),
      });
      setName("");
      setRows([{ kind: "navigate", field: "" }]);
      setOpen(false);
      toast("Fluxo criado.", "ok");
      onCreated();
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div style={{ marginTop: 12 }}>
        <Button variant="ghost" icon="pencil" onClick={() => setOpen(true)}>
          Criar Fluxo manualmente
        </Button>
      </div>
    );
  }

  return (
    <div className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10, marginTop: 12 }}>
      <div className="field">
        <label className="field__label" htmlFor="flow-name">Nome do Fluxo</label>
        <input
          id="flow-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex.: Consultar competência"
        />
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 8 }}>
          <select
            className="select"
            style={{ maxWidth: 140 }}
            value={r.kind}
            onChange={(e) =>
              setRows(rows.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))
            }
          >
            <option value="navigate">navigate</option>
            <option value="click">click</option>
            <option value="fill">fill</option>
            <option value="wait">wait</option>
          </select>
          <input
            className="input input--mono"
            style={{ flex: 1 }}
            value={r.field}
            placeholder={placeholderFor(r.kind)}
            onChange={(e) =>
              setRows(rows.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))
            }
          />
        </div>
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        <Button size="sm" variant="ghost" icon="plus" onClick={() => setRows([...rows, { kind: "click", field: "" }])}>
          Passo
        </Button>
        <span style={{ flex: 1 }} />
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button size="sm" variant="primary" icon="check" loading={saving} onClick={() => void submit()}>
          Criar Fluxo
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- RecordModal */
function RecordModal({
  instance,
  onClose,
  onSubmit,
}: {
  instance: Instance;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <Modal
      title="Gravar Fluxo"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon="video" disabled={!name.trim()} onClick={() => onSubmit(name.trim())}>
            Iniciar gravação
          </Button>
        </>
      }
    >
      <p className="help">
        Um navegador visível abrirá em <b>{instance.name}</b>. Suas interações (cliques, preenchimentos,
        navegação) viram Passos. Feche a janela ao terminar.
      </p>
      <div className="field">
        <label className="field__label" htmlFor="rec-name">Nome do Fluxo</label>
        <input
          id="rec-name"
          className="input"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex.: Login e consulta"
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onSubmit(name.trim())}
        />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------- PromoteModal */
function PromoteModal({
  flowId,
  step,
  onClose,
  onDone,
}: {
  flowId: number;
  step: Step;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const fail = failWith(toast);
  const [paramName, setParamName] = useState("");
  const [secret, setSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!paramName.trim()) return;
    setSaving(true);
    try {
      await api(`/api/flows/${flowId}/promote`, {
        method: "POST",
        body: JSON.stringify({ stepId: step.id, paramName: paramName.trim(), secret }),
      });
      toast("Parâmetro criado.", "ok");
      onDone();
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Promover a Parâmetro"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon="promote" loading={saving} disabled={!paramName.trim()} onClick={() => void submit()}>
            Promover
          </Button>
        </>
      }
    >
      <p className="help">
        O valor fixo deste Passo <span className="mono">fill</span> vira uma entrada variável, calibrada por
        Instância.
      </p>
      <div className="field">
        <label className="field__label" htmlFor="param-name">Nome do Parâmetro</label>
        <input
          id="param-name"
          className="input"
          autoFocus
          value={paramName}
          onChange={(e) => setParamName(e.target.value)}
          placeholder="ex.: competencia"
        />
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
        É um segredo (vai para o cofre cifrado, nunca ao banco)
      </label>
    </Modal>
  );
}

/* ----------------------------------------------------------- CalibrateModal */
function CalibrateModal({
  flowId,
  instances,
  parameters,
  onClose,
}: {
  flowId: number;
  instances: Instance[];
  parameters: Parameter[];
  onClose: () => void;
}) {
  const toast = useToast();
  const fail = failWith(toast);
  const [instanceId, setInstanceId] = useState<number | "">(instances[0]?.id ?? "");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const setVal = (name: string, value: string) => setVals((v) => ({ ...v, [name]: value }));

  const submit = async () => {
    if (instanceId === "") return;
    const values: Record<string, string> = {};
    const secrets: Record<string, string> = {};
    for (const p of parameters) {
      const v = vals[p.name] ?? "";
      if (p.secret) secrets[p.name] = v;
      else values[p.name] = v;
    }
    setSaving(true);
    try {
      await api(`/api/flows/${flowId}/calibrations`, {
        method: "POST",
        body: JSON.stringify({ instanceId: Number(instanceId), values, secrets }),
      });
      toast("Calibração salva.", "ok");
      onClose();
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  };

  const noParams = parameters.length === 0;

  return (
    <Modal
      title="Calibrar Fluxo"
      wide
      onClose={onClose}
      footer={
        noParams ? (
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" icon="sliders" loading={saving} disabled={instanceId === ""} onClick={() => void submit()}>
              Salvar Calibração
            </Button>
          </>
        )
      }
    >
      {noParams ? (
        <p className="help">Este Fluxo não tem Parâmetros para calibrar.</p>
      ) : instances.length === 0 ? (
        <p className="help">Adicione uma Instância antes de calibrar.</p>
      ) : (
        <>
          <div className="field">
            <label className="field__label" htmlFor="calib-inst">Instância</label>
            <select
              id="calib-inst"
              className="select"
              value={instanceId}
              onChange={(e) => setInstanceId(Number(e.target.value))}
            >
              {instances.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
          {parameters.map((p) => (
            <div className="field" key={p.id}>
              <label className="field__label" htmlFor={`calib-${p.id}`}>
                {p.name} {p.secret ? <Icon name="lock" size={12} /> : null}
              </label>
              <input
                id={`calib-${p.id}`}
                className="input"
                type={p.secret ? "password" : "text"}
                value={vals[p.name] ?? ""}
                onChange={(e) => setVal(p.name, e.target.value)}
                placeholder={p.secret ? "valor secreto" : "valor"}
              />
            </div>
          ))}
          <p className="help">Segredos exigem a variável de ambiente SISMOGRAFO_MASTER no servidor.</p>
        </>
      )}
    </Modal>
  );
}
