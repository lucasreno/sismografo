// Detecção de anomalia por estatística robusta (ver docs/adr/0001).
// Mediana + MAD + z-score modificado, com confiança graduada (faixa larga
// no início, estreitando conforme a amostra cresce). Funções puras = testáveis.

/** Amostras mínimas para considerar detecção estatística. Abaixo disso, só falha dura. */
export const MIN_SAMPLES = 4;
/** Limiar-base de desvios (z-score modificado) com amostra madura. */
export const BASE_THRESHOLD = 3.5;
/** Controla quão larga é a faixa no início; decai com n. */
export const WARMUP = 10;

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

/** Median Absolute Deviation — dispersão robusta a outliers. */
export function mad(values: number[]): number {
  if (values.length === 0) return NaN;
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

/** z-score modificado: quantos desvios robustos `x` está da mediana. */
export function modifiedZ(x: number, med: number, madValue: number): number {
  // 1.4826 reescala o MAD para aproximar o desvio-padrão sob normalidade.
  const scaled = 1.4826 * madValue;
  if (scaled === 0) return x === med ? 0 : Infinity;
  return (x - med) / scaled;
}

/** Limiar efetivo dado o tamanho da amostra (confiança graduada). */
export function thresholdFor(n: number): number {
  return BASE_THRESHOLD * (1 + WARMUP / n);
}

export interface Evaluation {
  isAnomaly: boolean;
  deviations: number; // z-score modificado (sinalizado)
  median: number;
  mad: number;
  threshold: number;
  learning: boolean; // amostra ainda insuficiente p/ detecção estatística
}

/**
 * Avalia uma observação contra a janela recente de uma combinação
 * (Fluxo, Passo, Instância, métrica). `window` NÃO inclui a observação.
 */
export function evaluate(observed: number, window: number[]): Evaluation {
  const n = window.length;
  const med = median(window);
  const madValue = mad(window);

  if (n < MIN_SAMPLES) {
    return { isAnomaly: false, deviations: 0, median: med, mad: madValue, threshold: NaN, learning: true };
  }

  const z = modifiedZ(observed, med, madValue);
  const threshold = thresholdFor(n);
  return {
    isAnomaly: Math.abs(z) > threshold,
    deviations: z,
    median: med,
    mad: madValue,
    threshold,
    learning: false,
  };
}
