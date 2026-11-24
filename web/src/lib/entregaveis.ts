// Fase 6 — Aprovações internas de entregáveis (T-190, autorizada em 10/11/2026).
// Regras: registro interno (sem acesso externo); projeto/cliente vêm do Vobi (só leitura); aprovação interna só por
// coordenação/gestão/admin; aprovação do cliente sempre com evidência (tipo + texto ou arquivo + data + quem) — nunca presumida;
// histórico imutável; visibilidade da arquiteta = projetos em que participa (regra D-A, mesma das reuniões).
import { desc, eq, getTableColumns, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { papeis } from "@/lib/cobertura";
import type { Usuario } from "@/lib/auth";
import { ultimaCargaAceita } from "@/lib/consultas";
import { restricaoDe, sqlParticipa } from "@/lib/participacao";

export type Entregavel = typeof schema.entregaveis.$inferSelect;
export type Versao = Omit<typeof schema.versoesEntregavel.$inferSelect, "conteudo">;
export type Aprovacao = Omit<typeof schema.aprovacoesEntregavel.$inferSelect, "conteudo">;

export const TIPOS: Record<string, string> = { layout: "Layout", apresentacao: "Apresentação ao cliente", executivo: "Projeto executivo / caderno", imagens3d: "Imagens 3D", video3d: "Vídeo 3D", legal: "Projeto legal", documentacao: "Documentação", outro: "Outro" };
export const STATUS: Record<string, { rotulo: string; tom: "ok" | "warn" | "bad" | "info" | "neutral"; ordem: number }> = {
  em_elaboracao:    { rotulo: "em elaboração",            tom: "neutral", ordem: 1 },
  revisao_interna:  { rotulo: "em revisão interna",       tom: "info",    ordem: 2 },
  aprovado_interno: { rotulo: "aprovado internamente",    tom: "ok",      ordem: 3 },
  enviado_cliente:  { rotulo: "enviado ao cliente",       tom: "info",    ordem: 4 },
  aprovado_cliente: { rotulo: "aprovado pelo cliente",    tom: "ok",      ordem: 5 },
  ajustes_cliente:  { rotulo: "ajustes solicitados pelo cliente", tom: "warn", ordem: 4 },
  cancelado:        { rotulo: "cancelado",                tom: "bad",     ordem: 9 },
};
export const EVIDENCIAS: Record<string, string> = { email: "E-mail do cliente", mensagem: "Mensagem (WhatsApp etc.)", ata: "Ata de reunião", item_reuniao: "Item de aprovação de reunião do A360", documento_assinado: "Documento assinado", verbal_registrada: "Aprovação verbal registrada (quem, quando, onde)", outro: "Outro" };
export const LIMITE_ARQUIVO = 15 * 1024 * 1024;

// T-292 (23/11/2026, regra de Rodrigo): revisão interna em cadeia. A júnior sobe; a sênior indicada aprova; depois a coordenação;
// por fim a gerência. Entregável de sênior começa na coordenação; o da coordenação, na gerência. Ajustes em qualquer etapa voltam
// para "em elaboração" e a versão nova recomeça a cadeia. A direção (admin) pode registrar qualquer etapa.
export const ETAPAS_REVISAO: Record<string, string> = { senior: "Arquiteta sênior", coordenacao: "Coordenação", gerencia: "Gerência" };
const ORDEM_REVISAO = ["senior", "coordenacao", "gerencia"];
export async function seniores(): Promise<{ id: number; nome: string }[]> {
  return (await db.execute(sql`select u.id, u.nome from usuario u join agenda_pessoa a on a.usuario_id = u.id where a.senior and u.ativo order by u.nome`)).rows as { id: number; nome: string }[];
}
async function ehSenior(id: number) { return (await db.execute(sql`select 1 from agenda_pessoa where usuario_id = ${id} and senior`)).rows.length > 0; }
async function perfilDe(id: number | null) { return id ? (await db.select({ p: schema.usuarios.perfil }).from(schema.usuarios).where(eq(schema.usuarios.id, id)).limit(1))[0]?.p ?? null : null; }
/** Primeira etapa da cadeia, conforme quem é responsável pelo entregável. */
export async function etapaInicial(e: { responsavelId: number | null; criadoPor: number }): Promise<string> {
  const id = e.responsavelId ?? e.criadoPor, perfil = await perfilDe(id);
  if (perfil === "coordenacao") return "gerencia";
  if (perfil === "gestao" || perfil === "admin") return "gerencia";
  return (await ehSenior(id)) ? "coordenacao" : "senior";
}
/** Quem registra a etapa atual: sênior (a indicada ou, sem indicação, qualquer sênior), coordenação, gerência; direção em qualquer uma. */
export async function podeRevisarEtapa(u: Usuario, e: Entregavel): Promise<boolean> {
  if (e.status !== "revisao_interna") return false;
  if (u.perfil === "admin") return true;
  const etapa = e.etapaRevisao ?? "coordenacao";
  if (etapa === "senior") return e.revisorId ? u.id === e.revisorId : await ehSenior(u.id);
  const meus = await papeis(u); // T-301: inclui o papel de quem a pessoa cobre (férias)
  if (etapa === "coordenacao") return meus.has("coordenacao");
  return meus.has("gestao");
}
async function cobreEtapa(u: Usuario, etapa: string): Promise<boolean> {
  if (u.perfil === "admin") return false; // a direção registra uma etapa por vez
  const meus = await papeis(u);
  return (etapa === "coordenacao" && meus.has("coordenacao")) || (etapa === "gerencia" && meus.has("gestao"));
}
/** Júnior precisa indicar a sênior que revisa. */
async function exigeRevisor(d: { responsavelId: number | null }, criador: number): Promise<boolean> {
  const id = d.responsavelId ?? criador, perfil = await perfilDe(id);
  return perfil === "arquiteta" && !(await ehSenior(id));
}

export const gestao = (u: Usuario) => u.perfil === "admin" || u.perfil === "gestao" || u.perfil === "coordenacao";

/** Arquiteta vê entregáveis dos projetos em que participa (dados do Vobi) ou que ela criou/é responsável. */
async function sqlVisivel(u: Usuario): Promise<string> {
  if (gestao(u)) return "true";
  const r = await restricaoDe(u.email);
  const carga = await ultimaCargaAceita();
  const porProjeto = carga ? `exists (select 1 from projeto p where p.codigo = e.projeto_codigo and ${sqlParticipa(r.email, r.nomes, carga.id, "p")})` : "false";
  return `(e.criado_por = ${u.id} or e.responsavel_id = ${u.id} or e.revisor_id = ${u.id} or ${porProjeto})`;
}
export async function podeVer(u: Usuario, e: Entregavel): Promise<boolean> {
  if (gestao(u)) return true;
  const q = await db.execute(sql.raw(`select 1 from entregavel e where e.id = ${e.id} and ${await sqlVisivel(u)}`));
  return q.rows.length > 0;
}
export async function podeVerProjeto(u: Usuario, codigo: number): Promise<boolean> {
  if (gestao(u)) return true;
  const r = await restricaoDe(u.email); const carga = await ultimaCargaAceita();
  if (!carga) return false;
  const q = await db.execute(sql.raw(`select 1 from projeto p where p.codigo = ${codigo} and ${sqlParticipa(r.email, r.nomes, carga.id, "p")}`));
  return q.rows.length > 0;
}
export const podeEditar = async (u: Usuario, e: Entregavel) => e.status !== "cancelado" && (await podeVer(u, e));

export type Filtros = { projeto: number | null; status: string; tipo: string; q: string; revisar?: boolean; papeis?: Set<string> };
export function lerFiltros(sp: Record<string, string | string[] | undefined>): Filtros {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  return { projeto: /^\d+$/.test(um(sp.projeto)) ? Number(um(sp.projeto)) : null, status: um(sp.status) in STATUS || ["abertos", "todos"].includes(um(sp.status)) ? um(sp.status) : "abertos", tipo: um(sp.tipo) in TIPOS ? um(sp.tipo) : "", q: um(sp.q).slice(0, 80), revisar: um(sp.revisar) === "1" };
}
export type EntregavelLista = Entregavel & { projetoNome: string | null; clienteNome: string | null; responsavelNome: string | null; versoes: number; aguardandoInterna: boolean; aguardandoCliente: boolean };

export async function listar(u: Usuario, f: Filtros): Promise<EntregavelLista[]> {
  const esc = (s: string) => s.replace(/'/g, "''");
  const where = [await sqlVisivel(u)];
  if (f.projeto) where.push(`e.projeto_codigo = ${f.projeto}`);
  if (f.status === "abertos") where.push(`e.status not in ('aprovado_cliente','cancelado')`); else if (f.status && f.status !== "todos") where.push(`e.status = '${esc(f.status)}'`);
  if (f.tipo) where.push(`e.tipo = '${esc(f.tipo)}'`);
  if (f.revisar) { // T-292: o que está na etapa de revisão desta pessoa
    const p = f.papeis ?? new Set([u.perfil]); // T-301: inclui o papel coberto
    const partes = [p.has("coordenacao") ? `e.etapa_revisao = 'coordenacao'` : null, p.has("gestao") ? `e.etapa_revisao = 'gerencia'` : null,
      `(e.etapa_revisao = 'senior' and (e.revisor_id = ${u.id} or (e.revisor_id is null and exists (select 1 from agenda_pessoa a where a.usuario_id = ${u.id} and a.senior))))`].filter(Boolean);
    const minhas = u.perfil === "admin" ? `true` : `(${partes.join(" or ")})`;
    where.push(`e.status = 'revisao_interna' and ${minhas}`);
  }
  if (f.q) where.push(`(e.titulo ilike '%${esc(f.q)}%' or p.nome ilike '%${esc(f.q)}%' or c.nome ilike '%${esc(f.q)}%')`);
  const rows = (await db.execute(sql.raw(`select e.*, p.nome projeto_nome, c.nome cliente_nome, u.nome responsavel_nome,
      (select count(*)::int from entregavel_versao v where v.entregavel_id=e.id) versoes
    from entregavel e left join projeto p on p.codigo=e.projeto_codigo left join cliente_vobi c on c.codigo=e.cliente_codigo left join usuario u on u.id=e.responsavel_id
    where ${where.join(" and ")} order by e.atualizado_em desc limit 300`))).rows as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id), projetoCodigo: Number(r.projeto_codigo), clienteCodigo: r.cliente_codigo == null ? null : Number(r.cliente_codigo), titulo: String(r.titulo), tipo: String(r.tipo), descricao: (r.descricao as string | null) ?? null,
    responsavelId: r.responsavel_id == null ? null : Number(r.responsavel_id), revisorId: r.revisor_id == null ? null : Number(r.revisor_id), etapaRevisao: (r.etapa_revisao as string | null) ?? null, status: String(r.status), versaoAtual: Number(r.versao_atual), reuniaoId: r.reuniao_id == null ? null : Number(r.reuniao_id),
    criadoPor: Number(r.criado_por), criadoEm: new Date(String(r.criado_em)), atualizadoEm: new Date(String(r.atualizado_em)),
    projetoNome: (r.projeto_nome as string | null) ?? null, clienteNome: (r.cliente_nome as string | null) ?? null, responsavelNome: (r.responsavel_nome as string | null) ?? null, versoes: Number(r.versoes),
    aguardandoInterna: r.status === "revisao_interna", aguardandoCliente: r.status === "enviado_cliente",
  }));
}

