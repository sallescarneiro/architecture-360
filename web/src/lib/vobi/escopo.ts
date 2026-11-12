// T-219 — RECORTE 2026 (regra definitiva de 12/11/2026, critério ajustado por Rodrigo às 11:44 do mesmo dia):
// entra na Agenda, na cobertura e na sincronização bidirecional o projeto cuja DATA DE INÍCIO PREVISTA no Vobi
// (startDate) é de 2026 em diante — não a data de criação do cadastro. Sem data de início prevista: não entra
// automaticamente; a gestão pode incorporá-lo pela busca sob demanda ("Buscar projeto no Vobi"), que também
// incorpora projetos anteriores. Projetos fora do recorte ficam só no Vobi: o que já estava copiado é preservado
// (nos demais módulos e no espelho), mas não é atualizado nem conta como pendência.
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { RECORTE_INICIO } from "@/lib/importador/normalizacao";

const ELEGIVEIS = `select codigo from projeto where inicio_previsto >= '${RECORTE_INICIO}'
  union select codigo from projeto_sob_demanda where situacao = 'integrado'`;

/** Subconsulta SQL com os códigos dos projetos elegíveis. */
export const SQL_ELEGIVEIS = sql.raw(`(${ELEGIVEIS})`);

export async function projetosElegiveis(): Promise<Set<number>> {
  return new Set(((await db.execute(sql.raw(ELEGIVEIS))).rows as { codigo: number }[]).map((p) => Number(p.codigo)));
}
export async function projetoElegivel(codigo: number | null | undefined): Promise<boolean> {
  if (!codigo) return false;
  return (await projetosElegiveis()).has(codigo);
}
/** Projetos incorporados sob demanda (a carga diária não os marca como ausentes e lê as tarefas deles). */
export async function projetosSobDemanda(): Promise<number[]> {
  return ((await db.execute(sql`select distinct codigo from projeto_sob_demanda where situacao = 'integrado'`)).rows as { codigo: number }[]).map((p) => Number(p.codigo));
}
/** "AAAA-MM-DD" da data de início prevista do Vobi (data pura; meia-noite UTC não muda de dia). */
export function dataInicioPrevisto(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s) && (s.length === 10 || /T00:00:00(\.0+)?(Z|\+00:00)$/.test(s))) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}
/** Grava a data de início prevista dos projetos lidos do Vobi (só nos que já estão no A360). */
export async function gravarInicioPrevisto(projs: Record<string, unknown>[]) {
  let n = 0;
  for (const p of projs) {
    const id = Number(p.id);
    if (!Number.isFinite(id) || !("startDate" in p)) continue;
    const ini = dataInicioPrevisto(p.startDate);
    const r = await db.execute(sql`update projeto set inicio_previsto = ${ini} where codigo = ${id} and inicio_previsto is distinct from ${ini}`);
    n += r.rowCount ?? 0;
  }
  return n;
}
