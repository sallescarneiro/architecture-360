// Etapa C da Agenda de Produção (design aprovado por Rodrigo em 13/11/2026): projetos ativos e visão gerencial.
// Três coisas separadas: SITUAÇÃO do projeto, ETAPA atual de produção e AÇÃO de acompanhamento (responsável e data; não é
// tarefa de produção e não entra no quadro nem na carga). Projetos vêm do cadastro do A360 (Vobi, só leitura): nada é
// importado da planilha, nada é gravado no Vobi. Responsável pelo projeto é diferente de quem executa cada atividade.
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Usuario } from "@/lib/auth";
import { dataCurta, hojeLocal, inicioSemana, somaDias } from "./datas";
import * as P from "./producao";
import { SQL_ELEGIVEIS } from "@/lib/vobi/escopo";

type R = { ok: true } | { ok: false; mensagem: string };

export const SITUACOES: Record<string, { rotulo: string; tom: string }> = {
  andamento: { rotulo: "Em andamento", tom: "s-and" }, cliente: { rotulo: "Aguardando cliente", tom: "s-cli" },
  pausado: { rotulo: "Pausado", tom: "s-pau" }, concluido: { rotulo: "Concluído", tom: "s-con" },
};
export const COMUNICACAO: Record<string, { rotulo: string; tom: string }> = {
  feita: { rotulo: "Feita", tom: "c-ok" }, pendente: { rotulo: "Pendente", tom: "c-pend" }, na: { rotulo: "Não se aplica", tom: "c-na" },
};
const ativo = (sit: string) => sit === "andamento" || sit === "cliente";

