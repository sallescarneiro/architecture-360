import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { podeVer, reuniaoPorId } from "@/lib/reunioes";
import { docxDaAta } from "@/lib/documentos/ata";
import { nomeArquivo } from "@/lib/documentos/docx";

/** Exporta a ata da reunião em .docx; `timbrado=1` aplica o papel timbrado da rucelle (opcional). */
export async function GET(req: Request) {
  const u = await usuarioAtual();
  if (!u) return new NextResponse("não autenticado", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const id = Number(sp.get("id"));
  const r = Number.isInteger(id) ? await reuniaoPorId(id) : null;
  if (!r) return new NextResponse("não encontrado", { status: 404 });
  if (!(await podeVer(u, r))) return new NextResponse("sem permissão", { status: 403 });
  const timbrado = sp.get("timbrado") === "1";
  const buf = await docxDaAta(r, timbrado);
  const nome = `ata-${nomeArquivo(r.titulo)}-${r.inicio.toISOString().slice(0, 10)}${timbrado ? "-timbrado" : ""}.docx`;
  return new NextResponse(new Uint8Array(buf), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "content-disposition": `attachment; filename="${nome}"`, "cache-control": "private, no-store" } });
}
export const dynamic = "force-dynamic";
