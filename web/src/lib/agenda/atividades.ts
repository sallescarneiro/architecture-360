// T-219 — Agenda gerencial: atividades programadas pela gestão para as arquitetas.
// Permissões no servidor: gestão (admin, gestão, coordenação = Rodrigo, Flavia, Thais, Ana Paula) vê todas e programa;
// arquiteta vê só as próprias, sem criar nem alterar. Fase 0: NADA é escrito no Vobi — vínculos e pedidos de envio
// ficam registrados ("aguardando envio") para as fases seguintes do plano aprovado.
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CamposVobi } from "@/db/schema";
import type { Perfil, Usuario } from "@/lib/auth";
import { atualizarFila, mapaResponsaveis } from "@/lib/vobi/espelho";
import { camposDaTarefa, diferencas, estadoDe, NOME_CAMPO, type Campo } from "@/lib/vobi/reconciliar";

export type Atividade = typeof schema.atividades.$inferSelect;
export const podeGerirAgenda = (p: Perfil) => p === "admin" || p === "gestao" || p === "coordenacao";

// Opções nos termos do Vobi (mesmos nomes e códigos)
export const STATUS_VOBI: Record<number, string> = { 1: "Planejado", 2: "Em andamento", 4: "Concluído", 5: "Cancelado" };
export const PRIORIDADE_VOBI: Record<number, string> = { 1: "Baixa", 2: "Média", 3: "Alta" };
export const TIPOS_INDEPENDENTE: Record<string, string> = {
  reuniao_interna: "Reunião interna", treinamento: "Treinamento", estudo: "Estudo", alinhamento: "Alinhamento", administrativa: "Atividade administrativa", outra: "Outra demanda gerencial",
};
export const ESTADO_VOBI: Record<string, { rotulo: string; tom: "neutral" | "info" | "ok" | "warn" | "bad" }> = {
  local: { rotulo: "Só no A360", tom: "neutral" },
  aguardando_envio: { rotulo: "Aguardando envio ao Vobi", tom: "info" },
  sincronizada: { rotulo: "Igual ao Vobi", tom: "ok" },
  conflito: { rotulo: "Conflito com o Vobi", tom: "bad" },
  divergencia: { rotulo: "Tarefa não encontrada no Vobi", tom: "warn" },
};
export const escritaVobiLigada = () => false; // Fase 0 (T-219): escrita no Vobi desligada por construção — não há código de envio.

const OFFSET = "-03:00";
export const instante = (dia: string, hora: string) => new Date(`${dia}T${hora}:00${OFFSET}`);

export type DadosAtividade = {
  vinculo: "independente" | "tarefa_existente" | "nova_tarefa";
  tipo: string; titulo: string; descricao: string | null; responsavelId: number;
  inicio: Date | null; fim: Date; diaInteiro: boolean; estimadaHoras: number | null; prioridade: number; status: number;
  projetoCodigo: number | null; etapaVobiId: number | null; tarefaVobiId: number | null;
};

