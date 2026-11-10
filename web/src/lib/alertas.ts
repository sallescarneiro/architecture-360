// Alertas de divergência e correção de rota (T-188 evolução, itens 6–8). A IA identifica e recomenda; a gestão decide;
// nada é alterado no Vobi. Histórico só-acréscimo; sem exclusão. Sem atribuição de culpa individual.
import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Usuario } from "@/lib/auth";
import { restricaoDe, sqlParticipa } from "@/lib/participacao";
import { ultimaCargaAceita } from "@/lib/consultas";

export type Alerta = typeof schema.alertasProjeto.$inferSelect;
export type Evidencia = Alerta["evidencias"][number];

export const CLASSIFICACOES: Record<string, { rotulo: string; tom: "ok" | "warn" | "bad" | "neutral" }> = {
  divergencia_confirmada: { rotulo: "divergência confirmada", tom: "bad" }, possivel_divergencia: { rotulo: "possível divergência", tom: "warn" }, alteracao_aprovada: { rotulo: "alteração aprovada", tom: "ok" },
  inconclusivo: { rotulo: "inconclusivo", tom: "neutral" }, corrigida: { rotulo: "já corrigida", tom: "ok" }, limitacao_dados: { rotulo: "limitação de dados", tom: "neutral" },
};
export const PRIORIDADES: Record<string, { rotulo: string; tom: "critico" | "relevante" | "breve" | "neutro"; ordem: number }> = {
  critico: { rotulo: "crítico", tom: "critico", ordem: 0 }, alto: { rotulo: "alto", tom: "relevante", ordem: 1 }, moderado: { rotulo: "moderado", tom: "breve", ordem: 2 }, informativo: { rotulo: "informativo", tom: "neutro", ordem: 3 },
};
export const SITUACOES: Record<string, { rotulo: string; tom: "ok" | "warn" | "bad" | "neutral"; aberto: boolean }> = {
  aberto: { rotulo: "aguardando análise", tom: "warn", aberto: true }, em_analise: { rotulo: "em análise", tom: "warn", aberto: true }, esclarecimento: { rotulo: "aguardando esclarecimento", tom: "warn", aberto: true },
  em_tratamento: { rotulo: "em tratamento", tom: "warn", aberto: true }, resolvido: { rotulo: "resolvido", tom: "ok", aberto: false }, descartado: { rotulo: "descartado", tom: "neutral", aberto: false },
};
export const CATEGORIAS: Record<string, string> = { material: "materiais", especificacao: "especificações", layout: "layout", ambientes: "distribuição dos ambientes", equipamentos: "equipamentos", dimensoes: "dimensões", quantitativos: "quantitativos", solucao_tecnica: "solução técnica", escopo: "alteração de escopo", condicao_aprovacao: "condição de aprovação", solicitacao_cliente: "solicitação do cliente", decisao_posterior: "decisão posterior", prazo: "prazo", outro: "outro" };

const podeTratar = (u: Usuario) => ["admin", "gestao", "coordenacao"].includes(u.perfil);

export const chaveDe = (projetoCodigo: number, categoria: string, titulo: string, refs: string[]) =>
  createHash("sha1").update(`${projetoCodigo}|${categoria}|${titulo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()}|${[...refs].sort().join(",")}`).digest("hex").slice(0, 20);

type NovoAlerta = { projetoCodigo: number; categoria: string; titulo: string; descricao: string; classificacao: string; prioridade: string; confianca: number | null; evidencias: Evidencia[]; impacto: string | null; origem: "ia" | "humano"; analiseId?: number | null; criadoPor?: number | null };

/** Cria o alerta se não existir ocorrência equivalente (mesma chave). Devolve o id e se é novo. */
export async function criarAlerta(a: NovoAlerta): Promise<{ id: number; novo: boolean }> {
  const chave = chaveDe(a.projetoCodigo, a.categoria, a.titulo, a.evidencias.map((e) => e.ref));
  const ex = (await db.select({ id: schema.alertasProjeto.id }).from(schema.alertasProjeto).where(and(eq(schema.alertasProjeto.projetoCodigo, a.projetoCodigo), eq(schema.alertasProjeto.chave, chave))).limit(1))[0];
  if (ex) return { id: ex.id, novo: false };
  return db.transaction(async (tx) => {
    const [r] = await tx.insert(schema.alertasProjeto).values({ projetoCodigo: a.projetoCodigo, chave, categoria: a.categoria, titulo: a.titulo.slice(0, 200), descricao: a.descricao, classificacao: a.classificacao, prioridade: a.prioridade, confianca: a.confianca, evidencias: a.evidencias, impacto: a.impacto, origem: a.origem, analiseId: a.analiseId ?? null, situacao: a.classificacao === "alteracao_aprovada" || a.classificacao === "corrigida" ? "resolvido" : "aberto", encerradoEm: a.classificacao === "alteracao_aprovada" || a.classificacao === "corrigida" ? new Date() : null }).returning({ id: schema.alertasProjeto.id });
    await tx.insert(schema.historicoAlerta).values({ alertaId: r.id, usuarioId: a.criadoPor ?? null, acao: "criado", justificativa: a.origem === "ia" ? `Identificado pela IA (confiança ${a.confianca ?? "—"}%)` : "Registrado pela gestão", depois: { classificacao: a.classificacao, prioridade: a.prioridade, evidencias: a.evidencias } });
    return { id: r.id, novo: true };
  });
}

