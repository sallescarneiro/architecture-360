// T-227 — Motivos da reunião (assunto tratado) e origem (quem solicitou). A lista de motivos é administrada pela gestão:
// incluir, desativar e reativar; nada é apagado. Motivo desativado sai do formulário de novas reuniões, mas continua nas
// reuniões que já o usam. Cada mudança fica no histórico (ação, motivo, responsável, data e hora).
import { asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Usuario } from "@/lib/auth";

export const ORIGENS: Record<string, string> = { cliente: "Cliente", rucelle: "Rucelle", coordenacao: "Coordenação", gestao: "Gestão", equipe_tecnica: "Equipe técnica" };

/** Só gestão e administração administram a lista de motivos. */
export const podeAdministrarMotivos = (u: Usuario) => u.perfil === "admin" || u.perfil === "gestao";

/** Chave de duplicidade: ignora maiúsculas/minúsculas e espaços repetidos ou nas pontas. */
export const chaveMotivo = (nome: string) => nome.toLowerCase().replace(/\s+/g, " ").trim();

export type Motivo = typeof schema.motivosReuniao.$inferSelect & { uso: number };

/** Lista de motivos com a contagem real de reuniões associadas. */
export async function listarMotivos(): Promise<Motivo[]> {
  const r = await db.execute(sql`select m.*, (select count(*)::int from reuniao r where r.motivo_id = m.id) uso from reuniao_motivo m order by m.ordem, m.id`);
  return (r.rows as Record<string, unknown>[]).map((x) => ({ id: Number(x.id), nome: String(x.nome), chave: String(x.chave), ordem: Number(x.ordem), ativo: Boolean(x.ativo), criadoEm: new Date(String(x.criado_em)), uso: Number(x.uso) }));
}
/** Opções do formulário: os ativos e, se houver, o motivo atual da reunião mesmo desativado (para não sumir na edição). */
export async function opcoesMotivo(atual?: number | null) {
  const todos = await db.select().from(schema.motivosReuniao).orderBy(asc(schema.motivosReuniao.ordem), asc(schema.motivosReuniao.id));
  return todos.filter((m) => m.ativo || m.id === atual).map((m) => ({ id: m.id, nome: m.nome, ativo: m.ativo }));
}
export async function motivoPorId(id: number | null | undefined) {
  if (!id) return null;
  return (await db.select().from(schema.motivosReuniao).where(eq(schema.motivosReuniao.id, id)).limit(1))[0] ?? null;
}

export async function historicoDosMotivos(limite = 40) {
  return db.select({ id: schema.historicoMotivos.id, acao: schema.historicoMotivos.acao, motivo: schema.historicoMotivos.motivoNome, quando: schema.historicoMotivos.quando, quem: schema.usuarios.nome })
    .from(schema.historicoMotivos).leftJoin(schema.usuarios, eq(schema.usuarios.id, schema.historicoMotivos.usuarioId))
    .orderBy(desc(schema.historicoMotivos.id)).limit(limite);
}

export async function incluirMotivo(u: Usuario, nomeBruto: string): Promise<{ ok: true; nome: string } | { ok: false; erro: string }> {
  if (!podeAdministrarMotivos(u)) return { ok: false, erro: "Só a gestão administra os motivos." };
  const nome = nomeBruto.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!nome) return { ok: false, erro: "Digite o nome do motivo." };
  const chave = chaveMotivo(nome);
  const igual = (await db.select().from(schema.motivosReuniao).where(eq(schema.motivosReuniao.chave, chave)).limit(1))[0];
  if (igual) return { ok: false, erro: igual.ativo ? `Já existe o motivo “${igual.nome}”. Nada foi incluído.` : `Já existe o motivo “${igual.nome}”, desativado. Use “Reativar” na lista em vez de incluir de novo.` };
  return db.transaction(async (tx) => {
    const [{ prox }] = (await tx.execute(sql`select coalesce(max(ordem), 0) + 1 as prox from reuniao_motivo`)).rows as { prox: number }[];
    const ins = await tx.insert(schema.motivosReuniao).values({ nome, chave, ordem: Number(prox) }).onConflictDoNothing().returning({ id: schema.motivosReuniao.id });
    if (!ins[0]) return { ok: false as const, erro: "Já existe um motivo com esse nome." };
    await tx.insert(schema.historicoMotivos).values({ motivoId: ins[0].id, acao: "incluido", motivoNome: nome, usuarioId: u.id });
    return { ok: true as const, nome };
  });
}

export async function alternarMotivo(u: Usuario, id: number, ativo: boolean): Promise<{ ok: true; nome: string; uso: number } | { ok: false; erro: string }> {
  if (!podeAdministrarMotivos(u)) return { ok: false, erro: "Só a gestão administra os motivos." };
  const m = await motivoPorId(id);
  if (!m) return { ok: false, erro: "Motivo não encontrado." };
  if (m.ativo === ativo) return { ok: true, nome: m.nome, uso: 0 };
  await db.transaction(async (tx) => {
    await tx.update(schema.motivosReuniao).set({ ativo }).where(eq(schema.motivosReuniao.id, id));
    await tx.insert(schema.historicoMotivos).values({ motivoId: id, acao: ativo ? "reativado" : "desativado", motivoNome: m.nome, usuarioId: u.id });
  });
  const uso = Number(((await db.execute(sql`select count(*)::int n from reuniao where motivo_id = ${id}`)).rows[0] as { n: number }).n);
  return { ok: true, nome: m.nome, uso };
}
