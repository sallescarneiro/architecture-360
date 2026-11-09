import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { agendaConfigurada } from "@/lib/agenda/cifra";
import { urlAutorizacao, urlBase } from "@/lib/agenda/google";

/** Inicia a conexão da Google Agenda do usuário da sessão (OAuth por usuário, D1). O state fica num cookie httpOnly ligado à sessão. */
export async function GET(req: Request) {
  const u = await usuarioAtual();
  if (!u) return NextResponse.redirect(new URL("/login", urlBase(req)));
  if (!agendaConfigurada()) return NextResponse.redirect(new URL("/agenda?erro=nao_configurada", urlBase(req)));
  const state = `${u.id}.${randomBytes(24).toString("base64url")}`;
  const jar = await cookies();
  jar.set("a360_agenda_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/agenda", maxAge: 600 });
  return NextResponse.redirect(urlAutorizacao(state, req));
}
export const dynamic = "force-dynamic";
