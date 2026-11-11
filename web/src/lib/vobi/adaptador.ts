// T-218 — Adaptador API do Vobi → mesmos arquivos (Projetos / Tarefas / Clientes no layout v1) que o importador já valida.
// Assim a sincronização passa exatamente pelas mesmas regras da carga por CSV (chaves, recorte 2026, não encontrados,
// renomeações, carga anômala retida, vínculo com clientes) — nada de regra paralela.
// Nomes de etapa são os originais do Vobi (refurbish-step.name), sem sinônimos (decisão de 10/11/2026).
import { db, schema } from "@/db";
import { lerCsv, layouts, type ArquivoLido } from "@/lib/importador/importador";
import { chaveTexto, etapaCanonica, limpar, minutosParaHoras } from "@/lib/importador/normalizacao";
import type { LeituraVobi } from "./api";

type R = Record<string, unknown>;
const txt = (v: unknown): string => (v == null ? "" : typeof v === "object" ? txt((v as R).name ?? (v as R).nome ?? "") : String(v));
const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
/** primeiro campo presente (permite variações de nome entre versões da API) */
const campo = (o: R, ...ks: string[]): unknown => { for (const k of ks) if (o[k] !== undefined) return o[k]; return undefined; };

/** ISO → dd/mm/aaaa no fuso de São Paulo; meia-noite UTC é tratada como data pura (sem fuso). */
export function dataBr(v: unknown): string {
  const s = txt(v).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) || /T00:00:00(\.0+)?(Z|\+00:00)$/.test(s)) { const [y, m, d] = s.slice(0, 10).split("-"); return `${d}/${m}/${y}`; }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return "";
  const p = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(dt);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("day")}/${g("month")}/${g("year")}`;
}

// Códigos documentados da API v2
const STATUS_TAREFA: Record<number, string> = { 1: "Planejado", 2: "Em andamento", 4: "Concluído", 5: "Cancelado" };
const PRIORIDADE: Record<number, string> = { 1: "Baixa", 2: "Média", 3: "Alta" };
const ENCERRA = new Set(["finalizado", "cancelado", "pausado"]);

const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
function serializar(layout: string[], linhas: Record<string, string>[]): Buffer {
  return Buffer.from([layout.map(esc).join(";"), ...linhas.map((r) => layout.map((c) => esc(r[c] ?? "")).join(";"))].join("\n") + "\n", "utf8");
}

export type Diagnostico = {
  projetos: number; tarefas: number; tarefasForaDeProjeto: number; etapas: number; clientes: number;
  responsaveis: { ids: number; comNome: number; novosPorCorrespondencia: { id: number; nome: string; votos: number }[]; semNome: { id: number; tarefas: number }[] };
  unidadeHoras: { estimadas: string; realizadas: string };
  camposRecebidos: Record<string, string[]>; // só os nomes dos campos (nunca valores), para conferência na ativação
  limitacoes: string[];
};
export type Montagem = {
  projetos: ArquivoLido; tarefas: ArquivoLido; clientes?: ArquivoLido;
  bufProjetos: Buffer; bufTarefas: Buffer; bufClientes?: Buffer;
  diagnostico: Diagnostico;
};

export const nomeSemResponsavelMapeado = (id: number) => `Vobi #${id}`;

/** Fator para minutos: detecta se a API manda horas (×60) ou minutos (×1) comparando com o que já está na base. */
function detectarFator(pares: [number, number][]): { fator: number; rotulo: string } {
  const r = pares.filter(([api, base]) => api > 0 && base > 0).map(([api, base]) => base / api).sort((a, b) => a - b);
  if (r.length < 5) return { fator: 60, rotulo: "horas (padrão; poucos valores para conferir)" };
  const med = r[Math.floor(r.length / 2)];
  if (Math.abs(med - 60) < 6) return { fator: 60, rotulo: `horas (conferido em ${r.length} tarefas)` };
  if (Math.abs(med - 1) < 0.1) return { fator: 1, rotulo: `minutos (conferido em ${r.length} tarefas)` };
  return { fator: 60, rotulo: `horas (padrão; conferência inconclusiva em ${r.length} tarefas)` };
}

