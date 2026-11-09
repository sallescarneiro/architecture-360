import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { concluirConexao, urlBase } from "@/lib/agenda/google";
import { sincronizar } from "@/lib/agenda/sync";

/** Retorno do Google. Confere o state (cookie + usuário da sessão), troca o código por tokens e grava cifrado. O código nunca é registrado em log. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const voltar = (q: string) => NextResponse.redirect(new URL(`/agenda?${q}`, urlBase(req)));
  const u = await usuarioAtual();
  if (!u) return NextResponse.redirect(new URL("/login", urlBase(req)));
  const jar = await cookies();
  const esperado = jar.get("a360_agenda_state")?.value;
  jar.delete({ name: "a360_agenda_state", path: "/api/agenda" });
  const state = url.searchParams.get("state");
  if (!esperado || !state || state !== esperado || !state.startsWith(`${u.id}.`)) return voltar("erro=state");
  if (url.searchParams.get("error")) return voltar(`erro=${encodeURIComponent(url.searchParams.get("error")!.slice(0, 40))}`);
  const code = url.searchParams.get("code");
  if (!code) return voltar("erro=sem_codigo");
  try {
    await concluirConexao(u.id, code, req);
    await sincronizar(u.id, true);
    return voltar("conectada=1");
  } catch (e) {
    console.warn(`[agenda] conexão do usuário ${u.id} falhou: ${e instanceof Error ? e.message.slice(0, 160) : "erro"}`);
    return voltar("erro=conexao");
  }
}
export const dynamic = "force-dynamic";
