import { contagem, ultimaCargaAceita } from "@/lib/consultas";
import { hojeIso, sqlStatusPrazo } from "@/lib/prazo";
import { recomendacoes } from "@/lib/recomendacoes";
import { minutosParaHoras } from "@/lib/importador/normalizacao";
import { estadoOrganizacao } from "@/lib/integracoes/people";
import type { Distribuicao, Indicador, Limitacao, PanoramaOperacaoV1, Proveniencia } from "@/lib/contratos/a360-v1";

/**
 * Camada de serviços: regras e indicadores da operação, independentes da camada visual.
 * A página Operação e o endpoint /api/export/operacao consomem a mesma função, para que o
 * Rucelle 360° receba exatamente o que a gestão vê aqui.
 */
export const ENTRA_EM: Record<string, string> = {
  completa: "todos os indicadores", incompleta_sem_responsavel: "indicadores por projeto/etapa; fora dos indicadores por pessoa",
  incompleta_sem_prazo: "contagens por status; fora de atraso, prazo e agenda", incompleta_sem_inicio: "prazo e atraso; fora de duração e agenda",
  orfa: "nenhum indicador", encerrada: "histórico",
};

export const LIMITACOES_ATUAIS: Limitacao[] = [
  { chave: "previsto_realizado", descricao: "Previsto × realizado em horas indisponível: estimativas quase inexistentes no Vobi." },
  { chave: "horas_semana_pessoa", descricao: "Horas por semana por pessoa exigem o CSV de Gestão de Horas (ainda não integrado)." },
  { chave: "capacidade", descricao: "Capacidade utilizada depende de jornada/alocação do People e das horas por período." },
  { chave: "tempo_parado", descricao: "Tempo parado por etapa exige histórico de várias cargas." },
  { chave: "desempenho_individual", descricao: "Produtividade ou eficiência individual não é calculada: sem base nos dados e fora do propósito do sistema." },
  { chave: "motivo_refacao", descricao: "O motivo das revisões (cliente, escopo, interno) não existe no Vobi." },
];

/** Cliente do projeto para exibição: nome do cadastro Vobi, ou a situação do vínculo quando não resolvido. */
function rotuloCliente(r: Record<string, unknown>): string {
  if (r.cliente) return String(r.cliente);
  return r.vinculo === "ambiguo" ? "(cliente ambíguo)" : "sem cliente associado";
}

export type PanoramaInterno = Awaited<ReturnType<typeof panoramaOperacao>>;

