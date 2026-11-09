// Provedor de IA (T-188 evolução). Anthropic Messages API via fetch quando ANTHROPIC_API_KEY existe; senão, extração por
// regras (claramente marcada como "regras" e "confirmar"). A IA nunca inventa: o prompt exige referência ao trecho e
// classificação de confiabilidade; o resultado é validado antes de entrar no banco. Nenhum conteúdo de transcrição vai para logs.
import { falas } from "./extrair";
import type { AtaEstruturada, Confianca, ItemAta } from "./tipos";

export const MODELO_PADRAO = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5"; // ajustável por variável; se o modelo não existir, o erro aparece na tela e no histórico
const API = "https://api.anthropic.com/v1/messages";
export type Provedor = "anthropic" | "regras";

export class ErroIA extends Error { constructor(public codigo: "sem_chave" | "http" | "formato" | "rede", msg: string) { super(msg); } }

// Preços públicos (platform.claude.com/docs/en/models/overview, consultado em 09/11/2026), US$ por milhão de tokens [entrada, saída].
// Haiku aparece como "a partir de"; valor aproximado. Modelo fora da tabela → custo não estimado (null).
export const PRECOS_USD_MTOK: Record<string, [number, number]> = { "claude-sonnet-5-5": [2, 10], "claude-opus-5-5": [4, 20], "claude-fable-5-2": [8, 40], "claude-haiku-5-5": [0.1, 0.5] };
export function custoEstimado(modelo: string | null, entrada: number | null, saida: number | null): number | null {
  const p = modelo ? PRECOS_USD_MTOK[modelo] : undefined; if (!p || entrada == null || saida == null) return null;
  return Math.round(((entrada * p[0] + saida * p[1]) / 1_000_000) * 1_000_000) / 1_000_000;
}
/** Limites de consumo (T-188): texto máximo enviado à IA e teto diário estimado (variável IA_LIMITE_DIARIO_USD, padrão 10). */
export const LIMITE_CHARS_IA = 300_000;
export const limiteDiarioUsd = () => { const v = Number(process.env.IA_LIMITE_DIARIO_USD); return Number.isFinite(v) && v > 0 ? v : 10; };

export type Uso = { modelo: string; tokensEntrada: number | null; tokensSaida: number | null; custoUsd: number | null; duracaoMs: number; httpStatus: number; modeloRetornado: string | null };
export type Chamada = { texto: string; uso: Uso };
let ultimoUso: Uso | null = null;
/** Uso da última chamada bem-sucedida neste processo (para quem registra o processamento). */
export const consumirUltimoUso = () => { const u = ultimoUso; ultimoUso = null; return u; };

const cabecalhos = (key: string) => ({ "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" });

async function chamarAnthropic(system: string, user: string, maxTokens = 8000): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new ErroIA("sem_chave", "ANTHROPIC_API_KEY não configurada");
  const t0 = Date.now();
  let r: Response;
  try {
    r = await fetch(API, { method: "POST", headers: cabecalhos(key), body: JSON.stringify({ model: MODELO_PADRAO, max_tokens: maxTokens, temperature: 0, system, messages: [{ role: "user", content: user }] }) });
  } catch (e) { throw new ErroIA("rede", e instanceof Error ? e.message.replace(key, "***").slice(0, 120) : "falha de rede"); }
  if (!r.ok) { let m = `HTTP ${r.status}`; try { m += ` ${String((await r.json()).error?.message ?? "").replace(key, "***").slice(0, 160)}`; } catch { /* sem corpo */ } throw new ErroIA("http", m); }
  const j = (await r.json()) as { model?: string; usage?: { input_tokens?: number; output_tokens?: number }; content?: { type: string; text?: string }[] };
  const te = j.usage?.input_tokens ?? null, ts = j.usage?.output_tokens ?? null;
  ultimoUso = { modelo: MODELO_PADRAO, tokensEntrada: te, tokensSaida: ts, custoUsd: custoEstimado(MODELO_PADRAO, te, ts), duracaoMs: Date.now() - t0, httpStatus: r.status, modeloRetornado: j.model ?? null };
  return (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
}

