// Central de Trabalho / Meu Dia (Fase 2, T-186) — camada de serviços, independente da camada visual.
// Regras: só dados já importados (Vobi) + mapeamentos existentes (pessoa_vobi, People); nada é escrito no Vobi;
// nenhuma comparação entre pessoas, nota ou ranking; o que não tem fonte é declarado como indisponível.
import { contagem, ultimaCargaAceita } from "@/lib/consultas";
import { panoramaOperacao } from "@/lib/servicos/operacao";
import { recomendacoes, type Recomendacao } from "@/lib/recomendacoes";
import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";

/** Cadência combinada (08/11/2026): duas cargas por semana. Acima disto a tela avisa "dados desatualizados". */
export const CADENCIA_AVISO_DIAS = 4;
/** Etapas cujo prazo é tratado como "entrega" (o Vobi não marca entregáveis; esta é a convenção da Rucelle). */
export const ETAPAS_ENTREGA = ["Projeto Executivo Civil", "Detalhamento de Interiores", "Documentação", "Projeto Legal", "Imagens 3D"];
export const JANELA_ENTREGAS_DIAS = 14;
// Regra de "exige acompanhamento" por projeto (limiares explicados na tela). Tarefas sem responsável NÃO entram:
// metade das tarefas do Vobi não tem responsável — é limitação da fonte, não risco do projeto.
export const RISCO_MIN_VENCIDAS = 1;
export const RISCO_REFACAO_FRACAO = 0.3;

export type ContextoCarga = {
  carga: { id: number; dataCarga: string; confirmadoEm: Date | null };
  hoje: string;            // data real de hoje (AAAA-MM-DD) — prazos são comparados com ela
  idadeDias: number;       // dias entre a exportação e hoje
  desatualizado: boolean;  // idadeDias > CADENCIA_AVISO_DIAS
};

export async function contextoCarga(): Promise<ContextoCarga | null> {
  const carga = await ultimaCargaAceita();
  if (!carga) return null;
  const hoje = new Date().toISOString().slice(0, 10);
  const idadeDias = Math.max(0, Math.floor((new Date(hoje + "T00:00:00Z").getTime() - new Date(carga.dataCarga + "T00:00:00Z").getTime()) / 86400_000));
  return { carga: { id: carga.id, dataCarga: carga.dataCarga, confirmadoEm: carga.confirmadoEm }, hoje, idadeDias, desatualizado: idadeDias > CADENCIA_AVISO_DIAS };
}

export type TarefaResumo = {
  chave: string; nome: string; etapa: string; status: string; dataFim: string | null; dataInicio: string | null;
  projetoCodigo: number; projetoNome: string; cliente: string | null; responsavel: string | null; situacao: "vencida" | "hoje" | "d7" | "d14" | "futura" | "sem_prazo";
};

function situacao(dataFim: string | null, hoje: string): TarefaResumo["situacao"] {
  if (!dataFim) return "sem_prazo";
  if (dataFim < hoje) return "vencida";
  if (dataFim === hoje) return "hoje";
  const d = Math.round((new Date(dataFim + "T00:00:00Z").getTime() - new Date(hoje + "T00:00:00Z").getTime()) / 86400_000);
  if (d <= 7) return "d7";
  if (d <= 14) return "d14";
  return "futura";
}

