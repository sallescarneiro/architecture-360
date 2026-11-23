import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { entrarComGoogle, usuarioAtual } from "@/lib/auth";
import { concluirConexao, emailDoLoginGoogle, urlBase } from "@/lib/agenda/google";
import { sincronizar } from "@/lib/agenda/sync";

/** Retorno do Google. Confere o state (cookie + usuário da sessão), troca o código por tokens e grava cifrado. O código nunca é registrado em log. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const voltar = (q: string) => NextResponse.redirect(new URL(`/agenda?${q}`, urlBase(req)));
  // "Entrar com Google": mesmo endereço de retorno, state com prefixo "login."
  if ((url.searchParams.get("state") ?? "").startsWith("login.")) {
    const login = (q: string) => NextResponse.redirect(new URL(q, urlBase(req)));
    const jar = await cookies();
    const esperado = jar.get("a360_login_state")?.value;
    jar.delete({ name: "a360_login_state", path: "/api/agenda" });
    if (!esperado || url.searchParams.get("state") !== esperado) return login("/login?erro=google_state");
    if (url.searchParams.get("error")) return login("/login?erro=google_cancelado");
    const code = url.searchParams.get("code");
    if (!code) return login("/login?erro=google_state");
    try {
      const email = await emailDoLoginGoogle(code, req);
      if (!email) return login("/login?erro=google_conta");
      const r = await entrarComGoogle(email);
      if (r !== "ok") return login(`/login?erro=google_${r}`);
      return login("/");
    } catch (e) {
      console.warn(`[login] entrada pelo Google falhou: ${e instanceof Error ? e.message.slice(0, 120) : "erro"}`);
      return login("/login?erro=google_falhou");
    }
  }
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
