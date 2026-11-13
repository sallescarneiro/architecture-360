// Etapa A da Agenda de Produção (design V2 aprovado por Rodrigo em 13/11/2026).
// Quadro da equipe (pessoas × dias úteis), blocos de produção, validação das propostas das arquitetas autônomas,
// indisponibilidades, feriados e configuração por pessoa. Nada aqui escreve no Vobi: blocos criados no quadro são
// atividades independentes (vinculo "independente"); atividades já ligadas ao Vobi continuam no fluxo da T-219.
import { and, asc, eq, gte, inArray, lte, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Usuario } from "@/lib/auth";
import { podeGerirAgenda } from "./atividades";
import { SQL_ELEGIVEIS } from "@/lib/vobi/escopo";
import { dataCurta, diaDe, diaSemanaCurto, hojeLocal, horaInput, somaDias } from "./datas";

export type Atividade = typeof schema.atividades.$inferSelect;
export type ConfigPessoa = typeof schema.agendaPessoas.$inferSelect;
type R<T = object> = ({ ok: true } & T) | { ok: false; mensagem: string };

const OFFSET = "-03:00";
const em = (dia: string, h: string) => new Date(`${dia}T${h}:00${OFFSET}`);

// ---------------------------------------------------------------------------------------------- vocabulário
export const ETAPAS: { k: string; n: string; bg: string; fg: string }[] = [
  { k: "LEV", n: "Levantamento", bg: "#e6edf6", fg: "#24456b" },
  { k: "PN", n: "Programa de necessidades", bg: "#ede5f5", fg: "#56367a" },
  { k: "LAY", n: "Layout e conceito", bg: "#e1f0e7", fg: "#1f5a3b" },
  { k: "3D", n: "Imagens 3D", bg: "#fbe7dc", fg: "#86370f" },
  { k: "REF", n: "Refação", bg: "#fcefcf", fg: "#6e4a00" },
  { k: "INT", n: "Interiores", bg: "#e1eff2", fg: "#1c5461" },
  { k: "EXE", n: "Executivo", bg: "#f4dfe3", fg: "#6b1a24" },
  { k: "LEG", n: "Projeto legal", bg: "#eae8e2", fg: "#46433c" },
  { k: "CF", n: "Caderno de franquia", bg: "#f5e3ee", fg: "#742a57" },
];
export const etapa = (k: string | null | undefined) => ETAPAS.find((e) => e.k === k) ?? null;
export const PERIODOS: Record<string, string> = { dia: "Dia inteiro", manha: "Manhã", tarde: "Tarde", hora: "Horário específico" };
const HORARIO_PERIODO: Record<string, [string, string]> = { dia: ["08:00", "18:00"], manha: ["08:00", "12:00"], tarde: ["13:30", "18:00"] };
export const VALIDACAO: Record<string, { rotulo: string; tom: "ok" | "warn" | "bad" | "info" | "neutral" }> = {
  confirmada: { rotulo: "Confirmada", tom: "neutral" }, rascunho: { rotulo: "Rascunho", tom: "neutral" },
  aguardando: { rotulo: "Aguardando validação", tom: "warn" }, aprovada: { rotulo: "Aprovada", tom: "ok" }, devolvida: { rotulo: "Devolvida", tom: "bad" },
};
export const MODELOS: Record<string, { rotulo: string; descricao: string }> = {
  indefinido: { rotulo: "A definir", descricao: "Padrão de toda pessoa. Funciona como programação estruturada até a gestão definir." },
  estruturada: { rotulo: "Programação estruturada", descricao: "A gestão e a coordenação programam a semana. Ela vê e atualiza o andamento; não inclui nem move atividades." },
  autonoma: { rotulo: "Programação autônoma", descricao: "Ela propõe as próprias atividades; cada uma passa pela validação (Ana Paula ou Thaís) antes de entrar na programação confirmada." },
};
export const TIPOS_INDISP: Record<string, { rotulo: string; privado?: boolean }> = {
  ferias: { rotulo: "Férias" }, atestado: { rotulo: "Atestado", privado: true }, pessoal: { rotulo: "Ausência pessoal" }, folga: { rotulo: "Folga" },
  parcial: { rotulo: "Ausência parcial" }, equipamento: { rotulo: "Problema de equipamento" }, outro: { rotulo: "Outro impedimento" },
};
export const ABRANGENCIA: Record<string, string> = { nacional: "Nacional", estadual: "Estadual", municipal: "Municipal", recesso: "Recesso da empresa" };
export const MOTIVOS_REPROG = ["Cliente pediu outra data", "Aguardando informação do cliente", "Mudança de prioridade", "Ausência da arquiteta", "Retrabalho ou refação", "Outro"];

// ---------------------------------------------------------------------------------------------- permissões
export const gestor = (u: Usuario) => podeGerirAgenda(u.perfil); // admin, gestão, coordenação
export const administraConfig = (u: Usuario) => u.perfil === "admin" || u.perfil === "gestao";

const PADRAO = (usuarioId: number): ConfigPessoa => ({ usuarioId, uf: null, municipio: null, almocoInicio: null, almocoFim: null, modelo: "indefinido", validadora: false, substitutaAte: null, atualizadoPorId: null, atualizadoEm: new Date(0) });

