"use server";
// Etapa A da Agenda de Produção: ações do quadro, da semana da arquiteta, da validação, das indisponibilidades,
// dos feriados e da configuração das pessoas. Toda regra de permissão está em src/lib/agenda/producao.ts (servidor).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import * as P from "@/lib/agenda/producao";

function volta(fd: FormData, padrao: string): string {
  const v = String(fd.get("volta") ?? "");
  return v.startsWith("/agenda") && !v.startsWith("//") ? v : padrao;
}
function com(url: string, params: Record<string, string | null>): string {
  const [base, q = ""] = url.split("?");
  const sp = new URLSearchParams(q);
  for (const k of ["ok", "erro", "aviso"]) sp.delete(k);
  for (const [k, v] of Object.entries(params)) { if (v === null) sp.delete(k); else sp.set(k, v); }
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}
const fim = (url: string, r: { ok: true; avisos?: string[] } | { ok: false; mensagem: string }, ok: string, extra: Record<string, string | null> = {}): never => {
  revalidatePath("/agenda", "layout");
  if (!r.ok) redirect(com(url, { erro: r.mensagem }));
  const av = r.avisos?.length ? `Atenção: ${r.avisos.join("; ")}.` : null;
  redirect(com(url, { ok, aviso: av, ...extra }));
};
const id = (fd: FormData) => Number(fd.get("id"));

export async function criarBlocoAction(fd: FormData) {
  const u = await exigirUsuario(), v = volta(fd, "/agenda/quadro");
  const l = P.lerBloco(fd);
  if ("erro" in l) redirect(com(v, { erro: l.erro }));
  const r = await P.criarBloco(u, l.d);
  fim(v, r, r.ok && !P.gestor(u) ? "Rascunho salvo. Envie para validação quando estiver pronto." : "Atividade incluída na agenda.", { novo: null });
}
export async function editarBlocoAction(fd: FormData) {
  const u = await exigirUsuario(), v = volta(fd, "/agenda/quadro");
  const l = P.lerBloco(fd);
  if ("erro" in l) redirect(com(v, { erro: l.erro }));
  fim(v, await P.editarBloco(u, id(fd), l.d), "Alterações salvas.");
}
export async function reprogramarAction(fd: FormData) {
  const u = await exigirUsuario(), v = volta(fd, "/agenda/quadro");
  fim(v, await P.reprogramar(u, id(fd), String(fd.get("novo_dia") ?? ""), String(fd.get("motivo") ?? ""), String(fd.get("detalhe") ?? "").trim()), "Atividade reprogramada.", { rep: null });
}
export async function enviarAction(fd: FormData) {
  const u = await exigirUsuario();
  fim(volta(fd, "/agenda/semana"), await P.enviarParaValidacao(u, id(fd)), "Enviada para validação (Ana Paula ou Thaís).");
}
export async function descartarAction(fd: FormData) {
  const u = await exigirUsuario();
  fim(volta(fd, "/agenda/semana"), await P.descartarRascunho(u, id(fd)), "Rascunho descartado.", { ver: null });
}
async function decidirComo(fd: FormData, d: "aprovar" | "devolver") {
  const u = await exigirUsuario();
  fim(volta(fd, "/agenda/validacao"), await P.decidir(u, id(fd), d, String(fd.get("comentario") ?? "")), d === "aprovar" ? "Aprovada: já está na programação confirmada." : "Devolvida para ajuste. A arquiteta vê a justificativa.", { sel: null });
}
/** Um botão = uma ação (o valor do botão clicado não é confiável no envio do formulário). */
export async function aprovarAction(fd: FormData) { await decidirComo(fd, "aprovar"); }
export async function devolverAction(fd: FormData) { await decidirComo(fd, "devolver"); }
export async function andamentoAction(fd: FormData) {
  const u = await exigirUsuario(), a = String(fd.get("acao")) as "iniciar" | "concluir" | "impedimento" | "retomar";
  if (!["iniciar", "concluir", "impedimento", "retomar"].includes(a)) redirect("/agenda/semana");
  fim(volta(fd, "/agenda/semana"), await P.andamento(u, id(fd), a, String(fd.get("texto") ?? "")), a === "impedimento" ? "Impedimento avisado à coordenação." : "Andamento atualizado.");
}

export async function indispAction(fd: FormData) {
  const u = await exigirUsuario(), v = volta(fd, "/agenda/indisponibilidades");
  const l = P.lerIndisp(fd);
  if ("erro" in l) redirect(com(v, { erro: l.erro }));
  const r = await P.registrarIndisp(u, l.d);
  fim(v, r, P.gestor(u) ? "Indisponibilidade registrada. Já aparece no quadro da equipe." : "Pedido enviado. Fica pendente até a coordenação confirmar.");
}
export async function decidirIndispAction(fd: FormData) {
  const u = await exigirUsuario(), a = String(fd.get("acao")) as "confirmar" | "recusar" | "cancelar";
  if (!["confirmar", "recusar", "cancelar"].includes(a)) redirect("/agenda/indisponibilidades");
  fim(volta(fd, "/agenda/indisponibilidades"), await P.decidirIndisp(u, id(fd), a), a === "confirmar" ? "Confirmada. Agora desconta da disponibilidade." : a === "recusar" ? "Pedido recusado." : "Cancelada (fica no histórico).");
}
export async function feriadoAction(fd: FormData) {
  const u = await exigirUsuario();
  fim(volta(fd, "/agenda/feriados"), await P.criarFeriado(u, fd), "Feriado cadastrado.");
}
export async function desativarFeriadoAction(fd: FormData) {
  const u = await exigirUsuario();
  fim(volta(fd, "/agenda/feriados"), await P.desativarFeriado(u, id(fd)), "Feriado removido da agenda (fica no histórico).");
}
export async function configAction(fd: FormData) {
  const u = await exigirUsuario();
  fim(volta(fd, "/agenda/pessoas"), await P.salvarConfig(u, id(fd), fd), "Configuração salva.");
}
export async function substitutaAction(fd: FormData) {
  const u = await exigirUsuario();
  fim(volta(fd, "/agenda/pessoas"), await P.designarSubstituta(u, id(fd), String(fd.get("ate") ?? "")), String(fd.get("ate") ?? "") ? "Substituta designada." : "Substituição encerrada.");
}
