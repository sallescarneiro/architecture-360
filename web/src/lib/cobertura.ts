// T-301 (24/11/2026, pedido de Rodrigo): cobertura de ausência entre coordenação e gerência.
// Enquanto a ausência estiver valendo, quem cobre recebe o papel da ausente: etapas de revisão de entregáveis,
// validação de atrasos, validação de propostas da agenda e a fila "Para eu revisar". Vale nos dois sentidos.
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { Perfil, Usuario } from "@/lib/auth";

export type Cobertura = { ausenteId: number; ausenteNome: string; ausentePerfil: Perfil; validadora: boolean; de: string | null; ate: string; cobreId: number; cobreNome: string };

const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Ausências valendo hoje, com quem cobre. */
export async function coberturasAtivas(): Promise<Cobertura[]> {
  const h = hoje();
  const r = await db.execute(sql`select a.usuario_id, ua.nome ausente_nome, ua.perfil ausente_perfil, a.validadora, a.ausente_de, a.ausente_ate, a.coberta_por_id, uc.nome cobre_nome
    from agenda_pessoa a join usuario ua on ua.id = a.usuario_id join usuario uc on uc.id = a.coberta_por_id
    where a.coberta_por_id is not null and a.ausente_ate is not null and a.ausente_ate >= ${h} and coalesce(a.ausente_de, ${h}) <= ${h} and uc.ativo`);
  return (r.rows as Record<string, unknown>[]).map((x) => ({
    ausenteId: Number(x.usuario_id), ausenteNome: String(x.ausente_nome), ausentePerfil: x.ausente_perfil as Perfil, validadora: !!x.validadora,
    de: (x.ausente_de as string) ?? null, ate: String(x.ausente_ate), cobreId: Number(x.coberta_por_id), cobreNome: String(x.cobre_nome),
  }));
}

/** O que esta pessoa está cobrindo hoje. */
export async function cobrindo(u: Usuario): Promise<Cobertura[]> {
  return (await coberturasAtivas()).filter((c) => c.cobreId === u.id);
}

/** Perfil próprio + perfis de quem a pessoa cobre hoje. */
export async function papeis(u: Usuario): Promise<Set<Perfil>> {
  const s = new Set<Perfil>([u.perfil]);
  for (const c of await cobrindo(u)) s.add(c.ausentePerfil);
  return s;
}

export const dataBr = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