export async function configDe(usuarioId: number): Promise<ConfigPessoa> {
  return (await db.select().from(schema.agendaPessoas).where(eq(schema.agendaPessoas.usuarioId, usuarioId)))[0] ?? PADRAO(usuarioId);
}
export async function configs(): Promise<Map<number, ConfigPessoa>> {
  return new Map((await db.select().from(schema.agendaPessoas)).map((c) => [c.usuarioId, c]));
}
/** Ana Paula e Thaís (validadoras), substituta designada dentro do prazo, e a administração. */
export function validaComConfig(u: Usuario, c: ConfigPessoa | undefined): boolean {
  if (u.perfil === "admin") return true;
  if (!c) return false;
  return c.validadora || (!!c.substitutaAte && c.substitutaAte >= hojeLocal());
}
export async function podeValidar(u: Usuario) { return validaComConfig(u, await configDe(u.id)); }
export const autonoma = (c: ConfigPessoa) => c.modelo === "autonoma";

// ---------------------------------------------------------------------------------------------- leitura
export type Pessoa = { id: number; nome: string; perfil: string; cfg: ConfigPessoa };
/** Arquitetas ativas (linhas do quadro), por nome. */
export async function arquitetas(): Promise<Pessoa[]> {
  const us = await db.select({ id: schema.usuarios.id, nome: schema.usuarios.nome, perfil: schema.usuarios.perfil }).from(schema.usuarios)
    .where(and(eq(schema.usuarios.ativo, true), eq(schema.usuarios.perfil, "arquiteta"))).orderBy(asc(schema.usuarios.nome));
  const cs = await configs();
  return us.map((x) => ({ ...x, cfg: cs.get(x.id) ?? PADRAO(x.id) }));
}
/** Todas as pessoas ativas com a configuração (tela Pessoas da agenda). */
export async function pessoasComConfig(): Promise<Pessoa[]> {
  const us = await db.select({ id: schema.usuarios.id, nome: schema.usuarios.nome, perfil: schema.usuarios.perfil }).from(schema.usuarios)
    .where(eq(schema.usuarios.ativo, true)).orderBy(asc(schema.usuarios.nome));
  const cs = await configs();
  return us.map((x) => ({ ...x, cfg: cs.get(x.id) ?? PADRAO(x.id) })).sort((a, b) => Number(a.perfil !== "arquiteta") - Number(b.perfil !== "arquiteta") || a.nome.localeCompare(b.nome));
}

export const diasUteis = (segunda: string) => [0, 1, 2, 3, 4].map((i) => somaDias(segunda, i));
export const rotuloDia = (dia: string) => `${diaSemanaCurto(dia).replace(/^./, (c) => c.toUpperCase())} ${dataCurta(dia)}`;

export type Feriado = typeof schema.feriados.$inferSelect;
export async function feriadosEntre(de: string, ate: string): Promise<Feriado[]> {
  return db.select().from(schema.feriados).where(and(eq(schema.feriados.ativo, true), gte(schema.feriados.data, de), lte(schema.feriados.data, ate))).orderBy(asc(schema.feriados.data));
}
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/** O feriado vale para a pessoa? Nacional e recesso: todos; estadual: mesma UF; municipal: mesma UF e município. */
export function feriadoVale(f: Feriado, c: ConfigPessoa): boolean {
  if (f.abrangencia === "nacional" || f.abrangencia === "recesso") return true;
  if (!c.uf || norm(c.uf) !== norm(f.uf)) return false;
  return f.abrangencia === "estadual" || norm(c.municipio) === norm(f.municipio);
}

export type Indisp = typeof schema.indisponibilidades.$inferSelect;
export async function indisponibilidadesEntre(de: string, ate: string, situacoes = ["confirmada", "pendente"]): Promise<Indisp[]> {
  return db.select().from(schema.indisponibilidades).where(and(inArray(schema.indisponibilidades.situacao, situacoes), lte(schema.indisponibilidades.inicio, ate), gte(schema.indisponibilidades.fim, de)));
}
/** Rótulo para a visão coletiva: atestado vira "Indisponível" (sem tipo nem observação). */
export function rotuloIndispColetivo(i: Indisp): string {
  const base = TIPOS_INDISP[i.tipo]?.privado ? "Indisponível" : TIPOS_INDISP[i.tipo]?.rotulo ?? "Indisponível";
  const per = i.periodo === "dia" ? "" : i.periodo === "hora" ? ` · a partir das ${i.aPartirDe}` : ` · ${i.periodo === "manha" ? "manhã" : "tarde"}`;
  return i.situacao === "pendente" ? `Pedido de ${base.toLowerCase()} · aguardando confirmação` : base + per;
}

/** Atividades (não canceladas) cujo dia (data de término) cai no período. */
export async function blocosEntre(de: string, ate: string, responsavelIds: number[]): Promise<Atividade[]> {
  if (!responsavelIds.length) return [];
  return db.select().from(schema.atividades).where(and(inArray(schema.atividades.responsavelId, responsavelIds), ne(schema.atividades.status, 5),
    gte(schema.atividades.fim, em(de, "00:00")), lte(schema.atividades.fim, new Date(`${ate}T23:59:59.999${OFFSET}`)))).orderBy(asc(schema.atividades.inicio), asc(schema.atividades.id));
}
export const diaDoBloco = (a: Atividade) => diaDe(a.fim);

/**
 * Peso em dias: dia inteiro 1; manhã/tarde 0,5. Horário específico NÃO vira fração de dia (decisão de 13/11: profissionais PJ,
 * sem jornada contratual) — registra início e fim e é somado à parte, em horas (horasComHorario).
 */
