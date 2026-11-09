"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { alertaPorId, tratarAlerta, type AcaoAlerta } from "@/lib/alertas";
import { decidirFlag } from "@/lib/flags";

const ACOES: AcaoAlerta[] = ["em_analise", "confirmado", "descartado", "esclarecimento", "alteracao_aprovada", "correcao_rota", "responsavel", "prazo", "providencia", "encerrado", "reaberto"];
const seguro = (s: unknown) => (typeof s === "string" && s.startsWith("/") && !s.startsWith("//") ? s : "/alertas");

export async function tratarAlertaAction(fd: FormData) {
  const u = await exigirUsuario(["admin", "gestao", "coordenacao"]);
  const id = Number(fd.get("id")); const volta = seguro(fd.get("volta"));
  const a = Number.isInteger(id) ? await alertaPorId(id) : null;
  if (!a) redirect("/alertas");
  const acao = String(fd.get("acao")) as AcaoAlerta;
  if (!ACOES.includes(acao)) redirect(`/alertas/${id}?erro=acao`);
  const erro = await tratarAlerta(u, a, acao, { justificativa: String(fd.get("justificativa") ?? ""), responsavel: String(fd.get("responsavel") ?? ""), prazo: String(fd.get("prazo") ?? ""), direcionamento: String(fd.get("direcionamento") ?? "") });
  revalidatePath("/alertas"); revalidatePath("/painel"); revalidatePath(`/projetos/${a.projetoCodigo}`);
  redirect(`/alertas/${id}?${erro ? `erro=${encodeURIComponent(erro)}` : "ok=1"}&volta=${encodeURIComponent(volta)}`);
}

export async function decidirFlagAction(fd: FormData) {
  const u = await exigirUsuario(["admin", "gestao", "coordenacao"]);
  const id = Number(fd.get("id")); const volta = seguro(fd.get("volta"));
  const s = String(fd.get("situacao"));
  const erro = Number.isInteger(id) && (s === "aceita" || s === "resolvida" || s === "aberta") ? await decidirFlag(u, id, s, String(fd.get("justificativa") ?? "")) : "Dados inválidos.";
  revalidatePath("/alertas"); revalidatePath("/painel"); revalidatePath("/integracao-vobi");
  redirect(`${volta}${volta.includes("?") ? "&" : "?"}${erro ? `erro=${encodeURIComponent(erro)}` : "flag=1"}#flags`);
}

export async function validarIaAction(fd: FormData) {
  const u = await exigirUsuario(["admin"]);
  void fd;
  const { validarIntegracaoIA } = await import("@/lib/transcricao/validacao-ia");
  const rel = await validarIntegracaoIA(u);
  revalidatePath("/integracao-vobi"); revalidatePath("/alertas"); revalidatePath("/painel");
  redirect(`/integracao-vobi?validacao=${rel.ok ? "ok" : "erro"}#ia`);
}
