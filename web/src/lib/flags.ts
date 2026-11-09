// Flags de limitação de dados (T-188 evolução, item 5). Uma flag diz o que o A360 NÃO consegue comparar e por quê.
// Nunca se trata ausência de dado como conformidade. Só encerra por resolução ou aceite consciente da gestão (com justificativa).
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Usuario } from "@/lib/auth";
import { LACUNAS, LACUNAS_A360, iaConfigurada } from "./vobi-cobertura";

export type Flag = typeof schema.flagsLimitacao.$inferSelect;
export const TIPOS_FLAG: Record<string, string> = { disponibilidade: "dado ausente no Vobi/exportação", integracao: "dado existe, mas não chega pela integração", permissao: "sem permissão de acesso", formato: "dado disponível só parcialmente", ausencia_registro: "informação não registrada por ninguém", falha_tecnica: "falha de sincronização ou processamento" };

type NovaFlag = { chave: string; projetoCodigo: number | null; comparacao: string; dadoAusente: string; informacaoDisponivel?: string | null; informacaoNecessaria: string; origemEsperada: "vobi" | "a360" | "google"; tipo: string; analisesComprometidas?: string | null; alternativa?: string | null };

/** Garante a flag (idempotente pela chave). Flags aceitas/resolvidas não são reabertas automaticamente. */
export async function garantirFlag(f: NovaFlag): Promise<number> {
  const ex = (await db.select({ id: schema.flagsLimitacao.id }).from(schema.flagsLimitacao).where(eq(schema.flagsLimitacao.chave, f.chave)).limit(1))[0];
  if (ex) return ex.id;
  const [r] = await db.insert(schema.flagsLimitacao).values({ ...f, informacaoDisponivel: f.informacaoDisponivel ?? null, analisesComprometidas: f.analisesComprometidas ?? null, alternativa: f.alternativa ?? null }).onConflictDoNothing().returning({ id: schema.flagsLimitacao.id });
  return r?.id ?? 0;
}

/** Resolve automaticamente uma flag quando a limitação deixou de existir (ex.: chave de IA configurada). */
export async function resolverFlag(chave: string, justificativa: string) {
  // Resolve a flag aberta; se já estiver resolvida com justificativa genérica (sem evidência), regrava com a evidência real.
  const f = (await db.select().from(schema.flagsLimitacao).where(eq(schema.flagsLimitacao.chave, chave)).limit(1))[0];
  if (!f) return;
  if (f.situacao === "aberta" || (f.situacao === "resolvida" && (!f.justificativa || /^ANTHROPIC_API_KEY configurada/.test(f.justificativa))))
    await db.update(schema.flagsLimitacao).set({ situacao: "resolvida", justificativa, decididoEm: new Date(), atualizadoEm: new Date() }).where(eq(schema.flagsLimitacao.id, f.id));
}

/** Flags gerais da integração (uma por lacuna conhecida) + flag de IA. Idempotente; chamado ao abrir o inventário ou uma análise. */
export async function garantirFlagsGerais() {
  for (const l of LACUNAS) await garantirFlag({ chave: `geral.${l.chave}`, projetoCodigo: null, comparacao: l.necessarioPara, dadoAusente: l.dado, informacaoNecessaria: l.dado, origemEsperada: "vobi", tipo: l.tipo, analisesComprometidas: l.necessarioPara, alternativa: l.alternativa });
  // A flag de IA NÃO se resolve pela presença da chave: só uma chamada real bem-sucedida (processarTranscricao) a encerra, com evidência.
  if (!iaConfigurada()) await garantirFlag({ chave: `geral.${LACUNAS_A360.ia.chave}`, projetoCodigo: null, comparacao: LACUNAS_A360.ia.necessarioPara, dadoAusente: LACUNAS_A360.ia.dado, informacaoNecessaria: LACUNAS_A360.ia.dado, origemEsperada: "a360", tipo: LACUNAS_A360.ia.tipo, analisesComprometidas: "atas automáticas, extração de decisões/encaminhamentos, cruzamento A360×Vobi, identificação de divergências", alternativa: LACUNAS_A360.ia.alternativa });
}