const ABERTAS = `t.status not in ('concluido','cancelado') and t.orfa=false`;
const SEL_TAREFA = `t.chave, t.nome, t.etapa_canonica etapa, t.status, t.data_fim, t.data_inicio, t.projeto_codigo, p.nome projeto_nome, c.nome cliente, t.responsavel_nome responsavel`;
const FROM_TAREFA = `from tarefa t join projeto p on p.codigo=t.projeto_codigo left join cliente_vobi c on c.codigo=p.cliente_codigo`;
const esc = (s: string) => s.replace(/'/g, "''");

function mapTarefa(r: Record<string, unknown>, hoje: string): TarefaResumo {
  const dataFim = (r.data_fim as string | null) ?? null;
  return {
    chave: String(r.chave), nome: String(r.nome), etapa: String(r.etapa ?? ""), status: String(r.status ?? ""), dataFim, dataInicio: (r.data_inicio as string | null) ?? null,
    projetoCodigo: Number(r.projeto_codigo), projetoNome: String(r.projeto_nome), cliente: (r.cliente as string | null) ?? null, responsavel: (r.responsavel as string | null) ?? null,
    situacao: situacao(dataFim, hoje),
  };
}

// ---------------------------------------------------------------------------
// Arquiteta — só associação confiável: e-mail do usuário ↔ pessoa_vobi.email_rucelle (semente ou mapeamento manual)
// ---------------------------------------------------------------------------
export async function meuDiaArquiteta(email: string) {
  const ctx = await contextoCarga();
  if (!ctx) return null;
  const cid = ctx.carga.id, hoje = ctx.hoje;
  const nomes = (await db.select({ nome: schema.pessoasVobi.nomeVobi }).from(schema.pessoasVobi).where(eq(schema.pessoasVobi.emailRucelle, email))).map((r) => r.nome);
  if (!nomes.length) return { ctx, associacao: false as const, nomes, tarefas: [] as TarefaResumo[], projetos: [] as ProjetoResumo[], entregas: [] as TarefaResumo[], resumo: { vencidas: 0, hoje: 0, d7: 0, semPrazo: 0, abertas: 0 } };

  const tarefas = (await contagem(`select ${SEL_TAREFA} ${FROM_TAREFA} where t.ultima_carga=${cid} and ${ABERTAS} and t.responsavel_email='${esc(email)}'
     order by t.data_fim nulls last, t.nome`)).map((r) => mapTarefa(r, hoje));
  const resumo = {
    abertas: tarefas.length,
    vencidas: tarefas.filter((t) => t.situacao === "vencida").length,
    hoje: tarefas.filter((t) => t.situacao === "hoje").length,
    d7: tarefas.filter((t) => t.situacao === "d7" || t.situacao === "hoje").length,
    semPrazo: tarefas.filter((t) => t.situacao === "sem_prazo").length,
  };
  // meus projetos: onde sou colaboradora (nome mapeado) ou tenho tarefa aberta
  const nomesSql = nomes.map((n) => `'${esc(n)}'`).join(",");
  const projetos = await projetosResumo(cid, hoje,
    `p.nao_encontrado_desde is null and p.status_classe<>'encerrado' and (exists (select 1 from jsonb_array_elements_text(p.colaboradores) e where e in (${nomesSql}))
      or exists (select 1 from tarefa t2 where t2.projeto_codigo=p.codigo and t2.ultima_carga=${cid} and t2.status not in ('concluido','cancelado') and t2.responsavel_email='${esc(email)}'))`);
  const entregas = tarefas.filter((t) => ETAPAS_ENTREGA.includes(t.etapa) && t.dataFim && t.dataFim <= addDias(hoje, JANELA_ENTREGAS_DIAS));
  return { ctx, associacao: true as const, nomes, tarefas, projetos, entregas, resumo };
}

export type ProjetoResumo = {
  codigo: number; nome: string; cliente: string | null; vinculo: string; status: string | null; statusClasse: string | null;
  abertas: number; vencidas: number; semResponsavel: number; proximoPrazo: string | null; proximaEtapa: string | null; refacaoFracao: number | null;
};

async function projetosResumo(cid: number, hoje: string, where: string, limite?: number): Promise<ProjetoResumo[]> {
  const rows = await contagem(`select p.codigo, p.nome, c.nome cliente, p.vinculo_cliente_status vinculo, p.status, p.status_classe,
      count(t.chave) filter (where ${ABERTAS})::int abertas,
      count(t.chave) filter (where ${ABERTAS} and t.sem_fim=false and t.data_fim < '${hoje}')::int vencidas,
      count(t.chave) filter (where ${ABERTAS} and t.sem_responsavel=true)::int sem_resp,
      min(t.data_fim) filter (where ${ABERTAS} and t.sem_fim=false and t.data_fim >= '${hoje}') proximo_prazo,
      (select t3.etapa_canonica from tarefa t3 where t3.projeto_codigo=p.codigo and t3.ultima_carga=${cid} and t3.status not in ('concluido','cancelado') and t3.orfa=false and t3.sem_fim=false and t3.data_fim >= '${hoje}' order by t3.data_fim limit 1) proxima_etapa,
      case when coalesce(sum(t.horas_realizadas_min),0)>0 then sum(case when t.etapa_canonica='Refação' then t.horas_realizadas_min else 0 end)::float / sum(t.horas_realizadas_min) else null end refacao
    from projeto p left join cliente_vobi c on c.codigo=p.cliente_codigo left join tarefa t on t.projeto_codigo=p.codigo and t.ultima_carga=${cid}
    where ${where} group by p.codigo, c.nome order by vencidas desc, proximo_prazo nulls last, p.nome ${limite ? `limit ${limite}` : ""}`);
  return rows.map((r) => ({
    codigo: Number(r.codigo), nome: String(r.nome), cliente: (r.cliente as string | null) ?? null, vinculo: String(r.vinculo), status: (r.status as string | null) ?? null, statusClasse: (r.status_classe as string | null) ?? null,
    abertas: Number(r.abertas), vencidas: Number(r.vencidas), semResponsavel: Number(r.sem_resp), proximoPrazo: (r.proximo_prazo as string | null) ?? null, proximaEtapa: (r.proxima_etapa as string | null) ?? null,
    refacaoFracao: r.refacao == null ? null : Number(r.refacao),
  }));
}

export function addDias(iso: string, n: number): string {
  return new Date(new Date(iso + "T00:00:00Z").getTime() + n * 86400_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Coordenação — equipe, projetos que exigem acompanhamento, entregas, gargalos, decisões pendentes
// ---------------------------------------------------------------------------
export async function meuDiaCoordenacao() {
  const ctx = await contextoCarga();
  if (!ctx) return null;
  const cid = ctx.carga.id, hoje = ctx.hoje;
  const panorama = await panoramaOperacao({ incluirPessoas: true });
  const projetos = await projetosResumo(cid, hoje, `p.nao_encontrado_desde is null and p.status_classe<>'encerrado'`);
  const risco = projetos.filter((p) => p.vencidas >= RISCO_MIN_VENCIDAS || (p.refacaoFracao ?? 0) >= RISCO_REFACAO_FRACAO)
    .map((p) => ({ ...p, motivos: [p.vencidas >= RISCO_MIN_VENCIDAS ? `${p.vencidas} vencida(s)` : null, (p.refacaoFracao ?? 0) >= RISCO_REFACAO_FRACAO ? `${Math.round((p.refacaoFracao ?? 0) * 100)}% das horas em Refação` : null, p.semResponsavel ? `${p.semResponsavel} sem responsável no Vobi` : null].filter(Boolean) as string[] }));
  const entregas = (await contagem(`select ${SEL_TAREFA} ${FROM_TAREFA} where t.ultima_carga=${cid} and ${ABERTAS} and t.sem_fim=false
     and t.etapa_canonica in (${ETAPAS_ENTREGA.map((e) => `'${esc(e)}'`).join(",")}) and t.data_fim <= '${addDias(hoje, JANELA_ENTREGAS_DIAS)}' order by t.data_fim, p.nome`)).map((r) => mapTarefa(r, hoje));
  const [dec] = await contagem(`select
     (select count(*)::int from projeto where vinculo_cliente_status='ambiguo' and nao_encontrado_desde is null) ambiguos,
     (select count(*)::int from pessoa_vobi where email_rucelle is null) pessoas_sem_email,
     (select count(distinct etapa_csv)::int from tarefa where ultima_carga=${cid} and etapa_conhecida=false) etapas_nao_mapeadas,
     (select count(*)::int from tarefa where ultima_carga=${cid} and orfa=true) orfas`);
  const decisoes = { ambiguos: Number(dec.ambiguos), pessoasSemEmail: Number(dec.pessoas_sem_email), etapasNaoMapeadas: Number(dec.etapas_nao_mapeadas), orfas: Number(dec.orfas) };
  // prazos com a data real de hoje (a Operação usa a data da carga)
  const [pr] = await contagem(`select sum(case when t.data_fim < '${hoje}' then 1 else 0 end)::int vencidas, sum(case when t.data_fim >= '${hoje}' and t.data_fim < '${addDias(hoje, 7)}' then 1 else 0 end)::int d7
     from tarefa t where t.ultima_carga=${cid} and ${ABERTAS} and t.sem_fim=false`);
  return { ctx, panorama, projetos, risco, entregas, decisoes, prazosHoje: { vencidas: Number(pr.vencidas), d7: Number(pr.d7) } };
}

// ---------------------------------------------------------------------------
// Gerência — visão executiva com cobertura, riscos, decisões que exigem a gerência
// ---------------------------------------------------------------------------
export async function meuDiaGerencia() {
  const coord = await meuDiaCoordenacao();
  if (!coord) return null;
  const { ctx } = coord;
  const recs: Recomendacao[] = await recomendacoes(ctx.carga.id, ctx.carga.dataCarga);
  const [u] = await contagem(`select count(*)::int total, count(*) filter (where perfil in ('gestao','coordenacao'))::int gestao, count(*) filter (where perfil='arquiteta')::int arquitetas from usuario where ativo=true`);
  const anterior = (await db.execute(sql`select id, data_carga from carga where status='aceita' and tipo='operacao' and id < ${ctx.carga.id} order by id desc limit 1`)).rows[0] as { id: number; data_carga: string } | undefined;
  return { ...coord, recomendacoes: recs, usuarios: { total: Number(u.total), gestao: Number(u.gestao), arquitetas: Number(u.arquitetas) }, cargaAnterior: anterior ?? null };
}
