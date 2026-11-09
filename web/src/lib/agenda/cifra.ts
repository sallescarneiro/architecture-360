// Cifra dos tokens do Google em repouso (T-187, acréscimo 4): AES-256-GCM com chave de AGENDA_TOKEN_KEY (32 bytes em base64).
// Formato guardado: "v1:" + base64(iv 12 bytes | tag 16 bytes | texto cifrado). A chave nunca sai do servidor nem vai para logs.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function chave(): Buffer {
  const b64 = process.env.AGENDA_TOKEN_KEY;
  if (!b64) throw new Error("AGENDA_TOKEN_KEY não configurada");
  const k = Buffer.from(b64.trim(), "base64");
  if (k.length !== 32) throw new Error("AGENDA_TOKEN_KEY inválida (esperados 32 bytes em base64)");
  return k;
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const enc = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return "v1:" + Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}

export function decifrar(guardado: string): string {
  if (!guardado.startsWith("v1:")) throw new Error("formato de token desconhecido");
  const buf = Buffer.from(guardado.slice(3), "base64");
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), enc = buf.subarray(28);
  const d = createDecipheriv("aes-256-gcm", chave(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export const agendaConfigurada = () => Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.AGENDA_TOKEN_KEY);
