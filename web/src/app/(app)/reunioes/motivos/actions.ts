"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { alternarMotivo, incluirMotivo, podeAdministrarMotivos } from "@/lib/reunioes-motivos";

/** T-227 — incluir motivo (sem duplicidade). Só gestão e administração. */
export async function incluirMotivoAction(fd: FormData) {
  const u = await exigirUsuario();
  if (!podeAdministrarMotivos(u)) redirect("/sem-permissao");
  const r = await incluirMotivo(u, String(fd.get("nome") ?? ""));
  revalidatePath("/reunioes/motivos");
  redirect(r.ok ? `/reunioes/motivos?ok=${encodeURIComponent(`Motivo “${r.nome}” incluído. Já aparece no formulário de novas reuniões.`)}` : `/reunioes/motivos?erro=${encodeURIComponent(r.erro)}&nome=${encodeURIComponent(String(fd.get("nome") ?? "").slice(0, 120))}`);
}

/** T-227 — desativar ou reativar (nada é apagado; as reuniões antigas mantêm o motivo). */
export async function alternarMotivoAction(fd: FormData) {
  const u = await exigirUsuario();
  if (!podeAdministrarMotivos(u)) redirect("/sem-permissao");
  const ativo = fd.get("ativo") === "1";
  const r = await alternarMotivo(u, Number(fd.get("id")), ativo);
  revalidatePath("/reunioes/motivos");
  if (!r.ok) redirect(`/reunioes/motivos?erro=${encodeURIComponent(r.erro)}`);
  redirect(`/reunioes/motivos?ok=${encodeURIComponent(ativo ? `“${r.nome}” reativado. Volta a aparecer para novas reuniões.` : `“${r.nome}” desativado. Sai do formulário de novas reuniões; ${r.uso === 1 ? "a reunião que já o usa continua" : `as ${r.uso} reuniões que já o usam continuam`} com ele.`)}`);
}
