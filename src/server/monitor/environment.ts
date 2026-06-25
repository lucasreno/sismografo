// Verificação de Ambiente (preflight) — ver CONTEXT.md.
// Antes de um Ciclo, confere se o PRÓPRIO Sismógrafo alcança os alvos.
// Se nada responde, é problema de ambiente (ex.: VPN caiu), não da aplicação:
// o Ciclo não roda e nenhum Incidente de aplicação abre.

export interface ReachResult {
  reachable: boolean;
  total: number;
  ok: number;
}

async function ping(url: string, timeoutMs = 5000): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(url, { method: "HEAD", signal: ctrl.signal });
    return true; // qualquer resposta HTTP = alcançável (mesmo 4xx/5xx)
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Ambiente é considerado disponível se PELO MENOS uma Instância responde.
 * Se zero respondem, o problema é a rede/VPN do Sismógrafo, não os alvos.
 */
export async function checkEnvironment(urls: string[]): Promise<ReachResult> {
  if (urls.length === 0) return { reachable: false, total: 0, ok: 0 };
  const results = await Promise.all(urls.map((u) => ping(u)));
  const ok = results.filter(Boolean).length;
  return { reachable: ok > 0, total: urls.length, ok };
}
