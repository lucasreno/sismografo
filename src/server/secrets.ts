// Cofre de segredos cifrado (AES-256-GCM), fallback multiplataforma do ADR 0002.
// A chave deriva de uma senha mestra (env SISMOGRAFO_MASTER). Segredos NUNCA
// vão para o banco, logs ou Relatório. OS keychain nativo fica como evolução.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const VAULT_PATH = process.env.SISMOGRAFO_VAULT ?? join(process.cwd(), "data", "secrets.enc");
const SALT = "sismografo.v1"; // sal fixo do KDF; a entropia está na senha mestra

function key(): Buffer {
  const master = process.env.SISMOGRAFO_MASTER;
  if (!master) throw new Error("SISMOGRAFO_MASTER não definida — necessária para usar segredos.");
  return scryptSync(master, SALT, 32);
}

type Vault = Record<string, string>;

function load(): Vault {
  if (!existsSync(VAULT_PATH)) return {};
  const raw = JSON.parse(readFileSync(VAULT_PATH, "utf8")) as { iv: string; tag: string; data: string };
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(raw.iv, "hex"));
  decipher.setAuthTag(Buffer.from(raw.tag, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(raw.data, "hex")), decipher.final()]);
  return JSON.parse(dec.toString("utf8")) as Vault;
}

function persist(vault: Vault): void {
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(vault), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  writeFileSync(VAULT_PATH, JSON.stringify({ iv: iv.toString("hex"), tag: tag.toString("hex"), data: enc.toString("hex") }));
}

/** Chave canônica de um segredo de Parâmetro por (Fluxo, Instância). */
export function secretKey(flowId: number, instanceId: number, paramName: string): string {
  return `flow:${flowId}:instance:${instanceId}:param:${paramName}`;
}

export function setSecret(k: string, value: string): void {
  const v = load();
  v[k] = value;
  persist(v);
}

export function getSecret(k: string): string | undefined {
  try {
    return load()[k];
  } catch {
    return undefined; // sem senha mestra ou cofre ilegível
  }
}

/**
 * Remove do cofre todo segredo cuja chave satisfaça `pred`. Usado ao excluir
 * Fluxos/Instâncias (o banco cascateia, mas o cofre vive fora dele). Sem senha
 * mestra/cofre ilegível, os segredos órfãos ficam — cifrados e inertes.
 */
export function deleteSecretsWhere(pred: (key: string) => boolean): void {
  let v: Vault;
  try {
    v = load();
  } catch {
    return;
  }
  let changed = false;
  for (const k of Object.keys(v))
    if (pred(k)) {
      delete v[k];
      changed = true;
    }
  if (changed) persist(v);
}
