// Upload e processamento de transcrições (T-188 evolução, itens 2.1–2.4).
// Fluxo: arquivo → guardado intacto (bytea, versão nova; anteriores preservadas) → texto extraído → IA/regras → ata estruturada
// registrada na reunião → decisões/aprovações/encaminhamentos criados como itens "não confirmados" (sem duplicar os que já
// existem) → histórico. Falhas ficam no registro de processamento; o documento nunca se perde.
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Usuario } from "@/lib/auth";
import { reuniaoPorId, type Reuniao } from "@/lib/reunioes";
import { FORMATOS_ACEITOS, TAMANHO_MAX, extrairTexto, formatoDe } from "./extrair";
import { ErroIA, consumirUltimoUso, gerarAta, MODELO_PADRAO } from "./ia";
import { registrarUso, tetoAtingido } from "./uso";
import { resolverFlag } from "@/lib/flags";
import type { AtaEstruturada, ItemAta } from "./tipos";

export type Transcricao = Omit<typeof schema.transcricoes.$inferSelect, "conteudo">;
export type Processamento = typeof schema.processamentos.$inferSelect;

export async function transcricoesDe(reuniaoId: number): Promise<Transcricao[]> {
  return db.select({ id: schema.transcricoes.id, reuniaoId: schema.transcricoes.reuniaoId, versao: schema.transcricoes.versao, atual: schema.transcricoes.atual, nomeArquivo: schema.transcricoes.nomeArquivo, tipoMime: schema.transcricoes.tipoMime, tamanho: schema.transcricoes.tamanho, texto: schema.transcricoes.texto, formato: schema.transcricoes.formato, hash: schema.transcricoes.hash, linkOriginal: schema.transcricoes.linkOriginal, entrada: schema.transcricoes.entrada, enviadoPor: schema.transcricoes.enviadoPor, enviadoEm: schema.transcricoes.enviadoEm })
    .from(schema.transcricoes).where(eq(schema.transcricoes.reuniaoId, reuniaoId)).orderBy(desc(schema.transcricoes.versao));
}
export async function processamentosDe(reuniaoId: number): Promise<Processamento[]> {
  return db.select().from(schema.processamentos).where(eq(schema.processamentos.reuniaoId, reuniaoId)).orderBy(desc(schema.processamentos.id));
}
export async function arquivoDe(id: number) {
  return (await db.select().from(schema.transcricoes).where(eq(schema.transcricoes.id, id)).limit(1))[0] ?? null;
}

async function registrar(reuniaoId: number, usuarioId: number, acao: string, resumo: string, depois?: unknown) {
  await db.insert(schema.historicoReuniao).values({ reuniaoId, usuarioId, acao, resumo: resumo.slice(0, 300), depois: depois ?? null });
}

/** Link do arquivo original no Drive (opcional): só https. */
export function lerLinkOriginal(v: unknown): { link: string | null } | { erro: string } {
  const link = String(v ?? "").trim();
  if (!link) return { link: null };
  try { if (new URL(link).protocol !== "https:" || link.length > 1000) throw new Error(); } catch { return { erro: "Link do arquivo original inválido: use um endereço que comece com https://." }; }
  return { link };
}

/**
 * T-227: guarda uma nova versão da transcrição SÓ COMO TEXTO (o arquivo continua no Drive): texto integral, hash sha-256,
 * nome, tamanho, formato e link do original. A versão anterior deixa de ser "atual", mas permanece.
 * Entrada por arquivo (TXT, DOCX, PDF, VTT, SRT) ou texto colado.
 */
