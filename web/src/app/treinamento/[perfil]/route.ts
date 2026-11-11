import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { TRILHAS, podeVerTrilha, trilhaDoPerfil } from "@/lib/treinamento";

// T-213 — Treinamento dentro do A360. Páginas estáticas (web/treinamento/*.html, geradas por gerar.py) servidas só para quem está
// logado: arquiteta vê a trilha de arquitetas; coordenação a sua; gestão e administração veem as três.
const FONTES = `<style>
@font-face{font-family:"Montserrat";font-weight:400;src:url("/fonts/Montserrat-Regular.woff2") format("woff2");font-display:swap}
@font-face{font-family:"Montserrat";font-weight:500;src:url("/fonts/Montserrat-Medium.woff2") format("woff2");font-display:swap}
@font-face{font-family:"Montserrat";font-weight:600;src:url("/fonts/Montserrat-SemiBold.woff2") format("woff2");font-display:swap}
@font-face{font-family:"Montserrat";font-weight:700;src:url("/fonts/Montserrat-Bold.woff2") format("woff2");font-display:swap}
@font-face{font-family:"Fraunces";font-weight:500;src:url("/fonts/Fraunces-Medium.woff2") format("woff2");font-display:swap}
@font-face{font-family:"Fraunces";font-weight:600;src:url("/fonts/Fraunces-SemiBold.woff2") format("woff2");font-display:swap}
</style>`;


export async function GET(_req: Request, ctx: { params: Promise<{ perfil: string }> }) {
  const u = await usuarioAtual();
  if (!u) return NextResponse.redirect(new URL("/login", _req.url));
  const { perfil } = await ctx.params;
  if (!(perfil in TRILHAS)) return new NextResponse("não encontrado", { status: 404 });
  if (!podeVerTrilha(u.perfil, perfil)) return NextResponse.redirect(new URL(`/treinamento/${trilhaDoPerfil(u.perfil)}`, _req.url));
  let html = await readFile(path.join(process.cwd(), "treinamento", `${perfil}.html`), "utf8");
  const outras = (u.perfil === "admin" || u.perfil === "gestao")
    ? `<div class="trilhas"><span>Outras trilhas</span>${Object.entries(TRILHAS).filter(([k]) => k !== perfil).map(([k, n]) => `<a href="/treinamento/${k}">${n}</a>`).join("")}</div>`
    : "";
  html = html.replace("<!--TRILHAS-->", outras).replace(/src="shots\//g, 'src="/treinamento/shots/');
  const pagina = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${FONTES}${html}</html>`;
  return new NextResponse(pagina, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" } });
}
export const dynamic = "force-dynamic";
