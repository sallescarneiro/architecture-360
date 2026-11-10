// Central de Trabalho / Meu Dia (Fase 2, T-186; redesign T-196) — camada de serviços, independente da camada visual.
// Regras: só dados já importados (Vobi) + mapeamentos existentes (pessoa_vobi, People); nada é escrito no Vobi;
// nenhuma comparação entre pessoas, nota ou ranking; o que não tem fonte é declarado como indisponível.
// Prazos: regra única de src/lib/prazo.ts, sempre pela data real; a data da exportação é proveniência.
import { contagem, ultimaCargaAceita } from "@/lib/consultas";
import { panoramaOperacao } from "@/lib/servicos/operacao";
import { recomendacoes, type Recomendacao } from "@/lib/recomendacoes";
import { ETAPAS_ENTREGA, RISCO_REFACAO_FRACAO } from "@/lib/listas";
import { FILTROS_PRAZO, diasEntre, hojeIso, sqlForaDePausado, sqlStatusPrazo, type StatusPrazo } from "@/lib/prazo";
import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";

export { ETAPAS_ENTREGA, RISCO_REFACAO_FRACAO };
/** Cadência combinada (08/11/2026): duas cargas por semana. Acima disto a tela avisa "dados desatualizados". */
export const CADENCIA_AVISO_DIAS = 4;
export const PERIODOS = [7, 14, 30] as const;
export type Periodo = (typeof PERIODOS)[number];

export type ContextoCarga = {
  carga: { id: number; dataCarga: string; confirmadoEm: Date | null };
  hoje: string; idadeDias: number; desatualizado: boolean;
};

export async function contextoCarga(): Promise<ContextoCarga | null> {
  const carga = await ultimaCargaAceita();
  if (!carga) return null;
  const hoje = hojeIso();
  const idadeDias = Math.max(0, diasEntre(carga.dataCarga, hoje));
  return { carga: { id: carga.id, dataCarga: carga.dataCarga, confirmadoEm: carga.confirmadoEm }, hoje, idadeDias, desatualizado: idadeDias > CADENCIA_AVISO_DIAS };
}

export type TarefaResumo = {
  chave: string; nome: string; etapa: string; status: string; dataFim: string | null; projetoCodigo: number; projetoNome: string; cliente: string | null;
  responsavel: string | null; prazo: StatusPrazo; dias: number | null;
};
export type Contagens = { atrasadas: number; a30: number; a8: number; a1: number; hoje: number; d7: number; periodo: number; noPrazo: number; semPrazo: number; abertas: number; entregasPeriodo: number };