export function peso(a: Pick<Atividade, "periodo" | "inicio" | "fim" | "diaInteiro">): number {
  if (a.periodo === "dia" || (!a.periodo && a.diaInteiro)) return 1;
  if (a.periodo === "manha" || a.periodo === "tarde") return 0.5;
  return 0;
}
/** Horas das atividades com horário específico (início e fim), sem conversão em dias. */
export function horasComHorario(a: Pick<Atividade, "periodo" | "inicio" | "fim" | "diaInteiro">): number {
  if (peso(a) > 0 || !a.inicio) return 0;
  return Math.max(0, (a.fim.getTime() - a.inicio.getTime()) / 3_600_000);
}
export function fmtProgramado(dias: number, horas: number): string {
  return fmtDias(dias) + (horas > 0 ? ` + ${String(Math.round(horas * 10) / 10).replace(".", ",")} h com horário` : "");
}
export const fmtDias = (n: number) => `${String(Math.round(n * 100) / 100).replace(".", ",")} d`;
export function rotuloPeriodo(a: Pick<Atividade, "periodo" | "inicio" | "fim" | "diaInteiro">): string {
  if (a.periodo === "dia" || (!a.periodo && a.diaInteiro)) return "Dia inteiro";
  if (a.periodo === "manha") return "Manhã";
  if (a.periodo === "tarde") return "Tarde";
  return a.inicio ? `${horaInput(a.inicio)}–${horaInput(a.fim)}` : `até ${horaInput(a.fim)}`;
}

/** Disponibilidade de um dia (0, 0,5 ou 1) pela localidade e pelas indisponibilidades CONFIRMADAS. */
export function disponivelNoDia(dia: string, c: ConfigPessoa, feriados: Feriado[], indisp: Indisp[]): number {
  if (feriados.some((f) => f.data === dia && feriadoVale(f, c))) return 0;
  const i = indisp.find((x) => x.usuarioId === c.usuarioId && x.situacao === "confirmada" && x.inicio <= dia && x.fim >= dia);
  if (!i) return 1;
  return i.periodo === "dia" ? 0 : 0.5;
}

// ---------------------------------------------------------------------------------------------- histórico
const histAtv = (atividadeId: number, usuarioId: number | null, resumo: string, antes?: unknown, depois?: unknown) =>
  db.insert(schema.atividadeHistorico).values({ atividadeId, usuarioId, resumo, antes: antes ?? null, depois: depois ?? null, origem: "a360" });
export const histAgenda = (entidade: string, entidadeId: number | null, resumo: string, usuarioId: number | null) =>
  db.insert(schema.agendaHistorico).values({ entidade, entidadeId, resumo, usuarioId });

// ---------------------------------------------------------------------------------------------- blocos de produção
export type DadosBloco = { pessoaId: number; dia: string; projetoCodigo: number; etapa: string; periodo: string; hi: string; hf: string; entrega: boolean; obs: string };

export function lerBloco(fd: FormData): { d: DadosBloco } | { erro: string } {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const pessoaId = Number(s("pessoa")), projetoCodigo = Number(s("projeto"));
  const d: DadosBloco = { pessoaId, dia: s("dia"), projetoCodigo, etapa: s("etapa"), periodo: s("periodo") || "dia", hi: s("hora_inicio"), hf: s("hora_fim"), entrega: s("entrega") === "1", obs: s("obs").slice(0, 500) };
  if (!Number.isInteger(pessoaId) || pessoaId <= 0) return { erro: "Escolha a arquiteta." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dia)) return { erro: "Dia inválido." };
  if (!Number.isInteger(projetoCodigo) || projetoCodigo <= 0) return { erro: "Escolha o projeto." };
  if (!etapa(d.etapa)) return { erro: "Escolha a etapa de produção." };
  if (!PERIODOS[d.periodo]) return { erro: "Período inválido." };
  if (d.periodo === "hora") {
    if (!/^\d{2}:\d{2}$/.test(d.hi) || !/^\d{2}:\d{2}$/.test(d.hf)) return { erro: "Informe o horário de início e de fim." };
    if (d.hf <= d.hi) return { erro: "O horário de fim precisa ser depois do início." };
  }
  return { d };
}
function horarios(d: Pick<DadosBloco, "dia" | "periodo" | "hi" | "hf">): { inicio: Date; fim: Date; diaInteiro: boolean } {
  const [hi, hf] = d.periodo === "hora" ? [d.hi, d.hf] : HORARIO_PERIODO[d.periodo];
  return { inicio: em(d.dia, hi), fim: em(d.dia, hf), diaInteiro: d.periodo === "dia" };
}
async function nomeProjeto(codigo: number): Promise<string | null> {
  return (await db.select({ nome: schema.projetos.nome }).from(schema.projetos).where(eq(schema.projetos.codigo, codigo)))[0]?.nome ?? null;
}
async function nomeUsuario(id: number): Promise<string> {
  return (await db.select({ nome: schema.usuarios.nome }).from(schema.usuarios).where(eq(schema.usuarios.id, id)))[0]?.nome ?? `#${id}`;
}

/** Avisos (não bloqueiam): feriado da localidade, indisponibilidade ou pedido, dia já com 2+ atividades. */
export async function avisosDoDia(pessoaId: number, dia: string, ignorarId?: number): Promise<string[]> {
  const c = await configDe(pessoaId), out: string[] = [];
  const f = (await feriadosEntre(dia, dia)).find((x) => feriadoVale(x, c));
  if (f) out.push(`é feriado na localidade dela (${f.nome})`);
  const i = (await indisponibilidadesEntre(dia, dia)).find((x) => x.usuarioId === pessoaId);
  if (i) out.push(i.situacao === "pendente" ? "há um pedido de ausência dela neste dia aguardando confirmação" : `ela está indisponível ${i.periodo === "dia" ? "neste dia" : "em parte do dia"}`);
  const n = (await blocosEntre(dia, dia, [pessoaId])).filter((a) => a.id !== ignorarId).length;
  if (n >= 2) out.push(`já há ${n} atividades neste dia`);
  return out;
}

