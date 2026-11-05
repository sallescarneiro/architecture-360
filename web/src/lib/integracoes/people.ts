import { desc, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Integração com o People Rucelle — fonte oficial de cargos, gestores, coordenadores e vínculos.
 *
 * Padrão reutilizado: o mesmo das plataformas Rucelle (Central → People): endpoint HTTP de exportação
 * protegido por cabeçalho `x-admin-key` (token em variável de ambiente). Aqui o A360 é o consumidor:
 *   GET {PEOPLE_URL}{PEOPLE_EXPORT_PATH}   com   x-admin-key: {PEOPLE_TOKEN}
 *
 * O A360 nunca grava no People e nunca inventa dado organizacional: o que não vier é "dado ausente".
 * O código do People não está disponível (Painel T-112); o formato abaixo é o contrato ESPERADO e deve ser
 * confirmado quando o endpoint existir. Enquanto PEOPLE_URL/PEOPLE_TOKEN não estiverem definidos, a
 * integração fica "não configurada" e o sistema segue funcionando sem hierarquia.
 */
export type PessoaPeople = {
  email: string; id?: string; nome: string; cargo?: string | null; funcao?: string | null; equipe?: string | null;
  gestorEmail?: string | null; coordenadorEmail?: string | null; ativo?: boolean | null; atualizadoEm?: string | null;
};

const CAMINHO_PADRAO = "/api/export/pessoas";

export function peopleConfigurado() {
  return Boolean(process.env.PEOPLE_URL && process.env.PEOPLE_TOKEN);
}

/** Lê o People. Nunca lança: devolve status para registro, sem expor o token. */
export async function lerPeople(): Promise<{ status: "ok"; pessoas: PessoaPeople[] } | { status: "nao_configurado" | "indisponivel" | "erro"; motivo: string }> {
  if (!peopleConfigurado()) return { status: "nao_configurado", motivo: "PEOPLE_URL/PEOPLE_TOKEN não definidos" };
  const url = `${process.env.PEOPLE_URL!.replace(/\/$/, "")}${process.env.PEOPLE_EXPORT_PATH || CAMINHO_PADRAO}`;
  try {
    const r = await fetch(url, { headers: { "x-admin-key": process.env.PEOPLE_TOKEN!, accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return { status: "indisponivel", motivo: `People respondeu HTTP ${r.status}` };
    const j = (await r.json()) as unknown;
    const lista = Array.isArray(j) ? j : (j as { pessoas?: unknown; people?: unknown; items?: unknown })?.pessoas ?? (j as { people?: unknown }).people ?? (j as { items?: unknown }).items;
    if (!Array.isArray(lista)) return { status: "erro", motivo: "resposta do People sem lista de pessoas (formato inesperado)" };
    const pessoas: PessoaPeople[] = [];
    for (const x of lista as Record<string, unknown>[]) {
      const email = String(x.email ?? "").trim().toLowerCase();
      if (!email) continue; // sem identificador comum não há como vincular; não inventar
      pessoas.push({
        email, id: x.id != null ? String(x.id) : undefined, nome: String(x.nome ?? x.name ?? email),
        cargo: (x.cargo as string) ?? (x.role as string) ?? null, funcao: (x.funcao as string) ?? null, equipe: (x.equipe as string) ?? (x.time as string) ?? null,
        gestorEmail: ((x.gestorEmail ?? x.gestor_email) as string)?.toLowerCase() ?? null,
        coordenadorEmail: ((x.coordenadorEmail ?? x.coordenador_email) as string)?.toLowerCase() ?? null,
        ativo: typeof x.ativo === "boolean" ? x.ativo : null, atualizadoEm: (x.atualizadoEm ?? x.updated_at ?? x.atualizado_em) as string | null ?? null,
      });
    }
    return { status: "ok", pessoas };
  } catch (e) {
    return { status: "indisponivel", motivo: (e as Error).name === "TimeoutError" ? "People não respondeu em 15 s" : `falha de rede ao consultar o People (${(e as Error).message})` };
  }
}

/** Sincroniza o espelho local (substituição integral: o People é a verdade; nada é editado aqui). */
export async function sincronizarPeople(porId: number) {
  const r = await lerPeople();
  if (r.status !== "ok") {
    await db.insert(schema.sincronizacoesPeople).values({ status: r.status, motivo: r.motivo, porId });
    return r;
  }
  await db.transaction(async (tx) => {
    await tx.delete(schema.pessoasPeople);
    if (r.pessoas.length) await tx.insert(schema.pessoasPeople).values(r.pessoas.map((p) => ({
      email: p.email, idPeople: p.id ?? null, nome: p.nome, cargo: p.cargo ?? null, funcao: p.funcao ?? null, equipe: p.equipe ?? null,
      gestorEmail: p.gestorEmail ?? null, coordenadorEmail: p.coordenadorEmail ?? null, ativo: p.ativo ?? null,
      atualizadoEmPeople: p.atualizadoEm ? new Date(p.atualizadoEm) : null, origem: "people",
    })));
    await tx.insert(schema.sincronizacoesPeople).values({ status: "ok", pessoas: r.pessoas.length, porId });
  });
  return r;
}

export async function estadoOrganizacao() {
  const ultima = (await db.select().from(schema.sincronizacoesPeople).orderBy(desc(schema.sincronizacoesPeople.id)).limit(1))[0] ?? null;
  const [{ n }] = (await db.execute(sql`select count(*)::int n from pessoa_people`)).rows as { n: number }[];
  return { ultima, pessoas: Number(n), sincronizadoEm: ultima?.status === "ok" ? ultima.em : null, configurado: peopleConfigurado() };
}
