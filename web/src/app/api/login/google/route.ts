import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { agendaConfigurada } from "@/lib/agenda/cifra";
import { urlBase, urlLoginGoogle } from "@/lib/agenda/google";

/** Inicia "Entrar com Google" (conta @rucelle.com.br). O state fica num cookie httpOnly; o retorno passa pelo endereço já autorizado. */
export async function GET(req: Request) {
  if (!agendaConfigurada() || !process.env.GOOGLE_OAUTH_CLIENT_ID) return NextResponse.redirect(new URL("/login?erro=google_indisponivel", urlBase(req)));
  const state = `login.${randomBytes(24).toString("base64url")}`;
  const jar = await cookies();
  jar.set("a360_login_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/agenda", maxAge: 600 });
  return NextResponse.redirect(urlLoginGoogle(state, req));
}
export const dynamic = "force-dynamic";