/** Lê e valida o formulário. Regras: prazo = Data de término; término ≥ início; vínculos pelos números do Vobi. */
export async function lerFormulario(fd: FormData): Promise<{ dados: DadosAtividade } | { erro: string }> {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const n = (k: string) => (/^\d+$/.test(s(k)) ? Number(s(k)) : null);
  const vinculo = s("vinculo") as DadosAtividade["vinculo"];
  if (!["independente", "tarefa_existente", "nova_tarefa"].includes(vinculo)) return { erro: "Escolha se a atividade é independente ou ligada a uma tarefa do Vobi." };
  const titulo = s("titulo");
  if (!titulo) return { erro: "Informe o nome da tarefa." };
  const responsavelId = n("responsavel");
  if (!responsavelId) return { erro: "Escolha a responsável." };
  const resp = (await db.select({ id: schema.usuarios.id }).from(schema.usuarios).where(and(eq(schema.usuarios.id, responsavelId), eq(schema.usuarios.ativo, true))))[0];
  if (!resp) return { erro: "Responsável inválida." };
  const di = s("data_inicio"), df = s("data_fim"), diaInteiro = s("dia_inteiro") === "1";
  // tarefa do Vobi pode não ter início (preservado vazio); atividade independente exige as duas datas
  const semInicio = !di && vinculo !== "independente";
  if ((!semInicio && !/^\d{4}-\d{2}-\d{2}$/.test(di)) || !/^\d{4}-\d{2}-\d{2}$/.test(df)) return { erro: "Informe a data de início e a data de término (prazo)." };
  const hi = diaInteiro ? "00:00" : s("hora_inicio") || "09:00", hf = diaInteiro ? "23:59" : s("hora_fim") || "18:00";
  if (!/^\d{2}:\d{2}$/.test(hi) || !/^\d{2}:\d{2}$/.test(hf)) return { erro: "Horário inválido." };
  const inicio = semInicio ? null : instante(di, hi), fim = instante(df, hf);
  if (inicio && fim.getTime() < inicio.getTime()) return { erro: "A data de término (prazo) não pode ser antes do início." };
  const prioridade = n("prioridade") ?? 2, status = n("status") ?? 1;
  if (!PRIORIDADE_VOBI[prioridade] || !STATUS_VOBI[status]) return { erro: "Prioridade ou status inválido." };
  const estimadaHoras = n("estimada");
  let tipo = "tarefa", projetoCodigo: number | null = null, etapaVobiId: number | null = null, tarefaVobiId: number | null = null;
  if (vinculo === "independente") {
    tipo = s("tipo");
    if (!TIPOS_INDEPENDENTE[tipo]) return { erro: "Escolha o tipo da atividade independente." };
  } else {
    projetoCodigo = n("projeto");
    if (!projetoCodigo) return { erro: "Escolha o projeto do Vobi." };
    const proj = (await db.select({ c: schema.projetos.codigo }).from(schema.projetos).where(eq(schema.projetos.codigo, projetoCodigo)))[0];
    if (!proj) return { erro: "Projeto não encontrado entre os projetos lidos do Vobi." };
    etapaVobiId = n("etapa");
    if (etapaVobiId) {
      const et = (await db.select().from(schema.vobiEtapas).where(eq(schema.vobiEtapas.idVobi, etapaVobiId)))[0];
      if (!et || et.idRefurbish !== projetoCodigo) return { erro: "A etapa escolhida não é deste projeto." };
    }
    if (vinculo === "tarefa_existente") {
      tarefaVobiId = n("tarefa");
      if (!tarefaVobiId) return { erro: "Escolha a tarefa do Vobi." };
      const t = (await db.select().from(schema.vobiTarefas).where(eq(schema.vobiTarefas.idVobi, tarefaVobiId)))[0];
      if (!t || t.idRefurbish !== projetoCodigo) return { erro: "A tarefa escolhida não é deste projeto." };
    }
  }
  return { dados: { vinculo, tipo, titulo, descricao: s("descricao") || null, responsavelId, inicio, fim, diaInteiro, estimadaHoras, prioridade, status, projetoCodigo, etapaVobiId, tarefaVobiId } };
}

/** Campos da atividade nos termos do Vobi (o que seria enviado). Responsável sem número do Vobi = null. */
async function camposDaAtividade(d: Pick<DadosAtividade, "titulo" | "etapaVobiId" | "responsavelId" | "inicio" | "fim" | "prioridade" | "status">, base?: CamposVobi | null): Promise<CamposVobi> {
  const { usuarioParaVobi, vobiParaUsuario } = await mapaResponsaveis();
  // a mesma pessoa pode ter mais de um número no Vobi: se a tarefa já é dela, mantém o número que está lá
  const idResp = base?.idResponsavel != null && vobiParaUsuario.get(base.idResponsavel) === d.responsavelId ? base.idResponsavel : usuarioParaVobi.get(d.responsavelId) ?? null;
  return { nome: d.titulo, idEtapa: d.etapaVobiId, idResponsavel: idResp, inicio: d.inicio ? d.inicio.toISOString() : null, fim: d.fim.toISOString(), prioridade: d.prioridade, status: d.status };
}

const hist = (atividadeId: number, usuarioId: number | null, resumo: string, antes?: unknown, depois?: unknown, origem = "a360") =>
  db.insert(schema.atividadeHistorico).values({ atividadeId, usuarioId, resumo, antes: antes ?? null, depois: depois ?? null, origem });

