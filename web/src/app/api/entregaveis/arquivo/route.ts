import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { arquivoAprovacao, arquivoVersao, podeVer, porId } from "@/lib/entregaveis";

/** Download do arquivo de uma versão (?v=) ou de uma evidência de aprovação (?a=) — só para quem vê o entregável. */
export async function GET(req: Request) {
  const u = await usuarioAtual();
  if (!u) return new NextResponse("não autenticado", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const v = Number(sp.get("v")), a = Number(sp.get("a"));
  const reg = Number.isInteger(v) && v > 0 ? await arquivoVersao(v) : Number.isInteger(a) && a > 0 ? await arquivoAprovacao(a) : null;
  if (!reg || !reg.conteudo) return new NextResponse("não encontrado", { status: 404 });
  const e = await porId(reg.entregavelId);
  if (!e || !(await podeVer(u, e))) return new NextResponse("sem permissão", { status: 403 });
  return new NextResponse(new Uint8Array(reg.conteudo), { headers: { "content-type": reg.tipoMime ?? "application/octet-stream", "content-disposition": `attachment; filename="${encodeURIComponent(reg.nomeArquivo ?? "arquivo")}"`, "cache-control": "private, no-store" } });
}
export const dynamic = "force-dynamic";
