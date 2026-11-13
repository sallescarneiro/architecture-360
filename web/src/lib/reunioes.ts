// Reuniões (T-188, Fase 4): registro de reuniões ligadas a projeto/cliente do Vobi, com pauta, ata, decisões, aprovações e
// encaminhamentos no A360. Regras: Vobi só leitura (nada vira tarefa lá); histórico só-acréscimo; arquiteta vê e edita só
// reuniões que criou, de que participa ou de projetos em que participa (mesma regra D-A); sem cobrança, ranking ou notificação.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Usuario } from "@/lib/auth";
import { restricaoDe, sqlParticipa } from "@/lib/participacao";
import { ultimaCargaAceita } from "@/lib/consultas";
import { FUSO } from "@/lib/agenda/datas";
import { ORIGENS } from "@/lib/reunioes-motivos";

export type Reuniao = typeof schema.reunioes.$inferSelect;
export type ItemReuniao = typeof schema.itensReuniao.$inferSelect;
export type Participante = { email: string | null; nome: string; externo: boolean };

export const STATUS_REUNIAO: Record<string, { rotulo: string; tom: "ok" | "warn" | "bad" | "neutral" }> = {
  planejada: { rotulo: "planejada", tom: "neutral" }, realizada: { rotulo: "realizada", tom: "ok" }, cancelada: { rotulo: "cancelada", tom: "bad" },
};
export const TIPOS_ITEM: Record<string, { rotulo: string; plural: string }> = {
  decisao: { rotulo: "decisão", plural: "Decisões" }, aprovacao: { rotulo: "aprovação", plural: "Aprovações" }, encaminhamento: { rotulo: "encaminhamento", plural: "Encaminhamentos" },
};

const gestao = (u: Usuario) => u.perfil === "admin" || u.perfil === "gestao" || u.perfil === "coordenacao";

