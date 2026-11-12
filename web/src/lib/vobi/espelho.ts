// T-219 — Espelho de etapas e tarefas do Vobi (com os números únicos) e reconciliação das atividades vinculadas.
// SOMENTE LEITURA no Vobi. Roda a cada sincronização da API (T-218), independente do aceite da carga.
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CamposVobi } from "@/db/schema";
import { lerTarefa, type LeituraVobi } from "./api";
import { camposDaTarefa, estadoDe, NOME_CAMPO, reconciliar, type Campo } from "./reconciliar";

type R = Record<string, unknown>;
const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const txt = (v: unknown) => (v == null ? "" : String(v)).replace(/\s+/g, " ").trim();
const data = (v: unknown): Date | null => { if (!v) return null; const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? null : d; };

const linhaTarefa = (t: R) => ({
  idVobi: num(t.id)!, idRefurbish: num(t.idRefurbish), idEtapa: num(t.idRefurbishStep), nome: txt(t.name) || "(sem nome)",
  idResponsavel: num(t.idResponsible), status: num(t.status), prioridade: num(t.priority), inicio: data(t.startDate), fim: data(t.endDate),
  duracaoDias: num(t.duration), estimadaHoras: num(t.estimativeDuration), realizadasHoras: num(t.totalPerformedHours), criadoVobiEm: data(t.createdAt),
  atualizadoVobiEm: data(t.updatedAt), vistoEm: new Date(), ausenteDesde: null,
});

// campos acompanhados no histórico a cada leitura (T-219: datas, horários, responsável, etapa, status)
const CAMPOS_HIST = ["nome", "idEtapa", "idResponsavel", "inicio", "fim", "status", "prioridade"] as const;
const valorHist = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));

async function gravarTarefas(linhas: ReturnType<typeof linhaTarefa>[]) {
  for (let i = 0; i < linhas.length; i += 500) {
    const lote = linhas.slice(i, i + 500);
    // histórico: compara com o que o espelho já tinha (a primeira leitura de uma tarefa não gera histórico)
    const antes = new Map((await db.select().from(schema.vobiTarefas).where(inArray(schema.vobiTarefas.idVobi, lote.map((l) => l.idVobi)))).map((t) => [t.idVobi, t]));
    const hist: (typeof schema.vobiTarefaHistorico.$inferInsert)[] = [];
    for (const l of lote) {
      const a = antes.get(l.idVobi);
      if (!a) continue;
      for (const c of CAMPOS_HIST) { const x = valorHist(a[c]), y = valorHist(l[c]); if (x !== y) hist.push({ idVobi: l.idVobi, campo: c, antes: x, depois: y }); }
    }
    if (hist.length) await db.insert(schema.vobiTarefaHistorico).values(hist);
    await db.insert(schema.vobiTarefas).values(lote).onConflictDoUpdate({
      target: schema.vobiTarefas.idVobi,
      set: {
        idRefurbish: sql`excluded.id_refurbish`, idEtapa: sql`excluded.id_etapa`, nome: sql`excluded.nome`, idResponsavel: sql`excluded.id_responsavel`,
        status: sql`excluded.status`, prioridade: sql`excluded.prioridade`, inicio: sql`excluded.inicio`, fim: sql`excluded.fim`,
        duracaoDias: sql`excluded.duracao_dias`, estimadaHoras: sql`excluded.estimada_horas`, realizadasHoras: sql`excluded.realizadas_horas`, criadoVobiEm: sql`excluded.criado_vobi_em`,
        atualizadoVobiEm: sql`excluded.atualizado_vobi_em`, vistoEm: sql`excluded.visto_em`, ausenteDesde: sql`null`,
      },
    });
  }
}

/** Mapa usuário do A360 ↔ número do responsável no Vobi (e-mail → nome no Vobi em Pessoas → número). */
export async function mapaResponsaveis() {
  const r = (await db.execute(sql`select u.id usuario_id, vr.id_vobi from usuario u
      join pessoa_vobi pv on lower(pv.email_rucelle) = lower(u.email)
      join vobi_responsavel vr on vr.nome = pv.nome_vobi`)).rows as { usuario_id: number; id_vobi: number }[];
  const usuarioParaVobi = new Map<number, number>(), vobiParaUsuario = new Map<number, number>();
  for (const x of r) { usuarioParaVobi.set(Number(x.usuario_id), Number(x.id_vobi)); vobiParaUsuario.set(Number(x.id_vobi), Number(x.usuario_id)); }
  return { usuarioParaVobi, vobiParaUsuario };
}