/**
 * Inclui um bloco. Gestão/coordenação: para qualquer arquiteta, entra CONFIRMADO (sem fila de validação).
 * Arquiteta: só para si e só se estiver configurada como autônoma; entra como RASCUNHO.
 */
export async function criarBloco(u: Usuario, d: DadosBloco): Promise<R<{ id: number; avisos: string[] }>> {
  const proj = await nomeProjeto(d.projetoCodigo);
  if (!proj) return { ok: false, mensagem: "Projeto não encontrado." };
  let validacao = "confirmada";
  if (!gestor(u)) {
    if (d.pessoaId !== u.id) return { ok: false, mensagem: "Você só pode propor atividades para você mesma." };
    if (!autonoma(await configDe(u.id))) return { ok: false, mensagem: "Sua programação é feita pela coordenação (modelo estruturado)." };
    validacao = "rascunho";
  } else {
    const alvo = (await db.select({ id: schema.usuarios.id }).from(schema.usuarios).where(and(eq(schema.usuarios.id, d.pessoaId), eq(schema.usuarios.ativo, true))))[0];
    if (!alvo) return { ok: false, mensagem: "Pessoa inválida." };
  }
  const e = etapa(d.etapa)!;
  const [a] = await db.insert(schema.atividades).values({
    vinculo: "independente", tipo: "producao", titulo: `${e.n} · ${proj}`, descricao: d.obs || null, responsavelId: d.pessoaId,
    ...horarios(d), prioridade: 2, status: 1, projetoCodigo: d.projetoCodigo, etapaRucelle: d.etapa, periodo: d.periodo, entrega: d.entrega,
    validacao, criadoPorId: u.id, atualizadoPorId: u.id,
  }).returning({ id: schema.atividades.id });
  await histAtv(a.id, u.id, validacao === "confirmada" ? `Programada para ${rotuloDia(d.dia)} · entra confirmada (criada pela ${u.perfil === "coordenacao" ? "coordenação" : "gestão"})` : `Proposta (rascunho) para ${rotuloDia(d.dia)}`, null, d);
  return { ok: true, id: a.id, avisos: await avisosDoDia(d.pessoaId, d.dia, a.id) };
}

/** Quem pode mexer no bloco: gestão sempre; a arquiteta só nas próprias propostas (não nas confirmadas pela coordenação). */
function podeEditar(u: Usuario, a: Atividade): boolean {
  if (gestor(u)) return true;
  return a.responsavelId === u.id && a.criadoPorId === u.id && a.validacao !== "confirmada";
}
/** Campos que, alterados numa atividade aprovada, a devolvem para validação (decisão de 13/11). */
// Relevantes: projeto, executora, etapa, dia, período, entrega (observação e andamento não).
function novaValidacao(a: Atividade, mudouRelevante: boolean): string {
  return mudouRelevante && a.validacao === "aprovada" ? "aguardando" : a.validacao;
}

export async function editarBloco(u: Usuario, id: number, d: DadosBloco): Promise<R<{ avisos: string[] }>> {
  const a = (await db.select().from(schema.atividades).where(eq(schema.atividades.id, id)))[0];
  if (!a || a.status === 5) return { ok: false, mensagem: "Atividade não encontrada." };
  if (!podeEditar(u, a)) return { ok: false, mensagem: "Você não pode alterar esta atividade." };
  if (a.vinculo !== "independente") return { ok: false, mensagem: "Atividade ligada ao Vobi: altere pela página da atividade (fluxo do Vobi)." };
  if (!gestor(u) && d.pessoaId !== a.responsavelId) return { ok: false, mensagem: "Só a coordenação muda a executora." };
  const proj = await nomeProjeto(d.projetoCodigo);
  if (!proj) return { ok: false, mensagem: "Projeto não encontrado." };
  const dia0 = diaDoBloco(a), h = horarios(d);
  const mud: string[] = [];
  if (a.projetoCodigo !== d.projetoCodigo) mud.push(`projeto → ${proj}`);
  if (a.responsavelId !== d.pessoaId) mud.push(`executora ${await nomeUsuario(a.responsavelId)} → ${await nomeUsuario(d.pessoaId)}`);
  if ((a.etapaRucelle ?? "") !== d.etapa) mud.push(`etapa ${a.etapaRucelle ?? "—"} → ${d.etapa}`);
  if (dia0 !== d.dia) mud.push(`dia ${rotuloDia(dia0)} → ${rotuloDia(d.dia)}`);
  if (a.periodo !== d.periodo || a.inicio?.getTime() !== h.inicio.getTime() || a.fim.getTime() !== h.fim.getTime()) mud.push(`período ${rotuloPeriodo(a)} → ${rotuloPeriodo({ periodo: d.periodo, inicio: h.inicio, fim: h.fim, diaInteiro: h.diaInteiro })}`);
  if (a.entrega !== d.entrega) mud.push(d.entrega ? "marcada como entrega" : "deixou de ser entrega");
  const obsMudou = (a.descricao ?? "") !== d.obs;
  if (!mud.length && !obsMudou) return { ok: true, avisos: [] };
  const validacao = novaValidacao(a, mud.length > 0);
  const e = etapa(d.etapa)!;
  await db.update(schema.atividades).set({
    titulo: `${e.n} · ${proj}`, descricao: d.obs || null, responsavelId: d.pessoaId, projetoCodigo: d.projetoCodigo, etapaRucelle: d.etapa, periodo: d.periodo, entrega: d.entrega, ...h,
    validacao, ...(validacao !== a.validacao ? { validadoPorId: null, validadoEm: null, validacaoComentario: null } : {}),
    reprogramacoes: a.reprogramacoes + (dia0 !== d.dia ? 1 : 0), atualizadoPorId: u.id, atualizadoEm: new Date(),
  }).where(eq(schema.atividades.id, id));
  await histAtv(id, u.id, mud.length ? `Alterada: ${mud.join("; ")}${obsMudou ? "; observação" : ""}${validacao !== a.validacao ? " · volta para validação" : ""}` : "Observação alterada (não exige nova validação)", { dia: dia0, periodo: a.periodo, etapa: a.etapaRucelle, entrega: a.entrega }, d);
  return { ok: true, avisos: mud.length ? await avisosDoDia(d.pessoaId, d.dia, id) : [] };
}

