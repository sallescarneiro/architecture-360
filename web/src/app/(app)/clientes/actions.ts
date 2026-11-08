"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import { chaveTexto, limpar } from "@/lib/importador/normalizacao";
import { vincularClientes } from "@/lib/importador/importador";
import { ultimaCargaAceita } from "@/lib/consultas";

/**
 * Decisão manual da coordenação: associa um projeto (nome de cliente ambíguo ou sem correspondência) a um cliente do Vobi.
 * Nada é escrito no Vobi. A decisão fica guardada com o nome do cliente vigente e é reaplicada em toda carga
 * enquanto esse nome não mudar; recalcula os vínculos em seguida.
 */
export async function vincularManualAction(form: FormData) {
  const u = await exigirUsuario(["admin", "gestao", "coordenacao"]);
  const projetoCodigo = Number(form.get("projeto")), clienteCodigo = Number(form.get("cliente"));
  const observacao = limpar(String(form.get("observacao") ?? "")) || null;
  const volta = String(form.get("volta") ?? "/clientes#fila");
  if (!Number.isFinite(projetoCodigo) || !Number.isFinite(clienteCodigo) || !clienteCodigo) redirect(volta);
  const proj = (await db.select().from(schema.projetos).where(eq(schema.projetos.codigo, projetoCodigo)).limit(1))[0];
  const cli = (await db.select({ codigo: schema.clientesVobi.codigo }).from(schema.clientesVobi).where(eq(schema.clientesVobi.codigo, clienteCodigo)).limit(1))[0];
  if (!proj || !cli) redirect(volta);
  const carga = await ultimaCargaAceita();
  await db.transaction(async (tx) => {
    await tx.insert(schema.vinculosClienteManual)
      .values({ projetoCodigo, clienteCodigo, chaveNomeCsv: chaveTexto(proj.cliente), decididoPorId: u.id, observacao })
      .onConflictDoUpdate({ target: schema.vinculosClienteManual.projetoCodigo, set: { clienteCodigo, chaveNomeCsv: chaveTexto(proj.cliente), decididoPorId: u.id, decididoEm: new Date(), observacao } });
    await vincularClientes(tx, carga?.id ?? proj.ultimaCarga);
  });
  revalidatePath("/clientes"); revalidatePath(`/projetos/${projetoCodigo}`); revalidatePath("/");
  redirect(volta);
}

/** Desfaz a decisão manual; o projeto volta ao resultado automático (resolvido, ambíguo ou sem cliente). */
export async function desfazerManualAction(form: FormData) {
  await exigirUsuario(["admin", "gestao", "coordenacao"]);
  const projetoCodigo = Number(form.get("projeto"));
  const volta = String(form.get("volta") ?? "/clientes#fila");
  const proj = (await db.select().from(schema.projetos).where(eq(schema.projetos.codigo, projetoCodigo)).limit(1))[0];
  if (!proj) redirect(volta);
  const carga = await ultimaCargaAceita();
  await db.transaction(async (tx) => {
    await tx.delete(schema.vinculosClienteManual).where(eq(schema.vinculosClienteManual.projetoCodigo, projetoCodigo));
    await vincularClientes(tx, carga?.id ?? proj.ultimaCarga);
  });
  revalidatePath("/clientes"); revalidatePath(`/projetos/${projetoCodigo}`); revalidatePath("/");
  redirect(volta);
}