export async function montarArquivos(v: LeituraVobi): Promise<Montagem> {
  const limitacoes: string[] = [];
  // contexto da base (o que a API não traz é mantido do que já está no A360)
  const projBase = new Map((await db.select({ codigo: schema.projetos.codigo, cliente: schema.projetos.cliente, etiquetas: schema.projetos.etiquetas, colaboradores: schema.projetos.colaboradores }).from(schema.projetos)).map((p) => [p.codigo, p]));
  const tarBase = new Map((await db.select({ chave: schema.tarefas.chave, resp: schema.tarefas.responsavelNome, est: schema.tarefas.horasEstimadasMin, rea: schema.tarefas.horasRealizadasMin }).from(schema.tarefas)).map((t) => [t.chave, t]));
  const cliBase = new Map((await db.select().from(schema.clientesVobi)).map((c) => [c.codigo, c]));
  const respBase = new Map((await db.select().from(schema.vobiResponsaveis)).map((r) => [r.idVobi, r.nome]));

  const etapaPorId = new Map(v.etapas.map((e) => [num(e.id), limpar(txt(e.name))]));
  const passoPorId = new Map(v.etapasProjeto.map((e) => [num(e.id), limpar(txt(e.name))]));
  const cliPorId = new Map(v.clientes.map((c) => [num(c.id), c]));

  // ---------------- Projetos ----------------
  const ordenar = <T extends R>(xs: T[]) => [...xs].sort((a, b) => (num(a.id) ?? 0) - (num(b.id) ?? 0));
  const nomeProj = new Map<number, string>();
  const linhasP = ordenar(v.projetos).map((p) => {
    const id = num(p.id)!;
    const nome = limpar(txt(p.name));
    nomeProj.set(id, nome);
    const statusNome = limpar(txt(campo(p, "status")));
    const passo = limpar(txt(campo(p, "activeStep"))) || passoPorId.get(num(p.idStep)) || "";
    const status = ENCERRA.has(chaveTexto(statusNome)) ? statusNome : passo || statusNome;
    const cli = cliPorId.get(num(p.idCompanyCustomer));
    const base = projBase.get(id);
    // sem nome de cliente na API (cadastro não retornado), mantém o da base em vez de apagar
    const clienteNome = limpar(txt(campo(p, "companyCustomer"))) || (cli ? limpar(txt(cli.name)) : "") || base?.cliente || "";
    const m2 = num(p.m2);
    return {
      "Código": String(id), "Nome": nome, "cliente (nome)": clienteNome, "Status": status,
      "Criado em": dataBr(campo(p, "creationDate", "createdAt")), "Metragem": m2 == null ? "" : m2.toFixed(2).replace(".", ","),
      // A API não traz colaboradores nem etiquetas do projeto: mantém o que a última exportação trouxe.
      "Colaboradores": (base?.colaboradores as string[] | null)?.join(",") ?? "",
      "Etiqueta": (base?.etiquetas as string[] | null)?.join(",") ?? "",
    } as Record<string, string>;
  });
  limitacoes.push("Colaboradores e etiquetas do projeto não existem na API: ficam como vieram na última exportação CSV (projetos novos entram sem colaboradores).");

  // ---------------- Responsáveis (id → nome) ----------------
  const tarefasApi = ordenar(v.tarefas);
  const foraDeProjeto = tarefasApi.filter((t) => num(t.idRefurbish) == null).length;
  // mesmo escopo da exportação: só tarefas dos projetos que a leitura trouxe (a API devolve todo o histórico do Vobi)
  const deOutros = tarefasApi.filter((t) => num(t.idRefurbish) != null && !nomeProj.has(num(t.idRefurbish)!)).length;
  const chaveDe = (t: R) => {
    const etapa = etapaPorId.get(num(t.idRefurbishStep)) ?? "";
    return `${num(t.idRefurbish)}|${chaveTexto(etapaCanonica(etapa).etapa)}|${chaveTexto(limpar(txt(t.name)))}|1`;
  };
  const votos = new Map<number, Map<string, number>>();
  for (const t of tarefasApi) {
    if (!nomeProj.has(num(t.idRefurbish) ?? -1)) continue;
    const idR = num(t.idResponsible);
    if (idR == null || respBase.has(idR)) continue;
    const nome = tarBase.get(chaveDe(t))?.resp;
    if (!nome || nome.startsWith("Vobi #")) continue;
    const m = votos.get(idR) ?? new Map(); m.set(nome, (m.get(nome) ?? 0) + 1); votos.set(idR, m);
  }
  const novosPorCorrespondencia: Diagnostico["responsaveis"]["novosPorCorrespondencia"] = [];
  for (const [idR, m] of votos) {
    const tot = [...m.values()].reduce((a, b) => a + b, 0);
    const [nome, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    // correspondência determinística: ≥ 2 tarefas iguais e ≥ 80% delas com o mesmo nome na última exportação
    if (n >= 2 && n / tot >= 0.8) { respBase.set(idR, nome); novosPorCorrespondencia.push({ id: idR, nome, votos: n }); }
  }
  const semNomeCont = new Map<number, number>();
  const nomeResp = (idR: number | null) => {
    if (idR == null) return "";
    const n = respBase.get(idR);
    if (n) return n;
    semNomeCont.set(idR, (semNomeCont.get(idR) ?? 0) + 1);
    return nomeSemResponsavelMapeado(idR);
  };

  // ---------------- Tarefas ----------------
  const fEst = detectarFator(tarefasApi.map((t) => [num(t.estimativeDuration) ?? 0, tarBase.get(chaveDe(t))?.est ?? 0]));
  const fRea = detectarFator(tarefasApi.map((t) => [num(t.totalPerformedHours) ?? 0, tarBase.get(chaveDe(t))?.rea ?? 0]));
  const horas = (v: unknown, f: number) => { const n = num(v); return n == null ? "" : minutosParaHoras(Math.round(n * f)); };
  const linhasT = tarefasApi.filter((t) => num(t.idRefurbish) != null && nomeProj.has(num(t.idRefurbish)!)).map((t) => ({
    "Nome da tarefa": limpar(txt(t.name)), "Etapa": etapaPorId.get(num(t.idRefurbishStep)) ?? "",
    "Projeto": nomeProj.get(num(t.idRefurbish)!) ?? "", "Data de Início": dataBr(t.startDate), "Data de Fim": dataBr(t.endDate),
    "Descrição": "", // descrição não é usada pelo A360; não é copiada
    "Horas estimadas": horas(t.estimativeDuration, fEst.fator), "Responsável": nomeResp(num(t.idResponsible)),
    "Horas realizadas (em minutos)": horas(t.totalPerformedHours, fRea.fator),
    "prioridade": PRIORIDADE[num(t.priority) ?? 0] ?? "", "Status": STATUS_TAREFA[num(t.status) ?? 0] ?? txt(t.status),
  }) as Record<string, string>);
  if (deOutros) limitacoes.push(`${deOutros} tarefa(s) de projetos que não vieram na leitura (antigos/arquivados no Vobi) não entram, como na exportação.`);
  if (foraDeProjeto) limitacoes.push(`${foraDeProjeto} tarefa(s) do Vobi sem projeto não entram (a exportação de tarefas é por projeto).`);

  // ---------------- Clientes (só colunas autorizadas; o que a API não traz é mantido) ----------------
  let linhasC: Record<string, string>[] | undefined;
  if (v.clientes.length) {
    linhasC = ordenar(v.clientes).map((c) => {
      const id = num(c.id)!; const b = cliBase.get(id);
      const ou = (api: unknown, base: string | null | undefined) => (api === undefined ? base ?? "" : limpar(txt(api)));
      const ativo = campo(c, "isActive", "active");
      return {
        "Código": String(id), "Nome": limpar(txt(c.name)) || b?.nome || "",
        "Razão Social": ou(campo(c, "corporateName", "companyName", "socialName"), b?.razaoSocial),
        "Email": ou(campo(c, "email"), b?.email), "Telefone": ou(campo(c, "phone", "cellphone", "telephone"), b?.telefone),
        "Status": ativo === undefined ? b?.status ?? "" : ativo ? "Ativo" : "Inativo",
        "Criado em": dataBr(campo(c, "createdAt")) || (b?.criadoEmVobi ? b.criadoEmVobi.split("-").reverse().join("/") : ""),
        "Cidade": ou(campo(c, "city"), b?.cidade), "Estado": ou(campo(c, "state", "uf"), b?.estado),
        "Tipo": ou(campo(c, "personType", "type"), b?.tipo),
      };
    });
  }

  const bufProjetos = serializar(layouts.projetos, linhasP), bufTarefas = serializar(layouts.tarefas, linhasT);
  const bufClientes = linhasC ? serializar(layouts.clientesA360, linhasC) : undefined;
  const camposRecebidos: Record<string, string[]> = {};
  for (const [k, xs] of Object.entries(v)) camposRecebidos[k] = Object.keys((xs as R[])[0] ?? {}).sort();
  return {
    projetos: lerCsv(bufProjetos, layouts.projetos, "API Vobi · projetos"),
    tarefas: lerCsv(bufTarefas, layouts.tarefas, "API Vobi · tarefas"),
    clientes: bufClientes ? lerCsv(bufClientes, layouts.clientesA360, "API Vobi · clientes") : undefined,
    bufProjetos, bufTarefas, bufClientes,
    diagnostico: {
      projetos: linhasP.length, tarefas: linhasT.length, tarefasForaDeProjeto: foraDeProjeto, etapas: v.etapas.length, clientes: v.clientes.length,
      responsaveis: {
        ids: new Set(tarefasApi.filter((t) => nomeProj.has(num(t.idRefurbish) ?? -1)).map((t) => num(t.idResponsible)).filter((x) => x != null)).size, comNome: respBase.size,
        novosPorCorrespondencia, semNome: [...semNomeCont].map(([id, tarefas]) => ({ id, tarefas })).sort((a, b) => b.tarefas - a.tarefas),
      },
      unidadeHoras: { estimadas: fEst.rotulo, realizadas: fRea.rotulo },
      camposRecebidos, limitacoes,
    },
  };
}
