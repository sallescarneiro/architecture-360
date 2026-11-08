import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export async function ultimaCargaAceita() {
  // só cargas de operação (Projetos+Tarefas); uma carga só de Clientes não muda a base da Operação
  return (await db.select().from(schema.cargas).where(and(eq(schema.cargas.status, "aceita"), eq(schema.cargas.tipo, "operacao"))).orderBy(desc(schema.cargas.id)).limit(1))[0] ?? null;
}

export type Selo = { base: number; total: number; dataCarga: string; cargaId: number };
export function selo(base: number, total: number, carga: { id: number; dataCarga: string }): Selo {
  return { base, total, dataCarga: carga.dataCarga, cargaId: carga.id };
}

export const linkVobiProjeto = (codigo: number) => `https://plataforma.vobi.com.br/profissional/projetos/perfil/${codigo}/tarefas`;

export async function contagem(sqlText: string) {
  const r = await db.execute(sql.raw(sqlText));
  return r.rows as Record<string, unknown>[];
}
