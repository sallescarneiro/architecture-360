// Análise de projeto (T-188 evolução, itens 4–7): cruza registros do A360 com fatos do Vobi.
// Duas camadas: (1) verificações determinísticas, sempre disponíveis (sem IA), que geram alertas/flags com evidência explícita;
// (2) análise por IA (quando configurada) sobre a linha do tempo, com evidências obrigatórias e classificação/confiança.
// Nunca trata ausência de dado como conformidade; o que não dá para comparar vira flag.
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Usuario } from "@/lib/auth";
import { criarAlerta } from "./alertas";
import { garantirFlagsDoProjeto, garantirFlagsGerais, garantirFlag } from "./flags";
import { linhaDoTempo, type Acontecimento } from "./linha-do-tempo";
import { ErroIA, analisarProjeto as iaAnalisar } from "./transcricao/ia";
import { iaConfigurada } from "./vobi-cobertura";
import { hojeLocal } from "./agenda/datas";

export type Analise = typeof schema.analisesProjeto.$inferSelect;

export async function analisesDe(codigo: number): Promise<Analise[]> {
  return db.select().from(schema.analisesProjeto).where(eq(schema.analisesProjeto.projetoCodigo, codigo)).orderBy(desc(schema.analisesProjeto.id)).limit(10);
}

const fmt = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

/** Texto de entrada para a IA: cada linha com ref estável, origem, data, tipo e conteúdo. Sem dados pessoais além de nomes já presentes. */
function entradaDe(linha: Acontecimento[], nomeProjeto: string, limitacoes: string[]): { texto: string; refs: Set<string> } {
  const refs = new Set<string>();
  const linhas = [...linha].sort((a, b) => a.quando.getTime() - b.quando.getTime()).map((a) => { refs.add(a.id); return `${a.id} | ${a.origem.toUpperCase()} | ${fmt(a.quando)}${a.precisao === "carga" ? " (data da exportação)" : a.precisao === "dia" ? " (dia)" : ""} | ${a.tipo} | ${a.titulo}${a.resumo ? ` — ${a.resumo}` : ""}${a.participantes?.length ? ` — participantes: ${a.participantes.join(", ")}` : ""}` });
  return { texto: `PROJETO: ${nomeProjeto}\nLIMITAÇÕES CONHECIDAS (não suponha estes dados):\n${limitacoes.map((l) => `- ${l}`).join("\n")}\n\nACONTECIMENTOS (ref | origem | data | tipo | conteúdo):\n${linhas.join("\n")}`, refs };
}