/** Lista os modelos disponíveis para a chave (GET /v1/models). Devolve ids e se o modelo configurado está entre eles. */
export async function verificarModelo(): Promise<{ httpStatus: number; duracaoMs: number; modelos: string[]; disponivel: boolean; modelo: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new ErroIA("sem_chave", "ANTHROPIC_API_KEY não configurada");
  const t0 = Date.now();
  const r = await fetch("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
  if (!r.ok) { let m = `HTTP ${r.status}`; try { m += ` ${String((await r.json()).error?.message ?? "").replace(key, "***").slice(0, 160)}`; } catch { /* sem corpo */ } throw new ErroIA("http", m); }
  const j = (await r.json()) as { data?: { id: string }[] };
  const modelos = (j.data ?? []).map((m) => m.id);
  return { httpStatus: r.status, duracaoMs: Date.now() - t0, modelos, disponivel: modelos.includes(MODELO_PADRAO), modelo: MODELO_PADRAO };
}

function extrairJson(s: string): unknown {
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < 0) throw new ErroIA("formato", "resposta sem JSON");
  try { return JSON.parse(s.slice(a, b + 1)); } catch { throw new ErroIA("formato", "JSON inválido na resposta"); }
}

const CONF: Confianca[] = ["mencionado", "sintese", "inferencia", "confirmar", "nao_identificado"];
function item(x: unknown): ItemAta | null {
  if (!x || typeof x !== "object") return null; const o = x as Record<string, unknown>;
  const texto = String(o.texto ?? "").trim(); if (!texto) return null;
  const c = CONF.includes(o.confianca as Confianca) ? (o.confianca as Confianca) : "confirmar";
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null);
  const prazo = str(o.prazo); return { texto: texto.slice(0, 1500), confianca: c, trecho: str(o.trecho), tempo: str(o.tempo), responsavel: str(o.responsavel), prazo: prazo && /^\d{4}-\d{2}-\d{2}$/.test(prazo) ? prazo : prazo };
}
function lista(x: unknown): ItemAta[] { return Array.isArray(x) ? x.map(item).filter((i): i is ItemAta => !!i).slice(0, 60) : []; }

/** Valida e normaliza a ata estruturada devolvida pela IA (nada entra sem passar por aqui). */
export function validarAta(x: unknown): AtaEstruturada {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  return {
    resumo: String(o.resumo ?? "").trim().slice(0, 4000),
    participantes: Array.isArray(o.participantes) ? o.participantes.map((p) => (p && typeof p === "object" ? { nome: String((p as Record<string, unknown>).nome ?? "").trim().slice(0, 120), confianca: CONF.includes((p as Record<string, unknown>).confianca as Confianca) ? ((p as Record<string, unknown>).confianca as Confianca) : "confirmar" } : null)).filter((p): p is { nome: string; confianca: Confianca } => !!p && !!p.nome).slice(0, 40) : [],
    assuntos: lista(o.assuntos), problemas: lista(o.problemas), decisoes: lista(o.decisoes), aprovacoes: lista(o.aprovacoes), encaminhamentos: lista(o.encaminhamentos),
    pendencias: lista(o.pendencias), duvidas: lista(o.duvidas), divergencias: lista(o.divergencias), relacoesAnteriores: lista(o.relacoesAnteriores),
    naoIdentificado: Array.isArray(o.naoIdentificado) ? o.naoIdentificado.map(String).slice(0, 20) : [],
    observacoes: typeof o.observacoes === "string" ? o.observacoes.slice(0, 1000) : null,
  };
}

const SYSTEM_ATA = `Você gera atas estruturadas de reuniões de um escritório de arquitetura de academias (Rucelle) a partir da transcrição literal.
Regras invioláveis:
1. Nunca invente. Só registre o que está na transcrição. Se algo não aparece, deixe a lista vazia e cite em "naoIdentificado".
2. Classifique cada item em "confianca": "mencionado" (dito expressamente), "sintese" (resumo de vários trechos), "inferencia" (interpretação sua), "confirmar" (ambíguo; precisa de confirmação humana).
3. Em decisões, aprovações e encaminhamentos, copie o trecho original em "trecho" e a marcação de tempo em "tempo" quando existir.
4. Nunca atribua responsável por suposição: só preencha "responsavel" se a pessoa foi nomeada; prazo só se foi dito (formato AAAA-MM-DD quando a data for explícita; senão a expressão literal, ex.: "próxima semana").
5. Não julgue pessoas nem desempenho. Não use nomes que não estejam na transcrição.
6. Responda SOMENTE com um JSON válido, sem comentários, no formato:
{"resumo":string,"participantes":[{"nome":string,"confianca":string}],"assuntos":[item],"problemas":[item],"decisoes":[item],"aprovacoes":[item],"encaminhamentos":[item],"pendencias":[item],"duvidas":[item],"divergencias":[item],"relacoesAnteriores":[item],"naoIdentificado":[string],"observacoes":string|null}
onde item = {"texto":string,"confianca":string,"trecho":string|null,"tempo":string|null,"responsavel":string|null,"prazo":string|null}.
Escreva em português do Brasil.`;