export async function criarAtividade(u: Usuario, d: DadosAtividade): Promise<{ ok: true; id: number } | { ok: false; mensagem: string }> {
  if (!podeGerirAgenda(u.perfil)) return { ok: false, mensagem: "Só a gestão programa atividades." };
  let baseVobi: Atividade["baseVobi"] = null, pendentes: CamposVobi = {};
  if (d.vinculo === "tarefa_existente") {
    const ja = (await db.select({ id: schema.atividades.id }).from(schema.atividades).where(eq(schema.atividades.tarefaVobiId, d.tarefaVobiId!)))[0];
    if (ja) return { ok: false, mensagem: `Essa tarefa do Vobi já está programada na atividade ${ja.id}.` };
    const t = (await db.select().from(schema.vobiTarefas).where(eq(schema.vobiTarefas.idVobi, d.tarefaVobiId!)))[0];
    d = { ...d, status: t.status ?? 1 }; // status é da execução no Vobi
    baseVobi = { ...camposDaTarefa(t), atualizadoVobiEm: t.atualizadoVobiEm?.toISOString() ?? null };
    pendentes = diferencas(baseVobi, await camposDaAtividade(d, baseVobi));
    if (pendentes.idResponsavel === null) delete pendentes.idResponsavel; // sem número do Vobi não há como enviar responsável
  } else if (d.vinculo === "nova_tarefa") {
    const c = await camposDaAtividade(d);
    pendentes = Object.fromEntries(Object.entries(c).filter(([, v]) => v != null)) as CamposVobi;
  }
  const estadoVobi = estadoDe({ vinculo: d.vinculo, tarefaVobiId: d.tarefaVobiId, pendentes, conflitos: {} });
  const [a] = await db.insert(schema.atividades).values({ ...d, baseVobi, pendentes, conflitos: {}, estadoVobi, criadoPorId: u.id, atualizadoPorId: u.id }).returning({ id: schema.atividades.id });
  await hist(a.id, u.id, d.vinculo === "independente" ? "Atividade independente criada" : d.vinculo === "tarefa_existente" ? `Atividade criada e ligada à tarefa nº ${d.tarefaVobiId} do Vobi` : "Atividade criada para virar nova tarefa no Vobi", null, d);
  if (d.vinculo === "nova_tarefa") await atualizarFila(a.id, { ...pendentes }, "criar", u.id);
  else if (d.vinculo === "tarefa_existente") await atualizarFila(a.id, pendentes, "atualizar", u.id);
  return { ok: true, id: a.id };
}

export async function editarAtividade(u: Usuario, id: number, d: DadosAtividade): Promise<{ ok: boolean; mensagem?: string }> {
  if (!podeGerirAgenda(u.perfil)) return { ok: false, mensagem: "Só a gestão altera atividades." };
  const a = (await db.select().from(schema.atividades).where(eq(schema.atividades.id, id)))[0];
  if (!a) return { ok: false, mensagem: "Atividade não encontrada." };
  // o vínculo e o projeto não mudam depois de criados (o Vobi não move tarefa de projeto)
  const fixo = { vinculo: a.vinculo as DadosAtividade["vinculo"], projetoCodigo: a.projetoCodigo, tarefaVobiId: a.tarefaVobiId, tipo: a.vinculo === "independente" ? d.tipo : a.tipo };
  const novo = { ...d, ...fixo };
  let pendentes: CamposVobi = a.pendentes ?? {};
  if (a.vinculo !== "independente") {
    const c = await camposDaAtividade(novo, a.baseVobi);
    if (a.vinculo === "nova_tarefa" && !a.tarefaVobiId) pendentes = Object.fromEntries(Object.entries(c).filter(([, v]) => v != null)) as CamposVobi;
    else {
      // status é do Vobi: a edição não manda status (só o cancelamento manda)
      const prog = diferencas(a.baseVobi, c);
      if (prog.idResponsavel === null) delete prog.idResponsavel;
      pendentes = { ...prog, ...(a.pendentes?.status === 5 ? { status: 5 } : {}) };
      novo.status = a.status;
    }
  }
  // um campo em conflito que a gestão editou de novo continua em conflito até ser resolvido
  const estadoVobi = estadoDe({ vinculo: a.vinculo, tarefaVobiId: a.tarefaVobiId, pendentes, conflitos: a.conflitos ?? {} });
  await db.update(schema.atividades).set({ ...novo, pendentes, estadoVobi, atualizadoPorId: u.id, atualizadoEm: new Date() }).where(eq(schema.atividades.id, id));
  await hist(id, u.id, "Atividade alterada", { titulo: a.titulo, inicio: a.inicio, fim: a.fim, responsavelId: a.responsavelId, etapaVobiId: a.etapaVobiId, prioridade: a.prioridade, status: a.status }, { titulo: novo.titulo, inicio: novo.inicio, fim: novo.fim, responsavelId: novo.responsavelId, etapaVobiId: novo.etapaVobiId, prioridade: novo.prioridade, status: novo.status });
  if (a.vinculo !== "independente") await atualizarFila(id, pendentes, a.vinculo === "nova_tarefa" && !a.tarefaVobiId ? "criar" : "atualizar", u.id);
  return { ok: true };
}

