import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { podeVer, reuniaoPorId } from "@/lib/reunioes";
import { arquivoDe } from "@/lib/transcricao/processar";

/** Download do documento original da transcrição — só para quem pode ver a reunião. */
export async function GET(req: Request) {
  const u = await usuarioAtual();
  if (!u) return new NextResponse("não autenticado", { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  const t = Number.isInteger(id) ? await arquivoDe(id) : null;
  if (!t) return new NextResponse("não encontrado", { status: 404 });
  const r = await reuniaoPorId(t.reuniaoId);
  if (!r || !(await podeVer(u, r))) return new NextResponse("sem permissão", { status: 403 });
  return new NextResponse(new Uint8Array(t.conteudo), { headers: { "content-type": t.tipoMime, "content-disposition": `attachment; filename="${encodeURIComponent(t.nomeArquivo)}"`, "cache-control": "private, no-store" } });
}
export const dynamic = "force-dynamic";
