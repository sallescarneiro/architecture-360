import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { MODELO_TIMBRADO, NOME_MODELO_TIMBRADO } from "@/lib/documentos/docx";

/** Modelo institucional (papel timbrado da rucelle, .docx) para download — qualquer usuário autenticado. */
export async function GET() {
  const u = await usuarioAtual();
  if (!u) return new NextResponse("não autenticado", { status: 401 });
  const buf = await readFile(MODELO_TIMBRADO);
  return new NextResponse(new Uint8Array(buf), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "content-disposition": `attachment; filename="${NOME_MODELO_TIMBRADO}"`, "cache-control": "private, no-store" } });
}
export const dynamic = "force-dynamic";
