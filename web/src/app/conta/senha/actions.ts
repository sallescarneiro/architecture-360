"use server";
import { redirect } from "next/navigation";
import { exigirUsuario, trocarPropriaSenha } from "@/lib/auth";

export async function trocarSenhaAction(_prev: { erro?: string } | undefined, form: FormData) {
  const u = await exigirUsuario();
  const erro = await trocarPropriaSenha(u, String(form.get("atual") ?? ""), String(form.get("nova") ?? ""), String(form.get("confirmacao") ?? ""));
  if (erro) return { erro };
  redirect(u.trocarSenha ? "/meu-dia?senha=ok" : "/conta/senha?ok=1");
}
