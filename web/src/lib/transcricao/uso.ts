// Registro e controle de consumo da IA (T-188). Nunca grava a chave nem o conteúdo enviado.
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { limiteDiarioUsd, type Uso } from "./ia";

export async function registrarUso(tipo: string, referencia: string | null, uso: Uso | null, estado: "ok" | "erro", erro: string | null, usuarioId: number | null, detalhes?: unknown, httpStatus?: number) {
  await db.insert(schema.usoIa).values({ tipo, referencia, modelo: uso?.modeloRetornado ?? uso?.modelo ?? null, tokensEntrada: uso?.tokensEntrada ?? null, tokensSaida: uso?.tokensSaida ?? null, custoEstimadoUsd: uso?.custoUsd ?? null, duracaoMs: uso?.duracaoMs ?? null, estado, erro: erro ? erro.slice(0, 300) : null, httpStatus: httpStatus ?? uso?.httpStatus ?? null, detalhes: detalhes ?? null, usuarioId });
}

/** Gasto estimado hoje (America/Sao_Paulo) e teto. */
export async function gastoHoje(): Promise<{ usd: number; limite: number; chamadas: number }> {
  const r = await db.execute(sql`select coalesce(sum(custo_estimado_usd),0)::float usd, count(*)::int n from ia_uso where quando >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' and estado='ok'`);
  const x = r.rows[0] as { usd: number; n: number };
  return { usd: Number(x.usd), limite: limiteDiarioUsd(), chamadas: Number(x.n) };
}
export async function tetoAtingido(): Promise<string | null> {
  const g = await gastoHoje();
  return g.usd >= g.limite ? `Teto diário estimado de IA atingido (US$ ${g.usd.toFixed(2)} de US$ ${g.limite.toFixed(2)}). Novas chamadas só amanhã ou após ajustar IA_LIMITE_DIARIO_USD.` : null;
}
export async function resumoUso() {
  const r = await db.execute(sql`select
    count(*) filter (where estado='ok')::int ok, count(*) filter (where estado='erro')::int erros,
    coalesce(sum(tokens_entrada),0)::int entrada, coalesce(sum(tokens_saida),0)::int saida, coalesce(sum(custo_estimado_usd),0)::float custo,
    coalesce(sum(custo_estimado_usd) filter (where quando >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),0)::float custo_mes,
    max(quando) filter (where estado='ok' and tipo <> 'teste_conexao') ultima_ok from ia_uso`);
  const x = r.rows[0] as Record<string, unknown>;
  return { ok: Number(x.ok), erros: Number(x.erros), entrada: Number(x.entrada), saida: Number(x.saida), custo: Number(x.custo), custoMes: Number(x.custo_mes), ultimaOk: x.ultima_ok ? new Date(String(x.ultima_ok)) : null, hoje: await gastoHoje() };
}
export async function ultimosUsos(n = 20) { return db.select().from(schema.usoIa).orderBy(desc(schema.usoIa.id)).limit(n); }
export async function ultimaValidacao() { return (await db.select().from(schema.usoIa).where(and(eq(schema.usoIa.tipo, "validacao"), gte(schema.usoIa.id, 0))).orderBy(desc(schema.usoIa.id)).limit(1))[0] ?? null; }