/** Flags por projeto: produção não comparável (sempre, com os dados atuais) e, quando faltar, aprovação/apresentação no Vobi. */
export async function garantirFlagsDoProjeto(codigo: number, nomeProjeto: string, temAprovacoesA360: boolean) {
  await garantirFlag({ chave: `projeto.${codigo}.producao`, projetoCodigo: codigo, comparacao: "Comparação de produção indisponível", dadoAusente: "especificação efetivamente utilizada na produção (materiais, equipamentos, dimensões, quantitativos, layout)",
    informacaoDisponivel: temAprovacoesA360 ? "aprovações do cliente registradas no A360 (reuniões)" : "nenhuma aprovação registrada no A360; o Vobi não exporta aprovações", informacaoNecessaria: "especificação atual da produção, em fonte acessível",
    origemEsperada: "vobi", tipo: "ausencia_registro", analisesComprometidas: `O A360 compara aprovações e decisões internas do projeto "${nomeProjeto}", mas não confirma se a produção segue a especificação aprovada.`, alternativa: "produção registrar a especificação em sistema acessível ou a Vobi exportar os registros de produção" });
  if (!temAprovacoesA360) await garantirFlag({ chave: `projeto.${codigo}.aprovacao`, projetoCodigo: codigo, comparacao: "Comparação aprovação × produção indisponível", dadoAusente: "aprovação do cliente (nem no Vobi exportado, nem registrada no A360)", informacaoDisponivel: "tarefas, etapas e prazos do Vobi; reuniões do A360 sem item de aprovação", informacaoNecessaria: "aprovação do cliente com data e condições", origemEsperada: "a360", tipo: "ausencia_registro", analisesComprometidas: "não é possível saber se a produção corresponde ao que o cliente aprovou", alternativa: "registrar a aprovação na reunião do A360 (seção Aprovações) ou subir a transcrição da reunião de aprovação" });
}

export async function flagsDoProjeto(codigo: number): Promise<Flag[]> {
  return db.select().from(schema.flagsLimitacao).where(eq(schema.flagsLimitacao.projetoCodigo, codigo)).orderBy(desc(schema.flagsLimitacao.situacao), schema.flagsLimitacao.id);
}
export async function flagsGerais(): Promise<Flag[]> {
  return db.select().from(schema.flagsLimitacao).where(isNull(schema.flagsLimitacao.projetoCodigo)).orderBy(schema.flagsLimitacao.id);
}
export async function flagsAbertas(): Promise<Flag[]> {
  return db.select().from(schema.flagsLimitacao).where(eq(schema.flagsLimitacao.situacao, "aberta")).orderBy(schema.flagsLimitacao.projetoCodigo, schema.flagsLimitacao.id);
}
export async function contagemFlags(): Promise<{ abertas: number; aceitas: number; resolvidas: number; projetosSemCobertura: number }> {
  const r = await db.execute(sql`select
    count(*) filter (where situacao='aberta')::int abertas, count(*) filter (where situacao='aceita')::int aceitas, count(*) filter (where situacao='resolvida')::int resolvidas,
    count(distinct projeto_codigo) filter (where situacao='aberta' and projeto_codigo is not null)::int projetos from flag_limitacao`);
  const x = r.rows[0] as { abertas: number; aceitas: number; resolvidas: number; projetos: number };
  return { abertas: Number(x.abertas), aceitas: Number(x.aceitas), resolvidas: Number(x.resolvidas), projetosSemCobertura: Number(x.projetos) };
}

/** Decisão consciente da gestão sobre uma flag: aceitar a limitação ou marcar como resolvida (com justificativa obrigatória). */
export async function decidirFlag(u: Usuario, id: number, situacao: "aceita" | "resolvida" | "aberta", justificativa: string): Promise<string | null> {
  if (!["admin", "gestao", "coordenacao"].includes(u.perfil)) return "Sem permissão.";
  const j = justificativa.trim(); if (situacao !== "aberta" && j.length < 5) return "Escreva a justificativa da decisão.";
  await db.update(schema.flagsLimitacao).set({ situacao, justificativa: j || null, decididoPor: u.id, decididoEm: new Date(), atualizadoEm: new Date() }).where(eq(schema.flagsLimitacao.id, id));
  return null;
}
