// Importador Vobi → Architecture 360 (somente leitura do Vobi).
// Porte da PoC (importador/importador.py) para o app. Seções 1.1–1.8 da especificação v2.0.
import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  LAYOUT_CLIENTES_A360, LAYOUT_CLIENTES_V1, LAYOUT_PROJETOS_V1, LAYOUT_TAREFAS_V1, LIMIAR_LINHAS_MINIMAS, LIMIAR_NAO_ENCONTRADOS,
  PESSOAS_SEMENTE, STATUS_PROJETO_CLASSE, chaveTexto, dataIso, etapaCanonica, extrairRevisao,
  horasParaMinutos, limpar, listaVirgula, metragemNum, similaridade,
} from "./normalizacao";

export type Tx = PgTransaction<NodePgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;
type Linha = Record<string, string>;

export type ArquivoLido = { linhas: Linha[]; hash: string; cabecalho: string[] };

export class LayoutInvalido extends Error {}

export type Relatorio = {
  status: "previa" | "aceita" | "retida";
  motivo?: string;
  dataCarga: string;
  avisosLayout: string[];
  // projetos/tarefas ausentes numa carga só de Clientes
  projetos?: { linhas: number; novos: number; alterados: number; naoEncontrados: number; porStatus: Record<string, number> };
  tarefas?: {
    linhas: number; novas: number; alteradas: number; naoEncontradas: number; orfas: number; colisoes: number;
    porStatus: Record<string, number>; qualidade: Record<string, number>;
  };
  possiveisRenomeacoes: { naoEncontrada: string; nova: string; similaridadeNome: number }[];
  pessoasNaoMapeadas: string[];
  etapasNaoMapeadas: Record<string, number>;
  alertasPorTipo: Record<string, number>;
  // Etapa 1 — presente quando a carga trouxe Clientes.csv
  clientes?: { linhas: number; novos: number; alterados: number; naoEncontrados: number; semCodigo: number; porTipo: Record<string, number>; porStatus: Record<string, number> };
  // Etapa 2 — recalculado em toda carga (projetos × clientes)
  vinculos?: RelatorioVinculos;
};
export type RelatorioVinculos = {
  resolvidos: number; ambiguos: number; semCliente: number; manuais: number; semNome: number; alterados: number;
  nomesAmbiguos: { nome: string; projetos: number; candidatos: number[] }[];
  nomesSemCorrespondencia: { nome: string; projetos: number }[];
  manuaisInvalidados: { projeto: number; motivo: string }[];
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

/**
 * Clientes: valida o cabeçalho completo do Vobi e devolve só as colunas autorizadas, já reserializadas em CSV.
 * O conteúdo guardado durante a prévia e a área de trabalho nunca contêm CPF/CNPJ, RG/IE, nascimento, endereço ou observações.
 */
export function lerClientes(buf: Buffer, nomeArquivo: string): { arq: ArquivoLido; csvAutorizado: Buffer } {
  const completo = lerCsv(buf, LAYOUT_CLIENTES_V1, nomeArquivo);
  const linhas = completo.linhas.map((r) => Object.fromEntries(LAYOUT_CLIENTES_A360.map((c) => [c, r[c] ?? ""])) as Linha);
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = [LAYOUT_CLIENTES_A360.map(esc).join(";"), ...linhas.map((r) => LAYOUT_CLIENTES_A360.map((c) => esc(r[c])).join(";"))].join("\n") + "\n";
  return { arq: { linhas, hash: completo.hash, cabecalho: LAYOUT_CLIENTES_A360 }, csvAutorizado: Buffer.from(csv, "utf8") };
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
  cargaId: number; dataCarga: string; projetos?: ArquivoLido; tarefas?: ArquivoLido; clientes?: ArquivoLido; modo: "previa" | "aplicar";
}): Promise<Relatorio> {
  const { cargaId, dataCarga, projetos, tarefas, clientes, modo } = opts;
  if (!clientes && !(projetos && tarefas)) throw new Error("carga sem arquivos: envie Projetos+Tarefas e/ou Clientes");
  try {
    return await db.transaction(async (tx) => {
      let rel: Relatorio = projetos && tarefas
        ? await processar(tx, cargaId, dataCarga, projetos, tarefas)
        : { status: "aceita", dataCarga, avisosLayout: [], possiveisRenomeacoes: [], pessoasNaoMapeadas: [], etapasNaoMapeadas: {}, alertasPorTipo: {} };
      if (clientes) rel = { ...rel, clientes: await processarClientes(tx, cargaId, clientes) };
      // Etapa 2: o vínculo projeto × cliente é recalculado em toda carga (decisões manuais preservadas enquanto o nome for compatível)
      rel.vinculos = await vincularClientes(tx, cargaId);
      rel.alertasPorTipo = await alertasPorTipo(tx, cargaId);
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
    .where(and(eq(schema.cargas.status, "aceita"), lt(schema.cargas.id, cargaId), isNotNull(schema.cargas.linhasTarefas)))
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
  const rel: Relatorio = {
    status: retida ? "retida" : "aceita", motivo: retida, dataCarga, avisosLayout: [...avisosLayout],
    projetos: { linhas: proj.linhas.length, novos: projNovos, alterados: projAlt, naoEncontrados: projNaoEnc, porStatus: await contar("projeto", "status") },
    tarefas: {
      linhas: tar.linhas.length, novas: tarNovas, alteradas: tarAlt, naoEncontradas: tarNaoEnc, orfas: tarOrfas, colisoes: tarColisoes,
      porStatus: await contar("tarefa", "status"), qualidade: await contar("tarefa", "classe_qualidade"),
    },
    possiveisRenomeacoes: sugestoes,
    pessoasNaoMapeadas: [...pessoas.entries()].filter(([, e]) => e == null).map(([k]) => k),
    etapasNaoMapeadas, alertasPorTipo: await alertasPorTipo(tx, cargaId),
  };
  return rel;
}

async function alertasPorTipo(tx: Tx, cargaId: number): Promise<Record<string, number>> {
  const rows = await tx.execute(sql`select tipo as k, count(*)::int as n from alerta where carga_id=${cargaId} group by 1`);
  const o: Record<string, number> = {};
  for (const r of rows.rows as { k: string; n: number }[]) o[r.k] = r.n;
  return o;
}

// ---------------------------------------------------------------------------
// Etapa 1 — Clientes do Vobi (chave = Código). Upsert; ausentes ficam "não encontrados", nunca são apagados.
// ---------------------------------------------------------------------------
async function processarClientes(tx: Tx, cargaId: number, cli: ArquivoLido): Promise<NonNullable<Relatorio["clientes"]>> {
  const alerta = (tipo: string, chave: string, detalhe: string) =>
    tx.insert(schema.alertas).values({ cargaId, tipo, entidade: "cliente", chave, detalhe });
  const atuais = new Map<number, typeof schema.clientesVobi.$inferSelect>();
  for (const c of await tx.select().from(schema.clientesVobi)) atuais.set(c.codigo, c);
  let novos = 0, alterados = 0, semCodigo = 0;
  const vistos = new Set<number>();
  const porTipo: Record<string, number> = {}, porStatus: Record<string, number> = {};
  for (const r of cli.linhas) {
    const codigo = parseInt(r["Código"], 10);
    if (!Number.isFinite(codigo)) { semCodigo++; await alerta("cliente_sem_codigo", r["Nome"] ?? "", "linha ignorada"); continue; }
    if (vistos.has(codigo)) { await alerta("cliente_codigo_repetido", String(codigo), "código repetido no CSV; primeira ocorrência mantida"); continue; }
    vistos.add(codigo);
    const nome = limpar(r["Nome"]);
    const novo = {
      nome, chaveNome: chaveTexto(nome), razaoSocial: limpar(r["Razão Social"]) || null, tipo: chaveTexto(r["Tipo"]) || null,
      status: limpar(r["Status"]) || null, email: limpar(r["Email"]).toLowerCase() || null, telefone: limpar(r["Telefone"]) || null,
      cidade: limpar(r["Cidade"]) || null, estado: limpar(r["Estado"]).toUpperCase() || null, criadoEmVobi: dataIso(r["Criado em"]),
    };
    porTipo[novo.tipo ?? "(vazio)"] = (porTipo[novo.tipo ?? "(vazio)"] ?? 0) + 1;
    porStatus[novo.status ?? "(vazio)"] = (porStatus[novo.status ?? "(vazio)"] ?? 0) + 1;
    const atual = atuais.get(codigo);
    if (!atual) {
      await tx.insert(schema.clientesVobi).values({ codigo, ...novo, origem: "vobi", primeiraCarga: cargaId, ultimaCarga: cargaId });
      novos++;
    } else {
      const mudou = await registrarDiferencas(tx, cargaId, "cliente", String(codigo), atual as unknown as Record<string, unknown>, novo,
        ["nome", "razaoSocial", "tipo", "status", "email", "telefone", "cidade", "estado", "criadoEmVobi"]);
      await tx.update(schema.clientesVobi).set({ ...novo, ultimaCarga: cargaId, naoEncontradoDesde: null, ...(mudou ? { atualizadoEm: new Date() } : {}) })
        .where(eq(schema.clientesVobi.codigo, codigo));
      if (mudou) alterados++;
    }
  }
  let naoEncontrados = 0;
  for (const c of await tx.select({ codigo: schema.clientesVobi.codigo }).from(schema.clientesVobi)
    .where(and(lt(schema.clientesVobi.ultimaCarga, cargaId), isNull(schema.clientesVobi.naoEncontradoDesde)))) {
    await tx.update(schema.clientesVobi).set({ naoEncontradoDesde: cargaId }).where(eq(schema.clientesVobi.codigo, c.codigo));
    await alerta("cliente_nao_encontrado", String(c.codigo), "ausente na exportação de clientes (mantido no A360)");
    naoEncontrados++;
  }
  // nomes repetidos no cadastro do Vobi (códigos diferentes): informativo — a resolução é da coordenação, nunca automática
  const dup = await tx.execute(sql`select chave_nome, array_agg(codigo order by codigo) codigos from cliente_vobi where nao_encontrado_desde is null group by 1 having count(*)>1`);
  for (const d of dup.rows as { chave_nome: string; codigos: number[] }[]) {
    await alerta("cliente_nome_duplicado", d.chave_nome, "códigos: " + d.codigos.join(","));
  }
  return { linhas: cli.linhas.length, novos, alterados, naoEncontrados, semCodigo, porTipo, porStatus };
}

// ---------------------------------------------------------------------------
// Etapa 2 — vínculo projeto → cliente pelo nome normalizado ("cliente (nome)" do CSV de Projetos).
// 1 candidato → resolvido · >1 → ambiguo (fila da coordenação) · 0 ou vazio → sem_cliente.
// Decisão manual prevalece enquanto o nome do cliente no projeto for o mesmo da decisão.
// ---------------------------------------------------------------------------
export async function vincularClientes(tx: Tx, cargaId: number): Promise<RelatorioVinculos> {
  const alerta = (tipo: string, chave: string, detalhe: string) =>
    tx.insert(schema.alertas).values({ cargaId, tipo, entidade: "vinculo_cliente", chave, detalhe });
  const porChave = new Map<string, number[]>();
  for (const c of await tx.select({ codigo: schema.clientesVobi.codigo, chaveNome: schema.clientesVobi.chaveNome }).from(schema.clientesVobi)) {
    const lst = porChave.get(c.chaveNome) ?? []; lst.push(c.codigo); porChave.set(c.chaveNome, lst);
  }
  const manuais = new Map<number, typeof schema.vinculosClienteManual.$inferSelect>();
  for (const m of await tx.select().from(schema.vinculosClienteManual)) manuais.set(m.projetoCodigo, m);

  const rel: RelatorioVinculos = { resolvidos: 0, ambiguos: 0, semCliente: 0, manuais: 0, semNome: 0, alterados: 0, nomesAmbiguos: [], nomesSemCorrespondencia: [], manuaisInvalidados: [] };
  const ambiguos = new Map<string, { nome: string; projetos: number; candidatos: number[] }>();
  const semCorr = new Map<string, { nome: string; projetos: number }>();
  const projetos = await tx.select({ codigo: schema.projetos.codigo, cliente: schema.projetos.cliente, clienteCodigo: schema.projetos.clienteCodigo, st: schema.projetos.vinculoClienteStatus })
    .from(schema.projetos);
  for (const p of projetos) {
    const nome = limpar(p.cliente);
    const chave = chaveTexto(nome);
    let clienteCodigo: number | null = null;
    let status: string;
    const manual = manuais.get(p.codigo);
    if (manual && manual.chaveNomeCsv === chave && porChave.size) {
      clienteCodigo = manual.clienteCodigo; status = "manual"; rel.manuais++;
    } else {
      if (manual && porChave.size) {
        rel.manuaisInvalidados.push({ projeto: p.codigo, motivo: `nome do cliente no projeto mudou ('${manual.chaveNomeCsv}' → '${chave}')` });
        await alerta("vinculo_manual_invalidado", String(p.codigo), `decisão manual não aplicada: nome mudou de '${manual.chaveNomeCsv}' para '${chave}'`);
      }
      if (!chave) { status = "sem_cliente"; rel.semNome++; rel.semCliente++; }
      else {
        const cand = porChave.get(chave) ?? [];
        if (cand.length === 1) { clienteCodigo = cand[0]; status = "resolvido"; rel.resolvidos++; }
        else if (cand.length > 1) {
          status = "ambiguo"; rel.ambiguos++;
          const a = ambiguos.get(chave) ?? { nome, projetos: 0, candidatos: cand }; a.projetos++; ambiguos.set(chave, a);
        } else {
          status = "sem_cliente"; rel.semCliente++;
          const s = semCorr.get(chave) ?? { nome, projetos: 0 }; s.projetos++; semCorr.set(chave, s);
        }
      }
    }
    if (p.clienteCodigo !== clienteCodigo || p.st !== status) {
      await registrarDiferencas(tx, cargaId, "projeto", String(p.codigo), { clienteCodigo: p.clienteCodigo, vinculoClienteStatus: p.st },
        { clienteCodigo, vinculoClienteStatus: status }, ["clienteCodigo", "vinculoClienteStatus"]);
      await tx.update(schema.projetos).set({ clienteCodigo, vinculoClienteStatus: status }).where(eq(schema.projetos.codigo, p.codigo));
      rel.alterados++;
    }
  }
  for (const a of ambiguos.values()) await alerta("cliente_ambiguo", a.nome, `${a.projetos} projeto(s); candidatos: ${a.candidatos.join(",")} — decisão da coordenação em /clientes`);
  if (porChave.size) for (const s of semCorr.values()) await alerta("cliente_sem_correspondencia", s.nome, `${s.projetos} projeto(s) com nome de cliente sem cadastro correspondente`);
  rel.nomesAmbiguos = [...ambiguos.values()].sort((a, b) => b.projetos - a.projetos);
  rel.nomesSemCorrespondencia = [...semCorr.values()].sort((a, b) => b.projetos - a.projetos);
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
  // listas (colaboradores, etiquetas) comparadas sem ordem: o Vobi exporta a mesma lista em ordens diferentes entre exportações
  const norm = (v: unknown) => (v == null ? "" : Array.isArray(v) ? JSON.stringify([...v].sort()) : typeof v === "object" ? JSON.stringify(v) : String(v));
  for (const c of campos) {
    const a = norm(atual[c]), n = norm(novo[c]);
    if (a !== n) {
      await tx.insert(schema.historicoAlteracoes).values({ cargaId, entidade, chave, campo: c, valorAnterior: a || null, valorNovo: n || null });
      mudou = true;
    }
  }
  return mudou;
}

export const layouts = { projetos: LAYOUT_PROJETOS_V1, tarefas: LAYOUT_TAREFAS_V1, clientes: LAYOUT_CLIENTES_V1, clientesA360: LAYOUT_CLIENTES_A360 };
