import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, ne } from "drizzle-orm";
import { db, schema } from "@/db";

export type Perfil = "admin" | "gestao" | "coordenacao" | "arquiteta";
export type Usuario = { id: number; nome: string; email: string; perfil: Perfil; trocarSenha?: boolean };
export const PERFIS: Perfil[] = ["admin", "gestao", "coordenacao", "arquiteta"];
export const NOME_PERFIL: Record<Perfil, string> = { admin: "Administração", gestao: "Gestão", coordenacao: "Coordenação", arquiteta: "Arquiteta" };
const DOMINIO = (process.env.DOMINIO_EMAIL ?? "rucelle.com.br").toLowerCase();
export const MIN_SENHA = 10;

const COOKIE = "a360_sessao";
const dias = () => Number(process.env.SESSION_DIAS ?? 7);

export async function usuarioAtual(): Promise<Usuario | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;
  const rows = await db
    .select({ id: schema.usuarios.id, nome: schema.usuarios.nome, email: schema.usuarios.email, perfil: schema.usuarios.perfil, ativo: schema.usuarios.ativo, trocarSenha: schema.usuarios.trocarSenha })
    .from(schema.sessoes)
    .innerJoin(schema.usuarios, eq(schema.sessoes.usuarioId, schema.usuarios.id))
    .where(and(eq(schema.sessoes.id, id), gt(schema.sessoes.expiraEm, new Date())))
    .limit(1);
  const u = rows[0];
  if (!u || !u.ativo) return null;
  return { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil as Perfil, trocarSenha: u.trocarSenha };
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
  await db.update(schema.usuarios).set({ ultimoAcessoEm: new Date() }).where(eq(schema.usuarios.id, u.id));
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

// ---------------------------------------------------------------------------
// T-205 — gestão de usuários pela interface (perfil admin) e troca da própria senha.
// Senhas só como hash bcrypt; a senha provisória é gerada aqui, devolvida UMA vez ao administrador e nunca gravada nem registrada em log.
// ---------------------------------------------------------------------------

/** Senha provisória legível (sem caracteres ambíguos), 14 caracteres, gerada com randomBytes. */
export function gerarSenhaProvisoria(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(14);
  let s = "";
  for (let i = 0; i < 14; i++) s += alfabeto[bytes[i] % alfabeto.length];
  return s;
}

export function emailValido(email: string): string | null {
  const e = email.trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return "E-mail inválido.";
  if (!e.endsWith(`@${DOMINIO}`)) return `Use um e-mail @${DOMINIO}.`;
  return null;
}

export async function listarUsuarios() {
  return db.select({ id: schema.usuarios.id, nome: schema.usuarios.nome, email: schema.usuarios.email, perfil: schema.usuarios.perfil, ativo: schema.usuarios.ativo, trocarSenha: schema.usuarios.trocarSenha, ultimoAcessoEm: schema.usuarios.ultimoAcessoEm, criadoEm: schema.usuarios.criadoEm })
    .from(schema.usuarios).orderBy(schema.usuarios.perfil, schema.usuarios.nome);
}

/** Admin cria um usuário com senha provisória; devolve a senha (uma vez) ou o erro. */
export async function adminCriarUsuario(admin: Usuario, nome: string, email: string, perfil: string): Promise<{ ok: true; id: number; senhaProvisoria: string } | { ok: false; erro: string }> {
  if (admin.perfil !== "admin") return { ok: false, erro: "Sem permissão." };
  const n = nome.trim(); if (n.length < 3) return { ok: false, erro: "Informe o nome completo." };
  const ev = emailValido(email); if (ev) return { ok: false, erro: ev };
  if (!PERFIS.includes(perfil as Perfil)) return { ok: false, erro: "Perfil inválido." };
  const e = email.trim().toLowerCase();
  const existe = (await db.select({ id: schema.usuarios.id }).from(schema.usuarios).where(eq(schema.usuarios.email, e)).limit(1))[0];
  if (existe) return { ok: false, erro: "Já existe um usuário com esse e-mail." };
  const senhaProvisoria = gerarSenhaProvisoria();
  const senhaHash = await bcrypt.hash(senhaProvisoria, 12);
  const [r] = await db.insert(schema.usuarios).values({ nome: n, email: e, senhaHash, perfil, trocarSenha: true, atualizadoEm: new Date() }).returning({ id: schema.usuarios.id });
  return { ok: true, id: r.id, senhaProvisoria };
}