export async function porId(id: number): Promise<Entregavel | null> { return (await db.select().from(schema.entregaveis).where(eq(schema.entregaveis.id, id)).limit(1))[0] ?? null; }
export async function versoesDe(id: number): Promise<Versao[]> {
  const { conteudo: _c, ...cols } = getTableColumns(schema.versoesEntregavel); void _c;
  return db.select(cols).from(schema.versoesEntregavel).where(eq(schema.versoesEntregavel.entregavelId, id)).orderBy(desc(schema.versoesEntregavel.numero));
}
export async function aprovacoesDe(id: number): Promise<(Aprovacao & { quem: string })[]> {
  const { conteudo: _c, ...cols } = getTableColumns(schema.aprovacoesEntregavel); void _c;
  const rows = await db.select({ ...cols, quem: schema.usuarios.nome }).from(schema.aprovacoesEntregavel).innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.aprovacoesEntregavel.registradoPor)).where(eq(schema.aprovacoesEntregavel.entregavelId, id)).orderBy(desc(schema.aprovacoesEntregavel.registradoEm));
  return rows;
}
export async function comentariosDe(id: number) {
  return db.select({ id: schema.comentariosEntregavel.id, texto: schema.comentariosEntregavel.texto, quando: schema.comentariosEntregavel.quando, autor: schema.usuarios.nome }).from(schema.comentariosEntregavel).innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.comentariosEntregavel.autorId)).where(eq(schema.comentariosEntregavel.entregavelId, id)).orderBy(schema.comentariosEntregavel.quando);
}
export async function historicoDe(id: number) {
  return db.select({ id: schema.historicoEntregavel.id, acao: schema.historicoEntregavel.acao, resumo: schema.historicoEntregavel.resumo, quando: schema.historicoEntregavel.quando, quem: schema.usuarios.nome }).from(schema.historicoEntregavel).innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.historicoEntregavel.usuarioId)).where(eq(schema.historicoEntregavel.entregavelId, id)).orderBy(schema.historicoEntregavel.quando);
}
export async function doProjeto(codigo: number): Promise<Entregavel[]> { return db.select().from(schema.entregaveis).where(eq(schema.entregaveis.projetoCodigo, codigo)).orderBy(desc(schema.entregaveis.atualizadoEm)); }
export async function arquivoVersao(id: number) { return (await db.select().from(schema.versoesEntregavel).where(eq(schema.versoesEntregavel.id, id)).limit(1))[0] ?? null; }
export async function arquivoAprovacao(id: number) { return (await db.select().from(schema.aprovacoesEntregavel).where(eq(schema.aprovacoesEntregavel.id, id)).limit(1))[0] ?? null; }

