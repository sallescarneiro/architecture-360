"use server";
import { redirect } from "next/navigation";
import { entrar, sair } from "@/lib/auth";

export async function entrarAction(_prev: { erro?: string } | undefined, form: FormData) {
  const email = String(form.get("email") ?? "");
  const senha = String(form.get("senha") ?? "");
  const ok = await entrar(email, senha);
  if (!ok) return { erro: "E-mail ou senha inválidos." };
  redirect("/");
}

export async function sairAction() {
  await sair();
  redirect("/login");
}