/** Atualiza o espelho com a leitura completa da API e reconcilia as atividades vinculadas. */
export async function atualizarEspelho(v: LeituraVobi): Promise<{ etapas: number; tarefas: number; reconciliadas: number; conflitos: number }> {
  // etapas (projetos da listagem lidos projeto a projeto)
  const etapas = v.etapas.filter((e) => num(e.id) != null && num(e.idRefurbish) != null).map((e) => ({
    idVobi: num(e.id)!, idRefurbish: num(e.idRefurbish)!, nome: txt(e.name) || "(sem nome)", ordem: num(e.order), inicio: data(e.startDate), fim: data(e.endDate), vistoEm: new Date(),
  }));
  for (let i = 0; i < etapas.length; i += 500) {
    await db.insert(schema.vobiEtapas).values(etapas.slice(i, i + 500)).onConflictDoUpdate({
      target: schema.vobiEtapas.idVobi,
      set: { idRefurbish: sql`excluded.id_refurbish`, nome: sql`excluded.nome`, ordem: sql`excluded.ordem`, inicio: sql`excluded.inicio`, fim: sql`excluded.fim`, vistoEm: sql`excluded.visto_em` },
    });
  }
  // tarefas do escopo: projetos que já estão no A360 (decisão de 12/11: as 2.259, qualquer status, com ou sem data;
  // fora: projetos antigos fora do recorte e tarefas sem projeto)
  const escopo = await projetosDoA360();
  const vistas = v.tarefas.filter((t) => num(t.id) != null && escopo.has(num(t.idRefurbish) ?? -1)).map(linhaTarefa);
  await gravarTarefas(vistas);
  const idsVistos = new Set(vistas.map((t) => t.idVobi));

  // tarefas vinculadas que não vieram nesta leitura: confere uma a uma antes de concluir qualquer coisa
  const vinculadas = await db.select({ id: schema.atividades.tarefaVobiId }).from(schema.atividades).where(isNotNull(schema.atividades.tarefaVobiId));
  for (const { id } of vinculadas) {
    if (id == null || idsVistos.has(id)) continue;
    try {
      const t = await lerTarefa(id);
      if (t) await gravarTarefas([linhaTarefa(t)]);
      else await db.update(schema.vobiTarefas).set({ ausenteDesde: new Date() }).where(and(eq(schema.vobiTarefas.idVobi, id), isNull(schema.vobiTarefas.ausenteDesde)));
    } catch { /* sem resposta: não conclui nada sobre a tarefa */ }
  }
  await vincularTarefasDaCarga();
  const r = await reconciliarAtividades();
  return { etapas: etapas.length, tarefas: vistas.length, ...r };
}

export async function projetosDoA360(): Promise<Set<number>> {
  return new Set(((await db.execute(sql`select codigo from projeto`)).rows as { codigo: number }[]).map((p) => Number(p.codigo)));
}

/**
 * Liga cada tarefa da carga (CSV/API, sem número) à tarefa do Vobi pelo projeto + etapa + nome — SÓ quando a correspondência
 * é única dos dois lados. Nunca troca um número já gravado (valor diferente = divergência, contada no relatório).
 */
export async function vincularTarefasDaCarga(): Promise<{ confirmadas: number; novas: number; ambiguas: number; divergentes: number }> {
  const r = (await db.execute(sql`
    with v as (
      select t.id_vobi, t.id_refurbish || '|' || coalesce(e.nome, '') || '|' || t.nome k from vobi_tarefa t left join vobi_etapa e on e.id_vobi = t.id_etapa
    ) select id_vobi, k from v`)).rows as { id_vobi: number; k: string }[];
  const { chaveTexto, etapaCanonica } = await import("@/lib/importador/normalizacao");
  const chaveDe = (projeto: string, etapa: string, nome: string) => `${projeto}|${chaveTexto(etapaCanonica(etapa).etapa)}|${chaveTexto(nome)}`;
  const vobi = new Map<string, number[]>();
  for (const x of r) { const [p, e, ...n] = x.k.split("|"); const k = chaveDe(p, e, n.join("|")); vobi.set(k, [...(vobi.get(k) ?? []), Number(x.id_vobi)]); }
  const carga = new Map<string, { chave: string; idVobi: number | null }[]>();
  for (const t of (await db.execute(sql`select chave, id_vobi from tarefa where projeto_codigo is not null`)).rows as { chave: string; id_vobi: number | null }[]) {
    const k = t.chave.split("|").slice(0, 3).join("|"); carga.set(k, [...(carga.get(k) ?? []), { chave: t.chave, idVobi: t.id_vobi == null ? null : Number(t.id_vobi) }]);
  }
  let confirmadas = 0, novas = 0, ambiguas = 0, divergentes = 0;
  for (const [k, cs] of carga) {
    const vs = vobi.get(k) ?? [];
    if (vs.length === 1 && cs.length === 1) {
      const c = cs[0];
      if (c.idVobi == null) { await db.execute(sql`update tarefa set id_vobi = ${vs[0]} where chave = ${c.chave} and id_vobi is null`); novas++; confirmadas++; }
      else if (c.idVobi === vs[0]) confirmadas++;
      else divergentes++;
    } else if (vs.length > 1 || cs.length > 1) ambiguas++;
  }
  return { confirmadas, novas, ambiguas, divergentes };
}