/** Reprograma para outro dia: motivo obrigatório, mantém o período, conta a reprogramação e registra no histórico. */
export async function reprogramar(u: Usuario, id: number, novoDia: string, motivo: string, detalhe: string): Promise<R<{ avisos: string[] }>> {
  const a = (await db.select().from(schema.atividades).where(eq(schema.atividades.id, id)))[0];
  if (!a || a.status === 5) return { ok: false, mensagem: "Atividade não encontrada." };
  if (!podeEditar(u, a)) return { ok: false, mensagem: "Você não pode reprogramar esta atividade." };
  if (a.vinculo !== "independente") return { ok: false, mensagem: "Atividade ligada ao Vobi: reprograme pela página da atividade." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novoDia)) return { ok: false, mensagem: "Escolha o novo dia." };
  if (!MOTIVOS_REPROG.includes(motivo)) return { ok: false, mensagem: "Escolha o motivo. A reprogramação não é salva sem motivo." };
  const dia0 = diaDoBloco(a);
  if (novoDia === dia0) return { ok: false, mensagem: "O novo dia é igual ao atual." };
  const desloc = (t: Date) => em(novoDia, horaInput(t));
  const validacao = novaValidacao(a, true);
  await db.update(schema.atividades).set({
    inicio: a.inicio ? desloc(a.inicio) : null, fim: desloc(a.fim), reprogramacoes: a.reprogramacoes + 1, validacao,
    ...(validacao !== a.validacao ? { validadoPorId: null, validadoEm: null, validacaoComentario: null } : {}), atualizadoPorId: u.id, atualizadoEm: new Date(),
  }).where(eq(schema.atividades.id, id));
  await histAtv(id, u.id, `Reprogramada de ${rotuloDia(dia0)} para ${rotuloDia(novoDia)} · motivo: ${motivo}${detalhe ? ` (${detalhe.slice(0, 200)})` : ""}${validacao !== a.validacao ? " · volta para validação" : ""}`, { dia: dia0 }, { dia: novoDia, motivo, detalhe });
  return { ok: true, avisos: await avisosDoDia(a.responsavelId, novoDia, id) };
}

/** A arquiteta envia a proposta (rascunho ou devolvida) para validação. */
export async function enviarParaValidacao(u: Usuario, id: number): Promise<R> {
  const a = (await db.select().from(schema.atividades).where(eq(schema.atividades.id, id)))[0];
  if (!a || a.status === 5 || a.responsavelId !== u.id || a.criadoPorId !== u.id) return { ok: false, mensagem: "Atividade não encontrada." };
  if (a.validacao !== "rascunho" && a.validacao !== "devolvida") return { ok: false, mensagem: "Esta atividade não está em rascunho nem devolvida." };
  await db.update(schema.atividades).set({ validacao: "aguardando", atualizadoPorId: u.id, atualizadoEm: new Date() }).where(eq(schema.atividades.id, id));
  await histAtv(id, u.id, a.validacao === "devolvida" ? "Ajustada e reenviada para validação" : "Enviada para validação");
  return { ok: true };
}
/** A arquiteta descarta um rascunho (fica no histórico como cancelado). */
export async function descartarRascunho(u: Usuario, id: number): Promise<R> {
  const a = (await db.select().from(schema.atividades).where(eq(schema.atividades.id, id)))[0];
  if (!a || a.responsavelId !== u.id || a.criadoPorId !== u.id || a.validacao !== "rascunho") return { ok: false, mensagem: "Rascunho não encontrado." };
  await db.update(schema.atividades).set({ status: 5, atualizadoPorId: u.id, atualizadoEm: new Date() }).where(eq(schema.atividades.id, id));
  await histAtv(id, u.id, "Rascunho descartado pela arquiteta");
  return { ok: true };
}

/** Ana Paula, Thaís (ou substituta designada): aprova ou devolve. Devolver exige justificativa. */
export async function decidir(u: Usuario, id: number, decisao: "aprovar" | "devolver", comentario: string): Promise<R> {
  if (!(await podeValidar(u))) return { ok: false, mensagem: "Você não está entre as validadoras." };
  const a = (await db.select().from(schema.atividades).where(eq(schema.atividades.id, id)))[0];
  if (!a || a.status === 5 || a.validacao !== "aguardando") return { ok: false, mensagem: "Esta atividade não está aguardando validação (outra pessoa pode já ter decidido)." };
  const txt = comentario.trim().slice(0, 1000);
  if (decisao === "devolver" && !txt) return { ok: false, mensagem: "Para devolver, escreva a justificativa. A arquiteta vê este comentário." };
  const r = await db.update(schema.atividades).set({ validacao: decisao === "aprovar" ? "aprovada" : "devolvida", validacaoComentario: txt || null, validadoPorId: u.id, validadoEm: new Date(), atualizadoPorId: u.id, atualizadoEm: new Date() })
    .where(and(eq(schema.atividades.id, id), eq(schema.atividades.validacao, "aguardando"))).returning({ id: schema.atividades.id });
  if (!r.length) return { ok: false, mensagem: "Outra pessoa decidiu esta atividade agora há pouco." };
  await histAtv(id, u.id, `${decisao === "aprovar" ? "Aprovada" : "Devolvida para ajuste"} por ${u.nome}${txt ? ` — “${txt}”` : ""}`);
  return { ok: true };
}

