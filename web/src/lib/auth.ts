import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";

export type Perfil = "admin" | "gestao" | "coordenacao" | "arquiteta";
export type Usuario = { id: number; nome: string; email: string; perfil: Perfil };

const COOKIE = "a360_sessao";
const dias = () => Number(process.env.SESSION_DIAS ?? 7);

export async function usuarioAtual(): Promise<Usuario | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;
  const rows = await db
    .select({ id: schema.usuarios.id, nome: schema.usuarios.nome, email: schema.usuarios.email, perfil: schema.usuarios.perfil, ativo: schema.usuarios.ativo })
    .from(schema.sessoes)
    .innerJoin(schema.usuarios, eq(schema.sessoes.usuarioId, schema.usuarios.id))
    .where(and(eq(schema.sessoes.id, id), gt(schema.sessoes.expiraEm, new Date())))
    .limit(1);
  const u = rows[0];
  if (!u || !u.ativo) return null;
  return { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil as Perfil };
}

/** Exige sessão; opcionalmente exige um dos perfis. Autorização no servidor, nunca só na interface. */
export async function exigirUsuario(perfis?: Perfil[]): Promise<Usuario> {
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  if (perfis && !perfis.includes(u.perfil)) redirect("/sem-permissao");
  return u;
}

export const podeImportar = (p: Perfil) => p === "admin" || p === "gestao";
export const veIndicadoresIndividuais = (p: Perfil) => p === "admin" || p === "gestao" || p === "coordenacao";

export async function entrar(email: string, senha: string): Promise<boolean> {
  const u = (await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, email.trim().toLowerCase())).limit(1))[0];
  if (!u || !u.ativo) return false;
  if (!(await bcrypt.compare(senha, u.senhaHash))) return false;
  const id = randomBytes(32).toString("base64url");
  const expiraEm = new Date(Date.now() + dias() * 86400_000);
  await db.insert(schema.sessoes).values({ id, usuarioId: u.id, expiraEm });
  const jar = await cookies();
  jar.set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiraEm });
  return true;
}

export async function sair() {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) await db.delete(schema.sessoes).where(eq(schema.sessoes.id, id));
  jar.delete(COOKIE);
}

export async function criarUsuario(nome: string, email: string, senha: string, perfil: Perfil) {
  const senhaHash = await bcrypt.hash(senha, 12);
  await db.insert(schema.usuarios).values({ nome, email: email.trim().toLowerCase(), senhaHash, perfil });
}
