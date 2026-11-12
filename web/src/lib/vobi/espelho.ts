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
  duracaoDias: num(t.duration), atualizadoVobiEm: data(t.updatedAt), vistoEm: new Date(), ausenteDesde: null,
});

async function gravarTarefas(linhas: ReturnType<typeof linhaTarefa>[]) {
  for (let i = 0; i < linhas.length; i += 500) {
    const lote = linhas.slice(i, i + 500);
    await db.insert(schema.vobiTarefas).values(lote).onConflictDoUpdate({
      target: schema.vobiTarefas.idVobi,
      set: {
        idRefurbish: sql`excluded.id_refurbish`, idEtapa: sql`excluded.id_etapa`, nome: sql`excluded.nome`, idResponsavel: sql`excluded.id_responsavel`,
        status: sql`excluded.status`, prioridade: sql`excluded.prioridade`, inicio: sql`excluded.inicio`, fim: sql`excluded.fim`,
        duracaoDias: sql`excluded.duracao_dias`, atualizadoVobiEm: sql`excluded.atualizado_vobi_em`, vistoEm: sql`excluded.visto_em`, ausenteDesde: sql`null`,
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
  // tarefas do escopo (projetos da listagem) — as mesmas que entram na carga
  const escopo = new Set((v.listagem ?? []).map(Number));
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
  const r = await reconciliarAtividades();
  return { etapas: etapas.length, tarefas: vistas.length, ...r };
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