export async function panoramaOperacao(opts: { incluirPessoas: boolean; emailRestrito?: string }) {
  const carga = await ultimaCargaAceita();
  if (!carga) return null;
  // Prazos sempre pela data real (regra única em src/lib/prazo.ts); a data da exportação fica como proveniência (carga.dataCarga).
  const cid = carga.id, hoje = hojeIso();
  const abertas = `status not in ('concluido','cancelado') and orfa=false`;
  const sp = sqlStatusPrazo(hoje, "tarefa");
  const ATRASADA = `${sp} in ('atrasada_30','atrasada_8_30','atrasada_1_7')`;
  const PROXIMA7 = `${sp} in ('vence_hoje','vence_7')`;

  const [tot] = await contagem(`select count(*)::int total, sum(case when classe_qualidade='completa' then 1 else 0 end)::int completas,
     sum(case when sem_fim=false and orfa=false then 1 else 0 end)::int com_fim,
     sum(case when sem_responsavel=false and orfa=false then 1 else 0 end)::int com_resp from tarefa where ultima_carga=${cid}`);
  const total = Number(tot.total), completas = Number(tot.completas), comFim = Number(tot.com_fim), comResp = Number(tot.com_resp);
  const projStatus = await contagem(`select status k, status_classe c, count(*)::int n from projeto where ultima_carga=${cid} group by 1,2 order by 2,3 desc`);
  const ativos = projStatus.filter((r) => r.c !== "encerrado");
  const encerrados = projStatus.filter((r) => r.c === "encerrado").reduce((a, r) => a + Number(r.n), 0);
  const tarStatus = await contagem(`select status k, count(*)::int n from tarefa where ultima_carga=${cid} and orfa=false group by 1 order by 2 desc`);
  const [prazos] = await contagem(`select
     count(*) filter (where ${ATRASADA})::int vencidas,
     count(*) filter (where ${sp} = 'atrasada_30')::int a30, count(*) filter (where ${sp} = 'atrasada_8_30')::int a8, count(*) filter (where ${sp} = 'atrasada_1_7')::int a1,
     count(*) filter (where ${sp} = 'vence_hoje')::int hoje_n,
     count(*) filter (where ${PROXIMA7})::int d7,
     count(*) filter (where sem_fim=false and data_fim::date >= date '${hoje}' and data_fim::date <= date '${hoje}' + 30)::int d30,
     count(*) filter (where ${sp} = 'sem_prazo')::int sem_prazo
     from tarefa where ultima_carga=${cid} and ${abertas}`);
  const porEtapa = await contagem(`select coalesce(nullif(etapa_csv,''),'(sem etapa)') k, count(*)::int abertas, count(*) filter (where ${ATRASADA})::int vencidas from tarefa where ultima_carga=${cid} and ${abertas} group by 1 order by 2 desc`);
  const porPessoa = opts.incluirPessoas
    ? await contagem(`select responsavel_nome k, count(*)::int abertas, count(*) filter (where ${ATRASADA})::int vencidas, count(*) filter (where ${PROXIMA7})::int d7,
        count(*) filter (where ${sp} = 'sem_prazo')::int sem_prazo
        from tarefa where ultima_carga=${cid} and ${abertas} and sem_responsavel=false group by 1 order by 2 desc`)
    : opts.emailRestrito
      ? await contagem(`select responsavel_nome k, count(*)::int abertas, count(*) filter (where ${ATRASADA})::int vencidas, count(*) filter (where ${PROXIMA7})::int d7,
        count(*) filter (where ${sp} = 'sem_prazo')::int sem_prazo
        from tarefa where ultima_carga=${cid} and ${abertas} and responsavel_email='${opts.emailRestrito.replace(/'/g, "''")}' group by 1`)
      : [];
  const horasProj = await contagem(`select p.nome k, p.codigo, c.nome cliente, p.vinculo_cliente_status vinculo, sum(t.horas_realizadas_min)::int min, sum(case when t.etapa_canonica='Refação' then t.horas_realizadas_min else 0 end)::int refacao
     from tarefa t join projeto p on p.codigo=t.projeto_codigo left join cliente_vobi c on c.codigo=p.cliente_codigo where t.ultima_carga=${cid} and t.horas_realizadas_min>0 group by 1,2,3,4 order by 5 desc limit 15`);
  const [horasTot] = await contagem(`select coalesce(sum(horas_realizadas_min),0)::int min, coalesce(sum(case when etapa_canonica='Refação' then horas_realizadas_min else 0 end),0)::int refacao,
     count(*) filter (where horas_realizadas_min>0)::int com_horas from tarefa where ultima_carga=${cid}`);
  const revisoes = await contagem(`select p.nome k, p.codigo, c.nome cliente, p.vinculo_cliente_status vinculo, count(*)::int n from tarefa t join projeto p on p.codigo=t.projeto_codigo
     left join cliente_vobi c on c.codigo=p.cliente_codigo where t.ultima_carga=${cid} and (t.revisao>=1 or t.etapa_canonica='Refação') group by 1,2,3,4 order by 5 desc limit 15`);
  const porClasse = await contagem(`select classe_qualidade k, count(*)::int n from tarefa where ultima_carga=${cid} group by 1 order by 2 desc`);
  const recs = opts.incluirPessoas ? await recomendacoes(cid, hoje) : [];

  return {
    carga, hoje, total, completas, comFim, comResp,
    projetosAtivos: ativos.map((r) => ({ rotulo: String(r.k), valor: Number(r.n) })), encerrados,
    tarefasStatus: tarStatus.map((r) => ({ rotulo: String(r.k), valor: Number(r.n) })),
    // vencidas = atrasadas (3 faixas somadas); d7 = vence hoje + 1–7 dias; d30 = prazo entre hoje e 30 dias; faixas para detalhe
    prazos: { vencidas: Number(prazos.vencidas ?? 0), d7: Number(prazos.d7 ?? 0), d30: Number(prazos.d30 ?? 0), hoje: Number(prazos.hoje_n ?? 0), semPrazo: Number(prazos.sem_prazo ?? 0),
      faixas: { a30: Number(prazos.a30 ?? 0), a8: Number(prazos.a8 ?? 0), a1: Number(prazos.a1 ?? 0) } },
    porEtapa: porEtapa.map((r) => ({ rotulo: String(r.k), abertas: Number(r.abertas), vencidas: Number(r.vencidas) })),
    porPessoa: porPessoa.map((r) => ({ rotulo: String(r.k), abertas: Number(r.abertas), vencidas: Number(r.vencidas), d7: Number(r.d7), semPrazo: Number(r.sem_prazo) })),
    horas: { totalMin: Number(horasTot.min), refacaoMin: Number(horasTot.refacao), comHoras: Number(horasTot.com_horas),
      porProjeto: horasProj.map((r) => ({ rotulo: String(r.k), codigo: Number(r.codigo), cliente: rotuloCliente(r), min: Number(r.min), refacaoMin: Number(r.refacao) })) },
    revisoes: revisoes.map((r) => ({ rotulo: String(r.k), codigo: Number(r.codigo), cliente: rotuloCliente(r), valor: Number(r.n) })),
    qualidade: porClasse.map((r) => ({ classe: String(r.k), tarefas: Number(r.n), entraEm: ENTRA_EM[String(r.k)] ?? "" })),
    recomendacoes: recs,
    limitacoes: LIMITACOES_ATUAIS,
  };
}

