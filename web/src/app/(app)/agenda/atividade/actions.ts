"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { cancelarAtividade, criarAtividade, editarAtividade, lerFormulario, podeGerirAgenda, resolverConflito } from "@/lib/agenda/atividades";
import type { Campo } from "@/lib/vobi/reconciliar";

// T-219 — ações da Agenda gerencial. Toda ação confere o perfil no servidor (gestão = admin, gestão, coordenação).
const seguro = (s: string) => (s.startsWith("/agenda") ? s : "/agenda");
const enc = encodeURIComponent;

async function exigirGestao() {
  const u = await exigirUsuario();
  if (!podeGerirAgenda(u.perfil)) redirect("/sem-permissao");
  return u;
}

export async function criarAtividadeAction(fd: FormData) {
  const u = await exigirGestao();
  const volta = seguro(String(fd.get("volta") ?? "/agenda"));
  const f = await lerFormulario(fd);
  if ("erro" in f) redirect(`/agenda/atividade/nova?erro=${enc(f.erro)}&volta=${enc(volta)}`);
  const r = await criarAtividade(u, f.dados);
  if (!r.ok) redirect(`/agenda/atividade/nova?erro=${enc(r.mensagem)}&volta=${enc(volta)}`);
  revalidatePath("/agenda");
  redirect(`/agenda/atividade/${r.id}?criada=1&volta=${enc(volta)}`);
}

export async function editarAtividadeAction(fd: FormData) {
  const u = await exigirGestao();
  const id = Number(fd.get("id"));
  const volta = seguro(String(fd.get("volta") ?? "/agenda"));
  if (!Number.isInteger(id)) redirect("/agenda");
  const f = await lerFormulario(fd);
  if ("erro" in f) redirect(`/agenda/atividade/${id}/editar?erro=${enc(f.erro)}&volta=${enc(volta)}`);
  const r = await editarAtividade(u, id, f.dados);
  if (!r.ok) redirect(`/agenda/atividade/${id}/editar?erro=${enc(r.mensagem ?? "erro")}&volta=${enc(volta)}`);
  revalidatePath("/agenda");
  redirect(`/agenda/atividade/${id}?salva=1&volta=${enc(volta)}`);
}

export async function cancelarAtividadeAction(fd: FormData) {
  const u = await exigirGestao();
  const id = Number(fd.get("id"));
  const volta = seguro(String(fd.get("volta") ?? "/agenda"));
  if (fd.get("confirmo") !== "1") redirect(`/agenda/atividade/${id}?erro=${enc("Marque a confirmação para cancelar.")}&volta=${enc(volta)}`);
  const r = await cancelarAtividade(u, id);
  revalidatePath("/agenda");
  redirect(`/agenda/atividade/${id}?${r.ok ? "cancelada=1" : `erro=${enc(r.mensagem ?? "erro")}`}&volta=${enc(volta)}`);
}

export async function resolverConflitoAction(fd: FormData) {
  const u = await exigirGestao();
  const id = Number(fd.get("id"));
  const campo = String(fd.get("campo")) as Campo;
  const escolha = fd.get("escolha") === "vobi" ? "vobi" : "a360";
  const r = await resolverConflito(u, id, campo, escolha);
  revalidatePath("/agenda");
  redirect(`/agenda/atividade/${id}?${r.ok ? "resolvido=1" : `erro=${enc(r.mensagem ?? "erro")}`}`);
}
