// Dados de apoio dos formulários da Agenda: projetos ativos (Vobi, só leitura), calendários com escrita e e-mails conhecidos.
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { calendariosEscrita, conexaoDe, projetosParaAssociacao } from "./sync";

/** Pessoas da rucelle que não usam o A360 mas são convidadas com frequência (pedido da Maiara, 23/11/2026). */
const CONVIDADOS_FIXOS: { email: string; nome: string; rotulo: string }[] = [
  { email: "renatamuraro@rucelle.com.br", nome: "Renata Muraro", rotulo: "Renata (assistente da Flávia)" },
];

export async function apoioFormulario(usuarioId: number) {
  const c = await conexaoDe(usuarioId);
  const projetos = await projetosParaAssociacao();
  // usuários do A360 primeiro: quando a mesma pessoa aparece também no Vobi (com ou sem ponto no e-mail), vale o cadastro do A360
  const r = await db.execute(sql`select lower(email) as email, nome, 0 o from usuario where ativo = true
      union all select lower(email_rucelle), nome_vobi, 1 from pessoa_vobi where email_rucelle is not null order by 3`);
  const vistos = new Map<string, { email: string; nome: string | null; rotulo?: string }>(), pessoas: { email: string; nome: string | null; rotulo?: string }[] = [];
  const completo = (n: string | null) => !!n && n.trim().includes(" ") && !n.includes("@");
  const chave = (e: string) => { const [l, d] = e.split("@"); return `${l.replace(/\./g, "")}@${d}`; };
  for (const p of [...(r.rows as { email: string; nome: string | null }[]), ...CONVIDADOS_FIXOS]) {
    if (!p.email || (c?.emailGoogle && chave(p.email) === chave(c.emailGoogle.toLowerCase()))) continue;
    const ja = vistos.get(chave(p.email));
    if (ja) { if (!completo(ja.nome) && completo(p.nome)) ja.nome = p.nome; continue; } // nome completo do Vobi quando o cadastro só tem o e-mail
    const novo = { ...p }; vistos.set(chave(p.email), novo); pessoas.push(novo);
  }
  pessoas.sort((a, b) => (a.nome ?? a.email).localeCompare(b.nome ?? b.email, "pt-BR"));
  return { c, projetos, calendarios: calendariosEscrita(c), pessoas };
}

const seguro = (s: string | undefined) => (s && s.startsWith("/agenda") ? s : "/agenda");
export const voltaDe = (sp: Record<string, string | undefined>) => seguro(sp.volta);
