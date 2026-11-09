// Validação real da integração Anthropic em produção (T-188, pedido de Rodrigo em 09/11/2026 17:44).
// Executada por um administrador a partir de /integracao-vobi. Usa a própria infraestrutura do A360 (upload → processamento →
// persistência) com uma transcrição FICTÍCIA identificada como "[TESTE A360 - VALIDAÇÃO IA]", sem projeto nem dados de clientes.
// O relatório nunca contém a chave nem o conteúdo enviado; registra status HTTP, latência, modelo, tokens e custo.
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Usuario } from "@/lib/auth";
import { criarReuniao, reuniaoPorId } from "@/lib/reunioes";
import { ErroIA, MODELO_PADRAO, custoEstimado, verificarModelo } from "./ia";
import { enviarTranscricao, processarTranscricao } from "./processar";
import { registrarUso } from "./uso";
import type { AtaEstruturada } from "./tipos";

export const TITULO_TESTE = "[TESTE A360 - VALIDAÇÃO IA]";

const TRANSCRICAO_TESTE = `[TESTE A360 - VALIDAÇÃO IA] — transcrição fictícia para validar a integração. Nenhum dado real de cliente.
00:00:05 Coordenadora Teste: Bom dia. Pauta de hoje: layout da sala fictícia de musculação e cronograma.
00:01:10 Cliente Fictício: Gostei da proposta. Aprovado o layout da sala de musculação, desde que o piso seja emborrachado.
00:02:30 Arquiteta Teste: Perfeito. Então ficou decidido manter o piso emborrachado em toda a área de peso livre.
00:03:45 Coordenadora Teste: Arquiteta Teste, você envia a planta revisada da recepção até 2026-11-20?
00:03:52 Arquiteta Teste: Sim, envio a planta revisada da recepção até 20 de novembro de 2026.
00:05:00 Cliente Fictício: E a quantidade de esteiras, vai caber doze?
00:05:20 Arquiteta Teste: Ainda não fechamos o quantitativo de esteiras; fica pendente para a próxima reunião.
00:06:10 Coordenadora Teste: Registro também que o cliente pediu um orçamento alternativo com piso vinílico, para comparar.
00:06:40 Cliente Fictício: Isso. E quem cuida do orçamento?
00:06:45 Coordenadora Teste: Fica comigo, Coordenadora Teste, até o fim do mês.
`;

export type RelatorioValidacao = {
  quando: string; ambiente: string;
  chave: { presente: boolean };
  modelos: { httpStatus: number; duracaoMs: number; total: number; modeloConfigurado: string; disponivel: boolean } | { erro: string };
  reuniaoId: number | null; transcricaoId: number | null; processamentoId: number | null;
  chamada: { httpStatus: number | null; duracaoMs: number | null; modeloRetornado: string | null; tokensEntrada: number | null; tokensSaida: number | null; custoUsd: number | null } | { erro: string };
  ata: { origem: string | null; caracteres: number; resumo: boolean; assuntos: number; decisoes: number; aprovacoes: number; encaminhamentos: number; pendencias: number; duvidas: number; comResponsavel: number; comPrazo: number } | null;
  itensPersistidos: { decisao: number; aprovacao: number; encaminhamento: number; comTrecho: number; comResponsavel: number; comPrazo: number } | null;
  reprocessamento: { reaproveitadoSemChamada: boolean; forcadoCriouItens: number | null; vigentesAntes: number; vigentesDepois: number; substituidos: number } | null;
  flagIa: string | null;
  ok: boolean; erros: string[];
};

