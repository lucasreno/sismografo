import { describe, it, expect } from "vitest";
import { transition, type StepState } from "./incidents.js";

const fresh: StepState = { consecAnom: 0, consecNormal: 0, openIncidentId: null };

describe("regra de abertura/fechamento de Incidente", () => {
  it("não abre com um único Ciclo anômalo", () => {
    const t = transition(fresh, true, false);
    expect(t.open).toBe(false);
    expect(t.state.consecAnom).toBe(1);
  });

  it("abre no 2º Ciclo anômalo consecutivo", () => {
    const t1 = transition(fresh, true, false);
    const t2 = transition(t1.state, true, false);
    expect(t2.open).toBe(true);
  });

  it("falha dura abre imediatamente", () => {
    expect(transition(fresh, true, true).open).toBe(true);
  });

  it("um Ciclo normal isolado zera a contagem (anti-flapping)", () => {
    const t1 = transition(fresh, true, false);
    const t2 = transition(t1.state, false, false);
    const t3 = transition(t2.state, true, false);
    expect(t3.open).toBe(false); // contagem reiniciou
    expect(t3.state.consecAnom).toBe(1);
  });

  it("fecha após 2 Ciclos normais consecutivos", () => {
    const open: StepState = { consecAnom: 2, consecNormal: 0, openIncidentId: 42 };
    const n1 = transition(open, false, false);
    expect(n1.close).toBe(false);
    const n2 = transition(n1.state, false, false);
    expect(n2.close).toBe(true);
  });

  it("não fecha com um único Ciclo normal", () => {
    const open: StepState = { consecAnom: 2, consecNormal: 0, openIncidentId: 42 };
    expect(transition(open, false, false).close).toBe(false);
  });
});
