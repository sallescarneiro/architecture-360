// Reuniões (T-188, Fase 4): registro de reuniões ligadas a projeto/cliente do Vobi, com pauta, ata, decisões, aprovações e
// encaminhamentos no A360. Regras: Vobi só leitura (nada vira tarefa lá); histórico só-acréscimo; arquiteta vê e edita só
// reuniões que criou, de que participa ou de projetos em que participa (mesma regra D-A); sem cobrança, ranking ou notificação.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Usuario } from "@/lib/auth";
import { restricaoDe, sqlParticipa } from "@/lib/participacao";
import { ultimaCargaAceita } from "@/lib/consultas";
import { FUSO } from "@/lib/agenda/datas";

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

export type FiltrosReuniao = { projeto: number | null; cliente: number | null; status: string; de: string | null; ate: string | null; q: string };

export function lerFiltros(sp: Record<string, string | string[] | undefined>): FiltrosReuniao {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const dia = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  return { projeto: /^\d+$/.test(um(sp.projeto)) ? Number(um(sp.projeto)) : null, cliente: /^\d+$/.test(um(sp.cliente)) ? Number(um(sp.cliente)) : null,
    status: ["planejada", "realizada", "cancelada"].includes(um(sp.status)) ? um(sp.status) : "", de: dia(um(sp.de)), ate: dia(um(sp.ate)), q: um(sp.q).slice(0, 80) };
}

export type ReuniaoLista = Reuniao & { projetoNome: string | null; clienteNome: string | null; decisoes: number; encaminhamentosAbertos: number };

export async function listarReunioes(u: Usuario, f: FiltrosReuniao): Promise<ReuniaoLista[]> {
  const where = [await sqlVisivel(u)];
  if (f.projeto) where.push(`r.projeto_codigo = ${f.projeto}`);
  if (f.cliente) where.push(`r.cliente_codigo = ${f.cliente}`);
  if (f.status) where.push(`r.status = '${f.status}'`);
  if (f.de) where.push(`r.inicio >= timestamptz '${f.de}T00:00:00-03:00'`);
  if (f.ate) where.push(`r.inicio <= timestamptz '${f.ate}T23:59:59-03:00'`);
  if (f.q) where.push(`(r.titulo ilike '%${f.q.replace(/'/g, "''").replace(/%/g, "")}%' or p.nome ilike '%${f.q.replace(/'/g, "''").replace(/%/g, "")}%' or c.nome ilike '%${f.q.replace(/'/g, "''").replace(/%/g, "")}%')`);
  const q = await db.execute(sql.raw(`select r.*, p.nome as projeto_nome, c.nome as cliente_nome,
      (select count(*)::int from reuniao_item i where i.reuniao_id = r.id and i.tipo in ('decisao','aprovacao')) as decisoes,
      (select count(*)::int from reuniao_item i where i.reuniao_id = r.id and i.tipo = 'encaminhamento' and i.situacao = 'aberto') as encaminhamentos_abertos
    from reuniao r left join projeto p on p.codigo = r.projeto_codigo left join cliente_vobi c on c.codigo = r.cliente_codigo
    where ${where.join(" and ")} order by r.inicio desc limit 300`));
  return (q.rows as Record<string, unknown>[]).map((x) => ({
    id: Number(x.id), titulo: String(x.titulo), projetoCodigo: x.projeto_codigo == null ? null : Number(x.projeto_codigo), clienteCodigo: x.cliente_codigo == null ? null : Number(x.cliente_codigo),
    inicio: new Date(String(x.inicio)), fim: new Date(String(x.fim)), local: (x.local as string | null) ?? null, participantes: (x.participantes as Participante[]) ?? [],
    pauta: (x.pauta as string | null) ?? null, ata: (x.ata as string | null) ?? null, status: String(x.status), eventoGoogleId: (x.evento_google_id as string | null) ?? null, eventoUsuarioId: x.evento_usuario_id == null ? null : Number(x.evento_usuario_id),
    criadoPor: Number(x.criado_por), criadoEm: new Date(String(x.criado_em)), atualizadoEm: new Date(String(x.atualizado_em)),
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

export type DadosReuniao = { titulo: string; projetoCodigo: number | null; data: string; horaInicio: string; horaFim: string; local: string; participantes: Participante[]; pauta: string };

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
  const proj = g("projeto");
  return { dados: { titulo, projetoCodigo: /^\d+$/.test(proj) ? Number(proj) : null, data, horaInicio: hi, horaFim: hf, local: g("local").slice(0, 300), participantes: lerParticipantes(g("participantes")), pauta: g("pauta").slice(0, 8000) } };
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
    const [r] = await tx.insert(schema.reunioes).values({ titulo: d.titulo, projetoCodigo: d.projetoCodigo, clienteCodigo, inicio, fim, local: d.local || null, participantes: d.participantes, pauta: d.pauta || null, eventoGoogleId: evento?.googleId ?? null, eventoUsuarioId: evento?.usuarioId ?? null, criadoPor: u.id }).returning({ id: schema.reunioes.id });
    await registrar(tx as unknown as typeof db, r.id, u.id, "criada", `Reunião criada${evento ? " a partir de um compromisso da Agenda" : ""}`, null, { titulo: d.titulo, projetoCodigo: d.projetoCodigo, inicio, fim });
    return r.id;
  });
}

export async function atualizarReuniao(u: Usuario, r: Reuniao, d: DadosReuniao): Promise<void> {
  const inicio = new Date(`${d.data}T${d.horaInicio}:00-03:00`), fim = new Date(`${d.data}T${d.horaFim}:00-03:00`);
  const clienteCodigo = await clienteDoProjeto(d.projetoCodigo);
  const antes = { titulo: r.titulo, projetoCodigo: r.projetoCodigo, inicio: r.inicio, fim: r.fim, local: r.local, participantes: r.participantes, pauta: r.pauta };
  const depois = { titulo: d.titulo, projetoCodigo: d.projetoCodigo, inicio, fim, local: d.local || null, participantes: d.participantes, pauta: d.pauta || null };
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

