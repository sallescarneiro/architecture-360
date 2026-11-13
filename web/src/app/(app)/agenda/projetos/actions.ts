"use server";
// Etapa C da Agenda de Produção: acompanhamento dos projetos ativos, Meus projetos e regras da carteira.
// Permissões no servidor (src/lib/agenda/carteira.ts). Uma ação por botão: o valor do botão clicado não chega à ação.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import * as C from "@/lib/agenda/carteira";

function volta(fd: FormData, padrao: string): string {
  const v = String(fd.get("volta") ?? "");
  return v.startsWith("/agenda") && !v.startsWith("//") ? v : padrao;
}
function com(url: string, params: Record<string, string | null>): string {
  const [semHash, hash = ""] = url.split("#");
  const [base, q = ""] = semHash.split("?");
  const sp = new URLSearchParams(q);
  for (const k of ["ok", "erro"]) sp.delete(k);
  for (const [k, v] of Object.entries(params)) { if (v === null) sp.delete(k); else sp.set(k, v); }
  const s = sp.toString();
  return (s ? `${base}?${s}` : base) + (hash ? `#${hash}` : "");
}
const fim = (url: string, r: { ok: true } | { ok: false; mensagem: string }, ok: string): never => {
  revalidatePath("/agenda", "layout");
  redirect(com(url, r.ok ? { ok } : { erro: r.mensagem }));
};
const num = (fd: FormData, k: string) => { const n = Number(fd.get(k)); return Number.isInteger(n) && n > 0 ? n : null; };
const txt = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function salvarAcompAction(fd: FormData) {
  const u = await exigirUsuario();
  fim(volta(fd, "/agenda/projetos"), await C.salvarAcompanhamento(u, num(fd, "codigo") ?? 0, {
    situacao: txt(fd, "situacao"), etapa: txt(fd, "etapa"), responsavelId: num(fd, "responsavel"), terceirizadoId: num(fd, "terceirizado"),
    acaoTipo: txt(fd, "acao"), acaoQuemId: num(fd, "quem"), acaoAte: txt(fd, "ate"),
  }), "Acompanhamento salvo.");
}
export async function acaoFeitaAction(fd: FormData) {
  const u = await exigirUsuario();
  fim(volta(fd, "/agenda/projetos"), await C.acaoFeita(u, num(fd, "codigo") ?? 0), "Ação marcada como feita. A coordenação define a próxima.");
}
const comunicar = async (fd: FormData, sit: string) => {
  const u = await exigirUsuario();
  fim(volta(fd, "/agenda/projetos"), await C.registrarComunicacao(u, num(fd, "codigo") ?? 0, sit), "Comunicação da semana registrada.");
};
export async function comFeitaAction(fd: FormData) { await comunicar(fd, "feita"); }
export async function comPendenteAction(fd: FormData) { await comunicar(fd, "pendente"); }
export async function comNaAction(fd: FormData) { await comunicar(fd, "na"); }
export async function solicitacaoAction(fd: FormData) {
  const u = await exigirUsuario();
  fim(volta(fd, "/agenda/projetos"), await C.registrarSolicitacao(u, num(fd, "codigo") ?? 0, txt(fd, "texto")), "Pedido do cliente registrado.");
}
export async function regrasAction(fd: FormData) {
  const u = await exigirUsuario();
  fim(volta(fd, "/agenda/pessoas"), await C.salvarRegras(u, Number(fd.get("alta")), Number(fd.get("sob"))), "Referência de carga salva.");
}
export async function incluirTipoAction(fd: FormData) {
  const u = await exigirUsuario();
  fim(volta(fd, "/agenda/pessoas"), await C.incluirTipo(u, txt(fd, "nome")), "Tipo de ação incluído.");
}
export async function desativarTipoAction(fd: FormData) {
  const u = await exigirUsuario();
  fim(volta(fd, "/agenda/pessoas"), await C.desativarTipo(u, num(fd, "id") ?? 0), "Tipo desativado. Ações antigas mantêm o tipo.");
}
export async function incluirTercAction(fd: FormData) {
  const u = await exigirUsuario();
  fim(volta(fd, "/agenda/pessoas"), await C.incluirTerceirizado(u, txt(fd, "nome"), txt(fd, "contato")), "Terceirizado cadastrado.");
}
export async function desativarTercAction(fd: FormData) {
  const u = await exigirUsuario();
  fim(volta(fd, "/agenda/pessoas"), await C.desativarTerceirizado(u, num(fd, "id") ?? 0), "Terceirizado desativado.");
}
