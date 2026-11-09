// Participação de uma pessoa num projeto, determinada só pelos dados importados do Vobi (T-199, decisão D-A de 08/11/2026):
//   a pessoa participa se o seu nome no Vobi está na lista "Colaboradores" do projeto
//   OU se é responsável por alguma tarefa do projeto na última carga.
// O nome do Vobi vem de pessoa_vobi.email_rucelle (semente ou mapeamento manual). Nenhum dado de origem é alterado;
// a regra só decide o que a arquiteta vê. Mesma lógica usada no Meu Dia (meuDiaArquiteta).
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const esc = (s: string) => s.replace(/'/g, "''");

/** Nomes do Vobi associados ao e-mail Rucelle (pode ser mais de um por grafia). Vazio = sem associação confiável. */
export async function nomesVobiDe(email: string): Promise<string[]> {
  return (await db.select({ nome: schema.pessoasVobi.nomeVobi }).from(schema.pessoasVobi).where(eq(schema.pessoasVobi.emailRucelle, email))).map((r) => r.nome);
}

/**
 * Condição SQL "a pessoa participa do projeto `alias`". Sem associação (nenhum nome do Vobi), devolve `false`:
 * a arquiteta não vê projeto nenhum até a gestão mapear o e-mail em Pessoas — nunca um conjunto arbitrário.
 */
export function sqlParticipa(email: string, nomes: string[], cargaId: number, alias = "p"): string {
  const porTarefa = `exists (select 1 from tarefa tp where tp.projeto_codigo=${alias}.codigo and tp.ultima_carga=${cargaId} and tp.orfa=false and tp.responsavel_email='${esc(email)}')`;
  if (!nomes.length) return `(${porTarefa})`;
  const lista = nomes.map((n) => `'${esc(n)}'`).join(",");
  return `(exists (select 1 from jsonb_array_elements_text(${alias}.colaboradores) e where e in (${lista})) or ${porTarefa})`;
}

export type Restricao = { email: string; nomes: string[] };

export async function restricaoDe(email: string): Promise<Restricao> {
  return { email, nomes: await nomesVobiDe(email) };
}