export async function gerarAta(transcricao: string, contexto: { titulo: string; projeto: string | null; cliente: string | null; data: string; participantesConhecidos: string[]; reunioesAnteriores: { data: string; titulo: string; decisoes: string[] }[] }): Promise<{ ata: AtaEstruturada; provedor: Provedor; modelo: string | null }> {
  if (transcricao.length > LIMITE_CHARS_IA) throw new ErroIA("formato", `transcrição com ${transcricao.length.toLocaleString("pt-BR")} caracteres excede o limite de ${LIMITE_CHARS_IA.toLocaleString("pt-BR")} para processamento por IA; divida o arquivo`);
  const texto = transcricao;
  if (process.env.ANTHROPIC_API_KEY) {
    const user = `Reunião: ${contexto.titulo}\nData: ${contexto.data}\nProjeto: ${contexto.projeto ?? "não informado"}\nCliente: ${contexto.cliente ?? "não informado"}\nParticipantes cadastrados: ${contexto.participantesConhecidos.join(", ") || "nenhum"}\n` +
      (contexto.reunioesAnteriores.length ? `Reuniões anteriores do projeto (para "relacoesAnteriores"):\n${contexto.reunioesAnteriores.map((r) => `- ${r.data} ${r.titulo}: ${r.decisoes.slice(0, 5).join("; ") || "sem decisões registradas"}`).join("\n")}\n` : "") +
      `\nTRANSCRIÇÃO:\n${texto}`;
    const resp = await chamarAnthropic(SYSTEM_ATA, user);
    return { ata: validarAta(extrairJson(resp)), provedor: "anthropic", modelo: MODELO_PADRAO };
  }
  return { ata: ataPorRegras(texto), provedor: "regras", modelo: null };
}

/** Fallback sem IA: regras simples sobre as falas. Tudo marcado como "confirmar"; não há síntese nem inferência. */
export function ataPorRegras(texto: string): AtaEstruturada {
  const fs = falas(texto);
  const quem = [...new Set(fs.map((f) => f.quem).filter((q): q is string => !!q))];
  const pega = (re: RegExp) => fs.filter((f) => (f.quem || f.tempo) && re.test(f.texto)).slice(0, 25).map<ItemAta>((f) => ({ texto: f.texto.slice(0, 400), confianca: "confirmar", trecho: `${f.quem ? f.quem + ": " : ""}${f.texto}`.slice(0, 500), tempo: f.tempo, responsavel: null, prazo: null }));
  return {
    resumo: `Extração automática por regras (IA não configurada): ${fs.length} falas, ${quem.length} participantes identificados pelo nome. Revise e complemente.`,
    participantes: quem.map((n) => ({ nome: n, confianca: "mencionado" as const })),
    assuntos: [], problemas: pega(/\bproblema|\bn[ãa]o (está|ficou|funciona|deu)|\berro\b|\batras/i),
    decisoes: pega(/\bdecidi|ficou decidido|vamos (manter|seguir|fazer|trocar|mudar)|\bdefinimos|\bfechado\b|\bfica (assim|combinado)/i),
    aprovacoes: pega(/\baprov|\bde acordo\b|\bpode seguir\b|\bt[áa] ok\b|\bconcord/i),
    encaminhamentos: pega(/\bvou (enviar|mandar|fazer|ajustar|revisar|ver|levantar)|\bvamos (enviar|mandar|ajustar|revisar)|\bfica (com|por conta)|\bresponsáv|\bat[ée] (segunda|terça|quarta|quinta|sexta|semana|dia)/i),
    pendencias: pega(/\bpendente|\bfalta\b|\bainda n[ãa]o/i), duvidas: pega(/\?\s*$/), divergencias: [], relacoesAnteriores: pega(/\bna (última|outra) reuni|\bcomo (falamos|combinamos)/i),
    naoIdentificado: ["Sem IA configurada: responsáveis e prazos não foram extraídos; divergências e síntese não foram produzidas."],
    observacoes: "Resultado por regras — cada item precisa de confirmação.",
  };
}

// ---------------------------------------------------------------------------
// Análise de projeto (cruzamento A360 × Vobi e divergências)
// ---------------------------------------------------------------------------
export type OcorrenciaIA = { categoria: string; titulo: string; descricao: string; classificacao: string; prioridade: string; confianca: number; impacto: string | null; evidencias: { origem: "a360" | "vobi"; ref: string; trecho?: string | null }[] };
export type ResultadoAnalise = { ocorrencias: OcorrenciaIA[]; relacoes: { a: string; b: string; relacao: string; confianca: number; evidencia: string }[]; inconclusivo: string[]; observacoes: string | null };

