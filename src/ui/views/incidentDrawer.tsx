// Drawer de detalhe de Incidente: estado do ciclo de vida, sintomas (anomalias),
// diagnóstico, plano de ação e exportação de relatório. Substitui o IncidentPanel.
import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import type {
  ActionItem,
  ActionStatus,
  IncidentDetail,
  IncidentStatus,
} from "../types.js";
import { Badge, Button, Drawer, Icon, Spinner, useConfirm, useToast } from "../ui.js";
import {
  actionStatusLabel,
  fmtDate,
  fmtNumber,
  incidentKindLabel,
  incidentStatusLabel,
  prettyMetric,
} from "../labels.js";

const STATUS_ORDER: IncidentStatus[] = ["open", "investigating", "diagnosed", "resolved"];
const ACTION_CYCLE: ActionStatus[] = ["todo", "doing", "done"];

export function IncidentDrawer({
  incidentId,
  onClose,
  onChanged,
}: {
  incidentId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();

  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [diagnosis, setDiagnosis] = useState("");
  const [savingDiag, setSavingDiag] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const [actionDesc, setActionDesc] = useState("");
  const [actionOwner, setActionOwner] = useState("");
  const [addingAction, setAddingAction] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<IncidentDetail>(`/api/incidents/${incidentId}`);
      setDetail(d);
      setDiagnosis(d.incident.diagnosis ?? "");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Falha ao carregar incidente.", "danger");
    }
  }, [incidentId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = async (status: IncidentStatus) => {
    if (!detail || status === detail.incident.status) return;
    setSavingStatus(true);
    try {
      await api(`/api/incidents/${incidentId}/diagnosis`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      toast("Status atualizado.", "ok");
      await load();
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Falha ao atualizar status.", "danger");
    } finally {
      setSavingStatus(false);
    }
  };

  const saveDiagnosis = async () => {
    setSavingDiag(true);
    try {
      await api(`/api/incidents/${incidentId}/diagnosis`, {
        method: "POST",
        body: JSON.stringify({ diagnosis }),
      });
      toast("Diagnóstico salvo.", "ok");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Falha ao salvar diagnóstico.", "danger");
    } finally {
      setSavingDiag(false);
    }
  };

  const addAction = async () => {
    const description = actionDesc.trim();
    if (!description) return;
    setAddingAction(true);
    try {
      await api(`/api/incidents/${incidentId}/actions`, {
        method: "POST",
        body: JSON.stringify({ description, owner: actionOwner.trim() || undefined }),
      });
      setActionDesc("");
      setActionOwner("");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Falha ao adicionar ação.", "danger");
    } finally {
      setAddingAction(false);
    }
  };

  const cycleAction = async (a: ActionItem) => {
    const next = ACTION_CYCLE[(ACTION_CYCLE.indexOf(a.status) + 1) % ACTION_CYCLE.length]!;
    try {
      await api(`/api/actions/${a.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Falha ao avançar ação.", "danger");
    }
  };

  const deleteAction = async (a: ActionItem) => {
    const ok = await confirm({
      title: "Excluir ação",
      body: (
        <>
          Remover a ação <strong>{a.description}</strong> do Plano de Ação?
        </>
      ),
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/actions/${a.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Falha ao excluir ação.", "danger");
    }
  };

  const title = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <Icon name="alert" /> Incidente #{incidentId}
    </span>
  );

  const subtitle = detail
    ? `Aberto ${fmtDate(detail.incident.opened_at)}` +
      (detail.incident.closed_at ? ` · Fechado ${fmtDate(detail.incident.closed_at)}` : "")
    : "Carregando…";

  return (
    <Drawer title={title} subtitle={subtitle} onClose={onClose}>
      {!detail ? (
        <div className="banner">
          <Spinner /> Carregando incidente…
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            <Badge intent={incidentKindLabel[detail.incident.kind].intent} dot>
              {incidentKindLabel[detail.incident.kind].text}
            </Badge>
            <Badge intent={incidentStatusLabel[detail.incident.status].intent} dot>
              {incidentStatusLabel[detail.incident.status].text}
            </Badge>
          </div>

          {/* Estado / ciclo de vida */}
          <section className="block">
            <div className="block__head">
              <span className="block__title">Estado</span>
              <span className="block__spacer" />
              {savingStatus && <Spinner />}
            </div>
            <div className="field">
              <label className="field__label" htmlFor="inc-status">
                Avançar o ciclo de vida
              </label>
              <select
                id="inc-status"
                className="select"
                value={detail.incident.status}
                disabled={savingStatus}
                onChange={(e) => void changeStatus(e.target.value as IncidentStatus)}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {incidentStatusLabel[s].text}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <hr className="divider" />

          {/* Sintomas */}
          <section className="block">
            <div className="block__head">
              <span className="block__title">Sintomas</span>
              <span className="block__spacer" />
              <Badge intent="neutral">{detail.symptoms.length}</Badge>
            </div>
            {detail.symptoms.length === 0 ? (
              <p className="help">Sem sintomas registrados.</p>
            ) : (
              detail.symptoms.map((s) => {
                const hard = s.observed === null && s.deviations === null;
                return (
                  <div key={s.id} className="symptom">
                    <span className="symptom__metric">{prettyMetric(s.metric)}</span>
                    {hard ? (
                      <Badge intent="danger">Falha dura</Badge>
                    ) : (
                      <>
                        <span className="symptom__val">observado {fmtNumber(s.observed)}</span>
                        {s.deviations !== null && (
                          <span className="symptom__dev">{fmtNumber(s.deviations, 1)}σ</span>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </section>

          <hr className="divider" />

          {/* Diagnóstico */}
          <section className="block">
            <div className="block__head">
              <span className="block__title">Diagnóstico</span>
            </div>
            <div className="field">
              <textarea
                className="textarea"
                placeholder="Causa concluída na investigação — distinga causa real de variação legítima."
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
              />
            </div>
            <div style={{ marginTop: 12 }}>
              <Button variant="primary" icon="check" loading={savingDiag} onClick={() => void saveDiagnosis()}>
                Salvar diagnóstico
              </Button>
            </div>
          </section>

          <hr className="divider" />

          {/* Plano de Ação */}
          <section className="block">
            <div className="block__head">
              <span className="block__title">Plano de Ação</span>
              <span className="block__spacer" />
              <Badge intent="neutral">{detail.actions.length}</Badge>
            </div>

            {detail.actions.length === 0 ? (
              <p className="help">Nenhuma ação ainda.</p>
            ) : (
              detail.actions.map((a) => (
                <div key={a.id} className="row">
                  <div className="row__main">
                    <div className="row__name">{a.description}</div>
                    <div className="row__sub">{a.owner || "Sem responsável"}</div>
                  </div>
                  <Badge intent={actionStatusLabel[a.status].intent} dot>
                    {actionStatusLabel[a.status].text}
                  </Badge>
                  <div className="row__actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="check"
                      iconOnly
                      aria-label="Avançar status"
                      onClick={() => void cycleAction(a)}
                    />
                    <Button
                      variant="danger"
                      size="sm"
                      icon="trash"
                      iconOnly
                      aria-label="Excluir ação"
                      onClick={() => void deleteAction(a)}
                    />
                  </div>
                </div>
              ))
            )}

            <div className="inline-form" style={{ marginTop: 12 }}>
              <div className="field">
                <label className="field__label" htmlFor="act-desc">
                  Nova ação
                </label>
                <input
                  id="act-desc"
                  className="input"
                  placeholder="O que será feito"
                  value={actionDesc}
                  onChange={(e) => setActionDesc(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void addAction()}
                />
              </div>
              <div className="field" style={{ maxWidth: 180 }}>
                <label className="field__label" htmlFor="act-owner">
                  Responsável
                </label>
                <input
                  id="act-owner"
                  className="input"
                  placeholder="Opcional"
                  value={actionOwner}
                  onChange={(e) => setActionOwner(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void addAction()}
                />
              </div>
              <Button
                variant="primary"
                icon="plus"
                loading={addingAction}
                disabled={!actionDesc.trim()}
                onClick={() => void addAction()}
              >
                Adicionar
              </Button>
            </div>
          </section>

          <hr className="divider" />

          {/* Relatório */}
          <section className="block">
            <div className="block__head">
              <span className="block__title">Relatório</span>
            </div>
            <a
              className="btn btn--secondary"
              href={`/api/incidents/${incidentId}/report.pdf`}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="file" /> Baixar Relatório PDF
            </a>
          </section>
        </>
      )}
    </Drawer>
  );
}