export type AlertaLista = Alerta & { projetoNome: string | null; clienteNome: string | null };

export async function listarAlertas(u: Usuario, f: { situacao?: string; prioridade?: string; projeto?: number | null; classificacao?: string; abertos?: boolean }): Promise<AlertaLista[]> {
  const where: string[] = ["true"];
  if (!podeTratar(u)) { // arquiteta: só alertas de projetos em que participa (sem culpa, só contexto)
    const r = await restricaoDe(u.email); const carga = await ultimaCargaAceita();
    where.push(carga ? `exists (select 1 from projeto p where p.codigo = a.projeto_codigo and ${sqlParticipa(r.email, r.nomes, carga.id, "p")})` : "false");
  }
  if (f.situacao) where.push(`a.situacao = '${f.situacao.replace(/'/g, "")}'`);
  if (f.abertos) where.push(`a.situacao in ('aberto','em_analise','esclarecimento','em_tratamento')`);
  if (f.prioridade) where.push(`a.prioridade = '${f.prioridade.replace(/'/g, "")}'`);
  if (f.classificacao) where.push(`a.classificacao = '${f.classificacao.replace(/'/g, "")}'`);
  if (f.projeto) where.push(`a.projeto_codigo = ${f.projeto}`);
  where.push("exists (select 1 from projeto px where px.codigo = a.projeto_codigo)"); // recorte 2026: alertas de projetos arquivados ficam fora
  const q = await db.execute(sql.raw(`select a.*, p.nome as projeto_nome, c.nome as cliente_nome from projeto_alerta a left join projeto p on p.codigo = a.projeto_codigo left join cliente_vobi c on c.codigo = p.cliente_codigo
    where ${where.join(" and ")} order by case a.prioridade when 'critico' then 0 when 'alto' then 1 when 'moderado' then 2 else 3 end, a.criado_em desc limit 300`));
  return (q.rows as Record<string, unknown>[]).map((x) => ({
    id: Number(x.id), projetoCodigo: Number(x.projeto_codigo), chave: String(x.chave), categoria: String(x.categoria), titulo: String(x.titulo), descricao: String(x.descricao), classificacao: String(x.classificacao), prioridade: String(x.prioridade), confianca: x.confianca == null ? null : Number(x.confianca), evidencias: (x.evidencias as Evidencia[]) ?? [], impacto: (x.impacto as string | null) ?? null, situacao: String(x.situacao), responsavel: (x.responsavel as string | null) ?? null, prazo: (x.prazo as string | null) ?? null, direcionamento: (x.direcionamento as string | null) ?? null, origem: String(x.origem), analiseId: x.analise_id == null ? null : Number(x.analise_id),
    criadoEm: new Date(String(x.criado_em)), atualizadoEm: new Date(String(x.atualizado_em)), encerradoEm: x.encerrado_em ? new Date(String(x.encerrado_em)) : null, projetoNome: (x.projeto_nome as string | null) ?? null, clienteNome: (x.cliente_nome as string | null) ?? null,
  }));
}

export async function alertaPorId(id: number): Promise<Alerta | null> { return (await db.select().from(schema.alertasProjeto).where(eq(schema.alertasProjeto.id, id)).limit(1))[0] ?? null; }
export async function historicoAlertaDe(id: number) {
  return db.select({ id: schema.historicoAlerta.id, acao: schema.historicoAlerta.acao, justificativa: schema.historicoAlerta.justificativa, antes: schema.historicoAlerta.antes, depois: schema.historicoAlerta.depois, quando: schema.historicoAlerta.quando, quem: schema.usuarios.nome })
    .from(schema.historicoAlerta).leftJoin(schema.usuarios, eq(schema.usuarios.id, schema.historicoAlerta.usuarioId)).where(eq(schema.historicoAlerta.alertaId, id)).orderBy(desc(schema.historicoAlerta.id));
}
export async function podeVerAlerta(u: Usuario, a: Alerta): Promise<boolean> {
  if (podeTratar(u)) return true;
  const r = await restricaoDe(u.email); const carga = await ultimaCargaAceita(); if (!carga) return false;
  const q = await db.execute(sql.raw(`select 1 from projeto p where p.codigo = ${a.projetoCodigo} and ${sqlParticipa(r.email, r.nomes, carga.id, "p")}`));
  return q.rows.length > 0;
}

export type AcaoAlerta = "em_analise" | "confirmado" | "descartado" | "esclarecimento" | "alteracao_aprovada" | "correcao_rota" | "responsavel" | "prazo" | "providencia" | "encerrado" | "reaberto";