let cargaEmAndamento = false;
export let ultimaCargaInicial: { inicio: string; fim?: string; erro?: string; resultado?: unknown } | null = null;

/**
 * Carga inicial da Programação do Vobi (T-219, 12/11/2026) — SÓ LEITURA no Vobi, separada da importação: não cria carga,
 * não mexe em prévia nem em atividades. Lê tarefas e etapas e grava apenas no espelho + histórico + vínculo da carga.
 */
export async function cargaInicialProgramacao() {
  if (cargaEmAndamento) return { ok: false, mensagem: "Já em andamento." };
  cargaEmAndamento = true;
  ultimaCargaInicial = { inicio: new Date().toISOString() };
  try {
    const { listarTudo } = await import("./api");
    const tarefas = await listarTudo<R>("/v2/task", {}, undefined, 500);
    const escopo = await projetosDoA360();
    const doEscopo = tarefas.filter((t) => escopo.has(num(t.idRefurbish) ?? -1));
    const projs = [...new Set(doEscopo.map((t) => num(t.idRefurbish)!))];
    const etapas: R[] = [];
    for (const id of projs) {
      const rows = await listarTudo<R>("/v2/refurbish-step", { "where[idRefurbish]": String(id) }, undefined, 100);
      for (const e of rows) etapas.push({ id: e.id, idRefurbish: e.idRefurbish, name: e.name, order: e.order, startDate: e.startDate, endDate: e.endDate });
      await new Promise((res) => setTimeout(res, 300));
    }
    const r = await atualizarEspelho({ projetos: [], ausentes: [], listagem: [], tarefas: doEscopo, etapas, etapasProjeto: [], clientes: [] } as unknown as LeituraVobi);
    const v = await vincularTarefasDaCarga();
    ultimaCargaInicial = { ...ultimaCargaInicial, fim: new Date().toISOString(), resultado: { lidas: tarefas.length, doEscopo: doEscopo.length, projetos: projs.length, etapasLidas: etapas.length, espelho: r, vinculo: v } };
    return { ok: true };
  } catch (e) {
    ultimaCargaInicial = { ...ultimaCargaInicial, fim: new Date().toISOString(), erro: (e as Error).message };
    return { ok: false, mensagem: (e as Error).message };
  } finally { cargaEmAndamento = false; }
}