async function registrar(entregavelId: number, usuarioId: number, acao: string, resumo: string, antes?: unknown, depois?: unknown) {
  await db.insert(schema.historicoEntregavel).values({ entregavelId, usuarioId, acao, resumo: resumo.slice(0, 300), antes: antes ?? null, depois: depois ?? null });
  await db.update(schema.entregaveis).set({ atualizadoEm: new Date() }).where(eq(schema.entregaveis.id, entregavelId));
}

export type Dados = { titulo: string; tipo: string; descricao: string; projetoCodigo: number; responsavelId: number | null; reuniaoId: number | null; revisorId: number | null };
export function lerDados(fd: FormData): { dados: Dados } | { erro: string } {
  const titulo = String(fd.get("titulo") ?? "").trim(); const tipo = String(fd.get("tipo") ?? "");
  const projetoCodigo = Number(fd.get("projeto")); const resp = String(fd.get("responsavel") ?? ""); const reuniao = String(fd.get("reuniao") ?? ""); const rev = String(fd.get("revisor") ?? "");
  if (titulo.length < 3) return { erro: "Informe o título do entregável." };
  if (!(tipo in TIPOS)) return { erro: "Tipo inválido." };
  if (!Number.isInteger(projetoCodigo) || projetoCodigo <= 0) return { erro: "Escolha o projeto (do Vobi)." };
  return { dados: { titulo, tipo, descricao: String(fd.get("descricao") ?? "").trim(), projetoCodigo, responsavelId: /^\d+$/.test(resp) ? Number(resp) : null, reuniaoId: /^\d+$/.test(reuniao) ? Number(reuniao) : null, revisorId: /^\d+$/.test(rev) ? Number(rev) : null } };
}