export async function enviarTranscricao(u: Usuario, r: Reuniao, entrada: { arquivo: File } | { colado: string }, linkOriginal: string | null): Promise<{ ok: true; id: number } | { ok: false; erro: string }> {
  let texto: string, buf: Buffer, nome: string, mime: string, formato: string;
  if ("arquivo" in entrada) {
    const arquivo = entrada.arquivo;
    if (arquivo.size === 0) return { ok: false, erro: "Arquivo vazio." };
    if (arquivo.size > TAMANHO_MAX) return { ok: false, erro: `Arquivo acima de ${TAMANHO_MAX / 1024 / 1024} MB.` };
    const f = formatoDe(arquivo.name, arquivo.type);
    if (f === "desconhecido") return { ok: false, erro: `Formato não suportado. Aceitos: ${FORMATOS_ACEITOS.join(", ")}. Áudio e vídeo não são enviados ao A360.` };
    formato = f;
    buf = Buffer.from(await arquivo.arrayBuffer());
    try { texto = (await extrairTexto(buf, f)).replace(/\u0000/g, "").trim(); } catch (e) { return { ok: false, erro: `Não foi possível ler o arquivo (${e instanceof Error ? e.message : "erro"}). Nada foi guardado.` }; }
    if (texto.length < 20) return { ok: false, erro: "O arquivo não tem texto legível (se for PDF escaneado, exporte a transcrição como .docx ou .txt, ou cole o texto). Nada foi guardado." };
    nome = arquivo.name.slice(0, 200); mime = arquivo.type || "application/octet-stream";
  } else {
    texto = entrada.colado.replace(/\u0000/g, "").trim();
    if (texto.length < 20) return { ok: false, erro: "Cole o texto completo da transcrição." };
    if (texto.length > 2_000_000) return { ok: false, erro: "Texto muito longo (acima de 2 milhões de caracteres)." };
    buf = Buffer.from(texto, "utf8"); nome = "Transcrição colada"; mime = "text/plain"; formato = "txt";
  }
  const hash = createHash("sha256").update(buf).digest("hex");
  const anteriores = await transcricoesDe(r.id);
  const versao = (anteriores[0]?.versao ?? 0) + 1;
  const tipoEntrada = "arquivo" in entrada ? "arquivo" : "colado";
  const id = await db.transaction(async (tx) => {
    await tx.update(schema.transcricoes).set({ atual: false }).where(eq(schema.transcricoes.reuniaoId, r.id));
    const [t] = await tx.insert(schema.transcricoes).values({ reuniaoId: r.id, versao, atual: true, nomeArquivo: nome, tipoMime: mime, tamanho: buf.length, conteudo: null, hash, linkOriginal, entrada: tipoEntrada, texto, formato, enviadoPor: u.id }).returning({ id: schema.transcricoes.id });
    await tx.insert(schema.historicoReuniao).values({ reuniaoId: r.id, usuarioId: u.id, acao: "transcricao", resumo: `Transcrição ${tipoEntrada === "colado" ? "colada" : "enviada"} (versão ${versao}, ${formato}, texto de ${Math.max(1, Math.round(Buffer.byteLength(texto) / 1024))} KB)`, depois: { transcricaoId: t.id, versao, formato, nome, hash, linkOriginal } });
    return t.id;
  });
  return { ok: true, id };
}