/** Camada determinística: regras simples, evidência explícita, classificação conservadora. */
async function verificacoesDeterministicas(codigo: number, linha: Acontecimento[], analiseId: number): Promise<number> {
  let novos = 0;
  const hoje = hojeLocal();
  const itens = await db.select({ i: schema.itensReuniao, r: schema.reunioes }).from(schema.itensReuniao).innerJoin(schema.reunioes, eq(schema.reunioes.id, schema.itensReuniao.reuniaoId)).where(and(eq(schema.reunioes.projetoCodigo, codigo), eq(schema.itensReuniao.confirmado, true)));
  const tarefas = await db.select().from(schema.tarefas).where(and(eq(schema.tarefas.projetoCodigo, codigo), eq(schema.tarefas.orfa, false)));
  const aprovacoes = itens.filter((x) => x.i.tipo === "aprovacao" && x.i.situacao !== "cancelado");
  // R1: refação/revisão no Vobi depois de aprovação registrada no A360 → uma ocorrência por projeto (todas as aprovações anteriores como evidência)
  const primeiraAprov = aprovacoes.map((x) => x.r.inicio.getTime()).sort()[0];
  if (primeiraAprov) {
    const depois = tarefas.filter((t) => (t.etapaCanonica === "Refação" || (t.revisao ?? 0) >= 1) && t.dataInicio && new Date(t.dataInicio + "T12:00:00-03:00").getTime() > primeiraAprov);
    if (depois.length) {
      const aps = aprovacoes.filter((x) => depois.some((t) => new Date(t.dataInicio! + "T12:00:00-03:00") > x.r.inicio)).slice(0, 4);
      const { novo } = await criarAlerta({ projetoCodigo: codigo, categoria: "decisao_posterior", titulo: `Revisão/refação no Vobi após aprovação registrada no A360`, descricao: `Há ${aps.length} aprovação(ões) registrada(s) em reunião (a partir de ${fmt(new Date(primeiraAprov))}). Depois delas, o Vobi mostra ${depois.length} tarefa(s) de revisão/refação: ${depois.slice(0, 3).map((t) => `“${t.nome}”${t.dataInicio ? ` (início ${t.dataInicio})` : ""}`).join(", ")}. Pode ser alteração solicitada e aprovada depois, ou retrabalho sobre algo já aprovado — exige esclarecimento.`, classificacao: "possivel_divergencia", prioridade: "moderado", confianca: 55, evidencias: [...aps.map((ap) => ({ origem: "a360" as const, tipo: "aprovacao", ref: `a360:item:${ap.i.id}`, rotulo: ap.i.texto.slice(0, 120), data: fmt(ap.r.inicio), link: `/reunioes/${ap.r.id}#aprovacao` })), ...depois.slice(0, 5).map((t) => ({ origem: "vobi" as const, tipo: "tarefa", ref: `vobi:tarefa:${t.chave}`, rotulo: `${t.etapaCanonica}: ${t.nome}${t.revisao ? ` R${t.revisao}` : ""}`, data: t.dataInicio ?? undefined }))], impacto: "Possível retrabalho sobre item aprovado; verificar se houve nova aprovação.", origem: "ia", analiseId });
      if (novo) novos++;
    }
  }
  // R2: encaminhamento com prazo vencido e aberto → informativo/moderado (acompanhamento, não cobrança individual)
  for (const x of itens.filter((y) => y.i.tipo === "encaminhamento" && y.i.situacao === "aberto" && y.i.prazo && y.i.prazo < hoje)) {
    const { novo } = await criarAlerta({ projetoCodigo: codigo, categoria: "prazo", titulo: `Encaminhamento com prazo vencido sem registro de conclusão: ${x.i.texto.slice(0, 80)}`, descricao: `Combinado na reunião “${x.r.titulo}” com prazo ${x.i.prazo}. Não há registro de conclusão no A360. O Vobi não informa se foi feito (não há vínculo entre encaminhamento e tarefa).`, classificacao: "inconclusivo", prioridade: "moderado", confianca: 70, evidencias: [{ origem: "a360", tipo: "encaminhamento", ref: `a360:item:${x.i.id}`, rotulo: x.i.texto.slice(0, 120), data: x.i.prazo ?? undefined, link: `/reunioes/${x.r.id}#encaminhamento` }], impacto: "Pode atrasar a etapa dependente; confirmar situação com o responsável.", origem: "ia", analiseId });
    if (novo) novos++;
  }
  // R3: decisões/aprovações registradas, mas nenhuma tarefa aberta no Vobi nas etapas seguintes (produção pode não ter sido acionada) — inconclusivo
  const abertas = tarefas.filter((t) => !/conclu|cancel/i.test(t.status ?? ""));
  if ((aprovacoes.length || itens.some((x) => x.i.tipo === "decisao")) && abertas.length === 0 && tarefas.length > 0) {
    const { novo } = await criarAlerta({ projetoCodigo: codigo, categoria: "escopo", titulo: "Decisões/aprovações registradas, mas sem tarefa aberta no Vobi", descricao: "Há decisões ou aprovações no A360 e o Vobi não mostra tarefas abertas neste projeto. Pode ser projeto concluído, decisão sem desdobramento em produção ou tarefas ainda não criadas no Vobi (a exportação só mostra o que existe lá).", classificacao: "inconclusivo", prioridade: "moderado", confianca: 40, evidencias: [...aprovacoes.slice(0, 2).map((x) => ({ origem: "a360" as const, tipo: "aprovacao", ref: `a360:item:${x.i.id}`, rotulo: x.i.texto.slice(0, 120), link: `/reunioes/${x.r.id}` })), ...itens.filter((x) => x.i.tipo === "decisao").slice(0, 2).map((x) => ({ origem: "a360" as const, tipo: "decisao", ref: `a360:item:${x.i.id}`, rotulo: x.i.texto.slice(0, 120), link: `/reunioes/${x.r.id}` }))].filter((e) => linha.some((a) => a.id === e.ref)), impacto: "Se a produção deveria seguir, falta a tarefa no Vobi.", origem: "ia", analiseId });
    if (novo) novos++;
  }
  return novos;
}

