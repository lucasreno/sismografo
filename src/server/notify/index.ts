// Notificação. In-app é a fonte da verdade; aqui ficam os canais de push.
// Eventos: Incidente aberto e Sessão expirada.

import notifier from "node-notifier";
import { db } from "../db/index.js";

export type NotifyEvent =
  | { type: "incident_opened"; incidentId: number; summary: string }
  | { type: "session_expired"; instanceId: number; instanceName: string };

function gchatWebhook(): string | null {
  const row = db.prepare(`SELECT value FROM setting WHERE key = 'gchat_webhook'`).get() as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

/** Envia ao Google Chat se houver webhook configurado (opt-in). */
async function sendGChat(text: string): Promise<void> {
  const url = gchatWebhook();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error("[notify] Falha ao enviar ao Google Chat:", err);
  }
}

export async function notify(event: NotifyEvent): Promise<void> {
  const text =
    event.type === "incident_opened"
      ? `🌋 Sismógrafo: novo Incidente — ${event.summary}`
      : `🔒 Sismógrafo: Sessão expirada na instância "${event.instanceName}" — requer reautenticação.`;

  console.log(`[notify] ${text}`);
  desktop("Sismógrafo", text);
  await sendGChat(text);
}

/** Notificação de desktop do SO (best-effort; ignora ambientes sem display). */
function desktop(title: string, message: string): void {
  try {
    notifier.notify({ title, message });
  } catch (err) {
    console.error("[notify] Falha na notificação de desktop:", err);
  }
}