/** Andamento das próprias atividades (não exige validação). Atividades ligadas ao Vobi: andamento é no Vobi. */
export async function andamento(u: Usuario, id: number, acao: "iniciar" | "concluir" | "impedimento" | "retomar", texto = ""): Promise<R> {
  const a = (await db.select().from(schema.atividades).where(eq(schema.atividades.id, id)))[0];
  if (!a || a.status === 5) return { ok: false, mensagem: "Atividade não encontrada." };
  if (!gestor(u) && a.responsavelId !== u.id) return { ok: false, mensagem: "Você só atualiza as suas atividades." };
  if (a.vinculo !== "independente") return { ok: false, mensagem: "Atividade ligada ao Vobi: o andamento é registrado no Vobi." };
  if (a.validacao === "rascunho" || a.validacao === "aguardando" || a.validacao === "devolvida") return { ok: false, mensagem: "A atividade ainda não está confirmada." };
  const set: Partial<typeof schema.atividades.$inferInsert> = { atualizadoPorId: u.id, atualizadoEm: new Date() };
  let resumo = "";
  if (acao === "iniciar") { set.status = 2; resumo = "Andamento: em andamento"; }
  else if (acao === "concluir") { set.status = 4; set.impedimento = null; resumo = "Andamento: concluída"; }
  else if (acao === "retomar") { set.impedimento = null; resumo = "Impedimento resolvido"; }
  else { const t = texto.trim().slice(0, 300); if (!t) return { ok: false, mensagem: "Descreva o impedimento." }; set.impedimento = t; resumo = `Impedimento avisado: ${t}`; }
  await db.update(schema.atividades).set(set).where(eq(schema.atividades.id, id));
  await histAtv(id, u.id, resumo);
  return { ok: true };
}

/** Fila de validação: propostas por situação, com o nome da arquiteta e do projeto. */
export async function fila(situacao: string) {
  return (await db.execute(sql`select a.*, u.nome pessoa, p.nome projeto_nome, v.nome validado_por_nome from atividade a join usuario u on u.id = a.responsavel_id
    left join projeto p on p.codigo = a.projeto_codigo left join usuario v on v.id = a.validado_por_id
    where a.status <> 5 and a.validacao = ${situacao} order by a.fim asc, a.id asc limit 200`)).rows as Record<string, unknown>[];
}
export async function contagemValidacao(): Promise<number> {
  return Number((await db.execute(sql`select count(*)::int n from atividade where status <> 5 and validacao = 'aguardando'`)).rows[0]?.n ?? 0);
}
export async function historicoValidacao(limite = 60) {
  return (await db.execute(sql`select h.quando, h.resumo, u.nome quem, a.titulo from atividade_historico h join atividade a on a.id = h.atividade_id left join usuario u on u.id = h.usuario_id
    where h.resumo like 'Aprovada por %' or h.resumo like 'Devolvida para ajuste por %' or h.resumo like 'Enviada para validação%' or h.resumo like 'Ajustada e reenviada%' or h.resumo like '%volta para validação%'
    order by h.quando desc limit ${limite}`)).rows as { quando: string; resumo: string; quem: string | null; titulo: string }[];
}

