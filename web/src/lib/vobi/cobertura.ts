// T-219 — Diagnóstico de cobertura da programação do Vobi na Agenda do A360 (pedido de Rodrigo, 12/11/2026).
// SOMENTE LEITURA: lê as tarefas pela API (GET) e compara com o que o A360 tem. Não grava nada — nem no Vobi, nem no banco.
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { chaveTexto } from "@/lib/importador/normalizacao";
import { listarTudo } from "./api";
import { mapaResponsaveis } from "./espelho";
import { SQL_ELEGIVEIS } from "./escopo";

type R = Record<string, unknown>;
const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const STATUS: Record<number, string> = { 1: "Planejado", 2: "Em andamento", 4: "Concluído", 5: "Cancelado" };
type Cont = { total: number; ambas: number; soInicio: number; soTermino: number; semData: number };
const cont = (): Cont => ({ total: 0, ambas: 0, soInicio: 0, soTermino: 0, semData: 0 });

export async function diagnosticoCobertura() {
  const inicio = Date.now();
  const tarefas = await listarTudo<R>("/v2/task", {}, undefined, 500);
  const projA360 = new Map(((await db.execute(sql`select codigo, status_classe, nao_encontrado_desde from projeto where codigo in ${SQL_ELEGIVEIS}`)).rows as { codigo: number; status_classe: string; nao_encontrado_desde: string | null }[]).map((p) => [Number(p.codigo), p]));
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

/**
 * Indicadores de cobertura a partir do que o A360 já guardou (sem chamar o Vobi). Separados como pedido em 12/11/2026:
 * importadas e identificadas · vínculo confirmado · pendentes de reconciliação · responsáveis mapeados / sem mapeamento ·
 * aptas para programação e envio. O bloqueio é por tarefa: uma pendência não trava as tarefas que não afeta.
 */
export async function indicadoresCobertura() {
  const q = async <T,>(s: ReturnType<typeof sql>) => (await db.execute(s)).rows as T[];
  const mapResp = sql`(select vr.id_vobi from vobi_responsavel vr join pessoa_vobi pv on pv.nome_vobi = vr.nome join usuario u on lower(u.email) = lower(pv.email_rucelle) and u.ativo)`;
  const [imp] = await q<Record<string, number>>(sql`select count(*)::int total,
      count(*) filter (where inicio is not null or fim is not null)::int com_data, count(*) filter (where inicio is null and fim is null)::int sem_data,
      count(*) filter (where status = 1)::int planejadas, count(*) filter (where status = 2)::int andamento, count(*) filter (where status = 4)::int concluidas, count(*) filter (where status = 5)::int canceladas,
      count(*) filter (where ausente_desde is not null)::int ausentes, max(visto_em) lido_em
    from vobi_tarefa t where t.id_refurbish in ${SQL_ELEGIVEIS}`);
  const [vinc] = await q<Record<string, number>>(sql`select
      (select count(*)::int from tarefa where id_vobi is not null and projeto_codigo in ${SQL_ELEGIVEIS}) carga_confirmadas,
      (select count(*)::int from tarefa where projeto_codigo in ${SQL_ELEGIVEIS} and id_vobi is null and nao_encontrado_desde is null) carga_sem_vinculo,
      (select count(*)::int from atividade where tarefa_vobi_id is not null) atividades,
      (select count(*)::int from vobi_tarefa where id_refurbish not in ${SQL_ELEGIVEIS}) fora_recorte,
      (select count(*)::int from projeto where codigo not in ${SQL_ELEGIVEIS}) projetos_fora`);
  // pendências: carga sem número (separando nome repetido = ambíguo) e tarefas do Vobi sem tarefa da carga
  const ambiguas = await q<{ k: string; n: number }>(sql`select split_part(chave,'|',1)||'|'||split_part(chave,'|',2)||'|'||split_part(chave,'|',3) k, count(*)::int n
      from tarefa where projeto_codigo in ${SQL_ELEGIVEIS} and id_vobi is null and nao_encontrado_desde is null group by 1 having count(*) > 1`);
  const [vobiSemCarga] = await q<{ n: number; com_data: number; encerrados: number }>(sql`select count(*)::int n, count(*) filter (where t.inicio is not null or t.fim is not null)::int com_data,
      count(*) filter (where (select p.status_classe from projeto p where p.codigo = t.id_refurbish) = 'encerrado')::int encerrados
      from vobi_tarefa t where t.id_refurbish in ${SQL_ELEGIVEIS} and not exists (select 1 from tarefa c where c.id_vobi = t.id_vobi)`);
  const resp = await q<{ id: number | null; nome: string | null; mapeado: boolean; n: number; abertas: number }>(sql`select t.id_responsavel id, vr.nome, (t.id_responsavel in ${mapResp}) mapeado,
      count(*)::int n, count(*) filter (where coalesce(t.status,1) in (1,2))::int abertas
      from vobi_tarefa t left join vobi_responsavel vr on vr.id_vobi = t.id_responsavel where t.id_refurbish in ${SQL_ELEGIVEIS} group by 1, 2, 3 order by 4 desc`);
  const [aptas] = await q<Record<string, number>>(sql`select
      count(*) filter (where coalesce(status,1) in (1,2))::int abertas,
      count(*) filter (where coalesce(status,1) in (1,2) and id_responsavel in ${mapResp} and fim is not null and ausente_desde is null)::int aptas,
      count(*) filter (where coalesce(status,1) in (1,2) and id_responsavel is not null and id_responsavel not in ${mapResp})::int bloq_resp,
      count(*) filter (where coalesce(status,1) in (1,2) and id_responsavel is null)::int bloq_sem_resp,
      count(*) filter (where coalesce(status,1) in (1,2) and id_responsavel in ${mapResp} and fim is null)::int sem_termino
    from vobi_tarefa where id_refurbish in ${SQL_ELEGIVEIS}`);
  const n = (x: unknown) => Number(x ?? 0);
  const mapeados = resp.filter((r) => r.id != null && r.mapeado), naoMapeados = resp.filter((r) => r.id != null && !r.mapeado), semResp = resp.find((r) => r.id == null);
  return {
    importadas: { total: n(imp?.total), comData: n(imp?.com_data), semData: n(imp?.sem_data), planejadas: n(imp?.planejadas), andamento: n(imp?.andamento), concluidas: n(imp?.concluidas), canceladas: n(imp?.canceladas), ausentes: n(imp?.ausentes), lidoEm: imp?.lido_em ? String(imp.lido_em) : null },
    vinculo: { cargaConfirmadas: n(vinc?.carga_confirmadas), atividades: n(vinc?.atividades) },
    foraDoRecorte: { tarefasPreservadas: n(vinc?.fora_recorte), projetos: n(vinc?.projetos_fora) },
    pendentes: {
      cargaSemVinculo: n(vinc?.carga_sem_vinculo), ambiguasGrupos: ambiguas.length, ambiguasTarefas: ambiguas.reduce((s, a) => s + n(a.n), 0), ambiguasExemplos: ambiguas.slice(0, 20),
      vobiSemCarga: n(vobiSemCarga?.n), vobiSemCargaComData: n(vobiSemCarga?.com_data), vobiSemCargaEncerrados: n(vobiSemCarga?.encerrados),
      responsavelSoNumero: naoMapeados.reduce((s, r) => s + n(r.n), 0), semResponsavel: n(semResp?.n),
    },
    responsaveis: {
      mapeados: mapeados.length, tarefasMapeadas: mapeados.reduce((s, r) => s + n(r.n), 0),
      semMapeamento: naoMapeados.map((r) => ({ id: r.id!, nome: r.nome, tarefas: n(r.n), abertas: n(r.abertas) })),
    },
    aptas: { abertas: n(aptas?.abertas), aptas: n(aptas?.aptas), bloqueadasResponsavel: n(aptas?.bloq_resp), bloqueadasSemResponsavel: n(aptas?.bloq_sem_resp), semTermino: n(aptas?.sem_termino) },
  };
}
