"use server";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { podeGerirAgenda } from "@/lib/agenda/atividades";
import { incorporarProjeto } from "@/lib/vobi/sobDemanda";

/** T-219 — incorpora ao A360 um projeto buscado no Vobi (só gestão; só leitura no Vobi). */
export async function incorporarAction(fd: FormData) {
  const u = await exigirUsuario();
  if (!podeGerirAgenda(u.perfil)) redirect("/sem-permissao");
  const codigo = Number(fd.get("codigo"));
  if (!Number.isInteger(codigo) || codigo <= 0) redirect("/projetos/vobi");
  const r = await incorporarProjeto(codigo, u.id);
  if (r.ok) redirect(`/projetos/${codigo}?vobi=${r.situacao}`);
  redirect(`/projetos/vobi?codigo=${codigo}&erro=${encodeURIComponent(r.mensagem)}`);
}