/** Cancelar nunca exclui: independente → status Cancelado; vinculada → pede Cancelado ao Vobi (fica aguardando na Fase 0). */
export async function cancelarAtividade(u: Usuario, id: number): Promise<{ ok: boolean; mensagem?: string }> {
  if (!podeGerirAgenda(u.perfil)) return { ok: false, mensagem: "Só a gestão cancela atividades." };
  const a = (await db.select().from(schema.atividades).where(eq(schema.atividades.id, id)))[0];
  if (!a) return { ok: false, mensagem: "Atividade não encontrada." };
  if (a.vinculo === "independente" || (a.vinculo === "nova_tarefa" && !a.tarefaVobiId)) {
    await db.update(schema.atividades).set({ status: 5, atualizadoPorId: u.id, atualizadoEm: new Date() }).where(eq(schema.atividades.id, id));
    if (a.vinculo === "nova_tarefa") {
      await db.update(schema.vobiEnvios).set({ estado: "descartado", resposta: "atividade cancelada antes de criar a tarefa", processadoEm: new Date() }).where(and(eq(schema.vobiEnvios.atividadeId, id), eq(schema.vobiEnvios.estado, "aguardando")));
      await db.update(schema.atividades).set({ estadoVobi: "local" }).where(eq(schema.atividades.id, id));
    }
  } else {
    const pendentes = { ...(a.pendentes ?? {}), status: 5 };
    await db.update(schema.atividades).set({ status: 5, pendentes, estadoVobi: estadoDe({ ...a, pendentes, conflitos: a.conflitos ?? {} }), atualizadoPorId: u.id, atualizadoEm: new Date() }).where(eq(schema.atividades.id, id));
    await atualizarFila(id, pendentes, "cancelar", u.id);
  }
  await hist(id, u.id, "Atividade cancelada (nada é excluído)");
  return { ok: true };
}

/** Gestão decide um conflito: "a360" mantém o valor programado (volta a aguardar envio); "vobi" adota o valor do Vobi. */
export async function resolverConflito(u: Usuario, id: number, campo: Campo, escolha: "a360" | "vobi"): Promise<{ ok: boolean; mensagem?: string }> {
  if (!podeGerirAgenda(u.perfil)) return { ok: false, mensagem: "Só a gestão resolve conflitos." };
  const a = (await db.select().from(schema.atividades).where(eq(schema.atividades.id, id)))[0];
  const c = a?.conflitos?.[campo];
  if (!a || !c) return { ok: false, mensagem: "Conflito não encontrado." };
  const conflitos = { ...a.conflitos }; delete conflitos[campo];
  const pendentes: CamposVobi = { ...(a.pendentes ?? {}) };
  const muda: Partial<typeof schema.atividades.$inferInsert> = {};
  if (escolha === "a360") (pendentes as Record<string, unknown>)[campo] = c.a360;
  else {
    const v = c.vobi as never;
    if (campo === "nome") muda.titulo = v; else if (campo === "idEtapa") muda.etapaVobiId = v;
    else if (campo === "inicio" && v) muda.inicio = new Date(v); else if (campo === "fim" && v) muda.fim = new Date(v);
    else if (campo === "prioridade") muda.prioridade = v; else if (campo === "status") muda.status = v;
    else if (campo === "idResponsavel") { const { vobiParaUsuario } = await mapaResponsaveis(); const uid = vobiParaUsuario.get(v); if (uid) muda.responsavelId = uid; }
  }
  const estadoVobi = estadoDe({ vinculo: a.vinculo, tarefaVobiId: a.tarefaVobiId, pendentes, conflitos });
  await db.update(schema.atividades).set({ ...muda, conflitos, pendentes, estadoVobi, atualizadoPorId: u.id, atualizadoEm: new Date() }).where(eq(schema.atividades.id, id));
  await atualizarFila(id, pendentes, "atualizar", u.id);
  await hist(id, u.id, `Conflito em ${NOME_CAMPO[campo]} resolvido: vale o valor ${escolha === "a360" ? "programado no A360" : "do Vobi"}`, c);
  return { ok: true };
}

