"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import { sincronizarPeople } from "@/lib/integracoes/people";

export async function mapearPessoaAction(form: FormData) {
  await exigirUsuario(["admin", "gestao"]);
  const nome = String(form.get("nome") ?? "");
  const email = String(form.get("email") ?? "").trim().toLowerCase() || null;
  await db.update(schema.pessoasVobi).set({ emailRucelle: email, origem: email ? "manual" : "nao_mapeada" }).where(eq(schema.pessoasVobi.nomeVobi, nome));
  // tarefas já importadas passam a enxergar o e-mail (classe de qualidade recalculada na próxima carga)
  if (email) await db.update(schema.tarefas).set({ responsavelEmail: email, semResponsavel: false }).where(eq(schema.tarefas.responsavelNome, nome));
  revalidatePath("/pessoas");
}

/** Recebe a estrutura organizacional do People (fonte oficial). Somente leitura: nada é cadastrado aqui. */
export async function sincronizarPeopleAction() {
  const u = await exigirUsuario(["admin"]);
  await sincronizarPeople(u.id);
  revalidatePath("/pessoas");
}

/**
 * T-218: a API do Vobi identifica o responsável só por um número. Define (ou corrige) a pessoa do Vobi correspondente.
 * Vale para as tarefas já importadas e para as próximas sincronizações; o Vobi não é alterado.
 */
export async function nomearResponsavelVobiAction(form: FormData) {
  await exigirUsuario(["admin", "gestao", "coordenacao"]);
  const idVobi = Number(form.get("idVobi"));
  const nome = String(form.get("nome") ?? "").trim();
  if (!Number.isInteger(idVobi) || !nome) return;
  const pessoa = (await db.select().from(schema.pessoasVobi).where(eq(schema.pessoasVobi.nomeVobi, nome)).limit(1))[0];
  if (!pessoa || nome.startsWith("Vobi #")) return;
  await db.insert(schema.vobiResponsaveis).values({ idVobi, nome, origem: "manual" })
    .onConflictDoUpdate({ target: schema.vobiResponsaveis.idVobi, set: { nome, origem: "manual", atualizadoEm: new Date() } });
  const provisorio = `Vobi #${idVobi}`;
  await db.update(schema.tarefas).set({ responsavelNome: nome, responsavelEmail: pessoa.emailRucelle, semResponsavel: !pessoa.emailRucelle })
    .where(eq(schema.tarefas.responsavelNome, provisorio));
  await db.delete(schema.pessoasVobi).where(eq(schema.pessoasVobi.nomeVobi, provisorio));
  revalidatePath("/pessoas");
}
