"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { criar as criarNoGoogle } from "@/lib/agenda/operacoes";
import { eventoDe } from "@/lib/agenda/sync";
import { adicionarItem, atualizarReuniao, criarReuniao, lerDados, ligarEvento, mudarSituacaoItem, mudarStatus, podeEditar, reuniaoPorId, salvarAta } from "@/lib/reunioes";

const seguro = (s: unknown) => (typeof s === "string" && s.startsWith("/") && !s.startsWith("//") ? s : "/reunioes");
const comParam = (url: string, q: string) => `${url}${url.includes("?") ? "&" : "?"}${q}`;

export async function criarReuniaoAction(fd: FormData) {
  const u = await exigirUsuario();
  const volta = seguro(fd.get("volta"));
  const f = lerDados(fd);
  if ("erro" in f) redirect(`/reunioes/nova?erro=${encodeURIComponent(f.erro)}&volta=${encodeURIComponent(volta)}${fd.get("projeto") ? `&projeto=${fd.get("projeto")}` : ""}`);
  // Ligação com um compromisso já existente da Agenda (vindo do detalhe do evento)
  let evento: { googleId: string; usuarioId: number } | null = null;
  const evId = Number(fd.get("evento"));
  if (Number.isInteger(evId) && evId > 0) { const e = await eventoDe(u.id, evId); if (e && !e.privado) evento = { googleId: e.googleId, usuarioId: u.id }; }
  const id = await criarReuniao(u, f.dados, evento);
  // Opcional: criar também o compromisso no Google Agenda do usuário (reutiliza a Agenda; só se ele pediu)
  if (!evento && fd.get("agenda") === "1") {
    const r = await criarNoGoogle(u.id, { titulo: f.dados.titulo, descricao: f.dados.pauta ? `Pauta:\n${f.dados.pauta}` : "", local: f.dados.local, data: f.dados.data, diaInteiro: false, horaInicio: f.dados.horaInicio, horaFim: f.dados.horaFim,
      participantes: f.dados.participantes.map((p) => p.email).filter((e): e is string => !!e), projetoCodigo: f.dados.projetoCodigo, criarMeet: fd.get("meet") === "1", calendarioId: "primary", enviarConvites: fd.get("convites") === "1" });
    revalidatePath("/reunioes"); revalidatePath("/agenda");
    if (r.ok && r.id) { const e = await eventoDe(u.id, r.id); const reuniao = await reuniaoPorId(id); if (e && reuniao) await ligarEvento(u, reuniao, e.googleId, u.id); redirect(`/reunioes/${id}?criada=1&agenda=1&volta=${encodeURIComponent(volta)}`); }
    redirect(`/reunioes/${id}?criada=1&erro=${encodeURIComponent(`Reunião registrada, mas o compromisso não foi criado no Google: ${r.ok ? "" : r.mensagem}`)}&volta=${encodeURIComponent(volta)}`);
  }
  revalidatePath("/reunioes");
  redirect(`/reunioes/${id}?criada=1&volta=${encodeURIComponent(volta)}`);
}

async function carregar(fd: FormData) {
  const u = await exigirUsuario();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) redirect("/reunioes");
  const r = await reuniaoPorId(id);
  if (!r) redirect("/reunioes");
  if (!(await podeEditar(u, r))) redirect(`/reunioes/${id}?erro=${encodeURIComponent("Você não pode alterar esta reunião.")}`);
  return { u, r, volta: seguro(fd.get("volta")) };
}

export async function editarReuniaoAction(fd: FormData) {
  const { u, r, volta } = await carregar(fd);
  const f = lerDados(fd);
  if ("erro" in f) redirect(`/reunioes/${r.id}/editar?erro=${encodeURIComponent(f.erro)}&volta=${encodeURIComponent(volta)}`);
  await atualizarReuniao(u, r, f.dados);
  revalidatePath("/reunioes");
  redirect(`/reunioes/${r.id}?editada=1&volta=${encodeURIComponent(volta)}`);
}

export async function salvarAtaAction(fd: FormData) {
  const { u, r, volta } = await carregar(fd);
  await salvarAta(u, r, String(fd.get("ata") ?? ""));
  revalidatePath("/reunioes");
  redirect(`/reunioes/${r.id}?ata=1&volta=${encodeURIComponent(volta)}#ata`);
}

export async function mudarStatusAction(fd: FormData) {
  const u = await exigirUsuario();
  const id = Number(fd.get("id")); const r = Number.isInteger(id) ? await reuniaoPorId(id) : null;
  if (!r) redirect("/reunioes");
  // cancelar/reabrir é permitido a quem pode ver (mesmo cancelada, para reabrir)
  const { podeVer } = await import("@/lib/reunioes");
  if (!(await podeVer(u, r))) redirect(`/reunioes/${id}?erro=${encodeURIComponent("Sem permissão.")}`);
  const s = String(fd.get("status"));
  if (s === "planejada" || s === "realizada" || s === "cancelada") await mudarStatus(u, r, s);
  revalidatePath("/reunioes");
  redirect(`/reunioes/${r.id}?status=1&volta=${encodeURIComponent(seguro(fd.get("volta")))}`);
}

export async function adicionarItemAction(fd: FormData) {
  const { u, r, volta } = await carregar(fd);
  const tipo = String(fd.get("tipo") ?? "");
  const erro = await adicionarItem(u, r, tipo, String(fd.get("texto") ?? ""), String(fd.get("responsavel") ?? ""), String(fd.get("prazo") ?? ""));
  revalidatePath("/reunioes");
  redirect(comParam(`/reunioes/${r.id}?volta=${encodeURIComponent(volta)}`, erro ? `erro=${encodeURIComponent(erro)}` : "item=1") + `#${tipo}`);
}

export async function situacaoItemAction(fd: FormData) {
  const { u, r, volta } = await carregar(fd);
  const s = String(fd.get("situacao"));
  if (s === "aberto" || s === "feito" || s === "cancelado") await mudarSituacaoItem(u, r, Number(fd.get("item")), s);
  revalidatePath("/reunioes");
  redirect(`/reunioes/${r.id}?volta=${encodeURIComponent(volta)}#encaminhamento`);
}
