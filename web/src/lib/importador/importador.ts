// Importador Vobi → Architecture 360 (somente leitura do Vobi).
// Porte da PoC (importador/importador.py) para o app. Seções 1.1–1.8 da especificação v2.0.
import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  LAYOUT_PROJETOS_V1, LAYOUT_TAREFAS_V1, LIMIAR_LINHAS_MINIMAS, LIMIAR_NAO_ENCONTRADOS,
  PESSOAS_SEMENTE, STATUS_PROJETO_CLASSE, chaveTexto, dataIso, etapaCanonica, extrairRevisao,
  horasParaMinutos, limpar, listaVirgula, metragemNum, similaridade,
} from "./normalizacao";

type Tx = PgTransaction<NodePgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;
type Linha = Record<string, string>;

export type ArquivoLido = { linhas: Linha[]; hash: string; cabecalho: string[] };

export class LayoutInvalido extends Error {}

export type Relatorio = {
  status: "previa" | "aceita" | "retida";
  motivo?: string;
  dataCarga: string;
  avisosLayout: string[];
  projetos: { linhas: number; novos: number; alterados: number; naoEncontrados: number; porStatus: Record<string, number> };
  tarefas: {
    linhas: number; novas: number; alteradas: number; naoEncontradas: number; orfas: number; colisoes: number;
    porStatus: Record<string, number>; qualidade: Record<string, number>;
  };
  possiveisRenomeacoes: { naoEncontrada: string; nova: string; similaridadeNome: number }[];
  pessoasNaoMapeadas: string[];
  etapasNaoMapeadas: Record<string, number>;
  alertasPorTipo: Record<string, number>;
};

// ---------------------------------------------------------------------------
// Leitura e validação (etapas 1–2)
// ---------------------------------------------------------------------------
export function lerCsv(buf: Buffer, layout: string[], nomeArquivo: string): ArquivoLido {
  const hash = createHash("sha256").update(buf).digest("hex");
  let texto = buf.toString("utf8");
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  const registros = parse(texto, {
    delimiter: ";", quote: '"', relax_quotes: true, relax_column_count: true, bom: true, skip_empty_lines: false,
  }) as string[][];
  if (!registros.length) throw new LayoutInvalido(`${nomeArquivo}: arquivo vazio`);
  const cabecalho = registros[0].map((c) => c.trim());
  if (cabecalho.length !== layout.length || cabecalho.some((c, i) => c !== layout[i])) {
    throw new LayoutInvalido(
      `${nomeArquivo}: cabeçalho diferente do layout v1. Esperado: ${layout.join(" | ")}. Recebido: ${cabecalho.join(" | ")}`,
    );
  }
  const linhas: Linha[] = [];
  for (const r of registros.slice(1)) {
    if (r.length === 1 && r[0] === "") continue; // linha em branco no fim
    const o: Linha = {};
    layout.forEach((c, i) => (o[c] = r[i] ?? ""));
    linhas.push(o);
  }
  return { linhas, hash, cabecalho };
}

// ---------------------------------------------------------------------------
// Execução (etapas 3–8). `modo: "previa"` executa tudo e desfaz; `"aplicar"` grava.
// ---------------------------------------------------------------------------
class DesfazerPrevia extends Error {
  constructor(public relatorio: Relatorio) { super("previa"); }
}
class CargaRetida extends Error {
  constructor(public relatorio: Relatorio) { super("retida"); }
}

export async function executarCarga(opts: {
  cargaId: number; dataCarga: string; projetos: ArquivoLido; tarefas: ArquivoLido; modo: "previa" | "aplicar";
}): Promise<Relatorio> {
  const { cargaId, dataCarga, projetos, tarefas, modo } = opts;
  try {
    return await db.transaction(async (tx) => {
      const rel = await processar(tx, cargaId, dataCarga, projetos, tarefas);
      if (rel.status === "retida") throw new CargaRetida(rel);
      if (modo === "previa") throw new DesfazerPrevia(rel);
      return rel;
    });
  } catch (e) {
    if (e instanceof DesfazerPrevia) return { ...e.relatorio, status: "previa" };
    if (e instanceof CargaRetida) return e.relatorio;
    throw e;
  }
}