/** Condição SQL de visibilidade para a arquiteta: criou, participa pelo e-mail ou participa do projeto (dados do Vobi). */
async function sqlVisivel(u: Usuario): Promise<string> {
  if (gestao(u)) return "true";
  const r = await restricaoDe(u.email);
  const carga = await ultimaCargaAceita();
  const esc = u.email.replace(/'/g, "''");
  const porProjeto = carga ? `(r.projeto_codigo is not null and exists (select 1 from projeto p where p.codigo = r.projeto_codigo and ${sqlParticipa(r.email, r.nomes, carga.id, "p")}))` : "false";
  return `(r.criado_por = ${u.id} or exists (select 1 from jsonb_array_elements(r.participantes) x where lower(x->>'email') = '${esc}') or ${porProjeto})`;
}

export async function podeVer(u: Usuario, r: Reuniao): Promise<boolean> {
  if (gestao(u)) return true;
  const cond = await sqlVisivel(u);
  const q = await db.execute(sql.raw(`select 1 from reuniao r where r.id = ${r.id} and ${cond}`));
  return q.rows.length > 0;
}
/** Editar segue a mesma regra de ver (quem pode ver, pode registrar ata e itens); reuniões canceladas não são editadas. */
export const podeEditar = async (u: Usuario, r: Reuniao) => r.status !== "cancelada" && (await podeVer(u, r));

export type FiltrosReuniao = { projeto: number | null; cliente: number | null; status: string; de: string | null; ate: string | null; q: string; motivo: string; origem: string };

export function lerFiltros(sp: Record<string, string | string[] | undefined>): FiltrosReuniao {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const dia = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  return { projeto: /^\d+$/.test(um(sp.projeto)) ? Number(um(sp.projeto)) : null, cliente: /^\d+$/.test(um(sp.cliente)) ? Number(um(sp.cliente)) : null,
    status: ["planejada", "realizada", "cancelada"].includes(um(sp.status)) ? um(sp.status) : "", de: dia(um(sp.de)), ate: dia(um(sp.ate)), q: um(sp.q).slice(0, 80),
    // T-227: motivo (id ou "nc" = não classificada) e origem (chave ou "nc" = não informada)
    motivo: /^(\d+|nc)$/.test(um(sp.motivo)) ? um(sp.motivo) : "", origem: um(sp.origem) === "nc" || ORIGENS[um(sp.origem)] ? um(sp.origem) : "" };
}

export type ReuniaoLista = Reuniao & { projetoNome: string | null; clienteNome: string | null; decisoes: number; encaminhamentosAbertos: number; motivoNome: string | null; transcricaoKb: number | null; transcricaoAntiga: boolean };

export async function listarReunioes(u: Usuario, f: FiltrosReuniao): Promise<ReuniaoLista[]> {
  const where = [await sqlVisivel(u)];
  if (f.projeto) where.push(`r.projeto_codigo = ${f.projeto}`);
  if (f.cliente) where.push(`r.cliente_codigo = ${f.cliente}`);
  if (f.status) where.push(`r.status = '${f.status}'`);
  if (f.de) where.push(`r.inicio >= timestamptz '${f.de}T00:00:00-03:00'`);
  if (f.ate) where.push(`r.inicio <= timestamptz '${f.ate}T23:59:59-03:00'`);
  if (f.motivo === "nc") where.push("r.motivo_id is null"); else if (f.motivo) where.push(`r.motivo_id = ${Number(f.motivo)}`);
  if (f.origem === "nc") where.push("r.origem is null"); else if (f.origem) where.push(`r.origem = '${f.origem}'`);
  if (f.q) where.push(`(r.titulo ilike '%${f.q.replace(/'/g, "''").replace(/%/g, "")}%' or p.nome ilike '%${f.q.replace(/'/g, "''").replace(/%/g, "")}%' or c.nome ilike '%${f.q.replace(/'/g, "''").replace(/%/g, "")}%')`);
  const q = await db.execute(sql.raw(`select r.*, p.nome as projeto_nome, c.nome as cliente_nome, mo.nome as motivo_nome,
      (select round(length(t.texto) / 1024.0)::int from reuniao_transcricao t where t.reuniao_id = r.id and t.atual limit 1) as transcricao_kb,
      (select t.conteudo is not null from reuniao_transcricao t where t.reuniao_id = r.id and t.atual limit 1) as transcricao_antiga,
      (select count(*)::int from reuniao_item i where i.reuniao_id = r.id and i.tipo in ('decisao','aprovacao')) as decisoes,
      (select count(*)::int from reuniao_item i where i.reuniao_id = r.id and i.tipo = 'encaminhamento' and i.situacao = 'aberto') as encaminhamentos_abertos
    from reuniao r left join projeto p on p.codigo = r.projeto_codigo left join cliente_vobi c on c.codigo = r.cliente_codigo left join reuniao_motivo mo on mo.id = r.motivo_id
    where ${where.join(" and ")} order by r.inicio desc limit 300`));
  return (q.rows as Record<string, unknown>[]).map((x) => ({
    id: Number(x.id), titulo: String(x.titulo), projetoCodigo: x.projeto_codigo == null ? null : Number(x.projeto_codigo), clienteCodigo: x.cliente_codigo == null ? null : Number(x.cliente_codigo),
    inicio: new Date(String(x.inicio)), fim: new Date(String(x.fim)), local: (x.local as string | null) ?? null, participantes: (x.participantes as Participante[]) ?? [],
    pauta: (x.pauta as string | null) ?? null, ata: (x.ata as string | null) ?? null, ataOrigem: (x.ata_origem as string | null) ?? null, ataEstruturada: x.ata_estruturada ?? null, status: String(x.status), eventoGoogleId: (x.evento_google_id as string | null) ?? null, eventoUsuarioId: x.evento_usuario_id == null ? null : Number(x.evento_usuario_id),
    criadoPor: Number(x.criado_por), criadoEm: new Date(String(x.criado_em)), atualizadoEm: new Date(String(x.atualizado_em)),
    motivoId: x.motivo_id == null ? null : Number(x.motivo_id), origem: (x.origem as string | null) ?? null,
    gravacaoUrl: (x.gravacao_url as string | null) ?? null, gravacaoPlataforma: (x.gravacao_plataforma as string | null) ?? null, gravacaoData: (x.gravacao_data as string | null) ?? null,
    gravacaoDuracaoMin: x.gravacao_duracao_min == null ? null : Number(x.gravacao_duracao_min), avisoGravacaoForma: (x.aviso_gravacao_forma as string | null) ?? null,
    avisoGravacaoPor: x.aviso_gravacao_por == null ? null : Number(x.aviso_gravacao_por), avisoGravacaoEm: x.aviso_gravacao_em ? new Date(String(x.aviso_gravacao_em)) : null,
    motivoNome: (x.motivo_nome as string | null) ?? null, transcricaoKb: x.transcricao_kb == null ? null : Number(x.transcricao_kb), transcricaoAntiga: Boolean(x.transcricao_antiga),
    projetoNome: (x.projeto_nome as string | null) ?? null, clienteNome: (x.cliente_nome as string | null) ?? null, decisoes: Number(x.decisoes), encaminhamentosAbertos: Number(x.encaminhamentos_abertos),
  }));
}

export async function reuniaoPorId(id: number): Promise<Reuniao | null> {
  return (await db.select().from(schema.reunioes).where(eq(schema.reunioes.id, id)).limit(1))[0] ?? null;
}
export async function reuniaoPorEvento(googleId: string): Promise<Reuniao | null> {
  return (await db.select().from(schema.reunioes).where(eq(schema.reunioes.eventoGoogleId, googleId)).orderBy(desc(schema.reunioes.id)).limit(1))[0] ?? null;
}
export async function itensDe(reuniaoId: number): Promise<ItemReuniao[]> {
  return db.select().from(schema.itensReuniao).where(eq(schema.itensReuniao.reuniaoId, reuniaoId)).orderBy(schema.itensReuniao.id);
}
export async function historicoDe(reuniaoId: number) {
  return db.select({ id: schema.historicoReuniao.id, acao: schema.historicoReuniao.acao, resumo: schema.historicoReuniao.resumo, quando: schema.historicoReuniao.quando, quem: schema.usuarios.nome })
    .from(schema.historicoReuniao).innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.historicoReuniao.usuarioId))
    .where(eq(schema.historicoReuniao.reuniaoId, reuniaoId)).orderBy(desc(schema.historicoReuniao.id));
}
export async function reunioesDoProjeto(codigo: number): Promise<Reuniao[]> {
  return db.select().from(schema.reunioes).where(eq(schema.reunioes.projetoCodigo, codigo)).orderBy(desc(schema.reunioes.inicio)).limit(20);
}
/** Encaminhamentos abertos dos projetos indicados (para o detalhe do projeto). */
export async function encaminhamentosAbertosDe(reuniaoIds: number[]): Promise<ItemReuniao[]> {
  if (!reuniaoIds.length) return [];
  return db.select().from(schema.itensReuniao).where(and(inArray(schema.itensReuniao.reuniaoId, reuniaoIds), eq(schema.itensReuniao.tipo, "encaminhamento"), eq(schema.itensReuniao.situacao, "aberto"))).orderBy(schema.itensReuniao.prazo);
}

