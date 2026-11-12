"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { cancelarAtividade, criarAtividade, editarAtividade, lerFormulario, podeGerirAgenda, resolverConflito } from "@/lib/agenda/atividades";
import type { Campo } from "@/lib/vobi/reconciliar";
import { ensaiarFila } from "@/lib/vobi/ensaio";

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
  await ensaiarFila(); // Fase 1: só calcula e registra o que seria enviado
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
  await ensaiarFila();
  revalidatePath("/agenda");
  redirect(`/agenda/atividade/${id}?salva=1&volta=${enc(volta)}`);
}

export async function cancelarAtividadeAction(fd: FormData) {
  const u = await exigirGestao();
  const id = Number(fd.get("id"));
  const volta = seguro(String(fd.get("volta") ?? "/agenda"));
  if (fd.get("confirmo") !== "1") redirect(`/agenda/atividade/${id}?erro=${enc("Marque a confirmação para cancelar.")}&volta=${enc(volta)}`);
  const r = await cancelarAtividade(u, id);
  await ensaiarFila();
  revalidatePath("/agenda");
  redirect(`/agenda/atividade/${id}?${r.ok ? "cancelada=1" : `erro=${enc(r.mensagem ?? "erro")}`}&volta=${enc(volta)}`);
}

export async function resolverConflitoAction(fd: FormData) {
  const u = await exigirGestao();
  const id = Number(fd.get("id"));
  const campo = String(fd.get("campo")) as Campo;
  const escolha = fd.get("escolha") === "vobi" ? "vobi" : "a360";
  const r = await resolverConflito(u, id, campo, escolha);
  await ensaiarFila();
  revalidatePath("/agenda");
  redirect(`/agenda/atividade/${id}?${r.ok ? "resolvido=1" : `erro=${enc(r.mensagem ?? "erro")}`}`);
}

/** "Rodar ensaio agora" (Fase 1): recalcula o que seria enviado ao Vobi. Nenhuma chamada ao Vobi. */
export async function ensaiarAgoraAction() {
  await exigirGestao();
  await ensaiarFila();
  revalidatePath("/agenda/pendencias");
  redirect("/agenda/pendencias?ensaio=1");
}

/** "Programar no A360" a partir de uma tarefa da Programação do Vobi: valores exatos, sem envio (Fase 0/1). */
export async function programarDoVobiAction(fd: FormData) {
  const u = await exigirGestao();
  const id = Number(fd.get("idVobi"));
  const volta = seguro(String(fd.get("volta") ?? "/agenda"));
  const { programarDoVobi } = await import("@/lib/agenda/atividades");
  const r = await programarDoVobi(u, id);
  if (r.ok) { revalidatePath("/agenda"); redirect(`/agenda/atividade/${r.id}?criada=1&volta=${enc(volta)}`); }
  if (r.formulario) redirect(`/agenda/atividade/nova?tarefa=${id}&volta=${enc(volta)}`);
  redirect(`/agenda/vobi/${id}?erro=${enc(r.mensagem)}&volta=${enc(volta)}`);
}
