// Justificativa de atraso de tarefa do Vobi (T-287, pedido de Rodrigo em 23/11/2026, caso da Thaís na Academia Fitpong):
// a coordenação (e a gestão) registra por que a tarefa atrasou; a gestão (Thaís) ou a direção valida ou define outra medida.
// O A360 não escreve no Vobi: a data nova continua sendo trocada lá; aqui fica o registro e a decisão.
import { papeis } from "@/lib/cobertura";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Usuario } from "@/lib/auth";
import { hojeIso, statusPrazo } from "@/lib/prazo";

export const CATEGORIAS: Record<string, string> = {
  cliente: "Aguardando o cliente (informação, medidas, aprovação)",
  escopo: "Mudança de escopo ou pedido novo do cliente",
  equipe: "Capacidade da equipe ou redistribuição",
  terceiros: "Questão técnica ou de terceiros",
  outro: "Outro motivo",
};
export const CATEGORIA_CURTA: Record<string, string> = { cliente: "cliente", escopo: "escopo", equipe: "equipe", terceiros: "técnica/terceiros", outro: "outro" };
export const SITUACAO: Record<string, { rotulo: string; tom: "ok" | "warn" | "bad" | "info" | "neutral" }> = {
  aguardando: { rotulo: "aguardando validação", tom: "warn" },
  validada: { rotulo: "atraso justificado", tom: "ok" },
  medida: { rotulo: "outra medida", tom: "info" },
};

/** Registra: coordenação, gestão e direção. Arquitetas não veem (decisão de Rodrigo, 23/11/2026). */
export const podeJustificar = (u: Usuario) => u.perfil === "coordenacao" || u.perfil === "gestao" || u.perfil === "admin";
/** Valida: só a gestão (Thaís) e a direção. */
export const podeValidarAtraso = async (u: Usuario) => u.perfil === "admin" || (await papeis(u)).has("gestao"); // T-301: inclui quem cobre a gerência

export type Justificativa = typeof schema.atrasoJustificativas.$inferSelect & { registradoPor: string; decididoPor: string | null; projetoNome: string | null };

const BASE = sql`select j.*, ur.nome registrado_por, ud.nome decidido_por, p.nome projeto_nome
  from atraso_justificativa j join usuario ur on ur.id = j.registrado_por_id left join usuario ud on ud.id = j.decidido_por_id
  left join projeto p on p.codigo = j.projeto_codigo`;
const mapa = (r: Record<string, unknown>): Justificativa => ({
  id: Number(r.id), tarefaChave: String(r.tarefa_chave), idVobi: r.id_vobi == null ? null : Number(r.id_vobi), projetoCodigo: r.projeto_codigo == null ? null : Number(r.projeto_codigo),
  tarefaNome: String(r.tarefa_nome), etapa: (r.etapa as string) ?? null, prazoVobi: (r.prazo_vobi as string) ?? null, diasAtraso: r.dias_atraso == null ? null : Number(r.dias_atraso),
  categoria: String(r.categoria), motivo: String(r.motivo), novaData: (r.nova_data as string) ?? null, registradoPorId: Number(r.registrado_por_id),
  registradoEm: new Date(String(r.registrado_em)), situacao: String(r.situacao), decisao: (r.decisao as string) ?? null,
  decididoPorId: r.decidido_por_id == null ? null : Number(r.decidido_por_id), decididoEm: r.decidido_em ? new Date(String(r.decidido_em)) : null,
  registradoPor: String(r.registrado_por), decididoPor: (r.decidido_por as string) ?? null, projetoNome: (r.projeto_nome as string) ?? null,
});

/** Última justificativa de cada tarefa do projeto (chave → justificativa). */
export async function ultimasDoProjeto(codigo: number): Promise<Map<string, Justificativa>> {
  const rows = (await db.execute(sql`${BASE} where j.projeto_codigo = ${codigo} order by j.id`)).rows.map(mapa);
  return new Map(rows.map((j) => [j.tarefaChave, j]));
}

export async function porSituacao(situacao: string): Promise<Justificativa[]> {
  return (await db.execute(sql`${BASE} where j.situacao = ${situacao} order by j.registrado_em desc limit 300`)).rows.map(mapa);
}