async function registrar(tx: typeof db, reuniaoId: number, usuarioId: number, acao: string, resumo: string, antes?: unknown, depois?: unknown) {
  await tx.insert(schema.historicoReuniao).values({ reuniaoId, usuarioId, acao, resumo: resumo.slice(0, 300), antes: antes ?? null, depois: depois ?? null });
}

export type DadosReuniao = { titulo: string; projetoCodigo: number | null; motivoId: number | null; origem: string | null; data: string; horaInicio: string; horaFim: string; local: string; participantes: Participante[]; pauta: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function lerParticipantes(texto: string): Participante[] {
  return [...new Set(texto.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean))].slice(0, 60).map((s) => {
    const m = /^(.*?)<([^>]+)>$/.exec(s);
    const email = m ? m[2].trim().toLowerCase() : EMAIL.test(s) ? s.toLowerCase() : null;
    const nome = m ? m[1].trim() || email! : email ? s.split("@")[0] : s;
    return { email, nome, externo: email ? !email.endsWith("@rucelle.com.br") : true };
  });
}

export function lerDados(fd: FormData): { dados: DadosReuniao } | { erro: string } {
  const g = (k: string) => String(fd.get(k) ?? "").trim();
  const titulo = g("titulo").slice(0, 200), data = g("data"), hi = g("hora_inicio"), hf = g("hora_fim");
  if (!titulo) return { erro: "Informe o título da reunião." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Informe a data." };
  if (!/^\d{2}:\d{2}$/.test(hi) || !/^\d{2}:\d{2}$/.test(hf)) return { erro: "Informe início e término." };
  if (hf <= hi) return { erro: "O término precisa ser depois do início." };
  // T-227: toda reunião pertence a um projeto (o cliente vem dele); motivo e origem são obrigatórios
  const proj = g("projeto"), mot = g("motivo"), origem = g("origem");
  if (!/^\d+$/.test(proj)) return { erro: "Escolha o projeto: toda reunião precisa estar ligada a um projeto." };
  if (!/^\d+$/.test(mot)) return { erro: "Escolha o motivo da reunião." };
  if (!ORIGENS[origem]) return { erro: "Informe a origem da reunião (quem solicitou)." };
  return { dados: { titulo, projetoCodigo: Number(proj), motivoId: Number(mot), origem, data, horaInicio: hi, horaFim: hf, local: g("local").slice(0, 300), participantes: lerParticipantes(g("participantes")), pauta: g("pauta").slice(0, 8000) } };
}

async function clienteDoProjeto(codigo: number | null): Promise<number | null> {
  if (!codigo) return null;
  const p = (await db.select({ c: schema.projetos.clienteCodigo }).from(schema.projetos).where(eq(schema.projetos.codigo, codigo)).limit(1))[0];
  return p?.c ?? null;
}

export async function criarReuniao(u: Usuario, d: DadosReuniao, evento?: { googleId: string; usuarioId: number } | null): Promise<number> {
  const inicio = new Date(`${d.data}T${d.horaInicio}:00-03:00`), fim = new Date(`${d.data}T${d.horaFim}:00-03:00`);
  const clienteCodigo = await clienteDoProjeto(d.projetoCodigo);
  return db.transaction(async (tx) => {
    const [r] = await tx.insert(schema.reunioes).values({ titulo: d.titulo, projetoCodigo: d.projetoCodigo, motivoId: d.motivoId, origem: d.origem, clienteCodigo, inicio, fim, local: d.local || null, participantes: d.participantes, pauta: d.pauta || null, eventoGoogleId: evento?.googleId ?? null, eventoUsuarioId: evento?.usuarioId ?? null, criadoPor: u.id }).returning({ id: schema.reunioes.id });
    await registrar(tx as unknown as typeof db, r.id, u.id, "criada", `Reunião criada${evento ? " a partir de um compromisso da Agenda" : ""}`, null, { titulo: d.titulo, projetoCodigo: d.projetoCodigo, motivoId: d.motivoId, origem: d.origem, inicio, fim });
    return r.id;
  });
}

export async function atualizarReuniao(u: Usuario, r: Reuniao, d: DadosReuniao): Promise<void> {
  const inicio = new Date(`${d.data}T${d.horaInicio}:00-03:00`), fim = new Date(`${d.data}T${d.horaFim}:00-03:00`);
  const clienteCodigo = await clienteDoProjeto(d.projetoCodigo);
  const antes = { titulo: r.titulo, projetoCodigo: r.projetoCodigo, motivoId: r.motivoId, origem: r.origem, inicio: r.inicio, fim: r.fim, local: r.local, participantes: r.participantes, pauta: r.pauta };
  const depois = { titulo: d.titulo, projetoCodigo: d.projetoCodigo, motivoId: d.motivoId, origem: d.origem, inicio, fim, local: d.local || null, participantes: d.participantes, pauta: d.pauta || null };
  await db.transaction(async (tx) => {
    await tx.update(schema.reunioes).set({ ...depois, clienteCodigo, atualizadoEm: new Date() }).where(eq(schema.reunioes.id, r.id));
    await registrar(tx as unknown as typeof db, r.id, u.id, "editada", "Dados da reunião alterados", antes, depois);
  });
}

export async function salvarAta(u: Usuario, r: Reuniao, ata: string): Promise<void> {
  const nova = ata.trim().slice(0, 20000) || null;
  if ((r.ata ?? null) === nova) return;
  await db.transaction(async (tx) => {
    await tx.update(schema.reunioes).set({ ata: nova, atualizadoEm: new Date() }).where(eq(schema.reunioes.id, r.id));
    await registrar(tx as unknown as typeof db, r.id, u.id, "ata", r.ata ? "Ata atualizada" : "Ata registrada", { ata: r.ata }, { ata: nova });
  });
}

export async function mudarStatus(u: Usuario, r: Reuniao, status: "planejada" | "realizada" | "cancelada"): Promise<void> {
  if (r.status === status) return;
  await db.transaction(async (tx) => {
    await tx.update(schema.reunioes).set({ status, atualizadoEm: new Date() }).where(eq(schema.reunioes.id, r.id));
    await registrar(tx as unknown as typeof db, r.id, u.id, "status", `Status: ${STATUS_REUNIAO[r.status]?.rotulo} → ${STATUS_REUNIAO[status]?.rotulo}`, { status: r.status }, { status });
  });
}

export async function adicionarItem(u: Usuario, r: Reuniao, tipo: string, texto: string, responsavel: string, prazo: string): Promise<string | null> {
  if (!TIPOS_ITEM[tipo]) return "Tipo inválido.";
  const t = texto.trim().slice(0, 2000); if (!t) return "Escreva o texto.";
  const enc = tipo === "encaminhamento";
  const pz = enc && /^\d{4}-\d{2}-\d{2}$/.test(prazo) ? prazo : null;
  await db.transaction(async (tx) => {
    const [i] = await tx.insert(schema.itensReuniao).values({ reuniaoId: r.id, tipo, texto: t, responsavel: enc ? responsavel.trim().slice(0, 120) || null : null, prazo: pz, situacao: enc ? "aberto" : "registrado", criadoPor: u.id }).returning({ id: schema.itensReuniao.id });
    await tx.update(schema.reunioes).set({ atualizadoEm: new Date() }).where(eq(schema.reunioes.id, r.id));
    await registrar(tx as unknown as typeof db, r.id, u.id, "item_novo", `${TIPOS_ITEM[tipo].rotulo} registrada: ${t.slice(0, 120)}`, null, { itemId: i.id, tipo, texto: t, responsavel, prazo: pz });
  });
  return null;
}

export async function mudarSituacaoItem(u: Usuario, r: Reuniao, itemId: number, situacao: "aberto" | "feito" | "cancelado"): Promise<void> {
  const i = (await db.select().from(schema.itensReuniao).where(and(eq(schema.itensReuniao.id, itemId), eq(schema.itensReuniao.reuniaoId, r.id))).limit(1))[0];
  if (!i || i.tipo !== "encaminhamento" || i.situacao === situacao) return;
  await db.transaction(async (tx) => {
    await tx.update(schema.itensReuniao).set({ situacao }).where(eq(schema.itensReuniao.id, itemId));
    await tx.update(schema.reunioes).set({ atualizadoEm: new Date() }).where(eq(schema.reunioes.id, r.id));
    await registrar(tx as unknown as typeof db, r.id, u.id, "item_situacao", `Encaminhamento "${i.texto.slice(0, 80)}": ${i.situacao} → ${situacao}`, { itemId, situacao: i.situacao }, { itemId, situacao });
  });
}

export async function ligarEvento(u: Usuario, r: Reuniao, googleId: string, usuarioId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(schema.reunioes).set({ eventoGoogleId: googleId, eventoUsuarioId: usuarioId, atualizadoEm: new Date() }).where(eq(schema.reunioes.id, r.id));
    await registrar(tx as unknown as typeof db, r.id, u.id, "agenda", "Compromisso criado no Google Agenda e ligado à reunião", null, { googleId });
  });
}

