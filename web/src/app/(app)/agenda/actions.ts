"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { desconectar } from "@/lib/agenda/google";
import { sincronizar } from "@/lib/agenda/sync";

/** "Atualizar agora": ignora o cache de 10 minutos. Só a própria agenda do usuário da sessão. */
export async function atualizarAgendaAction() {
  const u = await exigirUsuario();
  const r = await sincronizar(u.id, true);
  revalidatePath("/agenda");
  redirect(r.motivo === "ok" ? "/agenda?atualizada=1" : `/agenda?sinc=${r.motivo}`);
}

/** Desconectar: revoga no Google (melhor esforço) e apaga tokens e espelho do próprio usuário. */
export async function desconectarAgendaAction() {
  const u = await exigirUsuario();
  await desconectar(u.id);
  revalidatePath("/agenda");
  redirect("/agenda?desconectada=1");
}
