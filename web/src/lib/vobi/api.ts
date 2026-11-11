// T-218 — Cliente da API v2 do Vobi (contratada por Rodrigo em 11/11/2026). SOMENTE LEITURA: este módulo só faz GET
// (e o POST de obtenção do token). Nunca cria, altera ou apaga nada no Vobi.
// Credenciais: VOBI_API_UUID e VOBI_API_SECRET, definidas por Rodrigo nas variáveis do serviço no Railway.
// Nunca registrar as credenciais nem o token em log, banco, GitHub ou mensagem de erro.

const BASE = (process.env.VOBI_API_BASE || "https://api.vobi.com.br").replace(/\/+$/, "");
const TAMANHO_PAGINA = 200;
const MAX_PAGINAS = 500; // trava de segurança (100 mil registros por entidade)
const PAUSA_MS = 150; // espaçamento entre chamadas, para não pressionar o limite de requisições

export class ErroVobi extends Error {
  constructor(msg: string, public status?: number) { super(msg); }
}

export function apiConfigurada(): boolean {
  return Boolean(process.env.VOBI_API_UUID && process.env.VOBI_API_SECRET);
}

let token: { jwt: string; expira: number } | null = null;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function obterToken(): Promise<string> {
  if (token && token.expira > Date.now()) return token.jwt;
  const uuid = process.env.VOBI_API_UUID, secret = process.env.VOBI_API_SECRET;
  if (!uuid || !secret) throw new ErroVobi("Integração com a API do Vobi não configurada (variáveis VOBI_API_UUID e VOBI_API_SECRET ausentes no Railway).");
  const basic = Buffer.from(`${uuid}:${secret}`).toString("base64");
  const r = await fetch(`${BASE}/v2/auth/token`, { method: "POST", headers: { Authorization: `Basic ${basic}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!r.ok) {
    // mensagem sem eco das credenciais nem do corpo da resposta
    throw new ErroVobi(r.status === 401 || r.status === 403
      ? "O Vobi recusou as credenciais da API (confira se a integração está ativa em Configurações › Central de Segurança e se as variáveis no Railway estão corretas)."
      : `Falha ao obter acesso à API do Vobi (HTTP ${r.status}).`, r.status);
  }
  const corpo = (await r.json()) as { jwt?: string; token?: string };
  const jwt = corpo.jwt ?? corpo.token;
  if (!jwt) throw new ErroVobi("Resposta de autenticação do Vobi sem token.");
  token = { jwt, expira: Date.now() + 4 * 60_000 }; // validade de 5 min no Vobi; renova com folga
  return jwt;
}

async function get<T>(caminho: string, params: Record<string, string | number>, tentativa = 0): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  let r: Response;
  try {
    r = await fetch(`${BASE}${caminho}${qs ? "?" + qs : ""}`, {
      headers: { Authorization: `Bearer ${await obterToken()}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    if (e instanceof ErroVobi) throw e;
    if (tentativa < 3) { await dormir(2000 * 2 ** tentativa); return get(caminho, params, tentativa + 1); }
    throw new ErroVobi(`A API do Vobi não respondeu em ${caminho} (tempo esgotado ou conexão interrompida).`);
  }
  if (r.status === 401 && tentativa < 1) { token = null; return get(caminho, params, tentativa + 1); }
  if ((r.status === 429 || r.status >= 500) && tentativa < 4) {
    const espera = Number(r.headers.get("retry-after")) * 1000 || 1000 * 2 ** tentativa;
    await dormir(Math.min(espera, 30_000));
    return get(caminho, params, tentativa + 1);
  }
  if (!r.ok) throw new ErroVobi(`A API do Vobi respondeu HTTP ${r.status} em ${caminho}.`, r.status);
  return (await r.json()) as T;
}

/** Lê todas as páginas de um endpoint de listagem ({count, rows}). */
export type Progresso = (etapa: string, lidos: number, total: number | undefined) => void | Promise<void>;
export async function listarTudo<T = Record<string, unknown>>(caminho: string, filtros: Record<string, string | number> = {}, progresso?: Progresso, tamanho = TAMANHO_PAGINA): Promise<T[]> {
  const TAMANHO_PAGINA = tamanho;
  const out: T[] = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const pg = await get<{ count?: number; rows?: T[] } | T[]>(caminho, { ...filtros, limit: TAMANHO_PAGINA, offset: p * TAMANHO_PAGINA, "order[0][0]": "id", "order[0][1]": "asc" });
    const rows = Array.isArray(pg) ? pg : pg.rows ?? [];
    out.push(...rows);
    const total = Array.isArray(pg) ? undefined : pg.count;
    await progresso?.(caminho, out.length, total != null && total > out.length ? total : undefined);
    // o "count" do Vobi não é confiável como total (veio igual ao tamanho da página): para só quando a página vem incompleta
    if (rows.length < TAMANHO_PAGINA) return out;
    await dormir(PAUSA_MS);
  }
  throw new ErroVobi(`${caminho}: mais de ${MAX_PAGINAS * TAMANHO_PAGINA} registros; leitura interrompida por segurança.`);
}

/** Leitura completa usada pela sincronização diária. */
export async function lerVobi(progresso?: Progresso) {
  // a listagem padrão traz só projetos ativos; os encerrados (Finalizado/Cancelado) vêm pelo filtro isActive=false.
  // Se o Vobi não aceitar o filtro, segue só com os ativos (os demais ficam como estão na base).
  const ativos = await listarTudo("/v2/refurbish", {}, progresso);
  let inativos: Record<string, unknown>[] = [];
  try { inativos = await listarTudo("/v2/refurbish", { "where[isActive]": "false" }, progresso); } catch (e) { if (!(e instanceof ErroVobi)) throw e; }
  const vistos = new Set<unknown>();
  const projetos = [...ativos, ...inativos].filter((p) => (vistos.has(p.id) ? false : (vistos.add(p.id), true)));
  const tarefas = await listarTudo("/v2/task", {}, progresso);
  // As etapas de projeto vêm com as tarefas embutidas e a leitura geral não responde no Vobi (503 / tempo esgotado em 11/11/2026):
  // lê projeto a projeto, só dos projetos lidos que têm tarefa.
  const doProjeto = new Set(projetos.map((p) => p.id));
  const ids = [...new Set(tarefas.map((t) => (t as Record<string, unknown>).idRefurbish).filter((x) => x != null && doProjeto.has(x)))];
  const etapas: Record<string, unknown>[] = [];
  for (const [i, id] of ids.entries()) {
    const rows = await listarTudo("/v2/refurbish-step", { "where[idRefurbish]": String(id) }, undefined, 100);
    // sem as tarefas embutidas: só o que o A360 usa
    for (const r of rows) etapas.push({ id: r.id, idRefurbish: r.idRefurbish, name: r.name, order: r.order });
    await progresso?.("/v2/refurbish-step", i + 1, ids.length);
  }
  const etapasProjeto = await listarTudo("/v2/step", {}, progresso);
  const clientes = await listarTudo("/v2/company-customer", {}, progresso);
  return { projetos, tarefas, etapas, etapasProjeto, clientes };
}
export type LeituraVobi = Awaited<ReturnType<typeof lerVobi>>;