/** Compara cada atividade vinculada com o espelho: adota o que mudou só no Vobi, registra conflitos, marca divergências. */
export async function reconciliarAtividades(): Promise<{ reconciliadas: number; conflitos: number }> {
  const ativs = await db.select().from(schema.atividades).where(isNotNull(schema.atividades.tarefaVobiId));
  if (!ativs.length) return { reconciliadas: 0, conflitos: 0 };
  const espelho = new Map((await db.select().from(schema.vobiTarefas).where(inArray(schema.vobiTarefas.idVobi, ativs.map((a) => a.tarefaVobiId!)))).map((t) => [t.idVobi, t]));
  const { vobiParaUsuario } = await mapaResponsaveis();
  let n = 0, nConf = 0;
  for (const a of ativs) {
    const t = espelho.get(a.tarefaVobiId!);
    if (!t || t.ausenteDesde) {
      if (a.estadoVobi !== "divergencia") {
        await db.update(schema.atividades).set({ estadoVobi: "divergencia", atualizadoEm: new Date() }).where(eq(schema.atividades.id, a.id));
        await db.insert(schema.atividadeHistorico).values({ atividadeId: a.id, origem: "vobi", resumo: `A tarefa nº ${a.tarefaVobiId} não foi encontrada no Vobi (conferida pelo número). A atividade foi mantida e aparece em Divergências.` });
      }
      continue;
    }
    // atualizadoVobiEm igual ao da base = nada mudou no Vobi
    if (a.baseVobi?.atualizadoVobiEm && t.atualizadoVobiEm && Date.parse(a.baseVobi.atualizadoVobiEm) === t.atualizadoVobiEm.getTime() && a.estadoVobi !== "divergencia") continue;
    const rec = reconciliar(a.baseVobi, a.pendentes ?? {}, camposDaTarefa(t));
    const muda: Partial<typeof schema.atividades.$inferInsert> = {};
    const notas: string[] = [];
    const ad = rec.adotar;
    if ("nome" in ad && ad.nome) muda.titulo = ad.nome;
    if ("idEtapa" in ad) muda.etapaVobiId = ad.idEtapa ?? null;
    if ("idResponsavel" in ad) {
      const u = ad.idResponsavel != null ? vobiParaUsuario.get(ad.idResponsavel) : undefined;
      if (u) muda.responsavelId = u; else notas.push(`responsável nº ${ad.idResponsavel ?? "—"} no Vobi sem acesso correspondente no A360 (indicar em Pessoas)`);
    }
    if ("inicio" in ad) { if (ad.inicio) muda.inicio = new Date(ad.inicio); else notas.push("o Vobi está sem data de início; mantida a do A360"); }
    if ("fim" in ad) { if (ad.fim) muda.fim = new Date(ad.fim); else notas.push("o Vobi está sem data de término; mantida a do A360"); }
    if ("prioridade" in ad && ad.prioridade) muda.prioridade = ad.prioridade;
    if ("status" in ad && ad.status) muda.status = ad.status;
    const conflitos = { ...(a.conflitos ?? {}), ...rec.conflitos };
    const novaBase = { ...rec.novaBase, atualizadoVobiEm: t.atualizadoVobiEm?.toISOString() ?? null };
    const estado = estadoDe({ vinculo: a.vinculo, tarefaVobiId: a.tarefaVobiId, pendentes: rec.pendentes, conflitos });
    await db.update(schema.atividades).set({ ...muda, baseVobi: novaBase, pendentes: rec.pendentes, conflitos, estadoVobi: estado, atualizadoEm: new Date() }).where(eq(schema.atividades.id, a.id));
    const camposAdotados = Object.keys(ad) as Campo[];
    if (camposAdotados.length || notas.length) {
      await db.insert(schema.atividadeHistorico).values({
        atividadeId: a.id, origem: "vobi",
        resumo: `Alterado no Vobi e adotado no A360: ${camposAdotados.map((c) => NOME_CAMPO[c]).join(", ") || "—"}${notas.length ? ` (${notas.join("; ")})` : ""}`,
        antes: a.baseVobi ?? null, depois: rec.novaBase,
      });
    }
    const novos = Object.keys(rec.conflitos);
    if (novos.length) {
      nConf++;
      await db.insert(schema.atividadeHistorico).values({ atividadeId: a.id, origem: "sistema", resumo: `Conflito: ${novos.map((c) => NOME_CAMPO[c as Campo]).join(", ")} mudou no A360 e no Vobi. Aguardando decisão da gestão.`, depois: rec.conflitos });
    }
    // fila: o que continua pendente substitui o pedido de atualização aguardando
    await atualizarFila(a.id, rec.pendentes);
    n++;
  }
  return { reconciliadas: n, conflitos: nConf };
}

/** Mantém UM pedido "aguardando" por atividade com os campos ainda pendentes (Fase 0: nada é enviado). */
export async function atualizarFila(atividadeId: number, pendentes: CamposVobi, operacao: "criar" | "atualizar" | "cancelar" = "atualizar", usuarioId?: number) {
  const aguardando = await db.select().from(schema.vobiEnvios).where(and(eq(schema.vobiEnvios.atividadeId, atividadeId), eq(schema.vobiEnvios.estado, "aguardando")));
  const vazio = !Object.keys(pendentes).length;
  const criar = aguardando.find((e) => e.operacao === "criar");
  if (criar) { // tarefa ainda não existe no Vobi: o pedido de criação leva tudo
    await db.update(schema.vobiEnvios).set({ campos: pendentes }).where(eq(schema.vobiEnvios.id, criar.id));
    return;
  }
  for (const e of aguardando) await db.update(schema.vobiEnvios).set({ estado: "descartado", resposta: "substituído por versão mais nova", processadoEm: new Date() }).where(eq(schema.vobiEnvios.id, e.id));
  if (!vazio || operacao === "criar") await db.insert(schema.vobiEnvios).values({ atividadeId, operacao: pendentes.status === 5 && operacao !== "criar" ? "cancelar" : operacao, campos: pendentes, criadoPorId: usuarioId ?? null });
}