// ---------------------------------------------------------------------------------------------- indisponibilidades
export type DadosIndisp = { usuarioId: number; tipo: string; inicio: string; fim: string; periodo: string; aPartirDe: string; obs: string };
export function lerIndisp(fd: FormData): { d: DadosIndisp } | { erro: string } {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const d: DadosIndisp = { usuarioId: Number(s("pessoa")), tipo: s("tipo"), inicio: s("inicio"), fim: s("fim") || s("inicio"), periodo: s("periodo") || "dia", aPartirDe: s("a_partir_de"), obs: s("obs").slice(0, 300) };
  if (!Number.isInteger(d.usuarioId) || d.usuarioId <= 0) return { erro: "Escolha a pessoa." };
  if (!TIPOS_INDISP[d.tipo]) return { erro: "Escolha o tipo." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(d.fim)) return { erro: "Informe as datas." };
  if (d.fim < d.inicio) return { erro: "A data final não pode ser antes da inicial." };
  if (!["dia", "manha", "tarde", "hora"].includes(d.periodo)) return { erro: "Duração inválida." };
  if (d.periodo === "hora" && !/^\d{2}:\d{2}$/.test(d.aPartirDe)) return { erro: "Informe a partir de que horário." };
  return { d };
}
/** Gestão/coordenação registra confirmada; a arquiteta só pede para si (fica pendente até a coordenação confirmar). */
export async function registrarIndisp(u: Usuario, d: DadosIndisp): Promise<R<{ id: number }>> {
  const pedido = !gestor(u);
  if (pedido && d.usuarioId !== u.id) return { ok: false, mensagem: "Você só pode pedir a sua própria ausência." };
  const [r] = await db.insert(schema.indisponibilidades).values({ usuarioId: d.usuarioId, tipo: d.tipo, inicio: d.inicio, fim: d.fim, periodo: d.periodo, aPartirDe: d.periodo === "hora" ? d.aPartirDe : null,
    observacao: d.obs || null, situacao: pedido ? "pendente" : "confirmada", registradoPorId: u.id, ...(pedido ? {} : { decididoPorId: u.id, decididoEm: new Date() }) }).returning({ id: schema.indisponibilidades.id });
  await histAgenda("indisponibilidade", r.id, `${pedido ? "Pedido" : "Registro"}: ${TIPOS_INDISP[d.tipo].rotulo} de ${await nomeUsuario(d.usuarioId)}, ${dataCurta(d.inicio)}${d.fim !== d.inicio ? ` a ${dataCurta(d.fim)}` : ""}`, u.id);
  return { ok: true, id: r.id };
}
export async function decidirIndisp(u: Usuario, id: number, acao: "confirmar" | "recusar" | "cancelar"): Promise<R> {
  const i = (await db.select().from(schema.indisponibilidades).where(eq(schema.indisponibilidades.id, id)))[0];
  if (!i) return { ok: false, mensagem: "Registro não encontrado." };
  const proprioPendente = i.usuarioId === u.id && i.situacao === "pendente" && acao === "cancelar";
  if (!gestor(u) && !proprioPendente) return { ok: false, mensagem: "Só a coordenação confirma ou recusa." };
  if ((acao === "confirmar" || acao === "recusar") && i.situacao !== "pendente") return { ok: false, mensagem: "Este pedido já foi decidido." };
  if (acao === "cancelar" && (i.situacao === "cancelada" || i.situacao === "recusada")) return { ok: false, mensagem: "Já está cancelado." };
  const situacao = acao === "confirmar" ? "confirmada" : acao === "recusar" ? "recusada" : "cancelada";
  await db.update(schema.indisponibilidades).set({ situacao, decididoPorId: u.id, decididoEm: new Date() }).where(eq(schema.indisponibilidades.id, id));
  await histAgenda("indisponibilidade", id, `${acao === "confirmar" ? "Confirmada" : acao === "recusar" ? "Pedido recusado" : "Cancelada"} por ${u.nome}`, u.id);
  return { ok: true };
}
/** Lista com regra de privacidade: tipo "atestado" e observação só para gestão/coordenação e a própria pessoa. */
export async function listaIndisp(u: Usuario, de: string) {
  const rows = (await db.execute(sql`select i.*, p.nome pessoa, r.nome registrado_por, d.nome decidido_por from agenda_indisponibilidade i join usuario p on p.id = i.usuario_id
    join usuario r on r.id = i.registrado_por_id left join usuario d on d.id = i.decidido_por_id
    where i.fim >= ${de} ${gestor(u) ? sql`` : sql`and i.usuario_id = ${u.id}`} order by (i.situacao = 'pendente') desc, i.inicio asc limit 300`)).rows as Record<string, unknown>[];
  return rows.map((r) => {
    const ve = gestor(u) || r.usuario_id === u.id;
    const t = TIPOS_INDISP[String(r.tipo)];
    return { id: Number(r.id), pessoa: String(r.pessoa), usuarioId: Number(r.usuario_id), tipo: ve ? t?.rotulo ?? String(r.tipo) : t?.privado ? "Indisponível" : t?.rotulo ?? "Indisponível",
      privado: !!t?.privado, inicio: String(r.inicio), fim: String(r.fim), periodo: String(r.periodo), aPartirDe: r.a_partir_de as string | null, obs: ve ? (r.observacao as string | null) : null,
      situacao: String(r.situacao), registradoPor: String(r.registrado_por), decididoPor: r.decidido_por as string | null, criadoEm: new Date(String(r.criado_em)) };
  });
}