/** Executa a análise completa do projeto. Nunca lança: o resultado (ou erro) fica em projeto_analise. */
export async function analisarProjeto(u: Usuario | null, codigo: number): Promise<{ ok: boolean; analiseId: number; alertasNovos: number; estado: string; erro?: string }> {
  const p = (await db.select().from(schema.projetos).where(eq(schema.projetos.codigo, codigo)).limit(1))[0];
  if (!p) return { ok: false, analiseId: 0, alertasNovos: 0, estado: "erro", erro: "projeto não encontrado" };
  const emCurso = (await db.select({ id: schema.analisesProjeto.id }).from(schema.analisesProjeto).where(and(eq(schema.analisesProjeto.projetoCodigo, codigo), eq(schema.analisesProjeto.estado, "processando"))).limit(1))[0];
  if (emCurso) return { ok: false, analiseId: emCurso.id, alertasNovos: 0, estado: "processando", erro: "já existe uma análise em andamento" };
  const [an] = await db.insert(schema.analisesProjeto).values({ projetoCodigo: codigo, estado: "processando", iniciadoPor: u?.id ?? null }).returning({ id: schema.analisesProjeto.id });
  try {
    await garantirFlagsGerais();
    const linha = await linhaDoTempo(codigo);
    const temAprov = linha.some((a) => a.tipo === "aprovacao");
    await garantirFlagsDoProjeto(codigo, p.nome, temAprov);
    let novos = await verificacoesDeterministicas(codigo, linha, an.id);
    const entradas = { acontecimentos: linha.length, a360: linha.filter((a) => a.origem === "a360").length, vobi: linha.filter((a) => a.origem === "vobi").length, refs: linha.slice(0, 500).map((a) => a.id) };
    if (!iaConfigurada()) {
      await db.update(schema.analisesProjeto).set({ estado: "sem_ia", provedor: "regras", entradas, resultado: { ocorrencias: [], relacoes: [], inconclusivo: ["Análise por IA não executada: ANTHROPIC_API_KEY ausente. Só as verificações determinísticas foram aplicadas."], observacoes: null }, alertasNovos: novos, concluidoEm: new Date() }).where(eq(schema.analisesProjeto.id, an.id));
      return { ok: true, analiseId: an.id, alertasNovos: novos, estado: "sem_ia" };
    }
    const limitacoes = ["O Vobi exportado não traz apresentações ao cliente, aprovações do cliente, solicitações de alteração, comentários nem especificação de produção.", "Datas do Vobi marcadas como (dia) são prazos planejados; (data da exportação) indica quando a mudança foi vista, não quando ocorreu.", "Aprovações e decisões do cliente só existem se registradas no A360 (reuniões)."];
    const { texto, refs } = entradaDe(linha, p.nome, limitacoes);
    const { resultado, provedor, modelo } = await iaAnalisar(texto, refs);
    for (const o of resultado.ocorrencias) {
      const evid = o.evidencias.map((e) => { const a = linha.find((x) => x.id === e.ref)!; return { origem: a.origem, tipo: a.tipo, ref: a.id, rotulo: a.titulo.slice(0, 140), trecho: e.trecho ?? undefined, data: fmt(a.quando), link: a.link ?? undefined }; });
      const { novo } = await criarAlerta({ projetoCodigo: codigo, categoria: o.categoria, titulo: o.titulo, descricao: o.descricao, classificacao: o.classificacao, prioridade: o.prioridade, confianca: o.confianca, evidencias: evid, impacto: o.impacto, origem: "ia", analiseId: an.id });
      if (novo) novos++;
    }
    for (const inc of resultado.inconclusivo.slice(0, 5)) await garantirFlag({ chave: `projeto.${codigo}.inconclusivo.${inc.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`, projetoCodigo: codigo, comparacao: "Comparação inconclusiva (IA)", dadoAusente: inc.slice(0, 300), informacaoNecessaria: inc.slice(0, 300), origemEsperada: "vobi", tipo: "ausencia_registro", analisesComprometidas: "cruzamento A360 × Vobi deste projeto" });
    await db.update(schema.analisesProjeto).set({ estado: "concluida", provedor, modelo, entradas, resultado, alertasNovos: novos, concluidoEm: new Date() }).where(eq(schema.analisesProjeto.id, an.id));
    return { ok: true, analiseId: an.id, alertasNovos: novos, estado: "concluida" };
  } catch (e) {
    const msg = e instanceof ErroIA ? `${e.codigo}: ${e.message}` : e instanceof Error ? e.message.slice(0, 200) : "erro";
    await db.update(schema.analisesProjeto).set({ estado: "erro", erro: msg, concluidoEm: new Date() }).where(eq(schema.analisesProjeto.id, an.id));
    await garantirFlag({ chave: `projeto.${codigo}.falha.analise`, projetoCodigo: codigo, comparacao: "Análise de divergências", dadoAusente: "resultado da análise (falha técnica)", informacaoNecessaria: "processamento concluído", origemEsperada: "a360", tipo: "falha_tecnica", analisesComprometidas: "cruzamento A360 × Vobi e identificação de divergências", alternativa: "reexecutar a análise" });
    console.warn(`[analise] projeto ${codigo}: ${msg.slice(0, 120)}`);
    return { ok: false, analiseId: an.id, alertasNovos: 0, estado: "erro", erro: msg };
  }
}