const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const chaveTexto = (s: string) => createHash("sha1").update(normalizar(s)).digest("hex").slice(0, 16);
const STOP = new Set(["a", "o", "e", "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas", "para", "por", "com", "um", "uma", "que", "se", "ao", "as", "os", "ate", "ser", "foi", "sera", "the", "of"]);
const palavras = (s: string) => new Set(normalizar(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
/** Similaridade de Jaccard entre conjuntos de palavras (0–1). Dois itens com ≥ 0,5 são tratados como o mesmo registro. */
export function similaridade(a: string, b: string): number {
  const A = palavras(a), B = palavras(b); if (!A.size || !B.size) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}
const LIMIAR_DUPLICADO = 0.5;

/** Processa a transcrição atual (ou a indicada): gera a ata e alimenta os itens. Nunca duplica um processamento em andamento. */
export async function processarTranscricao(u: Usuario, r: Reuniao, transcricaoId?: number, forcar = false): Promise<{ ok: true; processamentoId: number; estado: string; reaproveitado?: boolean } | { ok: false; erro: string }> {
  const t = transcricaoId ? await arquivoDe(transcricaoId) : (await db.select().from(schema.transcricoes).where(and(eq(schema.transcricoes.reuniaoId, r.id), eq(schema.transcricoes.atual, true))).limit(1))[0];
  if (!t || t.reuniaoId !== r.id) return { ok: false, erro: "Transcrição não encontrada." };
  if (!t.texto) return { ok: false, erro: "Transcrição sem texto extraído." };
  const emCurso = (await db.select({ id: schema.processamentos.id }).from(schema.processamentos).where(and(eq(schema.processamentos.transcricaoId, t.id), eq(schema.processamentos.estado, "processando"))).limit(1))[0];
  if (emCurso) return { ok: false, erro: "Já existe um processamento em andamento para esta transcrição." };
  const temIA = Boolean(process.env.ANTHROPIC_API_KEY);
  // Proteção contra reprocessamento desnecessário: mesma transcrição já processada com sucesso pelo mesmo modelo → só se forçado.
  if (temIA && !forcar) {
    const anterior = (await db.select({ id: schema.processamentos.id }).from(schema.processamentos).where(and(eq(schema.processamentos.transcricaoId, t.id), eq(schema.processamentos.estado, "concluido"), eq(schema.processamentos.modelo, MODELO_PADRAO))).orderBy(desc(schema.processamentos.id)).limit(1))[0];
    if (anterior) return { ok: true, processamentoId: anterior.id, estado: "concluido", reaproveitado: true };
  }
  if (temIA) { const teto = await tetoAtingido(); if (teto) return { ok: false, erro: teto }; }
  const [p] = await db.insert(schema.processamentos).values({ reuniaoId: r.id, transcricaoId: t.id, estado: "processando", iniciadoPor: u.id }).returning({ id: schema.processamentos.id });
  try {
    const contexto = await contextoDaReuniao(r);
    const { ata, provedor, modelo } = await gerarAta(t.texto, contexto);
    const uso = provedor === "anthropic" ? consumirUltimoUso() : null;
    const criados = await aplicarAta(u, r, ata, p.id, provedor);
    await db.update(schema.processamentos).set({ estado: provedor === "regras" ? "regras" : "concluido", provedor, modelo, resultado: ata, itensCriados: criados, concluidoEm: new Date() }).where(eq(schema.processamentos.id, p.id));
    await registrar(r.id, u.id, "ata_ia", provedor === "regras" ? `Ata gerada por regras (IA não configurada): ${criados} itens para confirmar` : `Ata gerada por IA (${modelo}): ${criados} itens extraídos para confirmação${uso?.custoUsd != null ? ` · ${uso.tokensEntrada}+${uso.tokensSaida} tokens · US$ ${uso.custoUsd.toFixed(4)}` : ""}`, { processamentoId: p.id, provedor, modelo, itens: criados });
    if (provedor === "anthropic") {
      await registrarUso("ata", `processamento:${p.id}`, uso, "ok", null, u.id);
      // Primeira chamada real bem-sucedida em produção: a flag "IA não configurada" encerra com evidência (processamento e uso).
      await resolverFlag("geral.a360.ia", `Chamada real à API Anthropic concluída: processamento #${p.id}, modelo ${uso?.modeloRetornado ?? modelo}, HTTP ${uso?.httpStatus ?? "—"}, ${uso?.tokensEntrada ?? "?"} tokens de entrada e ${uso?.tokensSaida ?? "?"} de saída.`);
    }
    return { ok: true, processamentoId: p.id, estado: provedor === "regras" ? "regras" : "concluido" };
  } catch (e) {
    const msg = e instanceof ErroIA ? `${e.codigo}: ${e.message}` : e instanceof Error ? e.message.slice(0, 200) : "erro";
    if (temIA) await registrarUso("ata", `processamento:${p.id}`, null, "erro", msg, u.id, undefined, /HTTP (\d{3})/.exec(msg) ? Number(/HTTP (\d{3})/.exec(msg)![1]) : undefined);
    await db.update(schema.processamentos).set({ estado: "erro", erro: msg, concluidoEm: new Date() }).where(eq(schema.processamentos.id, p.id));
    await registrar(r.id, u.id, "ata_ia_erro", `Processamento da transcrição falhou: ${msg.slice(0, 120)}`);
    console.warn(`[reunioes] processamento ${p.id} falhou: ${msg.slice(0, 120)}`); // sem conteúdo da transcrição
    return { ok: false, erro: `O processamento falhou (${msg}). O documento foi preservado; você pode reprocessar.` };
  }
}

async function contextoDaReuniao(r: Reuniao) {
  const projeto = r.projetoCodigo ? (await db.select({ nome: schema.projetos.nome }).from(schema.projetos).where(eq(schema.projetos.codigo, r.projetoCodigo)).limit(1))[0]?.nome ?? null : null;
  const cliente = r.clienteCodigo ? (await db.select({ nome: schema.clientesVobi.nome }).from(schema.clientesVobi).where(eq(schema.clientesVobi.codigo, r.clienteCodigo)).limit(1))[0]?.nome ?? null : null;
  const anteriores = r.projetoCodigo ? await db.select().from(schema.reunioes).where(and(eq(schema.reunioes.projetoCodigo, r.projetoCodigo))).orderBy(desc(schema.reunioes.inicio)).limit(8) : [];
  const reunioesAnteriores = [];
  for (const a of anteriores.filter((a) => a.id !== r.id && a.inicio < r.inicio).slice(0, 5)) {
    const itens = await db.select({ texto: schema.itensReuniao.texto }).from(schema.itensReuniao).where(and(eq(schema.itensReuniao.reuniaoId, a.id), eq(schema.itensReuniao.confirmado, true)));
    reunioesAnteriores.push({ data: a.inicio.toISOString().slice(0, 10), titulo: a.titulo, decisoes: itens.map((i) => i.texto) });
  }
  return { titulo: r.titulo, projeto, cliente, data: r.inicio.toISOString().slice(0, 10), participantesConhecidos: r.participantes.map((p) => p.nome), reunioesAnteriores };
}

/** Registra a ata e cria itens não confirmados; itens com texto equivalente a um já existente não são duplicados. */
async function aplicarAta(u: Usuario, r: Reuniao, ata: AtaEstruturada, processamentoId: number, provedor: string): Promise<number> {
  // Itens extraídos por processamentos anteriores que ninguém confirmou são substituídos (cancelados com registro), nunca duplicados.
  const anteriores = await db.select().from(schema.itensReuniao).where(and(eq(schema.itensReuniao.reuniaoId, r.id), eq(schema.itensReuniao.confirmado, false)));
  const substituidos = anteriores.filter((i) => i.processamentoId && i.processamentoId !== processamentoId && i.situacao !== "cancelado");
  if (substituidos.length) await db.update(schema.itensReuniao).set({ situacao: "cancelado", confirmado: true }).where(and(eq(schema.itensReuniao.reuniaoId, r.id), eq(schema.itensReuniao.confirmado, false)));
  // Itens vigentes (manuais ou confirmados) — um novo item igual ou muito parecido não entra.
  const vigentes = (await db.select({ texto: schema.itensReuniao.texto, tipo: schema.itensReuniao.tipo, situacao: schema.itensReuniao.situacao }).from(schema.itensReuniao).where(eq(schema.itensReuniao.reuniaoId, r.id))).filter((i) => i.situacao !== "cancelado");
  const existentes = new Set(vigentes.map((i) => `${i.tipo}:${chaveTexto(i.texto)}`));
  const parecido = (tipo: string, texto: string) => vigentes.some((v) => v.tipo === tipo && similaridade(v.texto, texto) >= LIMIAR_DUPLICADO);
  const novos: (typeof schema.itensReuniao.$inferInsert)[] = [];
  const add = (tipo: string, lista: ItemAta[]) => { for (const i of lista) { const k = `${tipo}:${chaveTexto(i.texto)}`; if (existentes.has(k) || parecido(tipo, i.texto)) continue; existentes.add(k); vigentes.push({ texto: i.texto, tipo, situacao: "aberto" });
    novos.push({ reuniaoId: r.id, tipo, texto: i.texto, responsavel: tipo === "encaminhamento" ? i.responsavel ?? null : null, prazo: tipo === "encaminhamento" && i.prazo && /^\d{4}-\d{2}-\d{2}$/.test(i.prazo) ? i.prazo : null, situacao: tipo === "encaminhamento" ? "aberto" : "registrado", criadoPor: u.id, origem: provedor === "regras" ? "regras" : "ia", confianca: i.confianca, trecho: i.trecho ?? null, tempo: i.tempo ?? (i.prazo && !/^\d{4}-\d{2}-\d{2}$/.test(i.prazo) ? `prazo mencionado: ${i.prazo}` : null), processamentoId, confirmado: false }); } };
  add("decisao", ata.decisoes); add("aprovacao", ata.aprovacoes); add("encaminhamento", ata.encaminhamentos);
  const textoAta = ataParaTexto(ata);
  await db.transaction(async (tx) => {
    if (novos.length) await tx.insert(schema.itensReuniao).values(novos);
    if (substituidos.length) await tx.insert(schema.historicoReuniao).values({ reuniaoId: r.id, usuarioId: u.id, acao: "itens_substituidos", resumo: `${substituidos.length} item(ns) extraído(s) não confirmado(s) substituído(s) pelo reprocessamento #${processamentoId}`, antes: { itens: substituidos.map((i) => i.id) }, depois: { processamentoId } });
    const antes = r.ata;
    // A ata manual, se existir, é preservada abaixo da gerada (nada se perde); versões ficam no histórico.
    const ataFinal = antes && r.ataOrigem === "manual" ? `${textoAta}\n\n— Ata manual anterior —\n${antes}` : textoAta;
    await tx.update(schema.reunioes).set({ ata: ataFinal, ataOrigem: provedor === "regras" ? "regras" : "ia", ataEstruturada: ata, atualizadoEm: new Date() }).where(eq(schema.reunioes.id, r.id));
    await tx.insert(schema.historicoReuniao).values({ reuniaoId: r.id, usuarioId: u.id, acao: "ata", resumo: provedor === "regras" ? "Ata substituída pela extração por regras" : "Ata substituída pela ata gerada por IA", antes: { ata: antes }, depois: { ata: ataFinal } });
  });
  return novos.length;
}

export function ataParaTexto(a: AtaEstruturada): string {
  const sec = (t: string, l: ItemAta[]) => (l.length ? `\n${t}\n${l.map((i) => `- ${i.texto}${i.responsavel ? ` (resp.: ${i.responsavel})` : ""}${i.prazo ? ` (prazo: ${i.prazo})` : ""} [${i.confianca}]`).join("\n")}\n` : "");
  return `Resumo\n${a.resumo}\n${a.participantes.length ? `\nParticipantes identificados\n${a.participantes.map((p) => `- ${p.nome} [${p.confianca}]`).join("\n")}\n` : ""}${sec("Assuntos discutidos", a.assuntos)}${sec("Problemas apresentados", a.problemas)}${sec("Decisões", a.decisoes)}${sec("Aprovações e condições", a.aprovacoes)}${sec("Encaminhamentos", a.encaminhamentos)}${sec("Pendências", a.pendencias)}${sec("Dúvidas não respondidas", a.duvidas)}${sec("Divergências de entendimento", a.divergencias)}${sec("Relação com reuniões anteriores", a.relacoesAnteriores)}${a.naoIdentificado.length ? `\nNão identificado na transcrição\n${a.naoIdentificado.map((x) => `- ${x}`).join("\n")}\n` : ""}${a.observacoes ? `\nObservações\n${a.observacoes}\n` : ""}\n[mencionado] dito expressamente · [sintese] resumo da IA · [inferencia] interpretação · [confirmar] precisa de confirmação`;
}

/** Confirmar ou descartar um item extraído (quem pode editar a reunião). Descartar = cancelar com registro; nada é apagado. */
export async function confirmarItem(u: Usuario, r: Reuniao, itemId: number, confirmar: boolean): Promise<void> {
  const i = (await db.select().from(schema.itensReuniao).where(and(eq(schema.itensReuniao.id, itemId), eq(schema.itensReuniao.reuniaoId, r.id))).limit(1))[0];
  if (!i) return;
  await db.transaction(async (tx) => {
    await tx.update(schema.itensReuniao).set(confirmar ? { confirmado: true } : { confirmado: true, situacao: "cancelado" }).where(eq(schema.itensReuniao.id, itemId));
    await tx.insert(schema.historicoReuniao).values({ reuniaoId: r.id, usuarioId: u.id, acao: confirmar ? "item_confirmado" : "item_descartado", resumo: `${confirmar ? "Confirmado" : "Descartado"} item extraído: ${i.texto.slice(0, 100)}`, antes: { confirmado: i.confirmado, situacao: i.situacao }, depois: { confirmado: true, situacao: confirmar ? i.situacao : "cancelado" } });
  });
}

export { reuniaoPorId };