async function contarAdminsAtivos(): Promise<number> {
  return (await db.select({ id: schema.usuarios.id }).from(schema.usuarios).where(and(eq(schema.usuarios.perfil, "admin"), eq(schema.usuarios.ativo, true)))).length;
}

export async function adminAlterarPerfil(admin: Usuario, id: number, perfil: string): Promise<string | null> {
  if (admin.perfil !== "admin") return "Sem permissão.";
  if (!PERFIS.includes(perfil as Perfil)) return "Perfil inválido.";
  const alvo = (await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, id)).limit(1))[0];
  if (!alvo) return "Usuário não encontrado.";
  if (alvo.perfil === "admin" && perfil !== "admin" && alvo.ativo && (await contarAdminsAtivos()) <= 1) return "Não é possível remover o último administrador ativo.";
  await db.update(schema.usuarios).set({ perfil, atualizadoEm: new Date() }).where(eq(schema.usuarios.id, id));
  return null;
}

/** Desativar encerra todas as sessões da pessoa; reativar não gera senha nova. */
export async function adminAtivar(admin: Usuario, id: number, ativo: boolean): Promise<string | null> {
  if (admin.perfil !== "admin") return "Sem permissão.";
  if (id === admin.id && !ativo) return "Você não pode desativar o seu próprio acesso.";
  const alvo = (await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, id)).limit(1))[0];
  if (!alvo) return "Usuário não encontrado.";
  if (!ativo && alvo.perfil === "admin" && alvo.ativo && (await contarAdminsAtivos()) <= 1) return "Não é possível desativar o último administrador ativo.";
  await db.update(schema.usuarios).set({ ativo, atualizadoEm: new Date() }).where(eq(schema.usuarios.id, id));
  if (!ativo) await db.delete(schema.sessoes).where(eq(schema.sessoes.usuarioId, id));
  return null;
}

/** Admin redefine: nova senha provisória (devolvida uma vez), troca obrigatória, sessões anteriores encerradas. */
export async function adminRedefinirSenha(admin: Usuario, id: number): Promise<{ ok: true; senhaProvisoria: string } | { ok: false; erro: string }> {
  if (admin.perfil !== "admin") return { ok: false, erro: "Sem permissão." };
  const alvo = (await db.select({ id: schema.usuarios.id }).from(schema.usuarios).where(eq(schema.usuarios.id, id)).limit(1))[0];
  if (!alvo) return { ok: false, erro: "Usuário não encontrado." };
  const senhaProvisoria = gerarSenhaProvisoria();
  const senhaHash = await bcrypt.hash(senhaProvisoria, 12);
  await db.update(schema.usuarios).set({ senhaHash, trocarSenha: true, atualizadoEm: new Date() }).where(eq(schema.usuarios.id, id));
  await db.delete(schema.sessoes).where(eq(schema.sessoes.usuarioId, id));
  return { ok: true, senhaProvisoria };
}

/** Troca da própria senha: exige a senha atual; encerra as outras sessões e limpa a obrigatoriedade. */
export async function trocarPropriaSenha(u: Usuario, senhaAtual: string, nova: string, confirmacao: string): Promise<string | null> {
  if (nova.length < MIN_SENHA) return `A nova senha precisa ter ao menos ${MIN_SENHA} caracteres.`;
  if (nova !== confirmacao) return "A confirmação não coincide com a nova senha.";
  if (nova === senhaAtual) return "A nova senha precisa ser diferente da atual.";
  const row = (await db.select({ senhaHash: schema.usuarios.senhaHash }).from(schema.usuarios).where(eq(schema.usuarios.id, u.id)).limit(1))[0];
  if (!row || !(await bcrypt.compare(senhaAtual, row.senhaHash))) return "Senha atual incorreta.";
  const senhaHash = await bcrypt.hash(nova, 12);
  await db.update(schema.usuarios).set({ senhaHash, trocarSenha: false, atualizadoEm: new Date() }).where(eq(schema.usuarios.id, u.id));
  const jar = await cookies();
  const atual = jar.get(COOKIE)?.value;
  if (atual) await db.delete(schema.sessoes).where(and(eq(schema.sessoes.usuarioId, u.id), ne(schema.sessoes.id, atual)));
  return null;
}
