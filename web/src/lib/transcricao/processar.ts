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
import { ErroIA, gerarAta } from "./ia";
import type { AtaEstruturada, ItemAta } from "./tipos";

export type Transcricao = Omit<typeof schema.transcricoes.$inferSelect, "conteudo">;
export type Processamento = typeof schema.processamentos.$inferSelect;

export async function transcricoesDe(reuniaoId: number): Promise<Transcricao[]> {
  return db.select({ id: schema.transcricoes.id, reuniaoId: schema.transcricoes.reuniaoId, versao: schema.transcricoes.versao, atual: schema.transcricoes.atual, nomeArquivo: schema.transcricoes.nomeArquivo, tipoMime: schema.transcricoes.tipoMime, tamanho: schema.transcricoes.tamanho, texto: schema.transcricoes.texto, formato: schema.transcricoes.formato, enviadoPor: schema.transcricoes.enviadoPor, enviadoEm: schema.transcricoes.enviadoEm })
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

/** Guarda uma nova versão da transcrição (a anterior deixa de ser "atual", mas permanece). */
export async function enviarTranscricao(u: Usuario, r: Reuniao, arquivo: File): Promise<{ ok: true; id: number } | { ok: false; erro: string }> {
  if (arquivo.size === 0) return { ok: false, erro: "Arquivo vazio." };
  if (arquivo.size > TAMANHO_MAX) return { ok: false, erro: `Arquivo acima de ${TAMANHO_MAX / 1024 / 1024} MB.` };
  const formato = formatoDe(arquivo.name, arquivo.type);
  if (formato === "desconhecido") return { ok: false, erro: `Formato não suportado. Aceitos: ${FORMATOS_ACEITOS.join(", ")} (a transcrição do Google Meet fica no Drive como Documento Google — baixe como .docx ou .txt).` };
  const buf = Buffer.from(await arquivo.arrayBuffer());
  let texto: string;
  try { texto = (await extrairTexto(buf, formato)).replace(/\u0000/g, "").trim(); } catch (e) { return { ok: false, erro: `Não foi possível ler o arquivo (${e instanceof Error ? e.message : "erro"}). O arquivo não foi guardado.` }; }
  if (texto.length < 20) return { ok: false, erro: "O arquivo não contém texto legível (se for PDF escaneado, exporte a transcrição como .docx ou .txt)." };
  const anteriores = await transcricoesDe(r.id);
  const versao = (anteriores[0]?.versao ?? 0) + 1;
  const id = await db.transaction(async (tx) => {
    await tx.update(schema.transcricoes).set({ atual: false }).where(eq(schema.transcricoes.reuniaoId, r.id));
    const [t] = await tx.insert(schema.transcricoes).values({ reuniaoId: r.id, versao, atual: true, nomeArquivo: arquivo.name.slice(0, 200), tipoMime: arquivo.type || "application/octet-stream", tamanho: arquivo.size, conteudo: buf, texto, formato, enviadoPor: u.id }).returning({ id: schema.transcricoes.id });
    await tx.insert(schema.historicoReuniao).values({ reuniaoId: r.id, usuarioId: u.id, acao: "transcricao", resumo: `Transcrição enviada (versão ${versao}, ${formato}, ${Math.round(arquivo.size / 1024)} KB)`, depois: { transcricaoId: t.id, versao, formato, nome: arquivo.name } });
    return t.id;
  });
  return { ok: true, id };
}

const chaveTexto = (s: string) => createHash("sha1").update(s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()).digest("hex").slice(0, 16);

/** Processa a transcrição atual (ou a indicada): gera a ata e alimenta os itens. Nunca duplica um processamento em andamento. */
export async function processarTranscricao(u: Usuario, r: Reuniao, transcricaoId?: number): Promise<{ ok: true; processamentoId: number; estado: string } | { ok: false; erro: string }> {
  const t = transcricaoId ? await arquivoDe(transcricaoId) : (await db.select().from(schema.transcricoes).where(and(eq(schema.transcricoes.reuniaoId, r.id), eq(schema.transcricoes.atual, true))).limit(1))[0];
  if (!t || t.reuniaoId !== r.id) return { ok: false, erro: "Transcrição não encontrada." };
  if (!t.texto) return { ok: false, erro: "Transcrição sem texto extraído." };
  const emCurso = (await db.select({ id: schema.processamentos.id }).from(schema.processamentos).where(and(eq(schema.processamentos.transcricaoId, t.id), eq(schema.processamentos.estado, "processando"))).limit(1))[0];
  if (emCurso) return { ok: false, erro: "Já existe um processamento em andamento para esta transcrição." };
  const [p] = await db.insert(schema.processamentos).values({ reuniaoId: r.id, transcricaoId: t.id, estado: "processando", iniciadoPor: u.id }).returning({ id: schema.processamentos.id });
  try {
    const contexto = await contextoDaReuniao(r);
    const { ata, provedor, modelo } = await gerarAta(t.texto, contexto);
    const criados = await aplicarAta(u, r, ata, p.id, provedor);
    await db.update(schema.processamentos).set({ estado: provedor === "regras" ? "regras" : "concluido", provedor, modelo, resultado: ata, itensCriados: criados, concluidoEm: new Date() }).where(eq(schema.processamentos.id, p.id));
    await registrar(r.id, u.id, "ata_ia", provedor === "regras" ? `Ata gerada por regras (IA não configurada): ${criados} itens para confirmar` : `Ata gerada por IA (${modelo}): ${criados} itens extraídos para confirmação`, { processamentoId: p.id, provedor, modelo, itens: criados });
    return { ok: true, processamentoId: p.id, estado: provedor === "regras" ? "regras" : "concluido" };
  } catch (e) {
    const msg = e instanceof ErroIA ? `${e.codigo}: ${e.message}` : e instanceof Error ? e.message.slice(0, 200) : "erro";
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
  const existentes = new Set((await db.select({ texto: schema.itensReuniao.texto, tipo: schema.itensReuniao.tipo }).from(schema.itensReuniao).where(eq(schema.itensReuniao.reuniaoId, r.id))).map((i) => `${i.tipo}:${chaveTexto(i.texto)}`));
  const novos: (typeof schema.itensReuniao.$inferInsert)[] = [];
  const add = (tipo: string, lista: ItemAta[]) => { for (const i of lista) { const k = `${tipo}:${chaveTexto(i.texto)}`; if (existentes.has(k)) continue; existentes.add(k);
    novos.push({ reuniaoId: r.id, tipo, texto: i.texto, responsavel: tipo === "encaminhamento" ? i.responsavel ?? null : null, prazo: tipo === "encaminhamento" && i.prazo && /^\d{4}-\d{2}-\d{2}$/.test(i.prazo) ? i.prazo : null, situacao: tipo === "encaminhamento" ? "aberto" : "registrado", criadoPor: u.id, origem: provedor === "regras" ? "regras" : "ia", confianca: i.confianca, trecho: i.trecho ?? null, tempo: i.tempo ?? (i.prazo && !/^\d{4}-\d{2}-\d{2}$/.test(i.prazo) ? `prazo mencionado: ${i.prazo}` : null), processamentoId, confirmado: false }); } };
  add("decisao", ata.decisoes); add("aprovacao", ata.aprovacoes); add("encaminhamento", ata.encaminhamentos);
  const textoAta = ataParaTexto(ata);
  await db.transaction(async (tx) => {
    if (novos.length) await tx.insert(schema.itensReuniao).values(novos);
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
