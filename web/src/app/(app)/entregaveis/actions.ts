"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { aprovacaoCliente, aprovacaoInterna, comentar, criar, editar, lerDados, mudarStatus, novaVersao, porId } from "@/lib/entregaveis";

const volta = (id: number, erro?: string | null, ok?: string) => `/entregaveis/${id}${erro ? `?erro=${encodeURIComponent(erro)}` : ok ? `?ok=${ok}` : ""}`;

export async function criarEntregavelAction(fd: FormData) {
  const u = await exigirUsuario();
  const r = lerDados(fd);
  if ("erro" in r) redirect(`/entregaveis/novo?projeto=${String(fd.get("projeto") ?? "")}&erro=${encodeURIComponent(r.erro)}`);
  const c = await criar(u, r.dados);
  if (!c.ok) redirect(`/entregaveis/novo?projeto=${r.dados.projetoCodigo}&erro=${encodeURIComponent(c.erro)}`);
  revalidatePath("/entregaveis"); revalidatePath(`/projetos/${r.dados.projetoCodigo}`);
  redirect(`/entregaveis/${c.id}?ok=criado`);
}

export async function editarEntregavelAction(fd: FormData) {
  const u = await exigirUsuario();
  const id = Number(fd.get("id")); const e = await porId(id); if (!e) redirect("/entregaveis");
  const r = lerDados(fd);
  if ("erro" in r) redirect(`/entregaveis/${id}/editar?erro=${encodeURIComponent(r.erro)}`);
  const erro = await editar(u, e, r.dados);
  revalidatePath(`/entregaveis/${id}`);
  redirect(erro ? `/entregaveis/${id}/editar?erro=${encodeURIComponent(erro)}` : volta(id, null, "editado"));
}

export async function novaVersaoAction(fd: FormData) {
  const u = await exigirUsuario();
  const id = Number(fd.get("id")); const e = await porId(id); if (!e) redirect("/entregaveis");
  const arq = fd.get("arquivo"); const arquivo = arq instanceof File && arq.size ? arq : null;
  const erro = await novaVersao(u, e, String(fd.get("descricao") ?? ""), String(fd.get("link") ?? ""), arquivo);
  revalidatePath(`/entregaveis/${id}`);
  redirect(volta(id, erro, "versao"));
}

export async function statusEntregavelAction(fd: FormData) {
  const u = await exigirUsuario();
  const id = Number(fd.get("id")); const e = await porId(id); if (!e) redirect("/entregaveis");
  const erro = await mudarStatus(u, e, String(fd.get("status") ?? ""), String(fd.get("justificativa") ?? ""));
  revalidatePath(`/entregaveis/${id}`); revalidatePath("/entregaveis");
  redirect(volta(id, erro, "status"));
}

// Um botão = uma ação: o valor do botão clicado não chega à ação do servidor (o "Pedir ajustes" era gravado como aprovação).
export async function aprovacaoInternaAction(fd: FormData) { await revisaoInterna(fd, "aprovado"); }
export async function ajustesInternaAction(fd: FormData) { await revisaoInterna(fd, "ajustes"); }
async function revisaoInterna(fd: FormData, decisao: "aprovado" | "ajustes") {
  const u = await exigirUsuario(["admin", "gestao", "coordenacao"]);
  const id = Number(fd.get("id")); const e = await porId(id); if (!e) redirect("/entregaveis");
  const erro = await aprovacaoInterna(u, e, decisao, String(fd.get("observacao") ?? ""));
  revalidatePath(`/entregaveis/${id}`); revalidatePath("/entregaveis");
  redirect(volta(id, erro, "interna"));
}

export async function aprovacaoClienteAction(fd: FormData) {
  const u = await exigirUsuario();
  const id = Number(fd.get("id")); const e = await porId(id); if (!e) redirect("/entregaveis");
  const arq = fd.get("arquivo"); const arquivo = arq instanceof File && arq.size ? arq : null;
  const d = String(fd.get("decisao") ?? "aprovado"); const decisao = d === "ajustes" ? "ajustes" : d === "reprovado" ? "reprovado" : "aprovado";
  const item = String(fd.get("item_reuniao") ?? "");
  const erro = await aprovacaoCliente(u, e, { decisao, tipo: String(fd.get("tipo") ?? ""), texto: String(fd.get("texto") ?? ""), data: String(fd.get("data") ?? ""), quem: String(fd.get("quem") ?? ""), itemReuniaoId: /^\d+$/.test(item) ? Number(item) : null, arquivo, observacao: String(fd.get("observacao") ?? "") });
  revalidatePath(`/entregaveis/${id}`); revalidatePath("/entregaveis"); revalidatePath(`/projetos/${e.projetoCodigo}`);
  redirect(volta(id, erro, "cliente"));
}

export async function comentarAction(fd: FormData) {
  const u = await exigirUsuario();
  const id = Number(fd.get("id")); const e = await porId(id); if (!e) redirect("/entregaveis");
  const erro = await comentar(u, e, String(fd.get("texto") ?? ""));
  revalidatePath(`/entregaveis/${id}`);
  redirect(volta(id, erro, "comentario"));
}

