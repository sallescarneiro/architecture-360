// Acesso ao Google (OAuth 2.0 por usuário + Calendar API v3). T-187 Etapas 1 e 2.
// Etapa 2 (decisão D6 de Rodrigo, 09/11/2026): o A360 cria, edita e exclui eventos no Google do usuário conectado, com o
// escopo calendar.events; calendar.readonly segue para listar calendários. Nenhum token, código ou dado de evento vai para logs.
// Toda escrita usa If-Match (ETag) quando há versão conhecida, para não sobrescrever o que mudou no Google.
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CalendarioGoogle } from "@/db/schema";
import { cifrar, decifrar } from "./cifra";

export const ESCOPO_LEITURA = "https://www.googleapis.com/auth/calendar.readonly";
export const ESCOPO_ESCRITA = "https://www.googleapis.com/auth/calendar.events";
export const ESCOPOS = ["openid", "email", ESCOPO_LEITURA, ESCOPO_ESCRITA];
export const podeEscrever = (escopos: string | null | undefined) => (escopos ?? "").includes(ESCOPO_ESCRITA);
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
  if (!(t.scope ?? "").includes("calendar.readonly") && !(t.scope ?? "").includes("calendar.events")) throw new Error("permissão de leitura da agenda não concedida");
  const email = emailDoIdToken(t.id_token);
  const valores = {
    emailGoogle: email, refreshTokenCifrado: cifrar(t.refresh_token), accessTokenCifrado: cifrar(t.access_token),
    accessExpiraEm: new Date(Date.now() + (t.expires_in - 60) * 1000), estado: "conectada", erro: null, conectadoEm: new Date(),
    ultimaSincEm: null, ultimaSincOkEm: null, eventos: 0, escopos: t.scope ?? null, calendarios: [] as CalendarioGoogle[],
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
  id: string; etag?: string; status?: string; summary?: string; description?: string; location?: string; visibility?: string; htmlLink?: string; updated?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string }; end?: { date?: string; dateTime?: string; timeZone?: string };
  attendees?: { email?: string; displayName?: string; self?: boolean; responseStatus?: string; organizer?: boolean }[];
  organizer?: { email?: string; displayName?: string; self?: boolean };
  hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[]; createRequest?: unknown };
  eventType?: string; transparency?: string; recurringEventId?: string; recurrence?: string[];
  extendedProperties?: { private?: Record<string, string> };
};

/** Erro de escrita com código tratável na interface: permissao (403), conflito (412), nao_encontrado (404), outro. */
export class ErroEscrita extends Error { constructor(public codigo: "permissao" | "conflito" | "nao_encontrado" | "invalido" | "outro", msg: string) { super(msg); } }