export const fmtPeriodo = (a: Date, b: Date) => {
  const d = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }).format(a).replace(".", "");
  const h = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
  return `${d} · ${h.format(a)}–${h.format(b)}`;
};
export const prazoVencido = (prazo: string | null, hoje: string) => Boolean(prazo && prazo < hoje);


// ---------------------------------------------------------------------------
// T-227 — gravação (só o link e metadados) com aviso obrigatório; acesso registrado no histórico
// ---------------------------------------------------------------------------
export const PLATAFORMAS: Record<string, string> = { drive: "Google Drive (Meet)", zoom: "Zoom", teams: "Microsoft Teams", outra: "Outra" };
export const FORMAS_AVISO: Record<string, string> = { inicio: "No início da reunião, verbalmente", convite: "No convite da reunião", mensagem: "Por mensagem ou e-mail antes da reunião", outro: "Outro" };

/** Registra que os participantes foram informados (uma vez por reunião; fica no histórico). */
export async function registrarAviso(u: Usuario, r: Reuniao, forma: string): Promise<string | null> {
  if (r.avisoGravacaoEm) return null;
  if (!FORMAS_AVISO[forma]) return "Diga como os participantes foram informados da gravação.";
  await db.transaction(async (tx) => {
    await tx.update(schema.reunioes).set({ avisoGravacaoForma: forma, avisoGravacaoPor: u.id, avisoGravacaoEm: new Date(), atualizadoEm: new Date() }).where(eq(schema.reunioes.id, r.id));
    await registrar(tx as unknown as typeof db, r.id, u.id, "aviso_gravacao", `Participantes informados da gravação: ${FORMAS_AVISO[forma].toLowerCase()}`, null, { forma });
  });
  return null;
}