/** A arquiteta só enxerga as próprias atividades (regra no servidor). */
export async function obterAtividade(u: Usuario, id: number): Promise<Atividade | null> {
  const a = (await db.select().from(schema.atividades).where(eq(schema.atividades.id, id)))[0];
  if (!a) return null;
  if (!podeGerirAgenda(u.perfil) && a.responsavelId !== u.id) return null;
  return a;
}

export async function listarAtividades(u: Usuario, f: { responsavelIds: number[] | null; de: Date; ate: Date; projeto?: number | null; incluirCanceladas?: boolean }): Promise<Atividade[]> {
  const ids = podeGerirAgenda(u.perfil) ? f.responsavelIds : [u.id]; // arquiteta: sempre só ela, qualquer que seja o filtro pedido
  const cond = [lte(sql`coalesce(${schema.atividades.inicio}, ${schema.atividades.fim})`, f.ate), gte(schema.atividades.fim, f.de)];
  if (ids) cond.push(inArray(schema.atividades.responsavelId, ids.length ? ids : [-1]));
  if (f.projeto) cond.push(eq(schema.atividades.projetoCodigo, f.projeto));
  if (!f.incluirCanceladas) cond.push(ne(schema.atividades.status, 5));
  return db.select().from(schema.atividades).where(and(...cond)).orderBy(asc(schema.atividades.inicio));
}

export async function historico(id: number) {
  return db.select({ h: schema.atividadeHistorico, nome: schema.usuarios.nome }).from(schema.atividadeHistorico)
    .leftJoin(schema.usuarios, eq(schema.usuarios.id, schema.atividadeHistorico.usuarioId))
    .where(eq(schema.atividadeHistorico.atividadeId, id)).orderBy(desc(schema.atividadeHistorico.quando));
}

export async function filaDe(id: number) {
  return db.select().from(schema.vobiEnvios).where(eq(schema.vobiEnvios.atividadeId, id)).orderBy(desc(schema.vobiEnvios.id));
}

/** Pessoas que podem receber atividade (todas ativas), arquitetas primeiro. */
export async function pessoasDaAgenda() {
  const us = await db.select({ id: schema.usuarios.id, nome: schema.usuarios.nome, email: schema.usuarios.email, perfil: schema.usuarios.perfil })
    .from(schema.usuarios).where(eq(schema.usuarios.ativo, true)).orderBy(asc(schema.usuarios.nome));
  const { usuarioParaVobi, vobiParaUsuario } = await mapaResponsaveis();
  const todos = new Map<number, number[]>();
  for (const [idV, uid] of vobiParaUsuario) todos.set(uid, [...(todos.get(uid) ?? []), idV]);
  return us.map((x) => ({ ...x, idVobi: usuarioParaVobi.get(x.id) ?? null, idsVobi: todos.get(x.id) ?? [] })).sort((a, b) => Number(a.perfil !== "arquiteta") - Number(b.perfil !== "arquiteta") || a.nome.localeCompare(b.nome));
}