async function checarRevisor(d: Dados, criador: number): Promise<string | null> {
  if (d.revisorId && !(await ehSenior(d.revisorId))) return "A revisora indicada não está marcada como arquiteta sênior.";
  if (!d.revisorId && (await exigeRevisor({ responsavelId: d.responsavelId ?? criador }, criador))) return "Escolha a arquiteta sênior que vai revisar este entregável.";
  return null;
}

export async function criar(u: Usuario, d: Dados): Promise<{ ok: true; id: number } | { ok: false; erro: string }> {
  if (!(await podeVerProjeto(u, d.projetoCodigo))) return { ok: false, erro: "Você não participa deste projeto." };
  const p = (await db.select({ c: schema.projetos.clienteCodigo }).from(schema.projetos).where(eq(schema.projetos.codigo, d.projetoCodigo)).limit(1))[0];
  if (!p) return { ok: false, erro: "Projeto não encontrado na última carga do Vobi." };
  const erroRev = await checarRevisor(d, u.id); if (erroRev) return { ok: false, erro: erroRev };
  const [r] = await db.insert(schema.entregaveis).values({ projetoCodigo: d.projetoCodigo, clienteCodigo: p.c ?? null, titulo: d.titulo, tipo: d.tipo, descricao: d.descricao || null, responsavelId: d.responsavelId ?? u.id, reuniaoId: d.reuniaoId, revisorId: d.revisorId, criadoPor: u.id }).returning({ id: schema.entregaveis.id });
  await registrar(r.id, u.id, "criado", `Entregável criado: ${d.titulo}`, null, d);
  return { ok: true, id: r.id };
}

