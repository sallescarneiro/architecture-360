// Linha do tempo única por projeto (T-188 evolução, item 3). Visão calculada (não armazenada), que referencia os registros
// originais sem duplicá-los. Fontes A360: reuniões, transcrições, atas, decisões/aprovações/encaminhamentos, alertas e seu
// tratamento, flags. Fontes Vobi (exportação CSV): criação do projeto, tarefas com prazo/status, revisões, mudanças entre
// cargas (histórico). Cada acontecimento diz a origem e leva um link para o registro original.
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { linkVobiProjeto } from "@/lib/consultas";

export type Origem = "a360" | "vobi";
export type Acontecimento = {
  id: string;                       // ref estável (ex.: a360:reuniao:3, vobi:tarefa:<chave>)
  quando: Date;
  precisao: "exata" | "dia" | "carga"; // carga = data da exportação em que a mudança apareceu
  origem: Origem;
  tipo: string;                     // reuniao | transcricao | ata | decisao | aprovacao | encaminhamento | alerta | tratamento | flag | projeto | tarefa | revisao | mudanca
  titulo: string;
  resumo: string | null;
  participantes?: string[];
  link: string | null;              // registro original no A360 ou no Vobi
  relacionados?: string[];          // refs de outros acontecimentos
  destaque?: "critico" | "alto" | "moderado" | "informativo" | null;
};

export const TIPOS_LINHA: Record<string, string> = { entregavel: "entregável", reuniao: "reunião", transcricao: "transcrição", ata: "ata", decisao: "decisão", aprovacao: "aprovação", encaminhamento: "encaminhamento", alerta: "alerta", tratamento: "tratamento", flag: "flag de limitação", projeto: "projeto (Vobi)", tarefa: "tarefa (Vobi)", revisao: "revisão (Vobi)", mudanca: "mudança (Vobi)" };

const dia = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? new Date(iso.slice(0, 10) + "T12:00:00-03:00") : null);

