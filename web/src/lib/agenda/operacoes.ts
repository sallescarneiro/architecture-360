// Operações de escrita da Agenda (T-187 Etapa 2, decisão D6): criar, editar, excluir e associar a projeto.
// Regras: só o usuário da sessão, só nos seus calendários com permissão de escrita, só eventos de que é organizador;
// toda escrita vai ao Google primeiro e o espelho é atualizado com a resposta; auditoria interna sem dados do evento.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { FUSO, calendariosEscrita, conexaoDe, espelharEvento, eventoDe, projetosParaAssociacao, type Evento } from "./sync";
import { ErroAutorizacao, ErroEscrita, accessTokenDe, atualizarEvento, criarEvento, excluirEvento, marcarRevogada, podeEscrever, type CorpoEvento } from "./google";

export type DadosEvento = {
  titulo: string; descricao: string; local: string;
  data: string;            // AAAA-MM-DD
  diaInteiro: boolean; horaInicio: string; horaFim: string; // HH:MM
  participantes: string[]; // e-mails
  projetoCodigo: number | null;
  criarMeet: boolean; calendarioId: string; enviarConvites: boolean;
};

export type ResultadoOp = { ok: true; id: number | null } | { ok: false; codigo: "validacao" | "sem_conexao" | "sem_escopo" | "sem_permissao" | "conflito" | "nao_encontrado" | "invalido" | "revogada" | "outro"; mensagem: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lê e valida o formulário (sem confiar em nada do cliente). */
export function lerFormulario(fd: FormData): { dados: DadosEvento } | { erro: string } {
  const g = (k: string) => String(fd.get(k) ?? "").trim();
  const titulo = g("titulo").slice(0, 200);
  const data = g("data");
  const diaInteiro = fd.get("dia_inteiro") === "1";
  const horaInicio = g("hora_inicio"), horaFim = g("hora_fim");
  if (!titulo) return { erro: "Informe o título." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Informe a data." };
  if (!diaInteiro) {
    if (!/^\d{2}:\d{2}$/.test(horaInicio) || !/^\d{2}:\d{2}$/.test(horaFim)) return { erro: "Informe horário de início e término." };
    if (horaFim <= horaInicio) return { erro: "O término precisa ser depois do início." };
  }
  const participantes = [...new Set(g("participantes").split(/[\s,;]+/).map((e) => e.toLowerCase()).filter(Boolean))];
  const invalido = participantes.find((e) => !EMAIL.test(e));
  if (invalido) return { erro: `E-mail de participante inválido: ${invalido}` };
  if (participantes.length > 50) return { erro: "Máximo de 50 participantes." };
  const proj = g("projeto");
  return { dados: {
    titulo, descricao: g("descricao").slice(0, 4000), local: g("local").slice(0, 300), data, diaInteiro, horaInicio, horaFim, participantes,
    projetoCodigo: /^\d+$/.test(proj) ? Number(proj) : null, criarMeet: fd.get("meet") === "1", calendarioId: g("calendario") || "primary", enviarConvites: fd.get("convites") === "1",
  } };
}

function corpoDe(d: DadosEvento, incluirProjeto: boolean): CorpoEvento {
  const corpo: CorpoEvento = { summary: d.titulo, description: d.descricao || undefined, location: d.local || undefined,
    start: d.diaInteiro ? { date: d.data } : { dateTime: `${d.data}T${d.horaInicio}:00`, timeZone: FUSO },
    end: d.diaInteiro ? { date: proximoDia(d.data) } : { dateTime: `${d.data}T${d.horaFim}:00`, timeZone: FUSO },
    attendees: d.participantes.map((email) => ({ email })) };
  if (incluirProjeto) corpo.extendedProperties = { private: { a360_projeto: d.projetoCodigo ? String(d.projetoCodigo) : "" } };
  return corpo;
}

function proximoDia(iso: string): string { const dt = new Date(iso + "T12:00:00Z"); dt.setUTCDate(dt.getUTCDate() + 1); return dt.toISOString().slice(0, 10); }

async function auditar(usuarioId: number, acao: string, calendarioId: string | null, googleId: string | null, resultado: string) {
  await db.insert(schema.acoesAgenda).values({ usuarioId, acao, calendarioId, googleId, resultado: resultado.slice(0, 60) });
}

async function traduzirErro(usuarioId: number, e: unknown): Promise<ResultadoOp> {
  if (e instanceof ErroAutorizacao) {
    if (e.message === "escopo_insuficiente") return { ok: false, codigo: "sem_escopo", mensagem: "Sua conexão só tem permissão de leitura. Reautorize a Google Agenda para criar e editar." };
    await marcarRevogada(usuarioId, "Acesso revogado ou expirado no Google; conecte novamente.");
    return { ok: false, codigo: "revogada", mensagem: "O Google recusou o acesso. Conecte a agenda novamente." };
  }
  if (e instanceof ErroEscrita) {
    const map = { permissao: "sem_permissao", conflito: "conflito", nao_encontrado: "nao_encontrado", invalido: "invalido", outro: "outro" } as const;
    return { ok: false, codigo: map[e.codigo], mensagem: e.codigo === "permissao" ? "Você não tem permissão para gravar neste calendário ou evento." : e.codigo === "conflito" ? "Este evento foi alterado no Google depois da última sincronização. Recarregue e tente de novo." : e.codigo === "nao_encontrado" ? "O evento não existe mais no Google." : e.codigo === "invalido" ? `O Google recusou os dados: ${e.message}` : "Falha ao gravar no Google. Tente novamente." };
  }
  console.warn(`[agenda] operação do usuário ${usuarioId} falhou: ${e instanceof Error ? e.message.slice(0, 160) : "erro"}`);
  return { ok: false, codigo: "outro", mensagem: "Falha ao gravar no Google. Tente novamente." };
}

type Prep = { erro: ResultadoOp; c?: undefined } | { erro?: undefined; c: NonNullable<Awaited<ReturnType<typeof conexaoDe>>> };
async function prepararEscrita(usuarioId: number): Promise<Prep> {
  const c = await conexaoDe(usuarioId);
  if (!c || c.estado === "revogada") return { erro: { ok: false, codigo: "sem_conexao", mensagem: "Conecte a Google Agenda primeiro." } };
  if (!podeEscrever(c.escopos)) return { erro: { ok: false, codigo: "sem_escopo", mensagem: "Sua conexão só tem permissão de leitura. Reautorize a Google Agenda para criar e editar." } };
  return { c };
}

export async function criar(usuarioId: number, d: DadosEvento): Promise<ResultadoOp> {
  const prep = await prepararEscrita(usuarioId); if (prep.erro) return prep.erro;
  const c = prep.c;
  const destino = calendariosEscrita(c).find((k) => k.id === d.calendarioId) ?? (d.calendarioId === "primary" ? { id: "primary" } : null);
  if (!destino) return { ok: false, codigo: "sem_permissao", mensagem: "Você não pode gravar nesse calendário." };
  if (d.projetoCodigo && !(await projetosParaAssociacao()).some((p) => p.codigo === d.projetoCodigo)) return { ok: false, codigo: "validacao", mensagem: "Projeto inválido." };
  try {
    const token = await accessTokenDe(usuarioId);
    const corpo = corpoDe(d, true);
    if (d.criarMeet) corpo.conferenceData = { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
    const e = await criarEvento(token, destino.id, corpo, d.enviarConvites && d.participantes.length > 0);
    const id = await espelharEvento(usuarioId, e, destino.id, c.emailGoogle, d.projetoCodigo ? { projetoCodigo: d.projetoCodigo, projetoOrigem: "manual" } : undefined);
    await auditar(usuarioId, "criar", destino.id, e.id, "ok");
    return { ok: true, id };
  } catch (e) { await auditar(usuarioId, "criar", destino.id, null, `erro:${e instanceof ErroEscrita ? e.codigo : "outro"}`); return traduzirErro(usuarioId, e); }
}

/** Só o organizador edita; eventos de terceiros são somente leitura no A360. */
export const podeEditar = (ev: Evento, c: { escopos: string | null } | null) => !ev.privado && ev.souOrganizador && podeEscrever(c?.escopos);

export async function editar(usuarioId: number, eventoId: number, d: DadosEvento): Promise<ResultadoOp> {
  const prep = await prepararEscrita(usuarioId); if (prep.erro) return prep.erro;
  const ev = await eventoDe(usuarioId, eventoId);
  if (!ev) return { ok: false, codigo: "nao_encontrado", mensagem: "Evento não encontrado." };
  if (!podeEditar(ev, prep.c)) return { ok: false, codigo: "sem_permissao", mensagem: "Só o organizador pode editar este compromisso. Use o Google Calendar para pedir a alteração." };
  if (d.projetoCodigo && !(await projetosParaAssociacao()).some((p) => p.codigo === d.projetoCodigo)) return { ok: false, codigo: "validacao", mensagem: "Projeto inválido." };
  try {
    const token = await accessTokenDe(usuarioId);
    const corpo: Partial<CorpoEvento> = corpoDe(d, true);
    if (d.criarMeet && !ev.meetLink) corpo.conferenceData = { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
    // Edição no calendário de origem; mover entre calendários fica para o Google.
    const e = await atualizarEvento(token, ev.calendarioId, ev.googleId, corpo, ev.etag, d.enviarConvites && d.participantes.length > 0);
    const id = await espelharEvento(usuarioId, e, ev.calendarioId, prep.c.emailGoogle, d.projetoCodigo ? { projetoCodigo: d.projetoCodigo, projetoOrigem: "manual" } : { projetoCodigo: null, projetoOrigem: null });
    await auditar(usuarioId, "editar", ev.calendarioId, ev.googleId, "ok");
    return { ok: true, id };
  } catch (e) { await auditar(usuarioId, "editar", ev.calendarioId, ev.googleId, `erro:${e instanceof ErroEscrita ? e.codigo : "outro"}`); return traduzirErro(usuarioId, e); }
}

export async function excluir(usuarioId: number, eventoId: number, avisar: boolean): Promise<ResultadoOp> {
  const prep = await prepararEscrita(usuarioId); if (prep.erro) return prep.erro;
  const ev = await eventoDe(usuarioId, eventoId);
  if (!ev) return { ok: false, codigo: "nao_encontrado", mensagem: "Evento não encontrado." };
  if (!podeEditar(ev, prep.c)) return { ok: false, codigo: "sem_permissao", mensagem: "Só o organizador pode excluir este compromisso." };
  try {
    const token = await accessTokenDe(usuarioId);
    try { await excluirEvento(token, ev.calendarioId, ev.googleId, ev.etag, avisar && ev.participantes.length > 0); }
    catch (e) { if (!(e instanceof ErroEscrita && e.codigo === "nao_encontrado")) throw e; /* já não existia: remove do espelho */ }
    await db.delete(schema.eventosAgenda).where(and(eq(schema.eventosAgenda.usuarioId, usuarioId), eq(schema.eventosAgenda.id, eventoId)));
    await auditar(usuarioId, "excluir", ev.calendarioId, ev.googleId, "ok");
    return { ok: true, id: null };
  } catch (e) { await auditar(usuarioId, "excluir", ev.calendarioId, ev.googleId, `erro:${e instanceof ErroEscrita ? e.codigo : "outro"}`); return traduzirErro(usuarioId, e); }
}

/** Associação manual a projeto (coordenação/gestão ou o próprio organizador). Grava no A360; no Google só se o usuário for o organizador e tiver escrita. */
export async function associarProjeto(usuarioId: number, eventoId: number, projetoCodigo: number | null): Promise<ResultadoOp> {
  const ev = await eventoDe(usuarioId, eventoId);
  if (!ev) return { ok: false, codigo: "nao_encontrado", mensagem: "Evento não encontrado." };
  if (ev.privado) return { ok: false, codigo: "sem_permissao", mensagem: "Eventos privados não recebem associação." };
  if (projetoCodigo && !(await projetosParaAssociacao()).some((p) => p.codigo === projetoCodigo)) return { ok: false, codigo: "validacao", mensagem: "Projeto inválido." };
  await db.update(schema.eventosAgenda).set({ projetoCodigo, projetoOrigem: "manual" }).where(eq(schema.eventosAgenda.id, ev.id));
  const c = await conexaoDe(usuarioId);
  if (c && podeEditar(ev, c)) {
    try { const token = await accessTokenDe(usuarioId); const e = await atualizarEvento(token, ev.calendarioId, ev.googleId, { extendedProperties: { private: { a360_projeto: projetoCodigo ? String(projetoCodigo) : "" } } }, null, false); await db.update(schema.eventosAgenda).set({ etag: e.etag ?? null }).where(eq(schema.eventosAgenda.id, ev.id)); }
    catch { /* a associação fica no A360; a propriedade no Google é conveniência */ }
  }
  await auditar(usuarioId, "associar", ev.calendarioId, ev.googleId, "ok");
  return { ok: true, id: ev.id };
}