// ---------------------------------------------------------------------------------------------- feriados
export async function criarFeriado(u: Usuario, fd: FormData): Promise<R> {
  if (!administraConfig(u)) return { ok: false, mensagem: "Só a gestão cadastra feriados." };
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const nome = s("nome").slice(0, 120), data = s("data"), abr = s("abrangencia"), uf = s("uf").toUpperCase().slice(0, 2), municipio = s("municipio").slice(0, 80);
  if (!nome || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false, mensagem: "Informe o nome e a data." };
  if (!ABRANGENCIA[abr]) return { ok: false, mensagem: "Escolha a abrangência." };
  if ((abr === "estadual" || abr === "municipal") && !/^[A-Z]{2}$/.test(uf)) return { ok: false, mensagem: "Informe o estado (UF)." };
  if (abr === "municipal" && !municipio) return { ok: false, mensagem: "Informe o município." };
  const dup = (await db.select({ id: schema.feriados.id }).from(schema.feriados).where(and(eq(schema.feriados.data, data), eq(schema.feriados.ativo, true), eq(schema.feriados.abrangencia, abr),
    or(sql`${abr} in ('nacional','recesso')`, and(eq(schema.feriados.uf, uf), abr === "municipal" ? sql`lower(${schema.feriados.municipio}) = lower(${municipio})` : sql`true`)))))[0];
  if (dup) return { ok: false, mensagem: "Já existe um feriado igual nesta data." };
  const [r] = await db.insert(schema.feriados).values({ nome, data, abrangencia: abr, uf: abr === "estadual" || abr === "municipal" ? uf : null, municipio: abr === "municipal" ? municipio : null, criadoPorId: u.id }).returning({ id: schema.feriados.id });
  await histAgenda("feriado", r.id, `Feriado cadastrado: ${nome} (${dataCurta(data)}, ${ABRANGENCIA[abr]}${abr === "municipal" ? ` ${municipio}/${uf}` : abr === "estadual" ? ` ${uf}` : ""})`, u.id);
  return { ok: true };
}
export async function desativarFeriado(u: Usuario, id: number): Promise<R> {
  if (!administraConfig(u)) return { ok: false, mensagem: "Só a gestão altera feriados." };
  const f = (await db.select().from(schema.feriados).where(eq(schema.feriados.id, id)))[0];
  if (!f || !f.ativo) return { ok: false, mensagem: "Feriado não encontrado." };
  await db.update(schema.feriados).set({ ativo: false }).where(eq(schema.feriados.id, id));
  await histAgenda("feriado", id, `Feriado removido da agenda: ${f.nome} (${dataCurta(f.data)}) — fica no histórico`, u.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------- configuração por pessoa
export async function salvarConfig(u: Usuario, usuarioId: number, fd: FormData): Promise<R> {
  if (!administraConfig(u)) return { ok: false, mensagem: "Só a gestão altera a configuração das pessoas." };
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const atual = await configDe(usuarioId);
  const nome = await nomeUsuario(usuarioId);
  const novo = {
    uf: s("uf").toUpperCase().slice(0, 2) || null, municipio: s("municipio").slice(0, 80) || null,
    almocoInicio: s("almoco_inicio") || null, almocoFim: s("almoco_fim") || null, modelo: s("modelo"), validadora: s("validadora") === "1",
  };
  if (novo.uf && !/^[A-Z]{2}$/.test(novo.uf)) return { ok: false, mensagem: "UF inválida (duas letras)." };
  if (!MODELOS[novo.modelo]) return { ok: false, mensagem: "Modelo inválido." };
  if ((novo.almocoInicio && !/^\d{2}:\d{2}$/.test(novo.almocoInicio)) || (novo.almocoFim && !/^\d{2}:\d{2}$/.test(novo.almocoFim))) return { ok: false, mensagem: "Horário de almoço inválido." };
  if (novo.almocoInicio && novo.almocoFim && novo.almocoFim <= novo.almocoInicio) return { ok: false, mensagem: "O fim do almoço precisa ser depois do início." };
  const mud: string[] = [];
  if ((atual.uf ?? "") !== (novo.uf ?? "") || (atual.municipio ?? "") !== (novo.municipio ?? "")) mud.push(`localidade ${[atual.municipio, atual.uf].filter(Boolean).join("/") || "—"} → ${[novo.municipio, novo.uf].filter(Boolean).join("/") || "—"}`);
  if ((atual.almocoInicio ?? "") !== (novo.almocoInicio ?? "") || (atual.almocoFim ?? "") !== (novo.almocoFim ?? "")) mud.push(`almoço ${atual.almocoInicio ?? "—"}–${atual.almocoFim ?? "—"} → ${novo.almocoInicio ?? "—"}–${novo.almocoFim ?? "—"}`);
  if (atual.modelo !== novo.modelo) mud.push(`${MODELOS[atual.modelo].rotulo} → ${MODELOS[novo.modelo].rotulo}`);
  if (atual.validadora !== novo.validadora) mud.push(novo.validadora ? "passa a validar propostas" : "deixa de validar propostas");
  if (!mud.length) return { ok: true };
  await db.insert(schema.agendaPessoas).values({ usuarioId, ...novo, substitutaAte: atual.substitutaAte, atualizadoPorId: u.id, atualizadoEm: new Date() })
    .onConflictDoUpdate({ target: schema.agendaPessoas.usuarioId, set: { ...novo, atualizadoPorId: u.id, atualizadoEm: new Date() } });
  await histAgenda("pessoa", usuarioId, `${u.nome} alterou ${nome}: ${mud.join("; ")}`, u.id);
  return { ok: true };
}
/** Gestão designa uma substituta para validar até uma data (registrado no histórico). Data vazia encerra a substituição. */
export async function designarSubstituta(u: Usuario, usuarioId: number, ate: string): Promise<R> {
  if (!administraConfig(u)) return { ok: false, mensagem: "Só a gestão designa substituta." };
  if (ate && !/^\d{4}-\d{2}-\d{2}$/.test(ate)) return { ok: false, mensagem: "Data inválida." };
  if (ate && ate < hojeLocal()) return { ok: false, mensagem: "A data final já passou." };
  const atual = await configDe(usuarioId), nome = await nomeUsuario(usuarioId);
  await db.insert(schema.agendaPessoas).values({ ...atual, substitutaAte: ate || null, atualizadoPorId: u.id, atualizadoEm: new Date() })
    .onConflictDoUpdate({ target: schema.agendaPessoas.usuarioId, set: { substitutaAte: ate || null, atualizadoPorId: u.id, atualizadoEm: new Date() } });
  await histAgenda("pessoa", usuarioId, ate ? `${u.nome} designou ${nome} como substituta na validação até ${dataCurta(ate)}/${ate.slice(0, 4)}` : `${u.nome} encerrou a substituição de ${nome} na validação`, u.id);
  return { ok: true };
}
export async function historicoAgenda(entidade: string, limite = 40) {
  return (await db.execute(sql`select h.quando, h.resumo, u.nome quem from agenda_historico h left join usuario u on u.id = h.usuario_id where h.entidade = ${entidade} order by h.quando desc limit ${limite}`)).rows as { quando: string; resumo: string; quem: string | null }[];
}

/** Projetos ativos do recorte (mesma lista da Agenda), por nome. Só leitura. */
export async function projetosAtivos() {
  return (await db.execute(sql`select p.codigo, p.nome from projeto p where p.nao_encontrado_desde is null and p.status_classe <> 'encerrado' and p.codigo in ${SQL_ELEGIVEIS} order by p.nome`)).rows as { codigo: number; nome: string }[];
}
