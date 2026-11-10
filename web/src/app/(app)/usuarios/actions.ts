"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminAlterarPerfil, adminAtivar, adminCriarUsuario, adminRedefinirSenha, exigirUsuario } from "@/lib/auth";

export type EstadoSenha = { erro?: string; senhaProvisoria?: string; email?: string; nome?: string } | undefined;

/** Cria o usuário e devolve a senha provisória UMA vez, só na resposta desta ação (nunca em URL, banco ou log). */
export async function criarUsuarioAction(_prev: EstadoSenha, form: FormData): Promise<EstadoSenha> {
  const admin = await exigirUsuario(["admin"]);
  const nome = String(form.get("nome") ?? "");
  const email = String(form.get("email") ?? "");
  const perfil = String(form.get("perfil") ?? "");
  const r = await adminCriarUsuario(admin, nome, email, perfil);
  if (!r.ok) return { erro: r.erro };
  revalidatePath("/usuarios");
  return { senhaProvisoria: r.senhaProvisoria, email: email.trim().toLowerCase(), nome: nome.trim() };
}

export async function redefinirSenhaAction(_prev: EstadoSenha, form: FormData): Promise<EstadoSenha> {
  const admin = await exigirUsuario(["admin"]);
  const id = Number(form.get("id"));
  const r = await adminRedefinirSenha(admin, id);
  if (!r.ok) return { erro: r.erro };
  revalidatePath("/usuarios");
  return { senhaProvisoria: r.senhaProvisoria, email: String(form.get("email") ?? ""), nome: String(form.get("nome") ?? "") };
}

export async function alterarPerfilAction(form: FormData) {
  const admin = await exigirUsuario(["admin"]);
  const erro = await adminAlterarPerfil(admin, Number(form.get("id")), String(form.get("perfil") ?? ""));
  revalidatePath("/usuarios");
  redirect(erro ? `/usuarios?erro=${encodeURIComponent(erro)}` : "/usuarios?ok=perfil");
}

export async function ativarAction(form: FormData) {
  const admin = await exigirUsuario(["admin"]);
  const ativo = String(form.get("ativo")) === "1";
  const erro = await adminAtivar(admin, Number(form.get("id")), ativo);
  revalidatePath("/usuarios");
  redirect(erro ? `/usuarios?erro=${encodeURIComponent(erro)}` : `/usuarios?ok=${ativo ? "reativado" : "desativado"}`);
}