export async function validarIntegracaoIA(u: Usuario): Promise<RelatorioValidacao> {
  const rel: RelatorioValidacao = { quando: new Date().toISOString(), ambiente: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV ?? "desconhecido", chave: { presente: Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim()) }, modelos: { erro: "não verificado" }, reuniaoId: null, transcricaoId: null, processamentoId: null, chamada: { erro: "não executada" }, ata: null, itensPersistidos: null, reprocessamento: null, flagIa: null, ok: false, erros: [] };
  if (!rel.chave.presente) { rel.erros.push("ANTHROPIC_API_KEY ausente ou vazia no servidor."); return finalizar(u, rel); }
  // 2. modelo
  try { const m = await verificarModelo(); rel.modelos = { httpStatus: m.httpStatus, duracaoMs: m.duracaoMs, total: m.modelos.length, modeloConfigurado: m.modelo, disponivel: m.disponivel }; await registrarUso("teste_conexao", "models", null, "ok", null, u.id, { total: m.modelos.length, disponivel: m.disponivel }, m.httpStatus); if (!m.disponivel) rel.erros.push(`Modelo ${MODELO_PADRAO} não consta na lista devolvida por /v1/models para esta chave.`); }
  catch (e) { const msg = e instanceof ErroIA ? `${e.codigo}: ${e.message}` : "erro"; rel.modelos = { erro: msg }; rel.erros.push(`Falha ao listar modelos: ${msg}`); await registrarUso("teste_conexao", "models", null, "erro", msg, u.id); return finalizar(u, rel); }
  // 3–7. reunião de teste (reutilizada se já existir), transcrição fictícia, processamento real
  let r = (await db.select().from(schema.reunioes).where(eq(schema.reunioes.titulo, TITULO_TESTE)).orderBy(desc(schema.reunioes.id)).limit(1))[0] ?? null;
  if (!r) { const hoje = new Date().toISOString().slice(0, 10); const id = await criarReuniao(u, { titulo: TITULO_TESTE, projetoCodigo: null, data: hoje, horaInicio: "09:00", horaFim: "09:30", local: "teste automatizado", participantes: [{ email: null, nome: "Coordenadora Teste", externo: false }, { email: null, nome: "Arquiteta Teste", externo: false }, { email: null, nome: "Cliente Fictício", externo: true }], pauta: "Validação da integração com a IA — dados fictícios." }); r = (await reuniaoPorId(id))!; }
  rel.reuniaoId = r.id;
  const env = await enviarTranscricao(u, r, new File([TRANSCRICAO_TESTE], "teste-a360-validacao-ia.txt", { type: "text/plain" }));
  if (!env.ok) { rel.erros.push(`Upload de teste falhou: ${env.erro}`); return finalizar(u, rel); }
  rel.transcricaoId = env.id;
  const proc = await processarTranscricao(u, r, env.id, true);
  if (!proc.ok) { rel.chamada = { erro: proc.erro }; rel.erros.push(proc.erro); return finalizar(u, rel); }
  rel.processamentoId = proc.processamentoId;
  const uso = (await db.select().from(schema.usoIa).where(eq(schema.usoIa.referencia, `processamento:${proc.processamentoId}`)).limit(1))[0];
  const p = (await db.select().from(schema.processamentos).where(eq(schema.processamentos.id, proc.processamentoId)).limit(1))[0];
  rel.chamada = uso ? { httpStatus: uso.httpStatus, duracaoMs: uso.duracaoMs, modeloRetornado: uso.modelo, tokensEntrada: uso.tokensEntrada, tokensSaida: uso.tokensSaida, custoUsd: uso.custoEstimadoUsd ?? custoEstimado(uso.modelo, uso.tokensEntrada, uso.tokensSaida) } : { erro: "uso não registrado" };
  if (p.provedor !== "anthropic") rel.erros.push(`Processamento não usou a API (provedor: ${p.provedor}).`);
  const rr = (await reuniaoPorId(r.id))!;
  const a = (rr.ataEstruturada ?? null) as AtaEstruturada | null;
  rel.ata = a ? { origem: rr.ataOrigem, caracteres: rr.ata?.length ?? 0, resumo: Boolean(a.resumo), assuntos: a.assuntos.length, decisoes: a.decisoes.length, aprovacoes: a.aprovacoes.length, encaminhamentos: a.encaminhamentos.length, pendencias: a.pendencias.length, duvidas: a.duvidas.length, comResponsavel: a.encaminhamentos.filter((i) => i.responsavel).length, comPrazo: a.encaminhamentos.filter((i) => i.prazo).length } : null;
  const itens = await db.select().from(schema.itensReuniao).where(and(eq(schema.itensReuniao.reuniaoId, r.id), eq(schema.itensReuniao.processamentoId, proc.processamentoId)));
  const todos = await db.select().from(schema.itensReuniao).where(eq(schema.itensReuniao.reuniaoId, r.id));
  rel.itensPersistidos = { decisao: todos.filter((i) => i.tipo === "decisao").length, aprovacao: todos.filter((i) => i.tipo === "aprovacao").length, encaminhamento: todos.filter((i) => i.tipo === "encaminhamento").length, comTrecho: todos.filter((i) => i.trecho).length, comResponsavel: todos.filter((i) => i.responsavel).length, comPrazo: todos.filter((i) => i.prazo).length };
  if (!rr.ata || rr.ataOrigem !== "ia") rel.erros.push("Ata não persistida com origem 'ia'.");
  if (!a?.decisoes.length || !a?.aprovacoes.length || !a?.encaminhamentos.length) rel.erros.push("A ata não trouxe decisões, aprovações e encaminhamentos (esperados na transcrição de teste).");
  void itens;
  // 8. reprocessamento: sem forçar → reaproveita (nenhuma chamada); forçando → nova chamada, zero itens novos
  const vigentes = async () => (await db.select({ s: schema.itensReuniao.situacao }).from(schema.itensReuniao).where(eq(schema.itensReuniao.reuniaoId, r.id))).filter((i) => i.s !== "cancelado").length;
  const vigentesAntes = await vigentes();
  const p2 = await processarTranscricao(u, r, env.id, false);
  const p3 = await processarTranscricao(u, r, env.id, true);
  const novos3 = p3.ok ? (await db.select({ n: schema.processamentos.itensCriados }).from(schema.processamentos).where(eq(schema.processamentos.id, p3.processamentoId)))[0]?.n ?? null : null;
  const vigentesDepois = await vigentes();
  const substituidos = (await db.select({ s: schema.itensReuniao.situacao, p: schema.itensReuniao.processamentoId }).from(schema.itensReuniao).where(eq(schema.itensReuniao.reuniaoId, r.id))).filter((i) => i.s === "cancelado" && i.p === proc.processamentoId).length;
  rel.reprocessamento = { reaproveitadoSemChamada: Boolean(p2.ok && p2.reaproveitado), forcadoCriouItens: novos3, vigentesAntes, vigentesDepois, substituidos };
  // Critério: o reprocessamento forçado substitui os itens não confirmados (podem ser reescritos), mas o total vigente não cresce.
  if (vigentesDepois > vigentesAntes) rel.erros.push(`Reprocessamento forçado aumentou os itens vigentes de ${vigentesAntes} para ${vigentesDepois} (duplicidade).`);
  if (!p3.ok) rel.erros.push(`Reprocessamento forçado falhou: ${p3.erro}`);
  rel.flagIa = (await db.select({ s: schema.flagsLimitacao.situacao }).from(schema.flagsLimitacao).where(eq(schema.flagsLimitacao.chave, "geral.a360.ia")).limit(1))[0]?.s ?? null;
  rel.ok = rel.erros.length === 0;
  return finalizar(u, rel);
}

async function finalizar(u: Usuario, rel: RelatorioValidacao): Promise<RelatorioValidacao> {
  await registrarUso("validacao", rel.processamentoId ? `processamento:${rel.processamentoId}` : null, null, rel.ok ? "ok" : "erro", rel.ok ? null : rel.erros.join(" | "), u.id, rel);
  return rel;
}