export type TarefaAtrasada = { chave: string; nome: string; etapa: string | null; dataFim: string; dias: number; responsavel: string | null; projetoCodigo: number; projetoNome: string };
/** Tarefas abertas e atrasadas (última carga) que ainda não têm justificativa registrada. */
export async function atrasadasSemJustificativa(): Promise<TarefaAtrasada[]> {
  const hoje = hojeIso();
  const rows = (await db.execute(sql`select t.chave, t.nome, t.etapa_csv, t.status, t.data_fim, t.responsavel_nome, p.codigo, p.nome projeto_nome
    from tarefa t join projeto p on p.codigo = t.projeto_codigo
    where t.nao_encontrado_desde is null and t.orfa = false and t.data_fim is not null and t.data_fim < ${hoje}
      and coalesce(t.status,'') not in ('concluido','cancelado')
      and not exists (select 1 from atraso_justificativa j where j.tarefa_chave = t.chave and coalesce(j.prazo_vobi,'') = t.data_fim)
    order by t.data_fim asc, p.nome asc limit 400`)).rows as Record<string, string | number | null>[];
  return rows.map((r) => ({ chave: String(r.chave), nome: String(r.nome), etapa: (r.etapa_csv as string) ?? null, dataFim: String(r.data_fim),
    dias: Math.abs(statusPrazo(r.status as string, r.data_fim as string, hoje).dias ?? 0), responsavel: (r.responsavel_nome as string) ?? null,
    projetoCodigo: Number(r.codigo), projetoNome: String(r.projeto_nome) }))
    .filter((t) => t.dias > 0);
}

type R = { ok: true } | { ok: false; mensagem: string };

export async function registrar(u: Usuario, chave: string, categoria: string, motivo: string, novaData: string | null): Promise<R> {
  if (!podeJustificar(u)) return { ok: false, mensagem: "Seu perfil não registra justificativa de atraso." };
  if (!(categoria in CATEGORIAS)) return { ok: false, mensagem: "Escolha a categoria do atraso." };
  if (motivo.trim().length < 5) return { ok: false, mensagem: "Escreva o motivo do atraso." };
  if (novaData && !/^\d{4}-\d{2}-\d{2}$/.test(novaData)) return { ok: false, mensagem: "Nova data inválida." };
  const t = (await db.select().from(schema.tarefas).where(eq(schema.tarefas.chave, chave)).limit(1))[0];
  if (!t) return { ok: false, mensagem: "Tarefa não encontrada na última carga." };
  const info = statusPrazo(t.status, t.dataFim, hojeIso());
  if (!info.atrasada) return { ok: false, mensagem: "Esta tarefa não está atrasada na última leitura do Vobi." };
  const aberta = (await db.select({ id: schema.atrasoJustificativas.id }).from(schema.atrasoJustificativas)
    .where(and(eq(schema.atrasoJustificativas.tarefaChave, chave), eq(schema.atrasoJustificativas.situacao, "aguardando"))).limit(1))[0];
  if (aberta) return { ok: false, mensagem: "Já existe uma justificativa aguardando validação para esta tarefa." };
  await db.insert(schema.atrasoJustificativas).values({
    tarefaChave: chave, idVobi: t.idVobi, projetoCodigo: t.projetoCodigo, tarefaNome: t.nome, etapa: t.etapaCsv, prazoVobi: t.dataFim,
    diasAtraso: Math.abs(info.dias ?? 0), categoria, motivo: motivo.trim(), novaData: novaData || null, registradoPorId: u.id,
  });
  return { ok: true };
}

export async function decidir(u: Usuario, id: number, situacao: "validada" | "medida", decisao: string): Promise<R> {
  if (!(await podeValidarAtraso(u))) return { ok: false, mensagem: "Só a gestão valida justificativas de atraso." };
  if (situacao === "medida" && decisao.trim().length < 5) return { ok: false, mensagem: "Descreva a medida a tomar." };
  const j = (await db.select().from(schema.atrasoJustificativas).where(eq(schema.atrasoJustificativas.id, id)).limit(1))[0];
  if (!j) return { ok: false, mensagem: "Justificativa não encontrada." };
  if (j.situacao !== "aguardando") return { ok: false, mensagem: "Esta justificativa já foi decidida." };
  await db.update(schema.atrasoJustificativas).set({ situacao, decisao: decisao.trim() || null, decididoPorId: u.id, decididoEm: new Date() })
    .where(eq(schema.atrasoJustificativas.id, id));
  return { ok: true };
}

export async function contagens() {
  const r = (await db.execute(sql`select situacao, count(*)::int n from atraso_justificativa group by situacao`)).rows as { situacao: string; n: number }[];
  return Object.fromEntries(r.map((x) => [x.situacao, Number(x.n)])) as Record<string, number>;
}
