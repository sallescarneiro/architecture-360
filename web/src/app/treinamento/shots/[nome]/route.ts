import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth";

/** Telas do treinamento (contêm nomes de projetos reais): só para quem está logado. */
export async function GET(req: Request, ctx: { params: Promise<{ nome: string }> }) {
  const u = await usuarioAtual();
  if (!u) return new NextResponse("não autenticado", { status: 401 });
  const { nome } = await ctx.params;
  if (!/^[a-z0-9-]+\.jpg$/.test(nome)) return new NextResponse("não encontrado", { status: 404 });
  try {
    const buf = await readFile(path.join(process.cwd(), "treinamento", "shots", nome));
    return new NextResponse(new Uint8Array(buf), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" } });
  } catch { return new NextResponse("não encontrado", { status: 404 }); }
  void req;
}
export const dynamic = "force-dynamic";
