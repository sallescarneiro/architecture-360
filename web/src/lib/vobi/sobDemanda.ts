// T-219 — "Buscar projeto no Vobi" (decisão de Rodrigo, 12/11/2026): a gestão procura um projeto no Vobi por nome ou número
// (inclusive anteriores a 2026 e arquivados/finalizados), confere os dados e incorpora ao A360 com as tarefas, etapas,
// responsáveis, datas e status, ligados pelos números do Vobi. SOMENTE LEITURA no Vobi (GET). Sem importação automática de
// históricos, sem duplicidade; cada pedido fica registrado (quem, quando, situação).
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { chaveTexto, limpar, STATUS_PROJETO_CLASSE } from "@/lib/importador/normalizacao";
import { ErroVobi, get, listarTudo } from "./api";
import { dataInicioPrevisto, projetoElegivel } from "./escopo";
import { gravarEspelhoProjeto, mapaResponsaveis } from "./espelho";

type R = Record<string, unknown>;
const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const txt = (v: unknown): string => (v == null ? "" : typeof v === "object" ? txt((v as R).name ?? "") : String(v)).replace(/\s+/g, " ").trim();

// a listagem completa custa algumas chamadas: guardada por 10 min para buscas seguidas
let cacheLista: { em: number; projetos: R[] } | null = null;
let cachePassos: { em: number; mapa: Map<number, string> } | null = null;
const DEZ_MIN = 10 * 60 * 1000;

async function passos(): Promise<Map<number, string>> {
  if (cachePassos && Date.now() - cachePassos.em < DEZ_MIN) return cachePassos.mapa;
  const mapa = new Map((await listarTudo<R>("/v2/step", {})).map((s) => [num(s.id)!, limpar(txt(s.name))]));
  cachePassos = { em: Date.now(), mapa };
  return mapa;
}

async function lerProjeto(codigo: number): Promise<R | null> {
  try {
    const r = await get<R & { rows?: R[] }>(`/v2/refurbish/${codigo}`, {});
    const p = Array.isArray(r.rows) ? r.rows[0] : r;
    return p && num(p.id) === codigo ? p : null;
  } catch (e) {
    if (e instanceof ErroVobi && e.status === 404) return null;
    throw e;
  }
}

export type ProjetoVobi = {
  codigo: number; nome: string; cliente: string; status: string; inicioPrevisto: string | null; criadoEm: string | null;
  noA360: boolean; elegivel: boolean; incorporado: boolean;
};

async function resumo(p: R, mapaPassos: Map<number, string>): Promise<ProjetoVobi> {
  const codigo = num(p.id)!;
  const noA360 = (await db.select({ c: schema.projetos.codigo }).from(schema.projetos).where(eq(schema.projetos.codigo, codigo))).length > 0;
  const incorporado = ((await db.execute(sql`select 1 from projeto_sob_demanda where codigo = ${codigo} and situacao = 'integrado' limit 1`)).rows.length) > 0;
  return {
    codigo, nome: limpar(txt(p.name)), cliente: limpar(txt(p.companyCustomer)),
    status: limpar(txt(p.activeStep)) || mapaPassos.get(num(p.idStep) ?? -1) || limpar(txt(p.status)) || "—",
    inicioPrevisto: dataInicioPrevisto(p.startDate), criadoEm: dataInicioPrevisto(p.creationDate ?? p.createdAt),
    noA360, elegivel: noA360 && (await projetoElegivel(codigo)), incorporado,
  };
}

/** Busca por número (leitura direta) ou por nome (listagem completa, inclusive arquivados, filtrada no A360). */
export async function buscarNoVobi(termo: string): Promise<{ resultados: ProjetoVobi[]; total: number; aviso?: string }> {
  const t = termo.trim();
  if (!t) return { resultados: [], total: 0 };
  const mapaPassos = await passos();
  if (/^\d+$/.test(t)) {
    const p = await lerProjeto(Number(t));
    return { resultados: p ? [await resumo(p, mapaPassos)] : [], total: p ? 1 : 0, aviso: p ? undefined : `Nenhum projeto com o número ${t} no Vobi.` };
  }
  if (!cacheLista || Date.now() - cacheLista.em > DEZ_MIN) {
    cacheLista = { em: Date.now(), projetos: await listarTudo<R>("/v2/refurbish", { "where[allSteps]": "true" }, undefined, 200) };
  }
  const k = chaveTexto(t);
  const achados = cacheLista.projetos.filter((p) => chaveTexto(txt(p.name)).includes(k));
  const resultados: ProjetoVobi[] = [];
  for (const p of achados.slice(0, 30)) resultados.push(await resumo(p, mapaPassos));
  return { resultados, total: achados.length, aviso: achados.length > 30 ? `${achados.length} projetos encontrados; mostrando os 30 primeiros — refine o nome ou use o número.` : undefined };
}

