// T-219 — Diagnóstico de cobertura da programação do Vobi na Agenda do A360 (pedido de Rodrigo, 12/11/2026).
// SOMENTE LEITURA: lê as tarefas pela API (GET) e compara com o que o A360 tem. Não grava nada — nem no Vobi, nem no banco.
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { chaveTexto } from "@/lib/importador/normalizacao";
import { listarTudo } from "./api";
import { mapaResponsaveis } from "./espelho";

type R = Record<string, unknown>;
const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const STATUS: Record<number, string> = { 1: "Planejado", 2: "Em andamento", 4: "Concluído", 5: "Cancelado" };
type Cont = { total: number; ambas: number; soInicio: number; soTermino: number; semData: number };
const cont = (): Cont => ({ total: 0, ambas: 0, soInicio: 0, soTermino: 0, semData: 0 });

export async function diagnosticoCobertura() {
  const inicio = Date.now();
  const tarefas = await listarTudo<R>("/v2/task", {}, undefined, 500);
  const projA360 = new Map(((await db.execute(sql`select codigo, status_classe, nao_encontrado_desde from projeto`)).rows as { codigo: number; status_classe: string; nao_encontrado_desde: string | null }[]).map((p) => [Number(p.codigo), p]));
  const vinculadas = new Map(((await db.execute(sql`select tarefa_vobi_id, id from atividade where tarefa_vobi_id is not null`)).rows as { tarefa_vobi_id: number; id: number }[]).map((x) => [Number(x.tarefa_vobi_id), Number(x.id)]));
  const espelho = new Set(((await db.execute(sql`select id_vobi from vobi_tarefa`)).rows as { id_vobi: number }[]).map((x) => Number(x.id_vobi)));
  // tarefas importadas pela carga (sem número do Vobi): correspondência por projeto + nome normalizado
  const importadas = new Map<string, number>();
  for (const t of (await db.execute(sql`select projeto_codigo, nome from tarefa where nao_encontrado_desde is null`)).rows as { projeto_codigo: number; nome: string }[]) {
    const k = `${t.projeto_codigo}|${chaveTexto(t.nome)}`; importadas.set(k, (importadas.get(k) ?? 0) + 1);
  }
  const ativs = Number(((await db.execute(sql`select count(*)::int n from atividade`)).rows[0] as { n: number }).n);
  const ativsIndep = Number(((await db.execute(sql`select count(*)::int n from atividade where vinculo = 'independente'`)).rows[0] as { n: number }).n);
  const nomesResp = new Map(((await db.execute(sql`select id_vobi, nome from vobi_responsavel`)).rows as { id_vobi: number; nome: string }[]).map((x) => [Number(x.id_vobi), x.nome]));
  const { vobiParaUsuario } = await mapaResponsaveis();

  const geral = cont(), porStatus: Record<string, Cont> = {};
  const escopo = { semProjeto: 0, projetoNoA360: 0, projetoAtivoNoA360: 0, projetoForaDoA360: 0 };
  const comDataNoA360 = { total: 0, naAgenda: 0, noEspelho: 0, comoTarefaImportada: 0, importadaAmbigua: 0, semRepresentacao: 0, precisaVincular: 0 };
  const resp = { semResponsavel: 0, comAcesso: 0, soNome: 0, desconhecido: 0 };
  const respPend = new Map<number, number>();
  const grupos = new Map<string, number[]>();
  for (const t of tarefas) {
    const id = num(t.id)!, proj = num(t.idRefurbish), st = num(t.status) ?? 1, ini = t.startDate ? 1 : 0, fim = t.endDate ? 1 : 0;
    const comData = ini || fim;
    for (const c of [geral, (porStatus[STATUS[st] ?? `status ${st}`] ??= cont())]) {
      c.total++; if (ini && fim) c.ambas++; else if (ini) c.soInicio++; else if (fim) c.soTermino++; else c.semData++;
    }
    if (proj == null) escopo.semProjeto++;
    else if (!projA360.has(proj)) escopo.projetoForaDoA360++;
    else { escopo.projetoNoA360++; if (!projA360.get(proj)!.nao_encontrado_desde && projA360.get(proj)!.status_classe !== "encerrado") escopo.projetoAtivoNoA360++; }
    const noA360 = proj != null && projA360.has(proj);
    if (comData && noA360) {
      comDataNoA360.total++;
      const naAgenda = vinculadas.has(id), noEsp = espelho.has(id);
      const imp = importadas.get(`${proj}|${chaveTexto(String(t.name ?? ""))}`) ?? 0;
      if (naAgenda) comDataNoA360.naAgenda++;
      if (noEsp) comDataNoA360.noEspelho++;
      if (imp === 1) comDataNoA360.comoTarefaImportada++; else if (imp > 1) comDataNoA360.importadaAmbigua++;
      if (!naAgenda && !noEsp && imp === 0) comDataNoA360.semRepresentacao++;
      if (!naAgenda) comDataNoA360.precisaVincular++;
      // responsável
      const r = num(t.idResponsible);
      if (r == null) resp.semResponsavel++;
      else if (vobiParaUsuario.has(r)) resp.comAcesso++;
      else { if (nomesResp.has(r)) resp.soNome++; else resp.desconhecido++; respPend.set(r, (respPend.get(r) ?? 0) + 1); }
      // possíveis duplicidades: mesmo projeto + mesmo nome + mesmo término
      const k = `${proj}|${chaveTexto(String(t.name ?? ""))}|${String(t.endDate ?? "").slice(0, 10)}`;
      grupos.set(k, [...(grupos.get(k) ?? []), id]);
    }
  }
  const duplicidades = [...grupos.entries()].filter(([, ids]) => ids.length > 1).map(([k, ids]) => ({ projeto: Number(k.split("|")[0]), nome: k.split("|")[1], termino: k.split("|")[2], ids }));
  return {
    lidoEm: new Date().toISOString(), segundos: Math.round((Date.now() - inicio) / 1000), chamadas: Math.ceil(tarefas.length / 500) + 1,
    geral, porStatus, escopo, comDataNoA360, resp,
    respPendentes: [...respPend.entries()].map(([id, n]) => ({ id, n, nome: nomesResp.get(id) ?? null })).sort((a, b) => b.n - a.n),
    duplicidades: { grupos: duplicidades.length, tarefas: duplicidades.reduce((n, d) => n + d.ids.length, 0), exemplos: duplicidades.slice(0, 15) },
    a360: { atividades: ativs, independentes: ativsIndep, vinculadas: vinculadas.size, espelho: espelho.size },
  };
}