async function garantirSemente(tx: Tx) {
  for (const [nome, email] of Object.entries(PESSOAS_SEMENTE)) {
    await tx.insert(schema.pessoasVobi)
      .values({ nomeVobi: nome, chaveNome: chaveTexto(nome), emailRucelle: email, origem: "semente" })
      .onConflictDoNothing();
  }
}

async function processar(tx: Tx, cargaId: number, dataCarga: string, proj: ArquivoLido, tar: ArquivoLido): Promise<Relatorio> {
  await garantirSemente(tx);
  const avisosLayout = new Set<string>();
  const alerta = (tipo: string, entidade: string, chave: string, detalhe: string) =>
    tx.insert(schema.alertas).values({ cargaId, tipo, entidade, chave, detalhe });

  const anterior = (await tx.select().from(schema.cargas)
    .where(and(eq(schema.cargas.status, "aceita"), lt(schema.cargas.id, cargaId)))
    .orderBy(sql`${schema.cargas.id} desc`).limit(1))[0];

  // 3. área bruta
  if (proj.linhas.length) {
    await tx.insert(schema.brutoProjetos).values(proj.linhas.map((r, i) => ({ cargaId, linha: i + 2, dados: r })));
  }
  if (tar.linhas.length) {
    await tx.insert(schema.brutoTarefas).values(tar.linhas.map((r, i) => ({ cargaId, linha: i + 2, dados: r })));
  }

  // pessoas: cache em memória dentro da transação
  const pessoas = new Map<string, string | null>();
  for (const p of await tx.select().from(schema.pessoasVobi)) pessoas.set(p.chaveNome, p.emailRucelle);
  const garantirPessoa = async (nome: string): Promise<string | null> => {
    const k = chaveTexto(nome);
    if (pessoas.has(k)) return pessoas.get(k)!;
    await tx.insert(schema.pessoasVobi).values({ nomeVobi: nome, chaveNome: k, emailRucelle: null, origem: "nao_mapeada" }).onConflictDoNothing();
    pessoas.set(k, null);
    await alerta("pessoa_nao_mapeada", "pessoa", nome, "sem e-mail; mapear manualmente");
    return null;
  };

  // ---------------- Projetos (seção 1.2) ----------------
  const projAtuais = new Map<number, typeof schema.projetos.$inferSelect>();
  for (const p of await tx.select().from(schema.projetos)) projAtuais.set(p.codigo, p);
  let projNovos = 0, projAlt = 0;
  const porNome = new Map<string, { codigo: number; statusClasse: string }[]>();
  const codigosCarga = new Set<number>();
  for (const r of proj.linhas) {
    const codigo = parseInt(r["Código"], 10);
    if (!Number.isFinite(codigo)) { await alerta("projeto_sem_codigo", "projeto", r["Nome"] ?? "", "linha ignorada"); continue; }
    const status = limpar(r["Status"]);
    const novo = {
      nome: limpar(r["Nome"]), chaveNome: chaveTexto(r["Nome"]), cliente: limpar(r["cliente (nome)"]), status,
      statusClasse: STATUS_PROJETO_CLASSE[chaveTexto(status)] ?? "ativo",
      criadoEm: dataIso(r["Criado em"]), metragem: metragemNum(r["Metragem"]),
      etiquetas: r["Etiqueta"].split(",").map(limpar).filter(Boolean),
      colaboradores: listaVirgula(r["Colaboradores"]),
    };
    for (const c of novo.colaboradores) await garantirPessoa(c);
    codigosCarga.add(codigo);
    const lst = porNome.get(novo.chaveNome) ?? [];
    lst.push({ codigo, statusClasse: novo.statusClasse });
    porNome.set(novo.chaveNome, lst);
    const atual = projAtuais.get(codigo);
    if (!atual) {
      await tx.insert(schema.projetos).values({ codigo, ...novo, primeiraCarga: cargaId, ultimaCarga: cargaId });
      projNovos++;
    } else {
      const mudou = await registrarDiferencas(tx, cargaId, "projeto", String(codigo), atual as unknown as Record<string, unknown>, novo,
        ["nome", "cliente", "status", "statusClasse", "metragem", "etiquetas", "colaboradores"]);
      await tx.update(schema.projetos).set({ ...novo, ultimaCarga: cargaId, naoEncontradoDesde: null }).where(eq(schema.projetos.codigo, codigo));
      if (mudou) projAlt++;
    }
  }
  let projNaoEnc = 0;
  for (const p of await tx.select({ codigo: schema.projetos.codigo }).from(schema.projetos)
    .where(and(lt(schema.projetos.ultimaCarga, cargaId), isNull(schema.projetos.naoEncontradoDesde)))) {
    await tx.update(schema.projetos).set({ naoEncontradoDesde: cargaId }).where(eq(schema.projetos.codigo, p.codigo));
    await alerta("projeto_nao_encontrado", "projeto", String(p.codigo), "ausente na exportação");
    projNaoEnc++;
  }
  // resolução nome → código (prefere o ativo; >1 ativo = colisão)
  const resolve = new Map<string, number | null>();
  for (const [k, lst] of porNome) {
    const ativos = lst.filter((p) => p.statusClasse !== "encerrado");
    if (ativos.length === 1) resolve.set(k, ativos[0].codigo);
    else if (ativos.length === 0 && lst.length === 1) resolve.set(k, lst[0].codigo);
    else if (ativos.length > 1) {
      resolve.set(k, null);
      await alerta("projeto_nome_duplicado_ativo", "projeto", k, "códigos: " + ativos.map((p) => p.codigo).join(","));
    } else resolve.set(k, Math.max(...lst.map((p) => p.codigo)));
  }
  const statusClassePorCodigo = new Map<number, string>();
  for (const lst of porNome.values()) for (const p of lst) statusClassePorCodigo.set(p.codigo, p.statusClasse);

  // ---------------- Tarefas (seção 1.3) ----------------
  const tarAtuais = new Map<string, typeof schema.tarefas.$inferSelect>();
  for (const t of await tx.select().from(schema.tarefas)) tarAtuais.set(t.chave, t);
  let tarNovas = 0, tarAlt = 0, tarOrfas = 0, tarColisoes = 0;
  const ocorr = new Map<string, number>();
  const novasNesta = new Map<string, typeof schema.tarefas.$inferInsert>();
  const etapasNaoMapeadas: Record<string, number> = {};
  for (const r of tar.linhas) {
    if (!Object.values(r).some((v) => limpar(v))) { await alerta("linha_vazia", "tarefa", "", "linha totalmente vazia; só na área bruta"); continue; }
    const nome = limpar(r["Nome da tarefa"]);
    const nomeProj = limpar(r["Projeto"]);
    const codigo = nomeProj ? (resolve.get(chaveTexto(nomeProj)) ?? null) : null;
    const { etapa: etapaC, conhecida } = etapaCanonica(r["Etapa"]);
    if (!conhecida) {
      etapasNaoMapeadas[limpar(r["Etapa"])] = (etapasNaoMapeadas[limpar(r["Etapa"])] ?? 0) + 1;
      await alerta("etapa_a_classificar", "tarefa", nome, `etapa '${limpar(r["Etapa"])}'`);
    }
    const trio = `${codigo ?? "?" + chaveTexto(nomeProj)}|${chaveTexto(etapaC)}|${chaveTexto(nome)}`;
    const n = (ocorr.get(trio) ?? 0) + 1;
    ocorr.set(trio, n);
    const chave = `${trio}|${n}`;
    if (n > 1) { tarColisoes++; await alerta("colisao_chave_tarefa", "tarefa", chave, "mesmo projeto+etapa+nome; distinguida por ocorrência"); }
    const est = horasParaMinutos(r["Horas estimadas"]);
    const rea = horasParaMinutos(r["Horas realizadas (em minutos)"]);
    for (const av of [est.aviso, rea.aviso]) if (av) avisosLayout.add(av);
    const respNome = limpar(r["Responsável"]);
    const respEmail = respNome ? await garantirPessoa(respNome) : null;
    const di = dataIso(r["Data de Início"]), df = dataIso(r["Data de Fim"]);
    const orfa = codigo == null;
    if (orfa) { tarOrfas++; await alerta("tarefa_orfa", "tarefa", chave, `projeto '${nomeProj || "(vazio)"}' não resolvido`); }
    const statusT = chaveTexto(r["Status"]);
    const novo: typeof schema.tarefas.$inferInsert = {
      chave, projetoCodigo: codigo, projetoNomeCsv: nomeProj, etapaCsv: limpar(r["Etapa"]), etapaCanonica: etapaC,
      etapaConhecida: conhecida, nome, nomeChave: chaveTexto(nome), ocorrencia: n, revisao: extrairRevisao(nome),
      status: statusT, prioridade: chaveTexto(r["prioridade"]), dataInicio: di, dataFim: df,
      horasEstimadasMin: est.minutos, horasRealizadasMin: rea.minutos,
      responsavelNome: respNome || null, responsavelEmail: respEmail,
      semResponsavel: !respEmail, semInicio: di == null, semFim: df == null, orfa, colisao: n > 1,
      classeQualidade: "", primeiraCarga: cargaId, ultimaCarga: cargaId,
    };
    novo.classeQualidade = classeQualidade(novo);
    const atual = tarAtuais.get(chave);
    if (!atual) {
      await tx.insert(schema.tarefas).values(novo);
      novasNesta.set(chave, novo);
      tarNovas++;
    } else {
      const mudou = await registrarDiferencas(tx, cargaId, "tarefa", chave, atual as unknown as Record<string, unknown>,
        novo as unknown as Record<string, unknown>,
        ["status", "dataInicio", "dataFim", "responsavelNome", "horasEstimadasMin", "horasRealizadasMin", "prioridade", "etapaCanonica"]);
      const { primeiraCarga: _p, ...semPrimeira } = novo; void _p;
      await tx.update(schema.tarefas).set({ ...semPrimeira, naoEncontradoDesde: null, motivoNaoEncontrado: null }).where(eq(schema.tarefas.chave, chave));
      if (mudou) tarAlt++;
    }
  }

  // não encontradas + sugestão de renomeação um-para-um (seção 1.8)
  let tarNaoEnc = 0;
  const sugestoes: Relatorio["possiveisRenomeacoes"] = [];
  const usadas = new Set<string>();
  const naoEncontradas = await tx.select().from(schema.tarefas)
    .where(and(lt(schema.tarefas.ultimaCarga, cargaId), isNull(schema.tarefas.naoEncontradoDesde)));
  for (const t of naoEncontradas) {
    const classe = t.projetoCodigo != null ? statusClassePorCodigo.get(t.projetoCodigo) ?? projAtuais.get(t.projetoCodigo)?.statusClasse : undefined;
    const motivo = classe === "encerrado" ? "projeto encerrado" : "possível exclusão ou renomeação";
    await tx.update(schema.tarefas).set({ naoEncontradoDesde: cargaId, motivoNaoEncontrado: motivo }).where(eq(schema.tarefas.chave, t.chave));
    tarNaoEnc++;
    if (motivo !== "projeto encerrado") {
      let melhor: string | null = null, melhorSim = 0;
      for (const [k, v] of novasNesta) {
        if (usadas.has(k)) continue;
        if (v.projetoCodigo === t.projetoCodigo && v.etapaCanonica === t.etapaCanonica && v.dataInicio === t.dataInicio
          && v.dataFim === t.dataFim && v.responsavelNome === t.responsavelNome && v.horasRealizadasMin === t.horasRealizadasMin) {
          const sim = similaridade(t.nomeChave, v.nomeChave);
          if (sim > melhorSim) { melhor = k; melhorSim = sim; }
        }
      }
      if (melhor && melhorSim >= 0.6) {
        usadas.add(melhor);
        sugestoes.push({ naoEncontrada: t.chave, nova: melhor, similaridadeNome: Math.round(melhorSim * 100) / 100 });
        await alerta("possivel_renomeacao", "tarefa", t.chave, `candidata: ${melhor}`);
      }
    }
    await alerta("tarefa_nao_encontrada", "tarefa", t.chave, motivo);
  }

  // carga anômala
  let retida: string | undefined;
  if (anterior) {
    const totalAnt = anterior.linhasTarefas ?? 0;
    const fracNe = totalAnt ? tarNaoEnc / totalAnt : 0;
    const fracLinhas = totalAnt ? tar.linhas.length / totalAnt : 1;
    if (fracNe > LIMIAR_NAO_ENCONTRADOS) retida = `não encontrados ${Math.round(fracNe * 100)}% > ${LIMIAR_NAO_ENCONTRADOS * 100}% (provável exportação filtrada)`;
    else if (fracLinhas < LIMIAR_LINHAS_MINIMAS) retida = `linhas ${Math.round(fracLinhas * 100)}% da carga anterior < ${LIMIAR_LINHAS_MINIMAS * 100}%`;
  }

  const contar = async (tabela: "projeto" | "tarefa", coluna: string) => {
    const rows = await tx.execute(sql.raw(`select ${coluna} as k, count(*)::int as n from ${tabela} where ultima_carga=${cargaId} group by 1`));
    const o: Record<string, number> = {};
    for (const r of rows.rows as { k: string; n: number }[]) o[r.k ?? "(vazio)"] = r.n;
    return o;
  };
  const alertasRows = await tx.execute(sql`select tipo as k, count(*)::int as n from alerta where carga_id=${cargaId} group by 1`);
  const alertasPorTipo: Record<string, number> = {};
  for (const r of alertasRows.rows as { k: string; n: number }[]) alertasPorTipo[r.k] = r.n;

  const rel: Relatorio = {
    status: retida ? "retida" : "aceita", motivo: retida, dataCarga, avisosLayout: [...avisosLayout],
    projetos: { linhas: proj.linhas.length, novos: projNovos, alterados: projAlt, naoEncontrados: projNaoEnc, porStatus: await contar("projeto", "status") },
    tarefas: {
      linhas: tar.linhas.length, novas: tarNovas, alteradas: tarAlt, naoEncontradas: tarNaoEnc, orfas: tarOrfas, colisoes: tarColisoes,
      porStatus: await contar("tarefa", "status"), qualidade: await contar("tarefa", "classe_qualidade"),
    },
    possiveisRenomeacoes: sugestoes,
    pessoasNaoMapeadas: [...pessoas.entries()].filter(([, e]) => e == null).map(([k]) => k),
    etapasNaoMapeadas, alertasPorTipo,
  };
  return rel;
}

export function classeQualidade(t: { orfa?: boolean | null; status?: string | null; semResponsavel?: boolean | null; semFim?: boolean | null; semInicio?: boolean | null }): string {
  if (t.orfa) return "orfa";
  if (t.status === "cancelado") return "encerrada";
  if (t.semResponsavel) return "incompleta_sem_responsavel";
  if (t.semFim) return "incompleta_sem_prazo";
  if (t.semInicio) return "incompleta_sem_inicio";
  return "completa";
}

async function registrarDiferencas(tx: Tx, cargaId: number, entidade: string, chave: string,
  atual: Record<string, unknown>, novo: Record<string, unknown>, campos: string[]): Promise<boolean> {
  let mudou = false;
  const norm = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  for (const c of campos) {
    const a = norm(atual[c]), n = norm(novo[c]);
    if (a !== n) {
      await tx.insert(schema.historicoAlteracoes).values({ cargaId, entidade, chave, campo: c, valorAnterior: a || null, valorNovo: n || null });
      mudou = true;
    }
  }
  return mudou;
}

export const layouts = { projetos: LAYOUT_PROJETOS_V1, tarefas: LAYOUT_TAREFAS_V1 };