/** Lê tudo o que a incorporação gravaria (sem gravar). */
export async function previaProjeto(codigo: number) {
  const p = await lerProjeto(codigo);
  if (!p) return null;
  const mapaPassos = await passos();
  const info = await resumo(p, mapaPassos);
  const tarefas = (await listarTudo<R>("/v2/task", { "where[idRefurbish]": String(codigo) }, undefined, 500)).filter((x) => num(x.idRefurbish) === codigo);
  const etapas = (await listarTudo<R>("/v2/refurbish-step", { "where[idRefurbish]": String(codigo) }, undefined, 100)).filter((x) => num(x.idRefurbish) === codigo);
  const nomes = new Map(((await db.execute(sql`select id_vobi, nome from vobi_responsavel`)).rows as { id_vobi: number; nome: string }[]).map((x) => [Number(x.id_vobi), x.nome]));
  const { vobiParaUsuario } = await mapaResponsaveis();
  const resp = new Map<number, { id: number; nome: string | null; acesso: boolean; tarefas: number }>();
  let semResponsavel = 0, comData = 0;
  const porStatus: Record<string, number> = {};
  const ST: Record<number, string> = { 1: "Planejado", 2: "Em andamento", 4: "Concluído", 5: "Cancelado" };
  for (const x of tarefas) {
    if (x.startDate || x.endDate) comData++;
    const st = ST[num(x.status) ?? 1] ?? "Outro"; porStatus[st] = (porStatus[st] ?? 0) + 1;
    const r = num(x.idResponsible);
    if (r == null) { semResponsavel++; continue; }
    const a = resp.get(r) ?? { id: r, nome: nomes.get(r) ?? null, acesso: vobiParaUsuario.has(r), tarefas: 0 };
    a.tarefas++; resp.set(r, a);
  }
  return {
    info, bruto: p, tarefas, etapas,
    resumo: {
      tarefas: tarefas.length, comData, semData: tarefas.length - comData, porStatus, etapas: etapas.length,
      etapasNomes: [...etapas].sort((a, b) => (num(a.order) ?? 0) - (num(b.order) ?? 0)).map((e) => limpar(txt(e.name))),
      responsaveis: [...resp.values()].sort((a, b) => b.tarefas - a.tarefas), semResponsavel,
    },
  };
}

export type ResultadoIncorporacao = { ok: boolean; situacao: "integrado" | "ja_existia" | "falhou"; mensagem: string; codigo: number };