export type DadosGravacao = { url: string; plataforma: string; data: string | null; duracaoMin: number | null };
export function lerGravacao(fd: FormData): { dados: DadosGravacao | null } | { erro: string } {
  const url = String(fd.get("gravacao_url") ?? "").trim();
  if (!url) return { dados: null };
  let ok = false; try { ok = new URL(url).protocol === "https:"; } catch { ok = false; }
  if (!ok || url.length > 1000) return { erro: "Link inválido: use um endereço que comece com https://." };
  const plat = String(fd.get("gravacao_plataforma") ?? "drive"), data = String(fd.get("gravacao_data") ?? ""), dur = Number(fd.get("gravacao_duracao"));
  return { dados: { url, plataforma: PLATAFORMAS[plat] ? plat : "outra", data: /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null, duracaoMin: Number.isInteger(dur) && dur > 0 && dur < 1000 ? dur : null } };
}
export async function salvarGravacao(u: Usuario, r: Reuniao, g: DadosGravacao): Promise<void> {
  const antes = { url: r.gravacaoUrl, plataforma: r.gravacaoPlataforma, data: r.gravacaoData, duracaoMin: r.gravacaoDuracaoMin };
  await db.transaction(async (tx) => {
    await tx.update(schema.reunioes).set({ gravacaoUrl: g.url, gravacaoPlataforma: g.plataforma, gravacaoData: g.data, gravacaoDuracaoMin: g.duracaoMin, atualizadoEm: new Date() }).where(eq(schema.reunioes.id, r.id));
    await registrar(tx as unknown as typeof db, r.id, u.id, "gravacao", r.gravacaoUrl ? "Link da gravação alterado" : "Link da gravação registrado", antes, g);
  });
}
/** Registra a abertura do link da gravação (quem e quando) e devolve o link. */
export async function registrarAcessoGravacao(u: Usuario, r: Reuniao, tempo?: string | null): Promise<void> {
  await registrar(db, r.id, u.id, "acesso_gravacao", `Abriu a gravação${tempo ? ` (ponto ${tempo})` : ""}`, null, tempo ? { tempo } : null);
}
export async function acessosGravacao(reuniaoId: number) {
  const r = await db.execute(sql`select count(*)::int n, max(h.quando) ultimo, (select u.nome from reuniao_historico h2 join usuario u on u.id = h2.usuario_id where h2.reuniao_id = ${reuniaoId} and h2.acao = 'acesso_gravacao' order by h2.id desc limit 1) quem
    from reuniao_historico h where h.reuniao_id = ${reuniaoId} and h.acao = 'acesso_gravacao'`);
  const x = r.rows[0] as { n: number; ultimo: string | null; quem: string | null };
  return { total: Number(x.n), ultimo: x.ultimo ? new Date(x.ultimo) : null, quem: x.quem };
}

