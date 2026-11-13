import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { podeVer, registrarAcessoGravacao, reuniaoPorId } from "@/lib/reunioes";

/**
 * T-227 — abre a gravação da reunião: confere a permissão, registra quem abriu e quando (histórico da reunião) e redireciona
 * para o link externo. O vídeo nunca passa pelo A360; quem pode assisti-lo é decidido pela plataforma (Drive, Zoom, Teams).
 */
export async function GET(req: Request) {
  const u = await usuarioAtual();
  if (!u) return new NextResponse("não autenticado", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const id = Number(sp.get("id"));
  const r = Number.isInteger(id) ? await reuniaoPorId(id) : null;
  if (!r || !r.gravacaoUrl) return new NextResponse("não encontrado", { status: 404 });
  if (!(await podeVer(u, r))) return new NextResponse("sem permissão", { status: 403 });
  const t = sp.get("t");
  await registrarAcessoGravacao(u, r, t && /^\d{1,2}:\d{2}(:\d{2})?$/.test(t) ? t : null);
  return NextResponse.redirect(r.gravacaoUrl, { status: 302, headers: { "cache-control": "private, no-store", "referrer-policy": "no-referrer" } });
}
export const dynamic = "force-dynamic";
