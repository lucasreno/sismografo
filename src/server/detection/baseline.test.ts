import { describe, it, expect } from "vitest";
import { median, mad, evaluate, thresholdFor, MIN_SAMPLES } from "./baseline.js";

describe("estatística robusta", () => {
  it("mediana ímpar e par", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("MAD ignora um outlier isolado", () => {
    // mediana 5; um pico não envenena a dispersão
    expect(mad([5, 5, 5, 5, 5, 999])).toBe(0);
  });
});

describe("confiança graduada", () => {
  it("não detecta nada antes de MIN_SAMPLES (estado learning)", () => {
    const window = Array(MIN_SAMPLES - 1).fill(200);
    const e = evaluate(99999, window);
    expect(e.learning).toBe(true);
    expect(e.isAnomaly).toBe(false);
  });

  it("faixa estreita conforme a amostra cresce", () => {
    expect(thresholdFor(5)).toBeGreaterThan(thresholdFor(50));
    expect(thresholdFor(1000)).toBeCloseTo(3.5, 1);
  });

  it("pega um salto grosseiro mesmo com pouca amostra", () => {
    const window = [200, 205, 198, 202, 201, 199];
    expect(evaluate(5000, window).isAnomaly).toBe(true);
  });

  it("não alarma em ruído normal", () => {
    const window = [200, 205, 198, 202, 201, 199, 203, 197];
    expect(evaluate(204, window).isAnomaly).toBe(false);
  });
});
