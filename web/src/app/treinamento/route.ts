import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { trilhaDoPerfil } from "@/lib/treinamento";

/** /treinamento → trilha do perfil de quem está logado. */
export async function GET(req: Request) {
  const u = await usuarioAtual();
  if (!u) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.redirect(new URL(`/treinamento/${trilhaDoPerfil(u.perfil)}`, req.url));
}
export const dynamic = "force-dynamic";
