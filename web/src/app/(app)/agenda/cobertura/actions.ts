"use server";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { podeGerirAgenda } from "@/lib/agenda/atividades";
import { cargaInicialProgramacao } from "@/lib/vobi/espelho";

/** T-219 — carga inicial da Programação do Vobi (só leitura no Vobi). Roda em segundo plano; a tela mostra o andamento. */
export async function cargaInicialAction() {
  const u = await exigirUsuario();
  if (u.perfil !== "admin" && !podeGerirAgenda(u.perfil)) redirect("/sem-permissao");
  void cargaInicialProgramacao().catch((e) => console.error("[vobi] carga inicial:", (e as Error).message));
  await new Promise((r) => setTimeout(r, 1000));
  redirect("/agenda/cobertura?carga=1");
}
