// Sincronização sob demanda do espelho da Agenda (T-187 Etapa 1, decisão D5): ao abrir a tela, se a última sincronização boa
// tiver mais de 10 minutos (ou se o usuário pedir "atualizar agora"), lê a agenda principal do Google e refaz a janela
// [hoje − 7 dias, hoje + 60 dias]. Eventos privados entram só como "ocupado" (sem título, participantes, local ou links).
// Falhas não derrubam a tela: a conexão guarda o erro e os eventos da última sincronização boa continuam visíveis.
import { and, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { ErroAutorizacao, accessTokenDe, listarEventos, marcarRevogada, type EventoGoogle } from "./google";

export const CACHE_MIN = 10;
export const JANELA_PASSADO_DIAS = 7;
export const JANELA_FUTURO_DIAS = 60;

export type Conexao = typeof schema.conexoesAgenda.$inferSelect;

export async function conexaoDe(usuarioId: number): Promise<Conexao | null> {
  return (await db.select().from(schema.conexoesAgenda).where(eq(schema.conexoesAgenda.usuarioId, usuarioId)).limit(1))[0] ?? null;
}

const ehPrivado = (e: EventoGoogle) => e.visibility === "private" || e.visibility === "confidential";

function converter(usuarioId: number, e: EventoGoogle, agora: Date) {
  const diaInteiro = Boolean(e.start?.date);
  const inicio = new Date(e.start?.dateTime ?? `${e.start?.date}T00:00:00-03:00`);
  const fim = new Date(e.end?.dateTime ?? `${e.end?.date}T00:00:00-03:00`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return null;
  const privado = ehPrivado(e);
  const participantes = privado ? [] : (e.attendees ?? []).filter((a) => a.email).map((a) => ({ email: a.email!.toLowerCase(), nome: a.displayName ?? null, externo: !a.email!.toLowerCase().endsWith("@rucelle.com.br") }));
  const meet = privado ? null : (e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null);
  return {
    usuarioId, googleId: e.id, inicio, fim, diaInteiro, privado,
    titulo: privado ? null : (e.summary?.trim() || "(sem título)"),
    local: privado ? null : (e.location?.trim() || null),
    participantes, externos: participantes.filter((p) => p.externo).length,
    meetLink: meet, htmlLink: privado ? null : (e.htmlLink ?? null),
    status: e.status ?? null,
    atualizadoGoogleEm: e.updated ? new Date(e.updated) : null,
    sincronizadoEm: agora,
  };
}

export type ResultadoSinc = { feita: boolean; motivo: "cache" | "ok" | "revogada" | "erro" | "sem_conexao"; eventos?: number; erro?: string };

/** Sincroniza se necessário. `forcar` ignora o cache de 10 minutos. Nunca lança: devolve o motivo. */
export async function sincronizar(usuarioId: number, forcar = false): Promise<ResultadoSinc> {
  const c = await conexaoDe(usuarioId);
  if (!c || c.estado === "revogada") return { feita: false, motivo: c ? "revogada" : "sem_conexao" };
  if (!forcar && c.ultimaSincOkEm && Date.now() - c.ultimaSincOkEm.getTime() < CACHE_MIN * 60_000) return { feita: false, motivo: "cache" };
  const agora = new Date();
  const min = new Date(agora.getTime() - JANELA_PASSADO_DIAS * 86400_000), max = new Date(agora.getTime() + JANELA_FUTURO_DIAS * 86400_000);
  try {
    const token = await accessTokenDe(usuarioId);
    const brutos = await listarEventos(token, min, max);
    const linhas = brutos.filter((e) => e.status !== "cancelled" && e.eventType !== "workingLocation" && e.eventType !== "birthday").map((e) => converter(usuarioId, e, agora)).filter((x): x is NonNullable<typeof x> => x !== null);
    await db.transaction(async (tx) => {
      // Refaz a janela: apaga o que estava nela e grava o que o Google devolveu agora (eventos fora da janela ficam como estavam).
      await tx.delete(schema.eventosAgenda).where(and(eq(schema.eventosAgenda.usuarioId, usuarioId), gte(schema.eventosAgenda.inicio, min), lte(schema.eventosAgenda.inicio, max)));
      for (let i = 0; i < linhas.length; i += 200) await tx.insert(schema.eventosAgenda).values(linhas.slice(i, i + 200)).onConflictDoNothing();
      await tx.update(schema.conexoesAgenda).set({ estado: "conectada", erro: null, ultimaSincEm: agora, ultimaSincOkEm: agora, eventos: linhas.length }).where(eq(schema.conexoesAgenda.usuarioId, usuarioId));
    });
    return { feita: true, motivo: "ok", eventos: linhas.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    if (e instanceof ErroAutorizacao) {
      await marcarRevogada(usuarioId, "Acesso revogado ou expirado no Google; conecte novamente.");
      console.warn(`[agenda] sincronização do usuário ${usuarioId}: autorização recusada`); // sem tokens nem dados do evento
      return { feita: false, motivo: "revogada" };
    }
    await db.update(schema.conexoesAgenda).set({ estado: "erro", erro: msg.slice(0, 160), ultimaSincEm: agora }).where(eq(schema.conexoesAgenda.usuarioId, usuarioId));
    console.warn(`[agenda] sincronização do usuário ${usuarioId} falhou: ${msg.slice(0, 160)}`);
    return { feita: false, motivo: "erro", erro: msg };
  }
}

/** Eventos do próprio usuário entre duas datas (ordenados). Privados vêm só com horário e marcação. */
export async function eventosDe(usuarioId: number, de: Date, ate: Date) {
  return db.select().from(schema.eventosAgenda)
    .where(and(eq(schema.eventosAgenda.usuarioId, usuarioId), gte(schema.eventosAgenda.fim, de), lte(schema.eventosAgenda.inicio, ate)))
    .orderBy(schema.eventosAgenda.inicio);
}
