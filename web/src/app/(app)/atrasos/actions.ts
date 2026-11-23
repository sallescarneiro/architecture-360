"use server";
// T-287 — justificativa de atraso: registrar (coordenação/gestão/direção) e decidir (gestão/direção). Regras em src/lib/atrasos.ts.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { decidir, registrar } from "@/lib/atrasos";

function volta(fd: FormData): string {
  const v = String(fd.get("volta") ?? "");
  return (v.startsWith("/atrasos") || v.startsWith("/projetos/")) && !v.startsWith("//") ? v : "/atrasos";
}
function com(url: string, k: string, msg: string) {
  const [base, q = ""] = url.split("#")[0].split("?");
  const sp = new URLSearchParams(q); sp.delete("ok"); sp.delete("erro"); sp.set(k, msg);
  return `${base}?${sp.toString()}`;
}

export async function justificarAtrasoAction(fd: FormData) {
  const u = await exigirUsuario(), v = volta(fd);
  const r = await registrar(u, String(fd.get("chave") ?? ""), String(fd.get("categoria") ?? ""), String(fd.get("motivo") ?? ""), String(fd.get("nova_data") ?? "") || null);
  revalidatePath("/atrasos"); revalidatePath("/projetos", "layout");
  redirect(r.ok ? com(v, "ok", "Justificativa registrada. Fica aguardando a validação da Thaís. Lembre de trocar a data no Vobi.") : com(v, "erro", r.mensagem));
}

export async function decidirAtrasoAction(fd: FormData) {
  const u = await exigirUsuario(), v = volta(fd);
  const situacao = fd.get("situacao") === "medida" ? "medida" : "validada";
  const r = await decidir(u, Number(fd.get("id")), situacao, String(fd.get("decisao") ?? ""));
  revalidatePath("/atrasos"); revalidatePath("/projetos", "layout");
  redirect(r.ok ? com(v, "ok", situacao === "validada" ? "Atraso validado como justificado." : "Medida registrada.") : com(v, "erro", r.mensagem));
}