export async function editar(u: Usuario, e: Entregavel, d: Dados): Promise<string | null> {
  if (!(await podeEditar(u, e))) return "Sem permissão.";
  if (d.projetoCodigo !== e.projetoCodigo) return "O projeto do entregável não muda; crie outro entregável.";
  const erroRev = await checarRevisor(d, e.criadoPor); if (erroRev) return erroRev;
  await db.update(schema.entregaveis).set({ titulo: d.titulo, tipo: d.tipo, descricao: d.descricao || null, responsavelId: d.responsavelId, reuniaoId: d.reuniaoId, revisorId: d.revisorId }).where(eq(schema.entregaveis.id, e.id));
  await registrar(e.id, u.id, "editado", "Dados do entregável alterados", { titulo: e.titulo, tipo: e.tipo, descricao: e.descricao, responsavelId: e.responsavelId, reuniaoId: e.reuniaoId, revisorId: e.revisorId }, d);
  return null;
}

/** Nova versão: descrição e link e/ou arquivo. Volta o status para "em revisão interna" se já havia aprovação (a versão nova precisa ser aprovada de novo). */
/** Vários links por versão (pedido de Rodrigo em 23/11/2026): um por linha, guardados no mesmo campo, separados por quebra de linha.
 *  Cada linha pode ter um nome antes do endereço: "Planta baixa: https://drive...". */
export type LinkVersao = { nome: string; url: string };
export function lerLinks(texto: string | null | undefined): LinkVersao[] {
  return (texto ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.search(/https?:\/\//i);
    const url = i >= 0 ? l.slice(i).trim() : l;
    let nome = i > 0 ? l.slice(0, i).replace(/[\s:–—-]+$/, "").trim() : "";
    if (!nome) { try { nome = new URL(url).hostname.replace(/^www\./, ""); } catch { nome = "link"; } }
    return { nome, url };
  });
}
export function validarLinks(texto: string): string | null {
  for (const l of lerLinks(texto)) if (!/^https?:\/\/\S+$/i.test(l.url)) return `Link inválido: "${l.url.slice(0, 60)}". Use um endereço começando com https://, um por linha.`;
  if (lerLinks(texto).length > 20) return "Até 20 links por versão.";
  return null;
}
const juntarLinks = (texto: string) => lerLinks(texto).map((l) => (l.nome && !l.url.includes(l.nome) ? `${l.nome}: ${l.url}` : l.url)).join("\n");

