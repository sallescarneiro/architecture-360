// Sincronização sob demanda do espelho da Agenda (T-187, D5): ao abrir a tela, se a última sincronização boa tiver mais de
// 10 minutos (ou se o usuário pedir "atualizar agora"), lê os calendários do usuário e refaz a janela [hoje − 7, hoje + 60 dias].
// Eventos privados entram só como "ocupado" (sem título, descrição, participantes, local ou links). Associações manuais a
// projeto são preservadas entre sincronizações. Falhas não derrubam a tela: a conexão guarda o erro e o espelho anterior fica.
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CalendarioGoogle } from "@/db/schema";
import { classificar, sugerirProjeto, type ProjetoRef } from "./classificacao";
import { ErroAutorizacao, accessTokenDe, listarCalendarios, listarEventos, marcarRevogada, type EventoGoogle } from "./google";

export const CACHE_MIN = 10;
export const JANELA_PASSADO_DIAS = 7;
export const JANELA_FUTURO_DIAS = 60;
export const FUSO = "America/Sao_Paulo";

export type Conexao = typeof schema.conexoesAgenda.$inferSelect;
export type Evento = typeof schema.eventosAgenda.$inferSelect;

export async function conexaoDe(usuarioId: number): Promise<Conexao | null> {
  return (await db.select().from(schema.conexoesAgenda).where(eq(schema.conexoesAgenda.usuarioId, usuarioId)).limit(1))[0] ?? null;
}

const ehPrivado = (e: EventoGoogle) => e.visibility === "private" || e.visibility === "confidential";

/** Projetos ativos do Vobi para sugestão de associação (só leitura). */
export async function projetosParaAssociacao(): Promise<ProjetoRef[]> {
  const r = await db.execute(sql`select p.codigo, p.nome, c.nome as cliente from projeto p left join cliente_vobi c on c.codigo = p.cliente_codigo
    where p.nao_encontrado_desde is null and p.status_classe <> 'encerrado' order by p.nome`);
  return (r.rows as { codigo: number; nome: string; cliente: string | null }[]).map((x) => ({ codigo: Number(x.codigo), nome: x.nome, cliente: x.cliente }));
}