const esc = (s: string) => s.replace(/'/g, "''");
const ABERTA = `t.status not in ('concluido','cancelado') and t.orfa=false and ${sqlForaDePausado("t.projeto_codigo")}`;
const FROM = `from tarefa t join projeto p on p.codigo=t.projeto_codigo left join cliente_vobi c on c.codigo=p.cliente_codigo`;

function selTarefa(sp: string, hoje: string) {
  return `t.chave, t.nome, t.etapa_csv etapa, t.status, t.data_fim, t.projeto_codigo, p.nome projeto_nome, c.nome cliente, t.responsavel_nome responsavel, ${sp} prazo,
    case when t.sem_fim=false then (t.data_fim::date - date '${hoje}') else null end dias`;
}
function mapTarefa(r: Record<string, unknown>): TarefaResumo {
  return {
    chave: String(r.chave), nome: String(r.nome), etapa: String(r.etapa ?? ""), status: String(r.status ?? ""), dataFim: (r.data_fim as string | null) ?? null,
    projetoCodigo: Number(r.projeto_codigo), projetoNome: String(r.projeto_nome), cliente: (r.cliente as string | null) ?? null, responsavel: (r.responsavel as string | null) ?? null,
    prazo: String(r.prazo) as StatusPrazo, dias: r.dias == null ? null : Number(r.dias),
  };
}

/** Contagens por status de prazo (regra única), com a janela do período escolhido. `extra` restringe (ex.: responsável). */
async function contagens(cid: number, hoje: string, periodo: Periodo, extra = ""): Promise<Contagens> {
  const sp = sqlStatusPrazo(hoje, "t");
  const inSt = (k: string) => `${sp} in (${FILTROS_PRAZO[k].status.map((s) => `'${s}'`).join(",")})`;
  const entregas = ETAPAS_ENTREGA.map((e) => `'${esc(e)}'`).join(",");
  const [r] = await contagem(`select count(*)::int abertas,
     count(*) filter (where ${inSt("atrasadas")})::int atrasadas,
     count(*) filter (where ${sp}='atrasada_30')::int a30, count(*) filter (where ${sp}='atrasada_8_30')::int a8, count(*) filter (where ${sp}='atrasada_1_7')::int a1,
     count(*) filter (where ${sp}='vence_hoje')::int hoje_n, count(*) filter (where ${inSt("proximas")})::int d7,
     count(*) filter (where t.sem_fim=false and t.data_fim::date >= date '${hoje}' and t.data_fim::date <= date '${hoje}' + ${periodo})::int periodo,
     count(*) filter (where ${sp}='no_prazo')::int no_prazo, count(*) filter (where ${sp}='sem_prazo')::int sem_prazo,
     count(*) filter (where t.etapa_canonica in (${entregas}) and t.sem_fim=false and t.data_fim::date >= date '${hoje}' and t.data_fim::date <= date '${hoje}' + ${periodo})::int entregas_periodo
     ${FROM} where t.ultima_carga=${cid} and ${ABERTA} ${extra}`);
  return { abertas: Number(r.abertas), atrasadas: Number(r.atrasadas), a30: Number(r.a30), a8: Number(r.a8), a1: Number(r.a1), hoje: Number(r.hoje_n), d7: Number(r.d7), periodo: Number(r.periodo), noPrazo: Number(r.no_prazo), semPrazo: Number(r.sem_prazo), entregasPeriodo: Number(r.entregas_periodo) };
}

/** Tarefas que pedem atenção no período: atrasadas + com prazo até `periodo` dias, por prazo. */
async function tarefasAtencao(cid: number, hoje: string, periodo: Periodo, limite: number, extra = "", soEntregas = false): Promise<TarefaResumo[]> {
  const sp = sqlStatusPrazo(hoje, "t");
  const ent = soEntregas ? `and t.etapa_canonica in (${ETAPAS_ENTREGA.map((e) => `'${esc(e)}'`).join(",")})` : "";
  return (await contagem(`select ${selTarefa(sp, hoje)} ${FROM} where t.ultima_carga=${cid} and ${ABERTA} and t.sem_fim=false and t.data_fim::date <= date '${hoje}' + ${periodo} ${extra} ${ent}
     order by t.data_fim asc, p.nome asc limit ${limite}`)).map(mapTarefa);
}

export type ProjetoResumo = {
  codigo: number; nome: string; cliente: string | null; vinculo: string; status: string | null; statusClasse: string | null;
  abertas: number; atrasadas: number; semResponsavel: number; proximoPrazo: string | null; proximaEtapa: string | null; refacaoFracao: number | null; motivos: string[];
};

async function projetosResumo(cid: number, hoje: string, where: string, limite?: number): Promise<ProjetoResumo[]> {
  const sp = sqlStatusPrazo(hoje, "t");
  const rows = await contagem(`select p.codigo, p.nome, c.nome cliente, p.vinculo_cliente_status vinculo, p.status, p.status_classe,
      count(t.chave) filter (where ${ABERTA})::int abertas,
      count(t.chave) filter (where ${ABERTA} and ${sp} in ('atrasada_30','atrasada_8_30','atrasada_1_7'))::int atrasadas,
      count(t.chave) filter (where ${ABERTA} and t.sem_responsavel=true)::int sem_resp,
      min(t.data_fim) filter (where ${ABERTA} and t.sem_fim=false and t.data_fim::date >= date '${hoje}') proximo_prazo,
      (select t3.etapa_canonica from tarefa t3 where t3.projeto_codigo=p.codigo and t3.ultima_carga=${cid} and t3.status not in ('concluido','cancelado') and t3.orfa=false and t3.sem_fim=false and t3.data_fim::date >= date '${hoje}' order by t3.data_fim limit 1) proxima_etapa,
      case when coalesce(sum(t.horas_realizadas_min),0)>0 then sum(case when t.etapa_canonica='Refação' then t.horas_realizadas_min else 0 end)::float / sum(t.horas_realizadas_min) else null end refacao
    from projeto p left join cliente_vobi c on c.codigo=p.cliente_codigo left join tarefa t on t.projeto_codigo=p.codigo and t.ultima_carga=${cid}
    where ${where} group by p.codigo, c.nome order by atrasadas desc, proximo_prazo nulls last, p.nome ${limite ? `limit ${limite}` : ""}`);
  return rows.map((r) => {
    const atr = Number(r.atrasadas), ref = r.refacao == null ? null : Number(r.refacao), sr = Number(r.sem_resp);
    return {
      codigo: Number(r.codigo), nome: String(r.nome), cliente: (r.cliente as string | null) ?? null, vinculo: String(r.vinculo), status: (r.status as string | null) ?? null, statusClasse: (r.status_classe as string | null) ?? null,
      abertas: Number(r.abertas), atrasadas: atr, semResponsavel: sr, proximoPrazo: (r.proximo_prazo as string | null) ?? null, proximaEtapa: (r.proxima_etapa as string | null) ?? null, refacaoFracao: ref,
      motivos: [atr > 0 ? `${atr} atrasada(s)` : null, (ref ?? 0) >= RISCO_REFACAO_FRACAO ? `${Math.round((ref ?? 0) * 100)}% das horas em Refação` : null, sr ? `${sr} sem responsável no Vobi` : null].filter(Boolean) as string[],
    };
  });
}
const exigeAcompanhamento = (p: ProjetoResumo) => p.atrasadas > 0 || (p.refacaoFracao ?? 0) >= RISCO_REFACAO_FRACAO;

// ---------------------------------------------------------------------------
// Arquiteta — só associação confiável: e-mail do usuário ↔ pessoa_vobi.email_rucelle (semente ou mapeamento manual)
// ---------------------------------------------------------------------------
export async function meuDiaArquiteta(email: string, periodo: Periodo) {
  const ctx = await contextoCarga();
  if (!ctx) return null;
  const cid = ctx.carga.id, hoje = ctx.hoje;
  const nomes = (await db.select({ nome: schema.pessoasVobi.nomeVobi }).from(schema.pessoasVobi).where(eq(schema.pessoasVobi.emailRucelle, email))).map((r) => r.nome);
  if (!nomes.length) return { ctx, associacao: false as const, nomes, cont: null, atencao: [] as TarefaResumo[], entregas: [] as TarefaResumo[], projetos: [] as ProjetoResumo[] };
  const extra = `and t.responsavel_email='${esc(email)}'`;
  const cont = await contagens(cid, hoje, periodo, extra);
  const atencao = await tarefasAtencao(cid, hoje, periodo, 50, extra);
  const entregas = atencao.filter((t) => ETAPAS_ENTREGA.includes(t.etapa));
  const nomesSql = nomes.map((n) => `'${esc(n)}'`).join(",");
  const projetos = await projetosResumo(cid, hoje,
    `p.nao_encontrado_desde is null and p.status_classe<>'encerrado' and (exists (select 1 from jsonb_array_elements_text(p.colaboradores) e where e in (${nomesSql}))
      or exists (select 1 from tarefa t2 where t2.projeto_codigo=p.codigo and t2.ultima_carga=${cid} and t2.status not in ('concluido','cancelado') and t2.responsavel_email='${esc(email)}'))`);
  return { ctx, associacao: true as const, nomes, cont, atencao, entregas, projetos };
}

// ---------------------------------------------------------------------------
// Coordenação — equipe, projetos que exigem acompanhamento, prazos/entregas, gargalos, decisões pendentes
// ---------------------------------------------------------------------------
export async function meuDiaCoordenacao(periodo: Periodo) {
  const ctx = await contextoCarga();
  if (!ctx) return null;
  const cid = ctx.carga.id, hoje = ctx.hoje;
  const panorama = await panoramaOperacao({ incluirPessoas: true });
  const cont = await contagens(cid, hoje, periodo);
  const atencao = await tarefasAtencao(cid, hoje, periodo, 25);
  const entregas = await tarefasAtencao(cid, hoje, periodo, 25, "", true);
  const projetos = await projetosResumo(cid, hoje, `p.nao_encontrado_desde is null and p.status_classe<>'encerrado'`);
  const risco = projetos.filter(exigeAcompanhamento);
  const [dec] = await contagem(`select
     (select count(*)::int from projeto where vinculo_cliente_status='ambiguo' and nao_encontrado_desde is null) ambiguos,
     (select count(*)::int from pessoa_vobi where email_rucelle is null) pessoas_sem_email,
     (select count(distinct etapa_csv)::int from tarefa where ultima_carga=${cid} and etapa_conhecida=false) etapas_nao_mapeadas,
     (select count(*)::int from tarefa where ultima_carga=${cid} and orfa=true) orfas`);
  const decisoes = { ambiguos: Number(dec.ambiguos), pessoasSemEmail: Number(dec.pessoas_sem_email), etapasNaoMapeadas: Number(dec.etapas_nao_mapeadas), orfas: Number(dec.orfas) };
  return { ctx, panorama, cont, atencao, entregas, projetos, risco, decisoes };
}

// ---------------------------------------------------------------------------
// Gerência — visão executiva com cobertura, riscos, decisões que exigem a gerência
// ---------------------------------------------------------------------------
export async function meuDiaGerencia(periodo: Periodo) {
  const coord = await meuDiaCoordenacao(periodo);
  if (!coord) return null;
  const { ctx } = coord;
  const recs: Recomendacao[] = await recomendacoes(ctx.carga.id, ctx.hoje);
  const [u] = await contagem(`select count(*)::int total, count(*) filter (where perfil in ('gestao','coordenacao'))::int gestao, count(*) filter (where perfil='arquiteta')::int arquitetas from usuario where ativo=true`);
  const anterior = (await db.execute(sql`select id, data_carga from carga where status='aceita' and tipo='operacao' and id < ${ctx.carga.id} order by id desc limit 1`)).rows[0] as { id: number; data_carga: string } | undefined;
  return { ...coord, recomendacoes: recs, usuarios: { total: Number(u.total), gestao: Number(u.gestao), arquitetas: Number(u.arquitetas) }, cargaAnterior: anterior ?? null };
}