/** Acrescenta links a uma versão já registrada (sem criar versão nova). */
export async function adicionarLinks(u: Usuario, e: Entregavel, versaoId: number, texto: string): Promise<string | null> {
  if (!(await podeEditar(u, e))) return "Sem permissão.";
  if (!lerLinks(texto).length) return "Informe ao menos um link.";
  const erro = validarLinks(texto); if (erro) return erro;
  const v = (await db.select().from(schema.versoesEntregavel).where(eq(schema.versoesEntregavel.id, versaoId)).limit(1))[0];
  if (!v || v.entregavelId !== e.id) return "Versão não encontrada.";
  const novo = [v.link ?? "", juntarLinks(texto)].filter(Boolean).join("\n");
  await db.update(schema.versoesEntregavel).set({ link: novo }).where(eq(schema.versoesEntregavel.id, v.id));
  await registrar(e.id, u.id, "versao", `${lerLinks(texto).length} link(s) acrescentado(s) à versão ${v.numero}`, null, null);
  return null;
}

export async function novaVersao(u: Usuario, e: Entregavel, descricao: string, link: string, arquivo: File | null): Promise<string | null> {
  if (!(await podeEditar(u, e))) return "Sem permissão.";
  if (!descricao.trim() && !link.trim() && !(arquivo && arquivo.size)) return "Descreva o que mudou, informe um link ou anexe o arquivo.";
  if (arquivo && arquivo.size > LIMITE_ARQUIVO) return "Arquivo acima de 15 MB. Use um link para o Drive.";
  const erroLink = validarLinks(link); if (erroLink) return erroLink;
  const numero = e.versaoAtual + 1;
  const buf = arquivo && arquivo.size ? Buffer.from(await arquivo.arrayBuffer()) : null;
  await db.insert(schema.versoesEntregavel).values({ entregavelId: e.id, numero, descricao: descricao.trim() || null, link: juntarLinks(link) || null, nomeArquivo: buf ? arquivo!.name : null, tipoMime: buf ? arquivo!.type || "application/octet-stream" : null, tamanho: buf ? buf.length : null, conteudo: buf, enviadoPor: u.id });
  const voltaRevisao = ["aprovado_interno", "enviado_cliente", "ajustes_cliente", "aprovado_cliente"].includes(e.status);
  const novoStatus = voltaRevisao || e.status === "em_elaboracao" ? "revisao_interna" : e.status;
  const etapa = novoStatus === "revisao_interna" ? await etapaInicial(e) : e.etapaRevisao; // versão nova recomeça a cadeia
  await db.update(schema.entregaveis).set({ versaoAtual: numero, status: novoStatus, etapaRevisao: etapa }).where(eq(schema.entregaveis.id, e.id));
  await registrar(e.id, u.id, "versao", `Versão ${numero} registrada${buf ? ` (${arquivo!.name})` : ""}${voltaRevisao ? " — volta para revisão interna" : ""}`, { versaoAtual: e.versaoAtual, status: e.status }, { versaoAtual: numero, descricao });
  return null;
}

export async function mudarStatus(u: Usuario, e: Entregavel, status: string, justificativa = ""): Promise<string | null> {
  if (!(status in STATUS)) return "Status inválido.";
  if (!(await podeVer(u, e))) return "Sem permissão.";
  // transições que exigem aprovação registrada (não se marca "aprovado" por aqui)
  if (status === "aprovado_interno" || status === "aprovado_cliente" || status === "ajustes_cliente") return "Aprovações e ajustes são registrados pela seção de aprovação, com evidência.";
  if (status === "enviado_cliente" && e.status !== "aprovado_interno") return "Só se envia ao cliente um entregável aprovado internamente.";
  if (status === "cancelado" && !gestao(u)) return "Só coordenação/gestão cancela um entregável.";
  if (status === "cancelado" && justificativa.trim().length < 5) return "Escreva a justificativa do cancelamento.";
  if (status === "revisao_interna" && e.versaoAtual < 1) return "Registre ao menos uma versão antes de enviar para revisão.";
  await db.update(schema.entregaveis).set({ status, etapaRevisao: status === "revisao_interna" ? await etapaInicial(e) : null }).where(eq(schema.entregaveis.id, e.id));
  await registrar(e.id, u.id, status === "cancelado" ? "cancelado" : "status", `Status: ${STATUS[e.status]?.rotulo} → ${STATUS[status].rotulo}${justificativa ? ` — ${justificativa}` : ""}`, { status: e.status }, { status });
  return null;
}

