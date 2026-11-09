// Dados de apoio dos formulários da Agenda: projetos ativos (Vobi, só leitura), calendários com escrita e e-mails conhecidos.
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { calendariosEscrita, conexaoDe, projetosParaAssociacao } from "./sync";

export async function apoioFormulario(usuarioId: number) {
  const c = await conexaoDe(usuarioId);
  const projetos = await projetosParaAssociacao();
  const r = await db.execute(sql`select distinct lower(e) as email, n as nome from (
      select email_rucelle as e, nome_vobi as n from pessoa_vobi where email_rucelle is not null
      union all select email, nome from usuario where ativo = true) x where e is not null order by 2`);
  const pessoas = (r.rows as { email: string; nome: string | null }[]).filter((p) => p.email && p.email !== c?.emailGoogle);
  return { c, projetos, calendarios: calendariosEscrita(c), pessoas };
}

const seguro = (s: string | undefined) => (s && s.startsWith("/agenda") ? s : "/agenda");
export const voltaDe = (sp: Record<string, string | undefined>) => seguro(sp.volta);