export async function linhaDoTempo(codigo: number): Promise<Acontecimento[]> {
  const out: Acontecimento[] = [];
  const p = (await db.select().from(schema.projetos).where(eq(schema.projetos.codigo, codigo)).limit(1))[0];
  if (!p) return out;
  // --- Vobi ---
  const d0 = dia(p.criadoEm);
  if (d0) out.push({ id: `vobi:projeto:${codigo}`, quando: d0, precisao: "dia", origem: "vobi", tipo: "projeto", titulo: "Projeto criado no Vobi", resumo: `${p.nome} · status atual: ${p.status}`, link: linkVobiProjeto(codigo) });
  const tarefas = await db.select().from(schema.tarefas).where(and(eq(schema.tarefas.projetoCodigo, codigo), eq(schema.tarefas.orfa, false)));
  for (const t of tarefas) {
    const q = dia(t.dataFim) ?? dia(t.dataInicio);
    if (!q) continue;
    const concluida = /conclu/i.test(t.status ?? "");
    out.push({ id: `vobi:tarefa:${t.chave}`, quando: q, precisao: "dia", origem: "vobi", tipo: t.revisao && t.revisao >= 1 ? "revisao" : "tarefa", titulo: `${t.etapaCanonica ?? t.etapaCsv ?? "Tarefa"}: ${t.nome}${t.revisao ? ` (R${String(t.revisao).padStart(2, "0")})` : ""}`, resumo: `${concluida ? "concluída" : `status: ${t.status ?? "—"}`}${t.dataFim ? ` · prazo ${t.dataFim.split("-").reverse().join("/")}` : " · sem prazo"}${t.responsavelNome ? ` · ${t.responsavelNome}` : ""}`, participantes: t.responsavelNome ? [t.responsavelNome] : [], link: linkVobiProjeto(codigo) });
  }
  const chaves = tarefas.map((t) => t.chave);
  const hist = await db.select({ h: schema.historicoAlteracoes, data: schema.cargas.dataCarga }).from(schema.historicoAlteracoes).innerJoin(schema.cargas, eq(schema.cargas.id, schema.historicoAlteracoes.cargaId))
    .where(or(and(eq(schema.historicoAlteracoes.entidade, "projeto"), eq(schema.historicoAlteracoes.chave, String(codigo))), chaves.length ? and(eq(schema.historicoAlteracoes.entidade, "tarefa"), inArray(schema.historicoAlteracoes.chave, chaves)) : sql`false`)).orderBy(asc(schema.historicoAlteracoes.id));
  for (const { h, data } of hist) {
    const q = dia(data); if (!q) continue;
    const nomeTarefa = h.entidade === "tarefa" ? tarefas.find((t) => t.chave === h.chave)?.nome : null;
    out.push({ id: `vobi:mudanca:${h.id}`, quando: q, precisao: "carga", origem: "vobi", tipo: "mudanca", titulo: `${h.entidade === "projeto" ? "Projeto" : `Tarefa “${nomeTarefa ?? h.chave}”`}: ${h.campo} alterado`, resumo: `${h.valorAnterior ?? "—"} → ${h.valorNovo ?? "—"} (visto na exportação de ${data.split("-").reverse().join("/")})`, link: linkVobiProjeto(codigo) });
  }
  // --- A360: reuniões ---
  const reunioes = await db.select().from(schema.reunioes).where(eq(schema.reunioes.projetoCodigo, codigo));
  const ids = reunioes.map((r) => r.id);
  for (const r of reunioes) {
    out.push({ id: `a360:reuniao:${r.id}`, quando: r.inicio, precisao: "exata", origem: "a360", tipo: "reuniao", titulo: r.titulo, resumo: `${r.status}${r.local ? ` · ${r.local}` : ""}${r.pauta ? ` · pauta: ${r.pauta.slice(0, 120)}` : ""}`, participantes: r.participantes.map((x) => x.nome), link: `/reunioes/${r.id}` });
  }
  if (ids.length) {
    const itens = await db.select().from(schema.itensReuniao).where(and(inArray(schema.itensReuniao.reuniaoId, ids), eq(schema.itensReuniao.confirmado, true)));
    for (const i of itens) {
      if (i.situacao === "cancelado") continue;
      const r = reunioes.find((x) => x.id === i.reuniaoId)!;
      out.push({ id: `a360:item:${i.id}`, quando: i.criadoEm, precisao: "exata", origem: "a360", tipo: i.tipo, titulo: i.texto, resumo: `${i.tipo === "encaminhamento" ? `${i.situacao}${i.responsavel ? ` · ${i.responsavel}` : ""}${i.prazo ? ` · prazo ${i.prazo.split("-").reverse().join("/")}` : ""}` : "registrada"} · reunião “${r.titulo}”${i.origem !== "manual" ? ` · extraída da transcrição [${i.confianca}]` : ""}`, link: `/reunioes/${r.id}#${i.tipo}`, relacionados: [`a360:reuniao:${r.id}`] });
    }
    const transcricoes = await db.select({ id: schema.transcricoes.id, reuniaoId: schema.transcricoes.reuniaoId, versao: schema.transcricoes.versao, enviadoEm: schema.transcricoes.enviadoEm, formato: schema.transcricoes.formato }).from(schema.transcricoes).where(inArray(schema.transcricoes.reuniaoId, ids));
    for (const t of transcricoes) out.push({ id: `a360:transcricao:${t.id}`, quando: t.enviadoEm, precisao: "exata", origem: "a360", tipo: "transcricao", titulo: `Transcrição enviada (v${t.versao}, ${t.formato})`, resumo: `reunião “${reunioes.find((r) => r.id === t.reuniaoId)?.titulo}”`, link: `/reunioes/${t.reuniaoId}#transcricao`, relacionados: [`a360:reuniao:${t.reuniaoId}`] });
    const hr = await db.select().from(schema.historicoReuniao).where(and(inArray(schema.historicoReuniao.reuniaoId, ids), inArray(schema.historicoReuniao.acao, ["ata", "ata_ia", "status", "editada"])));
    for (const h of hr) out.push({ id: `a360:reuniao_hist:${h.id}`, quando: h.quando, precisao: "exata", origem: "a360", tipo: h.acao === "status" || h.acao === "editada" ? "reuniao" : "ata", titulo: h.resumo, resumo: `reunião “${reunioes.find((r) => r.id === h.reuniaoId)?.titulo}”`, link: `/reunioes/${h.reuniaoId}`, relacionados: [`a360:reuniao:${h.reuniaoId}`] });
  }
  // --- A360: alertas e tratamento ---
  const alertas = await db.select().from(schema.alertasProjeto).where(eq(schema.alertasProjeto.projetoCodigo, codigo));
  for (const a of alertas) out.push({ id: `a360:alerta:${a.id}`, quando: a.criadoEm, precisao: "exata", origem: "a360", tipo: "alerta", titulo: `Alerta: ${a.titulo}`, resumo: `${a.classificacao.replace(/_/g, " ")} · prioridade ${a.prioridade} · ${a.situacao.replace(/_/g, " ")}`, link: `/alertas/${a.id}`, destaque: a.prioridade as Acontecimento["destaque"], relacionados: a.evidencias.map((e) => e.ref) });
  if (alertas.length) {
    const ha = await db.select({ h: schema.historicoAlerta, quem: schema.usuarios.nome }).from(schema.historicoAlerta).leftJoin(schema.usuarios, eq(schema.usuarios.id, schema.historicoAlerta.usuarioId)).where(and(inArray(schema.historicoAlerta.alertaId, alertas.map((a) => a.id)), sql`${schema.historicoAlerta.acao} <> 'criado'`));
    for (const { h, quem } of ha) out.push({ id: `a360:alerta_hist:${h.id}`, quando: h.quando, precisao: "exata", origem: "a360", tipo: "tratamento", titulo: `${rotuloAcaoAlerta(h.acao)} — ${alertas.find((a) => a.id === h.alertaId)?.titulo}`, resumo: `${quem ?? "IA"}${h.justificativa ? `: ${h.justificativa.slice(0, 160)}` : ""}`, link: `/alertas/${h.alertaId}`, relacionados: [`a360:alerta:${h.alertaId}`] });
  }
  const flags = await db.select().from(schema.flagsLimitacao).where(eq(schema.flagsLimitacao.projetoCodigo, codigo));
  for (const f of flags) out.push({ id: `a360:flag:${f.id}`, quando: f.identificadoEm, precisao: "exata", origem: "a360", tipo: "flag", titulo: `Flag: ${f.comparacao}`, resumo: `${f.dadoAusente} · ${f.situacao}`, link: `/projetos/${codigo}/linha-do-tempo#flags` });
  // --- A360: entregáveis (Fase 6) — criação, versões e aprovações, pelo histórico imutável ---
  const ents = await db.select().from(schema.entregaveis).where(eq(schema.entregaveis.projetoCodigo, codigo));
  if (ents.length) {
    const ids = ents.map((e) => e.id);
    const he = await db.select({ h: schema.historicoEntregavel, quem: schema.usuarios.nome }).from(schema.historicoEntregavel).innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.historicoEntregavel.usuarioId)).where(inArray(schema.historicoEntregavel.entregavelId, ids));
    for (const { h, quem } of he) {
      if (!["criado", "versao", "aprovacao_interna", "aprovacao_cliente", "cancelado", "status"].includes(h.acao)) continue;
      const e = ents.find((x) => x.id === h.entregavelId)!;
      out.push({ id: `a360:entregavel_hist:${h.id}`, quando: h.quando, precisao: "exata", origem: "a360", tipo: h.acao === "aprovacao_cliente" ? "aprovacao" : "entregavel", titulo: `${e.titulo}: ${h.resumo}`, resumo: `entregável (${e.tipo}) · ${quem}`, link: `/entregaveis/${e.id}`, destaque: h.acao === "aprovacao_cliente" ? "alto" : undefined });
    }
  }
  out.sort((a, b) => b.quando.getTime() - a.quando.getTime());
  return out;
}

export const rotuloAcaoAlerta = (a: string) => ({ confirmado: "Divergência confirmada", descartado: "Identificação descartada", esclarecimento: "Esclarecimento solicitado", alteracao_aprovada: "Alteração aprovada registrada", correcao_rota: "Correção de rota determinada", responsavel: "Responsável definido", prazo: "Prazo definido", providencia: "Providência registrada", encerrado: "Alerta encerrado", reaberto: "Alerta reaberto", reclassificado: "Reclassificado", em_analise: "Em análise" } as Record<string, string>)[a] ?? a;

export type FiltroLinha = { origem: Origem | ""; tipo: string; q: string };
export function filtrar(l: Acontecimento[], f: FiltroLinha): Acontecimento[] {
  const q = f.q.toLowerCase();
  return l.filter((a) => (!f.origem || a.origem === f.origem) && (!f.tipo || a.tipo === f.tipo) && (!q || `${a.titulo} ${a.resumo ?? ""} ${(a.participantes ?? []).join(" ")}`.toLowerCase().includes(q)));
}

