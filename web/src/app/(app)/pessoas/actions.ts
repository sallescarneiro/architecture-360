"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario } from "@/lib/auth";

export async function mapearPessoaAction(form: FormData) {
  await exigirUsuario(["admin", "gestao"]);
  const nome = String(form.get("nome") ?? "");
  const email = String(form.get("email") ?? "").trim().toLowerCase() || null;
  await db.update(schema.pessoasVobi).set({ emailRucelle: email, origem: email ? "manual" : "nao_mapeada" }).where(eq(schema.pessoasVobi.nomeVobi, nome));
  // tarefas já importadas passam a enxergar o e-mail (classe de qualidade recalculada na próxima carga)
  if (email) await db.update(schema.tarefas).set({ responsavelEmail: email, semResponsavel: false }).where(eq(schema.tarefas.responsavelNome, nome));
  revalidatePath("/pessoas");
}
