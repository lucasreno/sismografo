// Cliente REST mínimo. Lança em respostas não-2xx para que a UI mostre toast de erro.

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const text = await r.text();
  const data = text ? safeJson(text) : null;
  if (!r.ok) {
    let msg = `Falha na requisição (${r.status})`;
    if (data && typeof data === "object" && "error" in data) {
      msg = String((data as Record<string, unknown>).error);
    }
    throw new ApiError(r.status, msg);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