async function chamar(accessToken: string, metodo: string, url: string, corpo?: unknown, etag?: string | null): Promise<Response> {
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` };
  if (corpo !== undefined) headers["content-type"] = "application/json";
  if (etag) headers["if-match"] = etag;
  const r = await fetch(url, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  if (r.status === 401) throw new ErroAutorizacao("http_401");
  if (r.status === 403) { let m = "sem permissão"; try { m = String((await r.json()).error?.message ?? m).slice(0, 120); } catch { /* sem corpo */ } if (/insufficient|scope/i.test(m)) throw new ErroAutorizacao("escopo_insuficiente"); throw new ErroEscrita("permissao", m); }
  if (r.status === 412) throw new ErroEscrita("conflito", "o evento foi alterado no Google depois da última sincronização");
  if (r.status === 404 || r.status === 410) throw new ErroEscrita("nao_encontrado", "evento não encontrado no Google (pode ter sido excluído)");
  if (r.status === 400) { let m = "dados inválidos"; try { m = String((await r.json()).error?.message ?? m).slice(0, 160); } catch { /* sem corpo */ } throw new ErroEscrita("invalido", m); }
  if (!r.ok) throw new ErroEscrita("outro", `Google Calendar: HTTP ${r.status}`);
  return r;
}

/** Calendários do usuário (lista do próprio Google Calendar), com o nível de acesso. Só leitura. */
export async function listarCalendarios(accessToken: string): Promise<CalendarioGoogle[]> {
  const r = await chamar(accessToken, "GET", `${API}/users/me/calendarList?minAccessRole=freeBusyReader&showHidden=false&maxResults=100`);
  const j = (await r.json()) as { items?: { id: string; summary?: string; summaryOverride?: string; primary?: boolean; accessRole?: string; backgroundColor?: string; selected?: boolean }[] };
  return (j.items ?? []).filter((c) => c.selected !== false || c.primary).map((c) => ({ id: c.id, nome: c.summaryOverride ?? c.summary ?? c.id, primario: Boolean(c.primary), acesso: (c.accessRole as CalendarioGoogle["acesso"]) ?? "reader", cor: c.backgroundColor ?? null }));
}

export type CorpoEvento = {
  summary: string; description?: string; location?: string;
  start: { dateTime: string; timeZone: string } | { date: string }; end: { dateTime: string; timeZone: string } | { date: string };
  attendees?: { email: string }[]; conferenceData?: { createRequest: { requestId: string; conferenceSolutionKey: { type: "hangoutsMeet" } } };
  extendedProperties?: { private: Record<string, string> };
};

export async function obterEvento(accessToken: string, calendarioId: string, eventoId: string): Promise<EventoGoogle> {
  const r = await chamar(accessToken, "GET", `${API}/calendars/${encodeURIComponent(calendarioId)}/events/${encodeURIComponent(eventoId)}`);
  return (await r.json()) as EventoGoogle;
}

/** Cria um evento no calendário indicado (D6). sendUpdates: all | none. */
export async function criarEvento(accessToken: string, calendarioId: string, corpo: CorpoEvento, enviarConvites: boolean): Promise<EventoGoogle> {
  const p = new URLSearchParams({ sendUpdates: enviarConvites ? "all" : "none", conferenceDataVersion: "1" });
  const r = await chamar(accessToken, "POST", `${API}/calendars/${encodeURIComponent(calendarioId)}/events?${p}`, corpo);
  return (await r.json()) as EventoGoogle;
}

/** Atualiza campos de um evento (PATCH) com If-Match quando o ETag é conhecido. */
export async function atualizarEvento(accessToken: string, calendarioId: string, eventoId: string, corpo: Partial<CorpoEvento> & { attendees?: { email: string }[] }, etag: string | null, enviarConvites: boolean): Promise<EventoGoogle> {
  const p = new URLSearchParams({ sendUpdates: enviarConvites ? "all" : "none", conferenceDataVersion: "1" });
  const r = await chamar(accessToken, "PATCH", `${API}/calendars/${encodeURIComponent(calendarioId)}/events/${encodeURIComponent(eventoId)}?${p}`, corpo, etag);
  return (await r.json()) as EventoGoogle;
}

export async function excluirEvento(accessToken: string, calendarioId: string, eventoId: string, etag: string | null, enviarConvites: boolean): Promise<void> {
  const p = new URLSearchParams({ sendUpdates: enviarConvites ? "all" : "none" });
  await chamar(accessToken, "DELETE", `${API}/calendars/${encodeURIComponent(calendarioId)}/events/${encodeURIComponent(eventoId)}?${p}`, undefined, etag);
}

/** Lista eventos da agenda principal entre duas datas (instâncias de recorrência expandidas). Só leitura. */
export async function listarEventos(accessToken: string, timeMin: Date, timeMax: Date, calendarioId = "primary"): Promise<EventoGoogle[]> {
  const itens: EventoGoogle[] = [];
  let pageToken: string | undefined;
  do {
    const p = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), maxResults: "250", showDeleted: "false" });
    if (pageToken) p.set("pageToken", pageToken);
    const r = await fetch(`${API}/calendars/${encodeURIComponent(calendarioId)}/events?${p}`, { headers: { authorization: `Bearer ${accessToken}` } });
    if (r.status === 401 || r.status === 403) throw new ErroAutorizacao(`http_${r.status}`);
    if (!r.ok) throw new Error(`Google Calendar: HTTP ${r.status}`);
    const j = (await r.json()) as { items?: EventoGoogle[]; nextPageToken?: string };
    itens.push(...(j.items ?? []));
    pageToken = j.nextPageToken;
  } while (pageToken && itens.length < 2500);
  return itens;
}