/** Dados de apoio do formulário: projetos ativos, etapas e tarefas (espelho do Vobi), marcando as já programadas. */
export async function apoioVinculo() {
  const projetos = (await db.execute(sql`select p.codigo, p.nome, c.nome cliente from projeto p left join cliente_vobi c on c.codigo = p.cliente_codigo
      where p.nao_encontrado_desde is null and p.status_classe <> 'encerrado' order by p.nome`)).rows as { codigo: number; nome: string; cliente: string | null }[];
  const etapas = await db.select({ id: schema.vobiEtapas.idVobi, projeto: schema.vobiEtapas.idRefurbish, nome: schema.vobiEtapas.nome, ordem: schema.vobiEtapas.ordem })
    .from(schema.vobiEtapas).orderBy(asc(schema.vobiEtapas.idRefurbish), asc(schema.vobiEtapas.ordem));
  const tarefas = (await db.execute(sql`select t.id_vobi id, t.id_refurbish projeto, t.id_etapa etapa, t.nome, t.id_responsavel resp, t.status, t.prioridade,
      t.inicio, t.fim, a.id atividade from vobi_tarefa t left join atividade a on a.tarefa_vobi_id = t.id_vobi
      where t.ausente_desde is null and coalesce(t.status, 1) not in (4, 5) order by t.id_refurbish, t.fim nulls last`)).rows as {
      id: number; projeto: number; etapa: number | null; nome: string; resp: number | null; status: number | null; prioridade: number | null; inicio: string | null; fim: string | null; atividade: number | null }[];
  return {
    projetos: projetos.map((p) => ({ codigo: Number(p.codigo), nome: p.nome, cliente: p.cliente })),
    etapas: etapas.map((e) => ({ ...e, projeto: Number(e.projeto) })),
    tarefas: tarefas.map((t) => ({ ...t, id: Number(t.id), projeto: Number(t.projeto), inicio: t.inicio ? new Date(t.inicio).toISOString() : null, fim: t.fim ? new Date(t.fim).toISOString() : null })),
  };
}

/**
 * Camada "Programação do Vobi" (T-219, 12/11/2026): tarefas do espelho com data no período, de qualquer status, que ainda
 * não foram programadas no A360 (as programadas aparecem como atividade, sem duplicar). Só leitura.
 */
export async function programacaoVobi(f: { idsVobi: number[] | null; de: Date; ate: Date; projeto?: number | null }) {
  const cond = [
    sql`coalesce(${schema.vobiTarefas.inicio}, ${schema.vobiTarefas.fim}) <= ${f.ate.toISOString()}`,
    sql`coalesce(${schema.vobiTarefas.fim}, ${schema.vobiTarefas.inicio}) >= ${f.de.toISOString()}`,
    sql`${schema.vobiTarefas.idRefurbish} in (select codigo from projeto)`,
  ];
  if (f.idsVobi) cond.push(inArray(schema.vobiTarefas.idResponsavel, f.idsVobi.length ? f.idsVobi : [-1]));
  if (f.projeto) cond.push(eq(schema.vobiTarefas.idRefurbish, f.projeto));
  return db.select({ t: schema.vobiTarefas, projeto: schema.projetos.nome }).from(schema.vobiTarefas)
    .leftJoin(schema.projetos, eq(schema.projetos.codigo, schema.vobiTarefas.idRefurbish))
    .leftJoin(schema.atividades, eq(schema.atividades.tarefaVobiId, schema.vobiTarefas.idVobi))
    .where(and(...cond, isNull(schema.atividades.id))).orderBy(asc(schema.vobiTarefas.fim)).limit(800);
}