/** Projeção do panorama no contrato v1 (sem dados por pessoa: o Rucelle 360° recebe agregados). */
export async function panoramaParaContrato(): Promise<PanoramaOperacaoV1> {
  const p = await panoramaOperacao({ incluirPessoas: true });
  const org = await estadoOrganizacao();
  const base: Omit<PanoramaOperacaoV1, "carga" | "indicadores" | "distribuicoes" | "recomendacoes" | "qualidade"> = {
    versao: "a360.operacao.v1", geradoEm: new Date().toISOString(), sistema: "architecture-360", limitacoes: LIMITACOES_ATUAIS,
    organizacao: { fonte: "people", sincronizadoEm: org.sincronizadoEm?.toISOString() ?? null, pessoas: org.pessoas, status: org.pessoas ? "ok" : "ausente" },
  };
  if (!p) return { ...base, carga: null, indicadores: [], distribuicoes: [], recomendacoes: [], qualidade: null };
  const prov = (natureza: Proveniencia["natureza"], origem: Proveniencia["origem"] = "vobi"): Proveniencia => ({ origem, natureza, dataReferencia: p.carga.dataCarga, cargaId: p.carga.id });
  const ativos = p.projetosAtivos.reduce((a, r) => a + r.valor, 0);
  const indicadores: Indicador[] = [
    { chave: "projetos_ativos", rotulo: "Projetos ativos", valor: ativos, unidade: "projetos", proveniencia: prov("original") },
    { chave: "projetos_encerrados", rotulo: "Projetos encerrados", valor: p.encerrados, unidade: "projetos", proveniencia: prov("original") },
    { chave: "tarefas_total", rotulo: "Tarefas na carga", valor: p.total, unidade: "tarefas", proveniencia: prov("original") },
    { chave: "tarefas_completas", rotulo: "Tarefas com dados completos", valor: p.completas, unidade: "tarefas", proveniencia: prov("calculado", "a360"), cobertura: { base: p.total, total: p.total, descricao: "todas as tarefas" } },
    { chave: "tarefas_vencidas", rotulo: "Tarefas abertas vencidas", valor: p.prazos.vencidas, unidade: "tarefas", proveniencia: prov("calculado", "a360"), cobertura: { base: p.comFim, total: p.total, descricao: "tarefas com prazo" } },
    { chave: "tarefas_vencem_7d", rotulo: "Vencem em 7 dias", valor: p.prazos.d7, unidade: "tarefas", proveniencia: prov("calculado", "a360"), cobertura: { base: p.comFim, total: p.total, descricao: "tarefas com prazo" } },
    { chave: "tarefas_vencem_30d", rotulo: "Vencem em 30 dias", valor: p.prazos.d30, unidade: "tarefas", proveniencia: prov("calculado", "a360"), cobertura: { base: p.comFim, total: p.total, descricao: "tarefas com prazo" } },
    { chave: "horas_realizadas", rotulo: "Horas realizadas acumuladas", valor: Number(minutosParaHoras(p.horas.totalMin)), unidade: "horas", proveniencia: prov("original"), cobertura: { base: p.horas.comHoras, total: p.total, descricao: "tarefas com horas lançadas" } },
    { chave: "horas_refacao_pct", rotulo: "Horas em Refação (%)", valor: p.horas.totalMin ? Math.round((p.horas.refacaoMin / p.horas.totalMin) * 100) : 0, unidade: "percentual", proveniencia: prov("calculado", "a360"), cobertura: { base: p.horas.comHoras, total: p.total, descricao: "tarefas com horas lançadas" } },
  ];
  const distribuicoes: Distribuicao[] = [
    { chave: "projetos_por_etapa", rotulo: "Projetos ativos por etapa do fluxo", proveniencia: prov("original"), itens: p.projetosAtivos },
    { chave: "tarefas_por_status", rotulo: "Tarefas por status", proveniencia: prov("original"), itens: p.tarefasStatus },
    { chave: "tarefas_abertas_por_etapa", rotulo: "Tarefas abertas por etapa", proveniencia: prov("calculado", "a360"), itens: p.porEtapa.map((r) => ({ rotulo: r.rotulo, valor: r.abertas })) },
    { chave: "tarefas_vencidas_por_etapa", rotulo: "Tarefas vencidas por etapa", proveniencia: prov("calculado", "a360"), itens: p.porEtapa.map((r) => ({ rotulo: r.rotulo, valor: r.vencidas })) },
    { chave: "horas_por_projeto", rotulo: "Horas realizadas por projeto (top 15)", proveniencia: prov("original"), itens: p.horas.porProjeto.map((r) => ({ rotulo: r.rotulo, codigo: r.codigo, valor: Number(minutosParaHoras(r.min)) })) },
    { chave: "revisoes_por_projeto", rotulo: "Tarefas de revisão por projeto (top 15)", proveniencia: prov("calculado", "a360"), itens: p.revisoes },
  ];
  return {
    ...base, carga: { id: p.carga.id, dataExportacaoVobi: p.carga.dataCarga }, indicadores, distribuicoes,
    recomendacoes: p.recomendacoes.map((r) => ({ ...r, natureza: "calculado" as const })),
    qualidade: { classes: p.qualidade, proveniencia: prov("calculado", "a360") },
  };
}
