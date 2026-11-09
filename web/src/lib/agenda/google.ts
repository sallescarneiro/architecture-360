// Acesso ao Google (OAuth 2.0 por usuário + Calendar API v3), somente leitura. T-187 Etapa 1.
// Regras: escopo mínimo (calendar.readonly + e-mail para identificar a conta); nenhum token, código ou evento vai para logs;
// nada é criado, alterado ou apagado no Google.
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { cifrar, decifrar } from "./cifra";

export const ESCOPOS = ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly"];
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";

/** URL pública do app: APP_URL, senão o domínio público do Railway, senão o host da requisição (atrás de proxy, via x-forwarded-host). */
export function urlBase(req?: Request): string {
  const env = process.env.APP_URL ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null);
  if (env) return env.replace(/\/$/, "");
  if (req) {
    const h = req.headers; const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return "http://localhost:3000";
}

export function urlRedirecionamento(req?: Request): string {
  return `${urlBase(req)}/api/agenda/callback`;
}

export function urlAutorizacao(state: string, req?: Request): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!, redirect_uri: urlRedirecionamento(req), response_type: "code",
    scope: ESCOPOS.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "false", state,
    hd: "rucelle.com.br",
  });
  return `${AUTH_URL}?${p}`;
}

/** Erro de acesso cuja causa é a autorização (token revogado/expirado sem renovação): a conexão passa a "revogada". */
export class ErroAutorizacao extends Error {}

type TokenResp = { access_token: string; expires_in: number; refresh_token?: string; id_token?: string; scope?: string };

async function pedirToken(body: Record<string, string>): Promise<TokenResp> {
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  if (!r.ok) {
    let codigo = "erro_token";
    try { codigo = String((await r.json()).error ?? codigo); } catch { /* corpo não é JSON */ }
    if (codigo === "invalid_grant" || codigo === "unauthorized_client") throw new ErroAutorizacao(codigo);
    throw new Error(`Google token: ${r.status} ${codigo}`); // sem corpo nem tokens na mensagem
  }
  return (await r.json()) as TokenResp;
}

/** E-mail da conta Google a partir do id_token (emitido pelo próprio Google via canal TLS direto; só usado para exibir a conta conectada). */
function emailDoIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try { const p = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")); return typeof p.email === "string" ? p.email.toLowerCase() : null; } catch { return null; }
}

/** Troca o código do callback por tokens e grava a conexão do usuário (tokens cifrados). */
export async function concluirConexao(usuarioId: number, code: string, req?: Request) {
  const t = await pedirToken({ code, client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!, client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!, redirect_uri: urlRedirecionamento(req), grant_type: "authorization_code" });
  if (!t.refresh_token) throw new Error("Google não devolveu refresh_token (autorize novamente com consentimento)");
  if (!(t.scope ?? "").includes("calendar.readonly")) throw new Error("permissão de leitura da agenda não concedida");
  const email = emailDoIdToken(t.id_token);
  const valores = {
    emailGoogle: email, refreshTokenCifrado: cifrar(t.refresh_token), accessTokenCifrado: cifrar(t.access_token),
    accessExpiraEm: new Date(Date.now() + (t.expires_in - 60) * 1000), estado: "conectada", erro: null, conectadoEm: new Date(),
    ultimaSincEm: null, ultimaSincOkEm: null, eventos: 0,
  };
  await db.insert(schema.conexoesAgenda).values({ usuarioId, ...valores }).onConflictDoUpdate({ target: schema.conexoesAgenda.usuarioId, set: valores });
  // Reconexão: o espelho anterior é descartado e refeito na próxima sincronização.
  await db.delete(schema.eventosAgenda).where(eq(schema.eventosAgenda.usuarioId, usuarioId));
  return email;
}

/** Access token válido do usuário; renova com o refresh token quando expirado. Lança ErroAutorizacao se o Google recusar. */
export async function accessTokenDe(usuarioId: number): Promise<string> {
  const c = (await db.select().from(schema.conexoesAgenda).where(eq(schema.conexoesAgenda.usuarioId, usuarioId)).limit(1))[0];
  if (!c || c.estado === "revogada" || !c.refreshTokenCifrado) throw new ErroAutorizacao("sem_conexao");
  if (c.accessTokenCifrado && c.accessExpiraEm && c.accessExpiraEm.getTime() > Date.now()) return decifrar(c.accessTokenCifrado);
  const t = await pedirToken({ refresh_token: decifrar(c.refreshTokenCifrado), client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!, client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!, grant_type: "refresh_token" });
  await db.update(schema.conexoesAgenda).set({ accessTokenCifrado: cifrar(t.access_token), accessExpiraEm: new Date(Date.now() + (t.expires_in - 60) * 1000) }).where(eq(schema.conexoesAgenda.usuarioId, usuarioId));
  return t.access_token;
}

/** Marca a conexão como revogada (o Google recusou o refresh token) e apaga os tokens; eventos ficam até a desconexão. */
export async function marcarRevogada(usuarioId: number, motivo: string) {
  await db.update(schema.conexoesAgenda).set({ estado: "revogada", erro: motivo.slice(0, 120), refreshTokenCifrado: null, accessTokenCifrado: null, accessExpiraEm: null }).where(eq(schema.conexoesAgenda.usuarioId, usuarioId));
}

/** Desconecta: revoga o token no Google (melhor esforço) e apaga conexão e espelho do usuário. */
export async function desconectar(usuarioId: number) {
  const c = (await db.select().from(schema.conexoesAgenda).where(eq(schema.conexoesAgenda.usuarioId, usuarioId)).limit(1))[0];
  if (c?.refreshTokenCifrado) {
    try { await fetch(REVOKE_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: decifrar(c.refreshTokenCifrado) }) }); } catch { /* já revogado ou Google indisponível: os tokens locais são apagados mesmo assim */ }
  }
  await db.delete(schema.eventosAgenda).where(eq(schema.eventosAgenda.usuarioId, usuarioId));
  await db.delete(schema.conexoesAgenda).where(eq(schema.conexoesAgenda.usuarioId, usuarioId));
}

export type EventoGoogle = {
  id: string; status?: string; summary?: string; location?: string; visibility?: string; htmlLink?: string; updated?: string;
  start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string };
  attendees?: { email?: string; displayName?: string; self?: boolean; responseStatus?: string }[];
  hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  eventType?: string; transparency?: string;
};

/** Lista eventos da agenda principal entre duas datas (instâncias de recorrência expandidas). Só leitura. */
export async function listarEventos(accessToken: string, timeMin: Date, timeMax: Date): Promise<EventoGoogle[]> {
  const itens: EventoGoogle[] = [];
  let pageToken: string | undefined;
  do {
    const p = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), maxResults: "250", showDeleted: "false" });
    if (pageToken) p.set("pageToken", pageToken);
    const r = await fetch(`${API}/calendars/primary/events?${p}`, { headers: { authorization: `Bearer ${accessToken}` } });
    if (r.status === 401 || r.status === 403) throw new ErroAutorizacao(`http_${r.status}`);
    if (!r.ok) throw new Error(`Google Calendar: HTTP ${r.status}`);
    const j = (await r.json()) as { items?: EventoGoogle[]; nextPageToken?: string };
    itens.push(...(j.items ?? []));
    pageToken = j.nextPageToken;
  } while (pageToken && itens.length < 2500);
  return itens;
}
