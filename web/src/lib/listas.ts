// Listas operacionais (T-196 etapa C): tarefas e projetos com filtros (URL), busca sem acento, ordenação e paginação.
// Somente leitura sobre a última carga de operação. Os filtros só restringem a lista; os totais dos KPIs vêm dos serviços
// (meu-dia.ts / operacao.ts) e não dependem destes parâmetros.
import { contagem, ultimaCargaAceita } from "@/lib/consultas";
import { chaveTexto } from "@/lib/importador/normalizacao";
import { sqlParticipa, type Restricao } from "@/lib/participacao";
import { FILTROS_PRAZO, hojeIso, sqlStatusPrazo, type StatusPrazo } from "@/lib/prazo";

export type ParamsLista = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const esc = (s: string) => s.replace(/'/g, "''");
export const TAMANHOS = [25, 50, 100];

export type FiltrosTarefas = {
  q: string; prazo: string; etapa: string; resp: string; projeto: number | null; cliente: number | null; janela: number | null; ate: number | null; de: number | null; entregas: boolean; volta: string; vp: number | null;
  ord: string; dir: "asc" | "desc"; pag: number; n: number;
};

export function lerFiltrosTarefas(sp: ParamsLista): FiltrosTarefas {
  const prazo = um(sp.prazo); const ord = um(sp.ord) || "prazo";
  return {
    q: um(sp.q).slice(0, 80), prazo: prazo in FILTROS_PRAZO ? prazo : "abertas", etapa: um(sp.etapa).slice(0, 60), resp: um(sp.resp).slice(0, 80),
    projeto: /^\d+$/.test(um(sp.projeto)) ? Number(um(sp.projeto)) : null, cliente: /^\d+$/.test(um(sp.cliente)) ? Number(um(sp.cliente)) : null,
    janela: /^\d{1,2}$/.test(um(sp.janela)) && Number(um(sp.janela)) > 0 ? Number(um(sp.janela)) : null, ate: ["7", "14", "30"].includes(um(sp.ate)) ? Number(um(sp.ate)) : null,
    de: /^\d{1,2}$/.test(um(sp.de)) ? Number(um(sp.de)) : null, entregas: um(sp.entregas) === "1", ...lerVolta(sp),
    ord: ["prazo", "tarefa", "etapa", "projeto", "resp", "status"].includes(ord) ? ord : "prazo", dir: um(sp.dir) === "desc" ? "desc" : "asc",
    pag: Math.max(1, Number(um(sp.pag)) || 1), n: TAMANHOS.includes(Number(um(sp.n))) ? Number(um(sp.n)) : 25,
  };
}

export const ETAPAS_ENTREGA = ["Projeto Executivo Civil", "Detalhamento de Interiores", "Documentação", "Projeto Legal", "Imagens 3D"];

export type LinhaTarefa = {
  chave: string; nome: string; etapa: string; status: string; dataFim: string | null; dataInicio: string | null; responsavel: string | null;
  projetoCodigo: number; projetoNome: string; cliente: string | null; clienteCodigo: number | null; prazo: StatusPrazo; dias: number | null;
};

export async function listarTarefas(f: FiltrosTarefas, restricao?: { email: string }) {
  const carga = await ultimaCargaAceita();
  const hoje = hojeIso();
  if (!carga) return { carga: null, hoje, linhas: [] as LinhaTarefa[], total: 0, etapas: [] as string[], responsaveis: [] as string[] };
  const cid = carga.id;
  const sp = sqlStatusPrazo(hoje, "t");
  const where: string[] = [`t.ultima_carga=${cid}`, `t.orfa=false`];
  const st = FILTROS_PRAZO[f.prazo].status.map((s) => `'${s}'`).join(",");
  where.push(`${sp} in (${st})`);
  if (f.q) { const k = esc(chaveTexto(f.q)); where.push(`(p.chave_nome like '%${k}%' or lower(coalesce(c.chave_nome,'')) like '%${k}%' or t.nome_chave like '%${k}%')`); }
  if (f.etapa) where.push(`t.etapa_canonica = '${esc(f.etapa)}'`);
  if (f.resp === "__sem__") where.push(`t.sem_responsavel = true`);
  else if (f.resp) where.push(`t.responsavel_nome = '${esc(f.resp)}'`);
  if (f.projeto) where.push(`t.projeto_codigo = ${f.projeto}`);
  if (f.cliente) where.push(`p.cliente_codigo = ${f.cliente}`);
  // janela = vence de hoje até N dias (só futuro); ate = prazo até N dias incluindo as atrasadas
  if (f.janela) where.push(`t.sem_fim=false and t.data_fim::date >= date '${hoje}' and t.data_fim::date <= date '${hoje}' + ${f.janela}`);
  if (f.ate) where.push(`t.sem_fim=false and t.data_fim::date <= date '${hoje}' + ${f.ate}`);
  if (f.de != null) where.push(`t.sem_fim=false and t.data_fim::date >= date '${hoje}' + ${f.de}`); // início da janela (semana N do Painel)
  if (f.entregas) where.push(`t.etapa_canonica in (${ETAPAS_ENTREGA.map((e) => `'${esc(e)}'`).join(",")})`);
  if (restricao) where.push(`t.responsavel_email = '${esc(restricao.email)}'`);
  const ordem: Record<string, string> = {
    prazo: `(t.data_fim is null) asc, t.data_fim ${f.dir}, p.nome asc`, tarefa: `t.nome ${f.dir}`, etapa: `t.etapa_canonica ${f.dir}, t.data_fim asc nulls last`,
    projeto: `p.nome ${f.dir}, t.data_fim asc nulls last`, resp: `t.responsavel_nome ${f.dir} nulls last, t.data_fim asc nulls last`, status: `${sp} ${f.dir}, t.data_fim asc nulls last`,
  };
  const base = `from tarefa t join projeto p on p.codigo=t.projeto_codigo left join cliente_vobi c on c.codigo=p.cliente_codigo where ${where.join(" and ")}`;
  const [tot] = await contagem(`select count(*)::int n ${base}`);
  const rows = await contagem(`select t.chave, t.nome, t.etapa_canonica etapa, t.status, t.data_fim, t.data_inicio, t.responsavel_nome responsavel, t.projeto_codigo, p.nome projeto_nome,
     c.nome cliente, p.cliente_codigo, ${sp} prazo, case when t.sem_fim=false then (t.data_fim::date - date '${hoje}') else null end dias
     ${base} order by ${ordem[f.ord]} limit ${f.n} offset ${(f.pag - 1) * f.n}`);
  // opções de filtro (sempre sobre a carga inteira, não sobre o filtro atual)
  const etapas = (await contagem(`select distinct etapa_canonica k from tarefa where ultima_carga=${cid} and orfa=false order by 1`)).map((r) => String(r.k));
  const responsaveis = (await contagem(`select distinct responsavel_nome k from tarefa where ultima_carga=${cid} and orfa=false and responsavel_nome is not null ${restricao ? `and responsavel_email='${esc(restricao.email)}'` : ""} order by 1`)).map((r) => String(r.k));
  return {
    carga, hoje, total: Number(tot.n), etapas, responsaveis,
    linhas: rows.map((r) => ({
      chave: String(r.chave), nome: String(r.nome), etapa: String(r.etapa ?? ""), status: String(r.status ?? ""), dataFim: (r.data_fim as string | null) ?? null, dataInicio: (r.data_inicio as string | null) ?? null,
      responsavel: (r.responsavel as string | null) ?? null, projetoCodigo: Number(r.projeto_codigo), projetoNome: String(r.projeto_nome), cliente: (r.cliente as string | null) ?? null,
      clienteCodigo: r.cliente_codigo == null ? null : Number(r.cliente_codigo), prazo: String(r.prazo) as StatusPrazo, dias: r.dias == null ? null : Number(r.dias),
    })),
  };
}

// ---------------------------------------------------------------------------
export type FiltrosProjetos = { q: string; situacao: string; cliente: number | null; vinculo: string; status: string; volta: string; vp: number | null; ord: string; dir: "asc" | "desc"; pag: number; n: number };
export const SITUACOES_PROJETO: Record<string, string> = { ativos: "Ativos", acompanhar: "Exigem acompanhamento", pausados: "Pausados", encerrados: "Encerrados", todos: "Todos" };

/** Origem da navegação (T-199): volta=painel mantém o botão "← Painel de Gestão" com o período (vp) nas listas. */
export function lerVolta(sp: ParamsLista): { volta: string; vp: number | null } {
  return { volta: um(sp.volta) === "painel" ? "painel" : "", vp: ["7", "14", "30"].includes(um(sp.vp)) ? Number(um(sp.vp)) : null };
}
export function urlVolta(f: { volta: string; vp: number | null }): string | null {
  return f.volta === "painel" ? (f.vp && f.vp !== 14 ? `/painel?periodo=${f.vp}` : "/painel") : null;
}

export function lerFiltrosProjetos(sp: ParamsLista): FiltrosProjetos {
  const ord = um(sp.ord) || "atrasadas";
  return {
    q: um(sp.q).slice(0, 80), situacao: um(sp.situacao) in SITUACOES_PROJETO ? um(sp.situacao) : "ativos",
    cliente: /^\d+$/.test(um(sp.cliente)) ? Number(um(sp.cliente)) : null, vinculo: ["resolvido", "manual", "ambiguo", "sem_cliente"].includes(um(sp.vinculo)) ? um(sp.vinculo) : "",
    status: um(sp.status).slice(0, 60), ...lerVolta(sp),
    ord: ["atrasadas", "projeto", "cliente", "abertas", "prazo", "status"].includes(ord) ? ord : "atrasadas", dir: um(sp.dir) === "asc" ? "asc" : "desc",
    pag: Math.max(1, Number(um(sp.pag)) || 1), n: TAMANHOS.includes(Number(um(sp.n))) ? Number(um(sp.n)) : 25,
  };
}

export type LinhaProjeto = {
  codigo: number; nome: string; cliente: string | null; clienteCodigo: number | null; vinculo: string; status: string | null; statusClasse: string | null;
  abertas: number; atrasadas: number; proximas: number; semPrazo: number; semResponsavel: number; proximoPrazo: string | null; proximaEtapa: string | null; refacaoFracao: number | null; acompanhar: boolean;
};

export const RISCO_REFACAO_FRACAO = 0.3;

export async function listarProjetos(f: FiltrosProjetos, restricao?: Restricao) {
  const carga = await ultimaCargaAceita();
  const hoje = hojeIso();
  if (!carga) return { carga: null, hoje, linhas: [] as LinhaProjeto[], total: 0 };
  const cid = carga.id;
  const sp = sqlStatusPrazo(hoje, "t");
  const ABERTA = `t.status not in ('concluido','cancelado') and t.orfa=false`;
  const where: string[] = [`p.nao_encontrado_desde is null`];
  if (f.situacao === "ativos" || f.situacao === "acompanhar") where.push(`p.status_classe <> 'encerrado'`);
  if (f.situacao === "pausados") where.push(`p.status_classe = 'pausado'`);
  if (f.situacao === "encerrados") where.push(`p.status_classe = 'encerrado'`);
  if (f.q) { const k = esc(chaveTexto(f.q)); where.push(`(p.chave_nome like '%${k}%' or lower(coalesce(c.chave_nome,'')) like '%${k}%' or p.codigo::text = '${k}')`); }
  if (f.cliente) where.push(`p.cliente_codigo = ${f.cliente}`);
  if (f.vinculo) where.push(`p.vinculo_cliente_status = '${f.vinculo}'`);
  if (f.status) where.push(`p.status = '${esc(f.status)}'`); // etapa/status do projeto no Vobi (clique no gráfico do Painel)
  if (restricao) where.push(sqlParticipa(restricao.email, restricao.nomes, cid, "p")); // D-A: arquiteta vê só projetos em que participa (dados do Vobi)
  const agreg = `select p.codigo, p.nome, c.nome cliente, p.cliente_codigo, p.vinculo_cliente_status vinculo, p.status, p.status_classe,
      count(t.chave) filter (where ${ABERTA})::int abertas,
      count(t.chave) filter (where ${ABERTA} and ${sp} in ('atrasada_30','atrasada_8_30','atrasada_1_7'))::int atrasadas,
      count(t.chave) filter (where ${ABERTA} and ${sp} in ('vence_hoje','vence_7'))::int proximas,
      count(t.chave) filter (where ${ABERTA} and ${sp} = 'sem_prazo')::int sem_prazo,
      count(t.chave) filter (where ${ABERTA} and t.sem_responsavel)::int sem_resp,
      min(t.data_fim) filter (where ${ABERTA} and t.sem_fim=false and t.data_fim::date >= date '${hoje}') proximo_prazo,
      (select t3.etapa_canonica from tarefa t3 where t3.projeto_codigo=p.codigo and t3.ultima_carga=${cid} and t3.status not in ('concluido','cancelado') and t3.orfa=false and t3.sem_fim=false and t3.data_fim::date >= date '${hoje}' order by t3.data_fim limit 1) proxima_etapa,
      case when coalesce(sum(t.horas_realizadas_min),0)>0 then sum(case when t.etapa_canonica='Refação' then t.horas_realizadas_min else 0 end)::float / sum(t.horas_realizadas_min) else null end refacao
    from projeto p left join cliente_vobi c on c.codigo=p.cliente_codigo left join tarefa t on t.projeto_codigo=p.codigo and t.ultima_carga=${cid}
    where ${where.join(" and ")} group by p.codigo, c.nome`;
  const acomp = `(x.atrasadas > 0 or coalesce(x.refacao,0) >= ${RISCO_REFACAO_FRACAO})`;
  const whereX = f.situacao === "acompanhar" ? `where ${acomp}` : "";
  const ordem: Record<string, string> = {
    atrasadas: `x.atrasadas ${f.dir}, x.proximo_prazo asc nulls last, x.nome asc`, projeto: `x.nome ${f.dir}`, cliente: `x.cliente ${f.dir} nulls last, x.nome asc`,
    abertas: `x.abertas ${f.dir}, x.nome asc`, prazo: `x.proximo_prazo ${f.dir} nulls last, x.nome asc`, status: `x.status ${f.dir}, x.nome asc`,
  };
  const [tot] = await contagem(`select count(*)::int n from (${agreg}) x ${whereX}`);
  const rows = await contagem(`select x.*, ${acomp} acompanhar from (${agreg}) x ${whereX} order by ${ordem[f.ord]} limit ${f.n} offset ${(f.pag - 1) * f.n}`);
  return {
    carga, hoje, total: Number(tot.n),
    linhas: rows.map((r) => ({
      codigo: Number(r.codigo), nome: String(r.nome), cliente: (r.cliente as string | null) ?? null, clienteCodigo: r.cliente_codigo == null ? null : Number(r.cliente_codigo), vinculo: String(r.vinculo),
      status: (r.status as string | null) ?? null, statusClasse: (r.status_classe as string | null) ?? null, abertas: Number(r.abertas), atrasadas: Number(r.atrasadas), proximas: Number(r.proximas),
      semPrazo: Number(r.sem_prazo), semResponsavel: Number(r.sem_resp), proximoPrazo: (r.proximo_prazo as string | null) ?? null, proximaEtapa: (r.proxima_etapa as string | null) ?? null,
      refacaoFracao: r.refacao == null ? null : Number(r.refacao), acompanhar: Boolean(r.acompanhar),
    })),
  };
}

/** Monta uma URL da lista mantendo os filtros atuais e alterando/removendo chaves. */
export function urlCom(base: string, atual: Record<string, string | number | null | undefined | boolean>, mudancas: Record<string, string | number | null | undefined | boolean>): string {
  const p = new URLSearchParams();
  const tudo = { ...atual, ...mudancas };
  for (const [k, v] of Object.entries(tudo)) {
    if (v === null || v === undefined || v === "" || v === false) continue;
    p.set(k, v === true ? "1" : String(v));
  }
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}