/** Revisão interna em cadeia (T-292): registra a decisão da etapa atual; aprovado avança, ajustes volta para elaboração. */
export async function aprovacaoInterna(u: Usuario, e: Entregavel, decisao: "aprovado" | "ajustes", observacao: string): Promise<string | null> {
  if (e.status === "cancelado") return "Entregável cancelado.";
  if (e.versaoAtual < 1) return "Registre ao menos uma versão antes de aprovar.";
  if (e.status !== "revisao_interna") return "O entregável não está em revisão interna. Envie para revisão primeiro.";
  const etapa = e.etapaRevisao ?? "coordenacao";
  if (!(await podeRevisarEtapa(u, e))) return `Esta etapa da revisão é da ${ETAPAS_REVISAO[etapa].toLowerCase()}${etapa === "senior" && e.revisorId ? " indicada" : ""}.`;
  if (decisao === "ajustes" && observacao.trim().length < 5) return "Descreva os ajustes pedidos.";
  await db.insert(schema.aprovacoesEntregavel).values({ entregavelId: e.id, versaoNumero: e.versaoAtual, instancia: "interna", nivel: etapa, decisao, observacao: observacao.trim() || null, registradoPor: u.id });
  let prox = ORDEM_REVISAO[ORDEM_REVISAO.indexOf(etapa) + 1] ?? null;
  // T-301: quem cobre a ausente e também responde pela etapa seguinte aprova as duas de uma vez (fica registrado)
  if (decisao === "aprovado" && etapa !== "senior") while (prox && (await cobreEtapa(u, prox))) {
    await db.insert(schema.aprovacoesEntregavel).values({ entregavelId: e.id, versaoNumero: e.versaoAtual, instancia: "interna", nivel: prox, decisao, observacao: `aprovado junto com a etapa anterior (cobertura de ausência)${observacao.trim() ? `: ${observacao.trim()}` : ""}`, registradoPor: u.id });
    await registrar(e.id, u.id, "aprovacao_interna", `${ETAPAS_REVISAO[prox]} aprovou junto (v${e.versaoAtual}) · ${u.nome}, cobrindo ausência`, { etapa: prox }, { etapa: prox });
    prox = ORDEM_REVISAO[ORDEM_REVISAO.indexOf(prox) + 1] ?? null;
  }
  const status = decisao === "ajustes" ? "em_elaboracao" : prox ? "revisao_interna" : "aprovado_interno";
  await db.update(schema.entregaveis).set({ status, etapaRevisao: decisao === "aprovado" && prox ? prox : null }).where(eq(schema.entregaveis.id, e.id));
  const txt = decisao === "aprovado" ? `${ETAPAS_REVISAO[etapa]} aprovou (v${e.versaoAtual})${prox ? ` — segue para ${ETAPAS_REVISAO[prox].toLowerCase()}` : " — aprovado internamente"}` : `${ETAPAS_REVISAO[etapa]} pediu ajustes (v${e.versaoAtual})`;
  await registrar(e.id, u.id, "aprovacao_interna", `${txt} · ${u.nome}${observacao ? `: ${observacao.slice(0, 160)}` : ""}`, { status: e.status, etapa }, { status, decisao, etapa: prox });
  return null;
}