const SYSTEM_ANALISE = `Você cruza registros de um projeto de arquitetura: registros internos do A360 (reuniões, atas, decisões, aprovações, encaminhamentos, alertas anteriores) e fatos do Vobi (tarefas, etapas, prazos, revisões, mudanças entre exportações). O Vobi NÃO fornece apresentações, aprovações do cliente, solicitações nem especificações de produção — isso será dito na entrada como limitação; nunca suponha esses dados.
Objetivo: identificar divergências entre o que foi aprovado/decidido e o que consta nos registros, relacionar acontecimentos e dizer o que é inconclusivo.
Regras:
1. Duas informações não são equivalentes só por palavras parecidas; exija coerência de assunto, data e contexto.
2. Toda ocorrência cita evidências com "ref" exatamente igual a um dos identificadores fornecidos (ex.: "a360:item:12", "vobi:tarefa:abc").
3. Classifique em: divergencia_confirmada | possivel_divergencia | alteracao_aprovada | inconclusivo | corrigida | limitacao_dados. Verifique se houve alteração posterior aprovada antes de chamar algo de divergência.
4. Prioridade: critico (pode comprometer entrega, custo alto ou refação relevante) | alto (afeta decisão importante ou etapa em andamento) | moderado (exige esclarecimento) | informativo (alteração justificada/aprovada).
5. Nunca atribua culpa a pessoas. Não avalie desempenho.
6. Sem evidência suficiente → "inconclusivo" (liste em "inconclusivo" o que faltou).
7. Responda SOMENTE com JSON: {"ocorrencias":[{"categoria":string,"titulo":string,"descricao":string,"classificacao":string,"prioridade":string,"confianca":0-100,"impacto":string|null,"evidencias":[{"origem":"a360"|"vobi","ref":string,"trecho":string|null}]}],"relacoes":[{"a":string,"b":string,"relacao":string,"confianca":0-100,"evidencia":string}],"inconclusivo":[string],"observacoes":string|null}
Categorias: material, especificacao, layout, ambientes, equipamentos, dimensoes, quantitativos, solucao_tecnica, escopo, condicao_aprovacao, solicitacao_cliente, decisao_posterior, prazo, outro. Português do Brasil.`;

export async function analisarProjeto(entrada: string, refsValidas: Set<string>): Promise<{ resultado: ResultadoAnalise; provedor: Provedor; modelo: string | null }> {
  if (!process.env.ANTHROPIC_API_KEY) throw new ErroIA("sem_chave", "ANTHROPIC_API_KEY não configurada");
  const resp = await chamarAnthropic(SYSTEM_ANALISE, entrada.length > 150_000 ? entrada.slice(0, 150_000) : entrada, 6000);
  const j = extrairJson(resp) as Record<string, unknown>;
  const CLASS = ["divergencia_confirmada", "possivel_divergencia", "alteracao_aprovada", "inconclusivo", "corrigida", "limitacao_dados"], PRIO = ["critico", "alto", "moderado", "informativo"];
  const ocorrencias: OcorrenciaIA[] = (Array.isArray(j.ocorrencias) ? j.ocorrencias : []).map((o: Record<string, unknown>) => ({
    categoria: String(o.categoria ?? "outro").slice(0, 40), titulo: String(o.titulo ?? "").slice(0, 200), descricao: String(o.descricao ?? "").slice(0, 3000),
    classificacao: CLASS.includes(String(o.classificacao)) ? String(o.classificacao) : "inconclusivo", prioridade: PRIO.includes(String(o.prioridade)) ? String(o.prioridade) : "moderado",
    confianca: Math.max(0, Math.min(100, Number(o.confianca) || 0)), impacto: typeof o.impacto === "string" ? o.impacto.slice(0, 1000) : null,
    evidencias: (Array.isArray(o.evidencias) ? o.evidencias : []).map((e: Record<string, unknown>) => ({ origem: e.origem === "vobi" ? "vobi" as const : "a360" as const, ref: String(e.ref ?? ""), trecho: typeof e.trecho === "string" ? e.trecho.slice(0, 600) : null })).filter((e: { ref: string }) => refsValidas.has(e.ref)),
  })).filter((o: OcorrenciaIA) => o.titulo && o.evidencias.length > 0); // sem evidência válida, a ocorrência não entra
  return { resultado: { ocorrencias, relacoes: Array.isArray(j.relacoes) ? (j.relacoes as ResultadoAnalise["relacoes"]).slice(0, 50) : [], inconclusivo: Array.isArray(j.inconclusivo) ? j.inconclusivo.map(String).slice(0, 30) : [], observacoes: typeof j.observacoes === "string" ? j.observacoes.slice(0, 2000) : null }, provedor: "anthropic", modelo: MODELO_PADRAO };
}
