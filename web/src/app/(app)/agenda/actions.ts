"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { desconectar } from "@/lib/agenda/google";
import { associarProjeto, criar, editar, excluir, lerFormulario } from "@/lib/agenda/operacoes";
import { sincronizar } from "@/lib/agenda/sync";

/** "Atualizar agora": ignora o cache de 10 minutos. Só a própria agenda do usuário da sessão. */
export async function atualizarAgendaAction(fd: FormData) {
  const u = await exigirUsuario();
  const r = await sincronizar(u.id, true);
  revalidatePath("/agenda");
  const volta = String(fd.get("volta") ?? "/agenda");
  const sep = volta.includes("?") ? "&" : "?";
  redirect(r.motivo === "ok" ? `${volta}${sep}atualizada=1` : `${volta}${sep}sinc=${r.motivo}`);
}

/** Desconectar: revoga no Google (melhor esforço) e apaga tokens e espelho do próprio usuário. */
export async function desconectarAgendaAction() {
  const u = await exigirUsuario();
  await desconectar(u.id);
  revalidatePath("/agenda");
  redirect("/agenda/conexao?desconectada=1");
}

const seguro = (s: string) => (s.startsWith("/agenda") ? s : "/agenda");

export async function criarEventoAction(fd: FormData) {
  const u = await exigirUsuario();
  const volta = seguro(String(fd.get("volta") ?? "/agenda"));
  const f = lerFormulario(fd);
  if ("erro" in f) redirect(`/agenda/novo?erro=${encodeURIComponent(f.erro)}&volta=${encodeURIComponent(volta)}&d=${encodeURIComponent(String(fd.get("data") ?? ""))}`);
  const r = await criar(u.id, f.dados);
  revalidatePath("/agenda");
  if (!r.ok) redirect(`/agenda/novo?erro=${encodeURIComponent(r.mensagem)}&volta=${encodeURIComponent(volta)}&d=${encodeURIComponent(f.dados.data)}`);
  redirect(r.id ? `/agenda/e/${r.id}?criado=1&volta=${encodeURIComponent(volta)}` : `${volta}${volta.includes("?") ? "&" : "?"}criado=1`);
}

export async function editarEventoAction(fd: FormData) {
  const u = await exigirUsuario();
  const id = Number(fd.get("id"));
  const volta = seguro(String(fd.get("volta") ?? "/agenda"));
  if (!Number.isInteger(id)) redirect("/agenda");
  const f = lerFormulario(fd);
  if ("erro" in f) redirect(`/agenda/e/${id}/editar?erro=${encodeURIComponent(f.erro)}&volta=${encodeURIComponent(volta)}`);
  const r = await editar(u.id, id, f.dados);
  revalidatePath("/agenda");
  if (!r.ok) redirect(`/agenda/e/${id}/editar?erro=${encodeURIComponent(r.mensagem)}&volta=${encodeURIComponent(volta)}`);
  redirect(`/agenda/e/${r.id ?? id}?editado=1&volta=${encodeURIComponent(volta)}`);
}

export async function excluirEventoAction(fd: FormData) {
  const u = await exigirUsuario();
  const id = Number(fd.get("id"));
  const volta = seguro(String(fd.get("volta") ?? "/agenda"));
  if (!Number.isInteger(id)) redirect("/agenda");
  if (fd.get("confirmo") !== "1") redirect(`/agenda/e/${id}/excluir?erro=${encodeURIComponent("Marque a confirmação para excluir.")}&volta=${encodeURIComponent(volta)}`);
  const r = await excluir(u.id, id, fd.get("avisar") === "1");
  revalidatePath("/agenda");
  if (!r.ok) redirect(`/agenda/e/${id}/excluir?erro=${encodeURIComponent(r.mensagem)}&volta=${encodeURIComponent(volta)}`);
  redirect(`${volta}${volta.includes("?") ? "&" : "?"}excluido=1`);
}

export async function associarProjetoAction(fd: FormData) {
  const u = await exigirUsuario();
  const id = Number(fd.get("id"));
  const volta = seguro(String(fd.get("volta") ?? "/agenda"));
  const proj = String(fd.get("projeto") ?? "");
  if (!Number.isInteger(id)) redirect("/agenda");
  const r = await associarProjeto(u.id, id, /^\d+$/.test(proj) ? Number(proj) : null);
  revalidatePath("/agenda");
  redirect(`/agenda/e/${id}?${r.ok ? "associado=1" : `erro=${encodeURIComponent(r.mensagem)}`}&volta=${encodeURIComponent(volta)}`);
}