export type EvidenciaCliente = { decisao: "aprovado" | "ajustes" | "reprovado"; tipo: string; texto: string; data: string; quem: string; itemReuniaoId: number | null; arquivo: File | null; observacao: string };
/** Aprovação do cliente: quem vê o projeto registra; exige evidência (tipo + data + quem + texto ou arquivo ou item de reunião). */
export async function aprovacaoCliente(u: Usuario, e: Entregavel, ev: EvidenciaCliente): Promise<string | null> {
  if (!(await podeEditar(u, e))) return "Sem permissão.";
  if (e.versaoAtual < 1) return "Registre ao menos uma versão.";
  if (!(ev.tipo in EVIDENCIAS)) return "Informe como a resposta do cliente chegou (tipo de evidência).";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.data)) return "Informe a data da resposta do cliente.";
  if (ev.quem.trim().length < 2) return "Informe quem respondeu pelo cliente.";
  const temArquivo = Boolean(ev.arquivo && ev.arquivo.size);
  if (!ev.texto.trim() && !temArquivo && !ev.itemReuniaoId) return "Cole o trecho da evidência, anexe o arquivo ou aponte o item de reunião. Aprovação sem evidência não é registrada.";
  if (ev.arquivo && ev.arquivo.size > LIMITE_ARQUIVO) return "Arquivo acima de 15 MB.";
  if (ev.itemReuniaoId) {
    const it = (await db.select({ id: schema.itensReuniao.id, tipo: schema.itensReuniao.tipo }).from(schema.itensReuniao).where(eq(schema.itensReuniao.id, ev.itemReuniaoId)).limit(1))[0];
    if (!it || it.tipo !== "aprovacao") return "O item de reunião indicado não é um item de aprovação.";
  }
  const buf = temArquivo ? Buffer.from(await ev.arquivo!.arrayBuffer()) : null;
  await db.insert(schema.aprovacoesEntregavel).values({ entregavelId: e.id, versaoNumero: e.versaoAtual, instancia: "cliente", decisao: ev.decisao, observacao: ev.observacao.trim() || null, evidenciaTipo: ev.tipo, evidenciaTexto: ev.texto.trim() || null, evidenciaData: ev.data, evidenciaQuem: ev.quem.trim(), itemReuniaoId: ev.itemReuniaoId, nomeArquivo: buf ? ev.arquivo!.name : null, tipoMime: buf ? ev.arquivo!.type || "application/octet-stream" : null, tamanho: buf ? buf.length : null, conteudo: buf, registradoPor: u.id });
  const status = ev.decisao === "aprovado" ? "aprovado_cliente" : "ajustes_cliente";
  await db.update(schema.entregaveis).set({ status }).where(eq(schema.entregaveis.id, e.id));
  await registrar(e.id, u.id, "aprovacao_cliente", `Cliente ${ev.decisao === "aprovado" ? "aprovou" : ev.decisao === "ajustes" ? "pediu ajustes" : "reprovou"} a v${e.versaoAtual} em ${ev.data.split("-").reverse().join("/")} (${EVIDENCIAS[ev.tipo]}, por ${ev.quem.trim()}); registrado por ${u.nome}`, { status: e.status }, { status, decisao: ev.decisao, evidenciaTipo: ev.tipo });
  return null;
}

export async function comentar(u: Usuario, e: Entregavel, texto: string): Promise<string | null> {
  if (!(await podeVer(u, e))) return "Sem permissão.";
  const t = texto.trim(); if (t.length < 2) return "Escreva o comentário.";
  await db.insert(schema.comentariosEntregavel).values({ entregavelId: e.id, texto: t, autorId: u.id });
  await registrar(e.id, u.id, "comentario", `Comentário de ${u.nome}: ${t.slice(0, 120)}`);
  return null;
}

/** Indicadores para o Painel e o projeto: contagens por status (sem pessoas). */
export async function contagens(projeto?: number) {
  const r = (await db.execute(sql.raw(`select status, count(*)::int n from entregavel ${projeto ? `where projeto_codigo=${projeto}` : ""} group by 1`))).rows as { status: string; n: number }[];
  const m: Record<string, number> = {}; for (const x of r) m[x.status] = Number(x.n);
  return { porStatus: m, abertos: Object.entries(m).filter(([s]) => !["aprovado_cliente", "cancelado"].includes(s)).reduce((a, [, n]) => a + n, 0), aguardandoInterna: m.revisao_interna ?? 0, aguardandoCliente: m.enviado_cliente ?? 0, ajustesCliente: m.ajustes_cliente ?? 0, aprovadosCliente: m.aprovado_cliente ?? 0 };
}
