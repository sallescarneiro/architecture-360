// T-219 — REGRA DEFINITIVA DO RECORTE 2026 (Rodrigo, 12/11/2026): só projetos INICIADOS em 2026 entram na Agenda, na
// cobertura e na sincronização bidirecional. "Iniciado" = data de criação do projeto no Vobi ("Criado em", a mesma usada
// pelo importador). Projetos e tarefas anteriores ficam só no Vobi: o que já estava copiado é preservado, mas não é mais
// atualizado nem conta como pendência.
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { RECORTE_INICIO } from "@/lib/importador/normalizacao";

/** Subconsulta SQL com os códigos dos projetos elegíveis. */
export const SQL_ELEGIVEIS = sql.raw(`(select codigo from projeto where criado_em >= '${RECORTE_INICIO}')`);

export async function projetosElegiveis(): Promise<Set<number>> {
  return new Set(((await db.execute(sql`select codigo from projeto where criado_em >= ${RECORTE_INICIO}`)).rows as { codigo: number }[]).map((p) => Number(p.codigo)));
}
export async function projetoElegivel(codigo: number | null | undefined): Promise<boolean> {
  if (!codigo) return false;
  return (await projetosElegiveis()).has(codigo);
}