/** Tarefas do Vobi sem nenhuma data (não são descartadas: ficam listadas por pessoa). */
export async function semDataVobi(f: { idsVobi: number[] | null; projeto?: number | null }) {
  const cond = [isNull(schema.vobiTarefas.inicio), isNull(schema.vobiTarefas.fim), sql`${schema.vobiTarefas.idRefurbish} in (select codigo from projeto)`,
    or(isNull(schema.vobiTarefas.status), inArray(schema.vobiTarefas.status, [1, 2]))!];
  if (f.idsVobi) cond.push(inArray(schema.vobiTarefas.idResponsavel, f.idsVobi.length ? f.idsVobi : [-1]));
  if (f.projeto) cond.push(eq(schema.vobiTarefas.idRefurbish, f.projeto));
  return db.select({ t: schema.vobiTarefas, projeto: schema.projetos.nome }).from(schema.vobiTarefas)
    .leftJoin(schema.projetos, eq(schema.projetos.codigo, schema.vobiTarefas.idRefurbish))
    .leftJoin(schema.atividades, eq(schema.atividades.tarefaVobiId, schema.vobiTarefas.idVobi))
    .where(and(...cond, isNull(schema.atividades.id))).orderBy(asc(schema.projetos.nome)).limit(300);
}

/**
 * "Programar no A360": cria a atividade com os valores EXATOS da tarefa do Vobi (número, projeto, etapa, responsável, datas e
 * horários, status, prioridade). Não gera nada para enviar. Bloqueia individualmente se o responsável não estiver mapeado
 * ou se a tarefa não tiver término (aí a gestão programa pelo formulário).
 */
export async function programarDoVobi(u: Usuario, idVobi: number): Promise<{ ok: true; id: number } | { ok: false; mensagem: string; formulario?: boolean }> {
  if (!podeGerirAgenda(u.perfil)) return { ok: false, mensagem: "Só a gestão programa atividades." };
  const ja = (await db.select({ id: schema.atividades.id }).from(schema.atividades).where(eq(schema.atividades.tarefaVobiId, idVobi)))[0];
  if (ja) return { ok: true, id: ja.id }; // já programada: abre a existente, sem duplicar
  const t = (await db.select().from(schema.vobiTarefas).where(eq(schema.vobiTarefas.idVobi, idVobi)))[0];
  if (!t) return { ok: false, mensagem: "Tarefa não encontrada no espelho do Vobi." };
  if (!t.idRefurbish) return { ok: false, mensagem: "Tarefa sem projeto: fora do escopo do A360." };
  const { vobiParaUsuario } = await mapaResponsaveis();
  const resp = t.idResponsavel != null ? vobiParaUsuario.get(t.idResponsavel) : undefined;
  if (!resp) return { ok: false, mensagem: t.idResponsavel == null ? "A tarefa está sem responsável no Vobi." : `O responsável nº ${t.idResponsavel} ainda não está mapeado em Pessoas.` };
  if (!t.fim) return { ok: false, mensagem: "A tarefa não tem data de término no Vobi: programe pelo formulário.", formulario: true };
  const meiaNoite = (d: Date | null) => !d || new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(d) === "00:00";
  const baseVobi = { ...camposDaTarefa(t), atualizadoVobiEm: t.atualizadoVobiEm?.toISOString() ?? null };
  const [a] = await db.insert(schema.atividades).values({
    vinculo: "tarefa_existente", tipo: "tarefa", titulo: t.nome, descricao: null, responsavelId: resp, inicio: t.inicio, fim: t.fim,
    diaInteiro: meiaNoite(t.inicio) && meiaNoite(t.fim), estimadaHoras: t.estimadaHoras != null ? Math.round(t.estimadaHoras) : null,
    prioridade: t.prioridade ?? 2, status: t.status ?? 1, projetoCodigo: t.idRefurbish, etapaVobiId: t.idEtapa, tarefaVobiId: t.idVobi,
    baseVobi, pendentes: {}, conflitos: {}, estadoVobi: "sincronizada", criadoPorId: u.id, atualizadoPorId: u.id,
  }).returning({ id: schema.atividades.id });
  await hist(a.id, u.id, `Programada no A360 a partir da tarefa nº ${t.idVobi} do Vobi, com os valores exatos do Vobi (nada a enviar)`, null, baseVobi);
  return { ok: true, id: a.id };
}

export async function pendencias() {
  return db.select().from(schema.atividades).where(inArray(schema.atividades.estadoVobi, ["conflito", "divergencia"])).orderBy(desc(schema.atividades.atualizadoEm));
}
export async function contagemFila() {
  const [r] = (await db.execute(sql`select count(*)::int n from vobi_envio where estado = 'aguardando'`)).rows as { n: number }[];
  return Number(r?.n ?? 0);
}