// ---------------------------------------------------------------------------------------------- regras e cadastros
export async function regras(): Promise<{ alta: number; sob: number }> {
  const r = new Map((await db.select().from(schema.agendaRegras)).map((x) => [x.chave, Number(x.valor)]));
  return { alta: r.get("carga_alta") || 6, sob: r.get("sobrecarga") || 8 };
}
export async function tiposAcao(todos = false) {
  return db.select().from(schema.agendaTiposAcao).where(todos ? sql`true` : eq(schema.agendaTiposAcao.ativo, true)).orderBy(asc(schema.agendaTiposAcao.id));
}
export async function terceirizados(todos = false) {
  return db.select().from(schema.agendaTerceirizados).where(todos ? sql`true` : eq(schema.agendaTerceirizados.ativo, true)).orderBy(asc(schema.agendaTerceirizados.nome));
}
export async function salvarRegras(u: Usuario, alta: number, sob: number): Promise<R> {
  if (!P.administraConfig(u)) return { ok: false, mensagem: "Só a gerência altera a referência de carga." };
  if (!Number.isInteger(alta) || !Number.isInteger(sob) || alta < 1 || sob > 50) return { ok: false, mensagem: "Informe números inteiros." };
  if (sob <= alta) return { ok: false, mensagem: "Sobrecarga precisa ser maior que carga alta." };
  const atual = await regras();
  if (atual.alta === alta && atual.sob === sob) return { ok: true };
  for (const [chave, valor] of [["carga_alta", alta], ["sobrecarga", sob]] as const)
    await db.insert(schema.agendaRegras).values({ chave, valor: String(valor), atualizadoPorId: u.id, atualizadoEm: new Date() })
      .onConflictDoUpdate({ target: schema.agendaRegras.chave, set: { valor: String(valor), atualizadoPorId: u.id, atualizadoEm: new Date() } });
  await P.histAgenda("regra", null, `${u.nome} alterou a referência de carga: carga alta ${atual.alta} → ${alta}; sobrecarga ${atual.sob} → ${sob}`, u.id);
  return { ok: true };
}
const chave = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export async function incluirTipo(u: Usuario, nome: string): Promise<R> {
  if (!P.administraConfig(u)) return { ok: false, mensagem: "Só a gerência altera os tipos de ação." };
  const n = nome.trim().slice(0, 80);
  if (!n) return { ok: false, mensagem: "Informe o nome do tipo." };
  const existentes = await tiposAcao(true);
  const igual = existentes.find((t) => chave(t.nome) === chave(n));
  if (igual?.ativo) return { ok: false, mensagem: "Já existe um tipo com esse nome." };
  if (igual) await db.update(schema.agendaTiposAcao).set({ ativo: true }).where(eq(schema.agendaTiposAcao.id, igual.id));
  else await db.insert(schema.agendaTiposAcao).values({ nome: n });
  await P.histAgenda("regra", null, `${u.nome} incluiu o tipo de ação “${n}”`, u.id);
  return { ok: true };
}
export async function desativarTipo(u: Usuario, id: number): Promise<R> {
  if (!P.administraConfig(u)) return { ok: false, mensagem: "Só a gerência altera os tipos de ação." };
  const t = (await db.select().from(schema.agendaTiposAcao).where(eq(schema.agendaTiposAcao.id, id)))[0];
  if (!t || !t.ativo) return { ok: false, mensagem: "Tipo não encontrado." };
  await db.update(schema.agendaTiposAcao).set({ ativo: false }).where(eq(schema.agendaTiposAcao.id, id));
  await P.histAgenda("regra", null, `${u.nome} desativou o tipo de ação “${t.nome}” (ações antigas mantêm o tipo)`, u.id);
  return { ok: true };
}
export async function incluirTerceirizado(u: Usuario, nome: string, contato: string): Promise<R> {
  if (!P.administraConfig(u)) return { ok: false, mensagem: "Só a gerência cadastra terceirizados." };
  const n = nome.trim().slice(0, 120);
  if (!n) return { ok: false, mensagem: "Informe o nome do terceirizado." };
  if ((await terceirizados()).some((t) => chave(t.nome) === chave(n))) return { ok: false, mensagem: "Já existe um terceirizado com esse nome." };
  await db.insert(schema.agendaTerceirizados).values({ nome: n, contato: contato.trim().slice(0, 160) || null });
  await P.histAgenda("regra", null, `${u.nome} cadastrou o terceirizado “${n}”`, u.id);
  return { ok: true };
}
export async function desativarTerceirizado(u: Usuario, id: number): Promise<R> {
  if (!P.administraConfig(u)) return { ok: false, mensagem: "Só a gerência altera terceirizados." };
  const t = (await db.select().from(schema.agendaTerceirizados).where(eq(schema.agendaTerceirizados.id, id)))[0];
  if (!t || !t.ativo) return { ok: false, mensagem: "Terceirizado não encontrado." };
  await db.update(schema.agendaTerceirizados).set({ ativo: false }).where(eq(schema.agendaTerceirizados.id, id));
  await P.histAgenda("regra", null, `${u.nome} desativou o terceirizado “${t.nome}” (projetos antigos mantêm o registro)`, u.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------- projetos ativos
export type LinhaProjeto = {
  codigo: number; nome: string; cliente: string | null;
  situacao: string; etapa: string | null; responsavelId: number | null; responsavel: string | null;
  terceirizadoId: number | null; terceirizado: string | null;
  acaoTipo: string | null; acaoQuemId: number | null; acaoQuem: string | null; acaoAte: string | null; acaoVencida: boolean;
  entrega: { dia: string; quem: string; etapa: string | null } | null;
  solicitacao: { texto: string; quando: Date; quem: string | null } | null;
  comunicacao: string; executoras: string[];
};
/** Todos os projetos ativos do recorte, com o acompanhamento. Sem registro = situação "em andamento", sem responsável. */
export async function linhasProjetos(filtroResp?: number): Promise<LinhaProjeto[]> {
  const hoje = hojeLocal(), semana = inicioSemana(hoje), mesIni = hoje.slice(0, 8) + "01";
  const projs = (await db.execute(sql`select p.codigo, p.nome, p.cliente from projeto p where p.nao_encontrado_desde is null and p.status_classe <> 'encerrado'
    and p.codigo in ${SQL_ELEGIVEIS} order by p.nome`)).rows as { codigo: number; nome: string; cliente: string | null }[];
  const codigos = projs.map((p) => Number(p.codigo));
  if (!codigos.length) return [];
  const [acs, usuarios, tercs, sols, coms, entregas, execs] = await Promise.all([
    db.select().from(schema.agendaProjetos).where(inArray(schema.agendaProjetos.projetoCodigo, codigos)),
    db.select({ id: schema.usuarios.id, nome: schema.usuarios.nome }).from(schema.usuarios),
    terceirizados(true),
    db.execute(sql`select distinct on (s.projeto_codigo) s.projeto_codigo, s.texto, s.quando, u.nome quem from agenda_solicitacao s left join usuario u on u.id = s.usuario_id order by s.projeto_codigo, s.quando desc`),
    db.select().from(schema.agendaComunicacoes).where(eq(schema.agendaComunicacoes.semana, semana)),
    db.execute(sql`select distinct on (a.projeto_codigo) a.projeto_codigo, (a.fim at time zone 'America/Sao_Paulo')::date::text dia, u.nome quem, a.etapa_rucelle etapa
      from atividade a join usuario u on u.id = a.responsavel_id where a.status <> 5 and a.entrega and a.validacao not in ('rascunho','devolvida')
      and (a.fim at time zone 'America/Sao_Paulo')::date >= ${hoje}::date order by a.projeto_codigo, a.fim`),
    db.execute(sql`select distinct a.projeto_codigo, u.nome from atividade a join usuario u on u.id = a.responsavel_id where a.status <> 5 and a.tipo = 'producao'
      and a.validacao not in ('rascunho','devolvida') and (a.fim at time zone 'America/Sao_Paulo')::date >= ${mesIni}::date and (a.fim at time zone 'America/Sao_Paulo')::date < (${mesIni}::date + interval '1 month')`),
  ]);
  const nome = new Map(usuarios.map((x) => [x.id, x.nome])), terc = new Map(tercs.map((t) => [t.id, t.nome]));
  const ac = new Map(acs.map((a) => [a.projetoCodigo, a]));
  const sol = new Map((sols.rows as { projeto_codigo: number; texto: string; quando: string; quem: string | null }[]).map((s) => [Number(s.projeto_codigo), { texto: s.texto, quando: new Date(s.quando), quem: s.quem }]));
  const com = new Map(coms.map((c) => [c.projetoCodigo, c.situacao]));
  const ent = new Map((entregas.rows as { projeto_codigo: number; dia: string; quem: string; etapa: string | null }[]).map((e) => [Number(e.projeto_codigo), { dia: e.dia, quem: e.quem, etapa: e.etapa }]));
  const ex = new Map<number, string[]>();
  for (const r of execs.rows as { projeto_codigo: number; nome: string }[]) { const k = Number(r.projeto_codigo); ex.set(k, [...(ex.get(k) ?? []), r.nome]); }
  return projs.map((p) => {
    const cod = Number(p.codigo), a = ac.get(cod), sit = a?.situacao ?? "andamento";
    return {
      codigo: cod, nome: p.nome, cliente: p.cliente, situacao: sit, etapa: a?.etapa ?? null,
      responsavelId: a?.responsavelId ?? null, responsavel: a?.responsavelId ? nome.get(a.responsavelId) ?? null : null,
      terceirizadoId: a?.terceirizadoId ?? null, terceirizado: a?.terceirizadoId ? terc.get(a.terceirizadoId) ?? null : null,
      acaoTipo: a?.acaoTipo ?? null, acaoQuemId: a?.acaoQuemId ?? null, acaoQuem: a?.acaoQuemId ? nome.get(a.acaoQuemId) ?? null : null, acaoAte: a?.acaoAte ?? null,
      acaoVencida: !!(a?.acaoTipo && a.acaoAte && a.acaoAte < hoje),
      entrega: ent.get(cod) ?? null, solicitacao: sol.get(cod) ?? null,
      comunicacao: com.get(cod) ?? (ativo(sit) ? "pendente" : "na"), executoras: [...new Set(ex.get(cod) ?? [])].sort(),
    };
  }).filter((l) => filtroResp === undefined || l.responsavelId === filtroResp);
}
export const semanaAtual = () => inicioSemana(hojeLocal());
export const rotuloSemana = () => { const s = semanaAtual(); return `${dataCurta(s)} a ${dataCurta(somaDias(s, 4))}`; };

async function acompanhamento(codigo: number) {
  return (await db.select().from(schema.agendaProjetos).where(eq(schema.agendaProjetos.projetoCodigo, codigo)))[0] ?? null;
}
async function projetoValido(codigo: number) {
  return (await P.projetosAtivos()).find((p) => Number(p.codigo) === codigo) ?? null;
}
const hist = (codigo: number, resumo: string, u: Usuario) => P.histAgenda("projeto", codigo, resumo, u.id);
export async function historicoProjeto(codigo: number, limite = 15) {
  return (await db.execute(sql`select h.quando, h.resumo, u.nome quem from agenda_historico h left join usuario u on u.id = h.usuario_id
    where h.entidade = 'projeto' and h.entidade_id = ${codigo} order by h.quando desc limit ${limite}`)).rows as { quando: string; resumo: string; quem: string | null }[];
}

export type DadosAcomp = { situacao: string; etapa: string; responsavelId: number | null; terceirizadoId: number | null; acaoTipo: string; acaoQuemId: number | null; acaoAte: string };
/** Coordenação, gerência e administração definem situação, etapa, responsável, terceirizado e a próxima ação. */
export async function salvarAcompanhamento(u: Usuario, codigo: number, d: DadosAcomp): Promise<R> {
  if (!P.gestor(u)) return { ok: false, mensagem: "Só a coordenação e a gerência alteram o acompanhamento do projeto." };
  const proj = await projetoValido(codigo);
  if (!proj) return { ok: false, mensagem: "Projeto não encontrado entre os ativos." };
  if (!SITUACOES[d.situacao]) return { ok: false, mensagem: "Situação inválida." };
  if (d.etapa && !P.etapa(d.etapa)) return { ok: false, mensagem: "Etapa inválida." };
  const tipos = await tiposAcao(true);
  if (d.acaoTipo && !tipos.some((t) => t.nome === d.acaoTipo)) return { ok: false, mensagem: "Tipo de ação inválido." };
  if (d.acaoTipo && !/^\d{4}-\d{2}-\d{2}$/.test(d.acaoAte)) return { ok: false, mensagem: "Informe até quando a ação deve ser feita." };
  if (d.acaoTipo && !d.acaoQuemId) return { ok: false, mensagem: "Informe quem faz a ação." };
  const pessoas = new Map((await P.pessoasComConfig()).map((p) => [p.id, p.nome]));
  if (d.responsavelId && !pessoas.has(d.responsavelId)) return { ok: false, mensagem: "Responsável inválida." };
  if (d.acaoQuemId && !pessoas.has(d.acaoQuemId)) return { ok: false, mensagem: "Pessoa da ação inválida." };
  const tercs = new Map((await terceirizados(true)).map((t) => [t.id, t.nome]));
  if (d.terceirizadoId && !tercs.has(d.terceirizadoId)) return { ok: false, mensagem: "Terceirizado inválido." };
  const a = await acompanhamento(codigo);
  const antes = { situacao: a?.situacao ?? "andamento", etapa: a?.etapa ?? null, responsavelId: a?.responsavelId ?? null, terceirizadoId: a?.terceirizadoId ?? null,
    acaoTipo: a?.acaoTipo ?? null, acaoQuemId: a?.acaoQuemId ?? null, acaoAte: a?.acaoAte ?? null };
  const novo = { situacao: d.situacao, etapa: d.etapa || null, responsavelId: d.responsavelId, terceirizadoId: d.terceirizadoId,
    acaoTipo: d.acaoTipo || null, acaoQuemId: d.acaoTipo ? d.acaoQuemId : null, acaoAte: d.acaoTipo ? d.acaoAte : null };
  const mud: string[] = [];
  if (antes.situacao !== novo.situacao) mud.push(`situação: ${SITUACOES[antes.situacao].rotulo} → ${SITUACOES[novo.situacao].rotulo}`);
  if (antes.etapa !== novo.etapa) mud.push(`etapa: ${P.etapa(antes.etapa)?.n ?? "—"} → ${P.etapa(novo.etapa)?.n ?? "—"}`);
  if (antes.responsavelId !== novo.responsavelId) mud.push(`responsável: ${antes.responsavelId ? pessoas.get(antes.responsavelId) : "—"} → ${novo.responsavelId ? pessoas.get(novo.responsavelId) : "—"}`);
  if (antes.terceirizadoId !== novo.terceirizadoId) mud.push(novo.terceirizadoId ? `produção terceirizada: ${tercs.get(novo.terceirizadoId)}` : "produção deixa de ser terceirizada");
  if (antes.acaoTipo !== novo.acaoTipo || antes.acaoQuemId !== novo.acaoQuemId || antes.acaoAte !== novo.acaoAte)
    mud.push(novo.acaoTipo ? `próxima ação: ${novo.acaoTipo} (${pessoas.get(novo.acaoQuemId!)}, até ${dataCurta(novo.acaoAte!)})` : "sem próxima ação");
  if (!mud.length) return { ok: true };
  await db.insert(schema.agendaProjetos).values({ projetoCodigo: codigo, ...novo, atualizadoPorId: u.id, atualizadoEm: new Date() })
    .onConflictDoUpdate({ target: schema.agendaProjetos.projetoCodigo, set: { ...novo, atualizadoPorId: u.id, atualizadoEm: new Date() } });
  await hist(codigo, mud.join("; "), u);
  return { ok: true };
}
/** Quem pode registrar no projeto (ação feita, comunicação, pedido do cliente): gestão/coordenação, a responsável e quem faz a ação. */
async function podeRegistrar(u: Usuario, codigo: number) {
  if (P.gestor(u)) return true;
  const a = await acompanhamento(codigo);
  return !!a && (a.responsavelId === u.id || a.acaoQuemId === u.id);
}
/** Etapas dadas à pessoa no quadro (e atividades ligadas ao Vobi), dos últimos 30 dias em diante, por projeto.
 *  Várias arquitetas trabalham no mesmo projeto: quem recebe uma etapa vê o projeto, mesmo em nome de outra. */
export type MinhaEtapa = { dia: string; etapa: string | null; titulo: string; periodo: string; entrega: boolean; validacao: string; status: number };
export async function etapasDe(usuarioId: number): Promise<Map<number, MinhaEtapa[]>> {
  const desde = somaDias(hojeLocal(), -30);
  const r = await db.execute(sql`select a.projeto_codigo, (a.fim at time zone 'America/Sao_Paulo')::date::text dia, a.etapa_rucelle, a.titulo, a.periodo, a.inicio, a.fim, a.dia_inteiro, a.entrega, a.validacao, a.status
    from atividade a where a.responsavel_id = ${usuarioId} and a.projeto_codigo is not null and a.status <> 5 and a.validacao <> 'devolvida'
    and (a.fim at time zone 'America/Sao_Paulo')::date >= ${desde}::date order by a.fim`);
  const m = new Map<number, MinhaEtapa[]>();
  for (const x of r.rows as Record<string, unknown>[]) {
    const k = Number(x.projeto_codigo);
    const periodo = P.rotuloPeriodo({ periodo: x.periodo as string | null, inicio: x.inicio ? new Date(String(x.inicio)) : null, fim: new Date(String(x.fim)), diaInteiro: !!x.dia_inteiro } as P.Atividade);
    m.set(k, [...(m.get(k) ?? []), { dia: String(x.dia), etapa: (x.etapa_rucelle as string | null) ?? null, titulo: String(x.titulo), periodo, entrega: !!x.entrega, validacao: String(x.validacao), status: Number(x.status) }]);
  }
  return m;
}
/** Pedido do cliente: também pode registrar quem tem etapa no projeto. */
async function podeRegistrarPedido(u: Usuario, codigo: number) {
  return (await podeRegistrar(u, codigo)) || (await etapasDe(u.id)).has(codigo);
}
export async function acaoFeita(u: Usuario, codigo: number): Promise<R> {
  if (!(await podeRegistrar(u, codigo))) return { ok: false, mensagem: "Você não acompanha este projeto." };
  const a = await acompanhamento(codigo);
  if (!a?.acaoTipo) return { ok: false, mensagem: "Este projeto não tem ação pendente." };
  await db.update(schema.agendaProjetos).set({ acaoTipo: null, acaoQuemId: null, acaoAte: null, atualizadoPorId: u.id, atualizadoEm: new Date() }).where(eq(schema.agendaProjetos.projetoCodigo, codigo));
  await hist(codigo, `ação “${a.acaoTipo}” feita`, u);
  return { ok: true };
}
export async function registrarComunicacao(u: Usuario, codigo: number, situacao: string): Promise<R> {
  if (!COMUNICACAO[situacao]) return { ok: false, mensagem: "Situação inválida." };
  if (!(await podeRegistrar(u, codigo))) return { ok: false, mensagem: "Você não acompanha este projeto." };
  if (!(await projetoValido(codigo))) return { ok: false, mensagem: "Projeto não encontrado entre os ativos." };
  const semana = semanaAtual();
  await db.insert(schema.agendaComunicacoes).values({ projetoCodigo: codigo, semana, situacao, usuarioId: u.id })
    .onConflictDoUpdate({ target: [schema.agendaComunicacoes.projetoCodigo, schema.agendaComunicacoes.semana], set: { situacao, usuarioId: u.id, quando: new Date() } });
  await hist(codigo, `comunicação com o cliente na semana de ${dataCurta(semana)}: ${COMUNICACAO[situacao].rotulo.toLowerCase()}`, u);
  return { ok: true };
}
export async function registrarSolicitacao(u: Usuario, codigo: number, texto: string): Promise<R> {
  const t = texto.trim().slice(0, 500);
  if (!t) return { ok: false, mensagem: "Escreva o que o cliente pediu." };
  if (!(await podeRegistrarPedido(u, codigo))) return { ok: false, mensagem: "Você não acompanha este projeto." };
  if (!(await projetoValido(codigo))) return { ok: false, mensagem: "Projeto não encontrado entre os ativos." };
  await db.insert(schema.agendaSolicitacoes).values({ projetoCodigo: codigo, texto: t, usuarioId: u.id });
  await hist(codigo, `solicitação do cliente registrada: ${t}`, u);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------- carteira da equipe
export type LinhaCarteira = {
  id: number; nome: string; modelo: string; projetos: number; porEtapa: Record<string, number>; semEtapa: number;
  carga: "normal" | "alta" | "sobrecarga"; diasLivres: number; ausencia: string | null; entregas7: number; acoesVencidas: number;
  lista: LinhaProjeto[];
};
/** Carga = projetos em andamento ou aguardando cliente em que ela é responsável, sem os terceirizados. Não é avaliação. */
export async function carteira(linhas: LinhaProjeto[]) {
  const hoje = hojeLocal(), fim2 = somaDias(hoje, 13), fim7 = somaDias(hoje, 7);
  const [pessoas, ref, feriados, indisp] = await Promise.all([P.arquitetas(), regras(), P.feriadosEntre(hoje, fim2), P.indisponibilidadesEntre(hoje, fim2, ["confirmada"])]);
  const blocos = await P.blocosEntre(hoje, fim2, pessoas.map((p) => p.id));
  const dias: string[] = [];
  for (let d = hoje; d <= fim2; d = somaDias(d, 1)) { const dow = new Date(d + "T12:00:00Z").getUTCDay(); if (dow > 0 && dow < 6) dias.push(d); }
  const vencidas = new Map<number, number>();
  for (const l of linhas) if (l.acaoVencida && l.acaoQuemId) vencidas.set(l.acaoQuemId, (vencidas.get(l.acaoQuemId) ?? 0) + 1);
  const out: LinhaCarteira[] = pessoas.map((p) => {
    const lista = linhas.filter((l) => l.responsavelId === p.id && ativo(l.situacao));
    const conta = lista.filter((l) => !l.terceirizadoId);
    const porEtapa: Record<string, number> = {};
    for (const l of conta) if (l.etapa) porEtapa[l.etapa] = (porEtapa[l.etapa] ?? 0) + 1;
    const disp = dias.reduce((s, d) => s + P.disponivelNoDia(d, p.cfg, feriados, indisp), 0);
    const meus = blocos.filter((b) => b.responsavelId === p.id && b.validacao !== "rascunho" && b.validacao !== "devolvida");
    const prog = meus.reduce((s, b) => s + P.peso(b), 0);
    const aus = indisp.find((i) => i.usuarioId === p.id);
    const n = conta.length;
    return {
      id: p.id, nome: p.nome, modelo: P.MODELOS[p.cfg.modelo]?.rotulo ?? "A definir", projetos: n, porEtapa, semEtapa: conta.filter((l) => !l.etapa).length,
      carga: n >= ref.sob ? "sobrecarga" : n >= ref.alta ? "alta" : "normal", diasLivres: Math.max(0, disp - prog),
      ausencia: aus ? `${P.rotuloIndispColetivo(aus)} ${dataCurta(aus.inicio)}${aus.fim !== aus.inicio ? `–${dataCurta(aus.fim)}` : ""}` : null,
      entregas7: meus.filter((b) => b.entrega && P.diaDoBloco(b) <= fim7).length, acoesVencidas: vencidas.get(p.id) ?? 0, lista,
    };
  });
  const fora = {
    terceirizados: linhas.filter((l) => l.terceirizadoId && ativo(l.situacao)).length,
    pausados: linhas.filter((l) => l.situacao === "pausado").length,
    semResponsavel: linhas.filter((l) => !l.responsavelId && ativo(l.situacao)).length,
    semEntrega: linhas.filter((l) => l.situacao === "andamento" && !l.entrega).length,
  };
  return { linhas: out, ref, fora };
}