/** Incorpora o projeto ao A360 (projeto + espelho de etapas e tarefas) e registra o pedido. Só leitura no Vobi. */
export async function incorporarProjeto(codigo: number, usuarioId: number): Promise<ResultadoIncorporacao> {
  const registrar = async (situacao: ResultadoIncorporacao["situacao"], nome: string, detalhe: R) =>
    db.insert(schema.projetosSobDemanda).values({ codigo, nome: nome || `Projeto ${codigo}`, solicitadoPorId: usuarioId, situacao, detalhe });
  let nome = "";
  try {
    const jaIncorporado = ((await db.execute(sql`select 1 from projeto_sob_demanda where codigo = ${codigo} and situacao = 'integrado' limit 1`)).rows.length) > 0;
    const existente = (await db.select().from(schema.projetos).where(eq(schema.projetos.codigo, codigo)))[0];
    if (existente && (jaIncorporado || (await projetoElegivel(codigo)))) {
      await registrar("ja_existia", existente.nome, { motivo: jaIncorporado ? "já incorporado sob demanda" : "já está no recorte 2026" });
      return { ok: true, situacao: "ja_existia", codigo, mensagem: "O projeto já faz parte do A360 e da Agenda." };
    }
    const pv = await previaProjeto(codigo);
    if (!pv) {
      await registrar("falhou", "", { motivo: "projeto não encontrado no Vobi" });
      return { ok: false, situacao: "falhou", codigo, mensagem: `O Vobi não devolveu o projeto ${codigo}.` };
    }
    const p = pv.bruto, info = pv.info;
    nome = info.nome;
    let projetoInserido = false;
    if (!existente) {
      const ultima = (await db.select({ id: schema.cargas.id }).from(schema.cargas).where(eq(schema.cargas.status, "aceita")).orderBy(desc(schema.cargas.id)).limit(1))[0];
      if (!ultima) throw new Error("nenhuma carga aceita no A360 ainda");
      const idCli = num(p.idCompanyCustomer);
      const cli = idCli ? (await db.select().from(schema.clientesVobi).where(eq(schema.clientesVobi.codigo, idCli)))[0] : undefined;
      const status = info.status === "—" ? "" : info.status;
      await db.insert(schema.projetos).values({
        codigo, nome: info.nome, chaveNome: chaveTexto(info.nome), cliente: info.cliente || cli?.nome || null, status,
        statusClasse: STATUS_PROJETO_CLASSE[chaveTexto(status)] ?? "ativo", criadoEm: info.criadoEm, inicioPrevisto: info.inicioPrevisto,
        metragem: num(p.m2), etiquetas: [], colaboradores: [], primeiraCarga: ultima.id, ultimaCarga: ultima.id,
        ...(cli ? { clienteCodigo: cli.codigo, vinculoClienteStatus: "resolvido" } : {}),
      }).onConflictDoNothing();
      projetoInserido = true;
    } else if (info.inicioPrevisto !== existente.inicioPrevisto) {
      await db.update(schema.projetos).set({ inicioPrevisto: info.inicioPrevisto }).where(eq(schema.projetos.codigo, codigo));
    }
    // registra antes de gravar o espelho: o projeto passa a ser elegível (reconciliação e vínculo já o consideram)
    const [reg] = await db.insert(schema.projetosSobDemanda).values({
      codigo, nome: info.nome, solicitadoPorId: usuarioId, situacao: "integrado",
      detalhe: { statusVobi: info.status, inicioPrevisto: info.inicioPrevisto, criadoEm: info.criadoEm, projetoInserido, jaEstavaNoA360: !!existente, ...pv.resumo, responsaveis: pv.resumo.responsaveis.length },
    }).returning({ id: schema.projetosSobDemanda.id });
    try {
      const esp = await gravarEspelhoProjeto(codigo, pv.etapas, pv.tarefas);
      await db.execute(sql`update projeto_sob_demanda set detalhe = detalhe || ${JSON.stringify({ espelho: esp })}::jsonb where id = ${reg.id}`);
    } catch (e) {
      await db.update(schema.projetosSobDemanda).set({ situacao: "falhou", detalhe: { erro: (e as Error).message.slice(0, 300), projetoInserido } }).where(eq(schema.projetosSobDemanda.id, reg.id));
      throw e;
    }
    return { ok: true, situacao: "integrado", codigo, mensagem: `Projeto incorporado: ${pv.resumo.tarefas} tarefas (${pv.resumo.comData} com data) e ${pv.resumo.etapas} etapas.` };
  } catch (e) {
    const err = e as Error & { cause?: { message?: string } };
    const msg = (err.cause?.message ?? err.message).slice(0, 300);
    const jaRegistrado = ((await db.execute(sql`select 1 from projeto_sob_demanda where codigo = ${codigo} and solicitado_por_id = ${usuarioId} and solicitado_em > now() - interval '5 minutes' and situacao = 'falhou' limit 1`)).rows.length) > 0;
    if (!jaRegistrado) await registrar("falhou", nome, { erro: msg }).catch(() => {});
    return { ok: false, situacao: "falhou", codigo, mensagem: msg };
  }
}

/** Histórico de pedidos (mais recentes primeiro). */
export async function pedidosSobDemanda(limite = 30) {
  return (await db.execute(sql`select d.id, d.codigo, d.nome, d.situacao, d.solicitado_em, d.detalhe, u.nome usuario
    from projeto_sob_demanda d join usuario u on u.id = d.solicitado_por_id order by d.id desc limit ${limite}`)).rows as
    { id: number; codigo: number; nome: string; situacao: string; solicitado_em: string; detalhe: R; usuario: string }[];
}
