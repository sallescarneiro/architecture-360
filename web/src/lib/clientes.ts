// Consultas de Clientes do Vobi (Etapa 1) e do vínculo projeto × cliente (Etapa 2). Somente leitura.
import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export const URL_CLIENTES_VOBI = "https://plataforma.vobi.com.br/profissional/contatos/clientes";
export const ROTULO_VINCULO: Record<string, string> = { resolvido: "Resolvido pelo nome", manual: "Decisão manual", ambiguo: "Ambíguo", sem_cliente: "Sem cliente associado" };
export const TOM_VINCULO: Record<string, "ok" | "warn" | "bad" | "info" | "neutral"> = { resolvido: "ok", manual: "info", ambiguo: "warn", sem_cliente: "neutral" };

/** Última carga aceita que trouxe Clientes.csv (origem e data exibidas nas telas). */
export async function ultimaCargaClientes() {
  return (await db.select({ id: schema.cargas.id, dataCarga: schema.cargas.dataCarga, confirmadoEm: schema.cargas.confirmadoEm })
    .from(schema.cargas).where(and(eq(schema.cargas.status, "aceita"), isNotNull(schema.cargas.hashClientes))).orderBy(desc(schema.cargas.id)).limit(1))[0] ?? null;
}

export async function listarClientes(q: string) {
  const filtro = q ? sql`and (c.chave_nome like ${"%" + q + "%"} or c.codigo::text = ${q} or lower(coalesce(c.razao_social,'')) like ${"%" + q + "%"} or lower(coalesce(c.cidade,'')) like ${"%" + q + "%"})` : sql``;
  const r = await db.execute(sql`select c.codigo, c.nome, c.razao_social, c.tipo, c.status, c.email, c.telefone, c.cidade, c.estado, c.criado_em_vobi, c.nao_encontrado_desde, c.atualizado_em,
      count(p.codigo)::int projetos, count(p.codigo) filter (where p.status_classe <> 'encerrado')::int ativos
    from cliente_vobi c left join projeto p on p.cliente_codigo = c.codigo where true ${filtro} group by c.codigo order by c.nome`);
  return r.rows as { codigo: number; nome: string; razao_social: string | null; tipo: string | null; status: string | null; email: string | null; telefone: string | null;
    cidade: string | null; estado: string | null; criado_em_vobi: string | null; nao_encontrado_desde: number | null; atualizado_em: Date; projetos: number; ativos: number }[];
}

export async function resumoVinculos() {
  const r = await db.execute(sql`select vinculo_cliente_status k, count(*)::int n from projeto where nao_encontrado_desde is null group by 1`);
  const o = { resolvido: 0, manual: 0, ambiguo: 0, sem_cliente: 0 } as Record<"resolvido" | "manual" | "ambiguo" | "sem_cliente", number>;
  for (const x of r.rows as { k: keyof typeof o; n: number }[]) if (x.k in o) o[x.k] = x.n;
  const [{ n: clientes }] = (await db.execute(sql`select count(*)::int n from cliente_vobi where nao_encontrado_desde is null`)).rows as { n: number }[];
  return { ...o, clientes };
}

/** Fila da coordenação: projetos ambíguos (com candidatos de mesmo nome) e sem correspondência, mais os já decididos manualmente. */
export async function filaVinculos() {
  const clientes = await db.select({ codigo: schema.clientesVobi.codigo, nome: schema.clientesVobi.nome, chaveNome: schema.clientesVobi.chaveNome, cidade: schema.clientesVobi.cidade, estado: schema.clientesVobi.estado, tipo: schema.clientesVobi.tipo, status: schema.clientesVobi.status, criadoEmVobi: schema.clientesVobi.criadoEmVobi })
    .from(schema.clientesVobi).orderBy(asc(schema.clientesVobi.nome));
  // sem clientes importados não há o que decidir: a fila fica vazia em vez de listar todos os projetos
  if (!clientes.length) return { projetos: [], clientes, manuais: new Map<number, { p: number; c: number; em: Date; por: string | null; obs: string | null }>() };
  const projetos = await db.select().from(schema.projetos)
    .where(and(isNull(schema.projetos.naoEncontradoDesde), sql`${schema.projetos.vinculoClienteStatus} in ('ambiguo','manual') or (${schema.projetos.vinculoClienteStatus}='sem_cliente' and coalesce(${schema.projetos.cliente},'')<>'')`))
    .orderBy(asc(schema.projetos.vinculoClienteStatus), asc(schema.projetos.nome));
  const manuais = new Map((await db.select({ p: schema.vinculosClienteManual.projetoCodigo, c: schema.vinculosClienteManual.clienteCodigo, em: schema.vinculosClienteManual.decididoEm, por: schema.usuarios.nome, obs: schema.vinculosClienteManual.observacao })
    .from(schema.vinculosClienteManual).leftJoin(schema.usuarios, eq(schema.vinculosClienteManual.decididoPorId, schema.usuarios.id))).map((m) => [m.p, m]));
  return { projetos, clientes, manuais };
}

export async function clientePorCodigo(codigo: number) {
  const c = (await db.select().from(schema.clientesVobi).where(eq(schema.clientesVobi.codigo, codigo)).limit(1))[0];
  if (!c) return null;
  const projetos = await db.select().from(schema.projetos).where(eq(schema.projetos.clienteCodigo, codigo)).orderBy(asc(schema.projetos.statusClasse), desc(schema.projetos.criadoEm));
  const tarefas = (await db.execute(sql`select p.codigo, count(t.chave)::int total, count(t.chave) filter (where t.status not in ('concluido','cancelado'))::int abertas
    from projeto p left join tarefa t on t.projeto_codigo = p.codigo and t.nao_encontrado_desde is null where p.cliente_codigo=${codigo} group by p.codigo`)).rows as { codigo: number; total: number; abertas: number }[];
  return { cliente: c, projetos, tarefas: new Map(tarefas.map((t) => [t.codigo, t])) };
}