/** Converte um evento do Google numa linha do espelho. Para privados só ficam horário, calendário e marcação. */
export function converter(usuarioId: number, e: EventoGoogle, calendarioId: string, emailConta: string | null, agora: Date, projetos: ProjetoRef[], manual?: { projetoCodigo: number | null; projetoOrigem: string | null }) {
  const diaInteiro = Boolean(e.start?.date);
  const inicio = new Date(e.start?.dateTime ?? `${e.start?.date}T00:00:00-03:00`);
  const fim = new Date(e.end?.dateTime ?? `${e.end?.date}T00:00:00-03:00`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return null;
  const privado = ehPrivado(e);
  const participantes = privado ? [] : (e.attendees ?? []).filter((a) => a.email).map((a) => ({ email: a.email!.toLowerCase(), nome: a.displayName ?? null, externo: !a.email!.toLowerCase().endsWith("@rucelle.com.br"), resposta: a.responseStatus ?? null }));
  const externos = participantes.filter((p) => p.externo).length;
  const meet = privado ? null : (e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null);
  const titulo = privado ? null : (e.summary?.trim() || "(sem título)");
  const descricao = privado ? null : (e.description?.trim() || null);
  const organizador = e.organizer?.email?.toLowerCase() ?? null;
  const souOrganizador = Boolean(e.organizer?.self) || (!!emailConta && organizador === emailConta.toLowerCase()) || (!e.organizer && !e.attendees?.length);
  // Associação a projeto: manual preservada > propriedade privada gravada pelo A360 no Google > sugestão automática (D4).
  const doGoogle = e.extendedProperties?.private?.a360_projeto ? Number(e.extendedProperties.private.a360_projeto) : null;
  let projetoCodigo: number | null = null, projetoOrigem: string | null = null;
  if (manual?.projetoOrigem === "manual") { projetoCodigo = manual.projetoCodigo; projetoOrigem = "manual"; }
  else if (doGoogle && projetos.some((p) => p.codigo === doGoogle)) { projetoCodigo = doGoogle; projetoOrigem = "google"; }
  else if (!privado) { const s = sugerirProjeto(titulo, descricao, projetos); if (s) { projetoCodigo = s; projetoOrigem = "sugestao"; } }
  return {
    usuarioId, googleId: e.id, inicio, fim, diaInteiro, privado, titulo, descricao,
    local: privado ? null : (e.location?.trim() || null),
    participantes, externos, meetLink: meet, htmlLink: privado ? null : (e.htmlLink ?? null),
    status: e.status ?? null, atualizadoGoogleEm: e.updated ? new Date(e.updated) : null, sincronizadoEm: agora,
    calendarioId, organizadorEmail: privado ? null : organizador, souOrganizador, etag: e.etag ?? null, recorrenteDe: e.recurringEventId ?? null,
    tipo: classificar({ privado, titulo, local: e.location ?? null, externos, participantes: participantes.length }),
    projetoCodigo, projetoOrigem,
  };
}

export type ResultadoSinc = { feita: boolean; motivo: "cache" | "ok" | "revogada" | "erro" | "sem_conexao"; eventos?: number; erro?: string };

/** Calendários em que o usuário pode gravar (destino de novos eventos). */
export const calendariosEscrita = (c: Conexao | null) => (c?.calendarios ?? []).filter((k) => k.acesso === "owner" || k.acesso === "writer");

/** Sincroniza se necessário. `forcar` ignora o cache de 10 minutos. Nunca lança: devolve o motivo. */
export async function sincronizar(usuarioId: number, forcar = false): Promise<ResultadoSinc> {
  const c = await conexaoDe(usuarioId);
  if (!c || c.estado === "revogada") return { feita: false, motivo: c ? "revogada" : "sem_conexao" };
  if (!forcar && c.ultimaSincOkEm && Date.now() - c.ultimaSincOkEm.getTime() < CACHE_MIN * 60_000) return { feita: false, motivo: "cache" };
  const agora = new Date();
  const min = new Date(agora.getTime() - JANELA_PASSADO_DIAS * 86400_000), max = new Date(agora.getTime() + JANELA_FUTURO_DIAS * 86400_000);
  try {
    const token = await accessTokenDe(usuarioId);
    let calendarios: CalendarioGoogle[] = [];
    try { calendarios = await listarCalendarios(token); } catch (e) { if (e instanceof ErroAutorizacao) throw e; calendarios = c.calendarios.length ? c.calendarios : [{ id: "primary", nome: "Agenda principal", primario: true, acesso: "owner", cor: null }]; }
    if (!calendarios.length) calendarios = [{ id: "primary", nome: "Agenda principal", primario: true, acesso: "owner", cor: null }];
    const projetos = await projetosParaAssociacao();
    const manuais = new Map((await db.select({ g: schema.eventosAgenda.googleId, p: schema.eventosAgenda.projetoCodigo, o: schema.eventosAgenda.projetoOrigem }).from(schema.eventosAgenda).where(and(eq(schema.eventosAgenda.usuarioId, usuarioId), eq(schema.eventosAgenda.projetoOrigem, "manual")))).map((r) => [r.g, { projetoCodigo: r.p, projetoOrigem: r.o }]));
    const linhas: NonNullable<ReturnType<typeof converter>>[] = [];
    const vistos = new Set<string>();
    for (const cal of calendarios) {
      const brutos = await listarEventos(token, min, max, cal.id);
      for (const e of brutos) {
        if (e.status === "cancelled" || e.eventType === "workingLocation" || e.eventType === "birthday" || e.eventType === "outOfOffice" || vistos.has(e.id)) continue;
        const l = converter(usuarioId, e, cal.id, c.emailGoogle, agora, projetos, manuais.get(e.id));
        if (l) { linhas.push(l); vistos.add(e.id); }
      }
    }
    await db.transaction(async (tx) => {
      // Refaz a janela: apaga o que estava nela e grava o que o Google devolveu agora (eventos fora da janela ficam como estavam).
      await tx.delete(schema.eventosAgenda).where(and(eq(schema.eventosAgenda.usuarioId, usuarioId), gte(schema.eventosAgenda.inicio, min), lte(schema.eventosAgenda.inicio, max)));
      for (let i = 0; i < linhas.length; i += 200) await tx.insert(schema.eventosAgenda).values(linhas.slice(i, i + 200)).onConflictDoNothing();
      await tx.update(schema.conexoesAgenda).set({ estado: "conectada", erro: null, ultimaSincEm: agora, ultimaSincOkEm: agora, eventos: linhas.length, calendarios }).where(eq(schema.conexoesAgenda.usuarioId, usuarioId));
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
export async function eventosDe(usuarioId: number, de: Date, ate: Date): Promise<Evento[]> {
  return db.select().from(schema.eventosAgenda)
    .where(and(eq(schema.eventosAgenda.usuarioId, usuarioId), gte(schema.eventosAgenda.fim, de), lte(schema.eventosAgenda.inicio, ate)))
    .orderBy(schema.eventosAgenda.inicio);
}

export async function eventoDe(usuarioId: number, id: number): Promise<Evento | null> {
  return (await db.select().from(schema.eventosAgenda).where(and(eq(schema.eventosAgenda.usuarioId, usuarioId), eq(schema.eventosAgenda.id, id))).limit(1))[0] ?? null;
}

/** Grava/atualiza no espelho a resposta do Google logo após uma escrita (sem esperar a próxima sincronização). */
export async function espelharEvento(usuarioId: number, e: EventoGoogle, calendarioId: string, emailConta: string | null, manual?: { projetoCodigo: number | null; projetoOrigem: string | null }): Promise<number | null> {
  const projetos = await projetosParaAssociacao();
  const l = converter(usuarioId, e, calendarioId, emailConta, new Date(), projetos, manual);
  if (!l) return null;
  const r = await db.insert(schema.eventosAgenda).values(l).onConflictDoUpdate({ target: [schema.eventosAgenda.usuarioId, schema.eventosAgenda.googleId], set: l }).returning({ id: schema.eventosAgenda.id });
  return r[0]?.id ?? null;
}