// ---------------------------------------------------------------------------
// T-227 — histórico por cliente, separado por projeto (respeita a mesma visibilidade da lista)
// ---------------------------------------------------------------------------
export async function buscarClientes(q: string) {
  const t = q.trim().slice(0, 80); if (!t) return [];
  const like = `%${t.replace(/%/g, "")}%`;
  const r = await db.execute(sql`select c.codigo, c.nome, count(distinct p.codigo)::int projetos,
      (select p2.codigo from projeto p2 where p2.cliente_codigo = c.codigo and (p2.codigo::text like ${like} or p2.nome ilike ${like}) limit 1) proj_codigo,
      (select p2.nome from projeto p2 where p2.cliente_codigo = c.codigo and (p2.codigo::text like ${like} or p2.nome ilike ${like}) limit 1) proj_nome
    from cliente_vobi c join projeto p on p.cliente_codigo = c.codigo
    where c.nome ilike ${like} or exists (select 1 from projeto p3 where p3.cliente_codigo = c.codigo and (p3.codigo::text like ${like} or p3.nome ilike ${like}))
    group by c.codigo, c.nome order by c.nome limit 12`);
  return (r.rows as { codigo: number; nome: string; projetos: number; proj_codigo: number | null; proj_nome: string | null }[]).map((x) => ({ ...x, codigo: Number(x.codigo), projetos: Number(x.projetos) }));
}
export async function historicoDoCliente(u: Usuario, clienteCodigo: number) {
  const cond = await sqlVisivel(u);
  const r = await db.execute(sql.raw(`select r.id, r.titulo, r.inicio, r.origem, r.projeto_codigo, p.nome projeto_nome, mo.nome motivo_nome, r.gravacao_url is not null tem_gravacao,
      exists (select 1 from reuniao_transcricao t where t.reuniao_id = r.id) tem_transcricao
    from reuniao r join projeto p on p.codigo = r.projeto_codigo left join reuniao_motivo mo on mo.id = r.motivo_id
    where p.cliente_codigo = ${Number(clienteCodigo)} and ${cond} order by p.nome, r.inicio desc`));
  const grupos = new Map<number, { codigo: number; nome: string; reunioes: { id: number; titulo: string; inicio: Date; origem: string | null; motivo: string | null; gravacao: boolean; transcricao: boolean }[] }>();
  for (const x of r.rows as Record<string, unknown>[]) {
    const cod = Number(x.projeto_codigo);
    const g = grupos.get(cod) ?? { codigo: cod, nome: String(x.projeto_nome), reunioes: [] };
    g.reunioes.push({ id: Number(x.id), titulo: String(x.titulo), inicio: new Date(String(x.inicio)), origem: (x.origem as string | null) ?? null, motivo: (x.motivo_nome as string | null) ?? null, gravacao: Boolean(x.tem_gravacao), transcricao: Boolean(x.tem_transcricao) });
    grupos.set(cod, g);
  }
  return [...grupos.values()];
}