/** Tratamento humano. Toda ação exige quem pode tratar (coordenação/gestão/admin) e fica no histórico. */
export async function tratarAlerta(u: Usuario, a: Alerta, acao: AcaoAlerta, dados: { justificativa?: string; responsavel?: string; prazo?: string; direcionamento?: string }): Promise<string | null> {
  if (!podeTratar(u)) return "Só coordenação e gestão tratam alertas.";
  const j = (dados.justificativa ?? "").trim();
  const set: Partial<typeof schema.alertasProjeto.$inferInsert> = { atualizadoEm: new Date() };
  const antes = { situacao: a.situacao, classificacao: a.classificacao, responsavel: a.responsavel, prazo: a.prazo, direcionamento: a.direcionamento };
  switch (acao) {
    case "em_analise": set.situacao = "em_analise"; break;
    case "confirmado": set.classificacao = "divergencia_confirmada"; set.situacao = "em_tratamento"; break;
    case "descartado": if (j.length < 5) return "Descartar exige justificativa."; set.situacao = "descartado"; set.encerradoEm = new Date(); break;
    case "esclarecimento": if (j.length < 5) return "Descreva o esclarecimento solicitado e a quem."; set.situacao = "esclarecimento"; break;
    case "alteracao_aprovada": if (j.length < 5) return "Registre quem aprovou a alteração e quando."; set.classificacao = "alteracao_aprovada"; set.situacao = "resolvido"; set.encerradoEm = new Date(); break;
    case "correcao_rota": if (!dados.direcionamento?.trim()) return "Descreva a correção de rota."; set.direcionamento = dados.direcionamento.trim().slice(0, 2000); set.situacao = "em_tratamento"; if (dados.responsavel?.trim()) set.responsavel = dados.responsavel.trim().slice(0, 120); if (dados.prazo && /^\d{4}-\d{2}-\d{2}$/.test(dados.prazo)) set.prazo = dados.prazo; break;
    case "responsavel": set.responsavel = dados.responsavel?.trim().slice(0, 120) || null; break;
    case "prazo": set.prazo = dados.prazo && /^\d{4}-\d{2}-\d{2}$/.test(dados.prazo) ? dados.prazo : null; break;
    case "providencia": if (j.length < 3) return "Descreva a providência."; break;
    case "encerrado": if (j.length < 5) return "Registre o resultado para encerrar."; set.situacao = "resolvido"; set.encerradoEm = new Date(); if (a.classificacao === "possivel_divergencia" || a.classificacao === "inconclusivo") set.classificacao = "corrigida"; break;
    case "reaberto": set.situacao = "aberto"; set.encerradoEm = null; break;
  }
  await db.transaction(async (tx) => {
    await tx.update(schema.alertasProjeto).set(set).where(eq(schema.alertasProjeto.id, a.id));
    await tx.insert(schema.historicoAlerta).values({ alertaId: a.id, usuarioId: u.id, acao, justificativa: j || dados.direcionamento?.trim() || null, antes, depois: { situacao: set.situacao ?? a.situacao, classificacao: set.classificacao ?? a.classificacao, responsavel: set.responsavel ?? a.responsavel, prazo: set.prazo ?? a.prazo, direcionamento: set.direcionamento ?? a.direcionamento } });
  });
  return null;
}

export async function indicadoresAlertas() {
  const r = await db.execute(sql`select
    count(*) filter (where situacao in ('aberto','em_analise','esclarecimento','em_tratamento'))::int abertos,
    count(*) filter (where situacao in ('aberto','em_analise','esclarecimento','em_tratamento') and prioridade='critico')::int criticos,
    count(*) filter (where situacao in ('aberto','em_analise','esclarecimento','em_tratamento') and prioridade='alto')::int altos,
    count(*) filter (where situacao='aberto')::int aguardando,
    count(*) filter (where situacao in ('em_analise','esclarecimento','em_tratamento'))::int tratamento,
    count(*) filter (where situacao='resolvido')::int resolvidos,
    count(*) filter (where situacao='descartado')::int descartados,
    coalesce(round(avg(extract(epoch from (encerrado_em - criado_em))/86400) filter (where encerrado_em is not null and situacao='resolvido'))::int, 0) dias_tratamento,
    count(distinct projeto_codigo) filter (where situacao in ('aberto','em_analise','esclarecimento','em_tratamento'))::int projetos
    from projeto_alerta`);
  const x = r.rows[0] as Record<string, number>;
  const rec = await db.execute(sql`select categoria, count(*)::int n from projeto_alerta where classificacao in ('divergencia_confirmada','possivel_divergencia') group by 1 having count(*) >= 2 order by 2 desc limit 5`);
  return { abertos: Number(x.abertos), criticos: Number(x.criticos), altos: Number(x.altos), aguardando: Number(x.aguardando), tratamento: Number(x.tratamento), resolvidos: Number(x.resolvidos), descartados: Number(x.descartados), diasTratamento: Number(x.dias_tratamento), projetos: Number(x.projetos), recorrentes: (rec.rows as { categoria: string; n: number }[]).map((y) => ({ categoria: y.categoria, n: Number(y.n) })) };
}

export async function alertasDoProjeto(codigo: number): Promise<Alerta[]> {
  return db.select().from(schema.alertasProjeto).where(eq(schema.alertasProjeto.projetoCodigo, codigo)).orderBy(desc(schema.alertasProjeto.criadoEm));
}

