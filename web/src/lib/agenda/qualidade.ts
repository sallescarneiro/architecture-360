// T-219 — qualidade dos dados da Agenda (prioridade de Rodrigo, 12/11/2026): responsáveis sem mapeamento, tarefas abertas
// sem responsável e sem prazo, e o preenchimento da data de início prevista no Vobi. Só leitura do que o A360 já tem.
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { SQL_ELEGIVEIS } from "@/lib/vobi/escopo";
import { mapaResponsaveis } from "@/lib/vobi/espelho";

type Linha = { id: number; nome: string; projeto: number; projeto_nome: string; etapa: string | null; fim: string | null; status: number | null; resp: number | null; atividade: number | null };

/** Tarefas abertas (Planejado/Em andamento) dos projetos do recorte que não estão encerrados nem ausentes. */
async function abertas(): Promise<Linha[]> {
  return (await db.execute(sql`select t.id_vobi id, t.nome, t.id_refurbish projeto, p.nome projeto_nome, e.nome etapa, t.fim, t.status, t.id_responsavel resp,
      (select a.id from atividade a where a.tarefa_vobi_id = t.id_vobi limit 1) atividade
    from vobi_tarefa t join projeto p on p.codigo = t.id_refurbish left join vobi_etapa e on e.id_vobi = t.id_etapa
    where t.ausente_desde is null and coalesce(t.status, 1) not in (4, 5) and t.id_refurbish in ${SQL_ELEGIVEIS}
      and p.status_classe <> 'encerrado' and p.nao_encontrado_desde is null
    order by p.nome, t.fim nulls last, t.nome`)).rows.map((r) => ({ ...(r as Linha), id: Number((r as Linha).id), projeto: Number((r as Linha).projeto) }));
}

export async function qualidadeAgenda() {
  const lst = await abertas();
  const { vobiParaUsuario } = await mapaResponsaveis();
  const semResponsavel = lst.filter((t) => t.resp == null && !t.atividade);
  const semPrazo = lst.filter((t) => !t.fim && !t.atividade);
  const agrupar = (xs: Linha[]) => {
    const m = new Map<number, { projeto: number; nome: string; tarefas: Linha[] }>();
    for (const t of xs) { const g = m.get(t.projeto) ?? { projeto: t.projeto, nome: t.projeto_nome, tarefas: [] }; g.tarefas.push(t); m.set(t.projeto, g); }
    return [...m.values()].sort((a, b) => b.tarefas.length - a.tarefas.length);
  };

  // responsáveis do Vobi sem pessoa do A360 (tarefas do recorte), com pistas para a coordenação identificar quem é
  const nums = (await db.execute(sql`select t.id_responsavel id, count(*)::int tarefas,
      count(*) filter (where coalesce(t.status, 1) not in (4, 5))::int abertas,
      (select vr.nome from vobi_responsavel vr where vr.id_vobi = t.id_responsavel limit 1) nome,
      string_agg(distinct p.nome, ' · ') projetos, max(coalesce(t.fim, t.inicio)) ultima
    from vobi_tarefa t join projeto p on p.codigo = t.id_refurbish
    where t.id_responsavel is not null and t.ausente_desde is null and t.id_refurbish in ${SQL_ELEGIVEIS}
    group by t.id_responsavel`)).rows as { id: number; tarefas: number; abertas: number; nome: string | null; projetos: string; ultima: string | null }[];
  const semMapeamento = [];
  for (const x of nums.filter((x) => !vobiParaUsuario.has(Number(x.id))).sort((a, b) => b.abertas - a.abertas || b.tarefas - a.tarefas)) {
    // pista da carga: nome do responsável nas tarefas da carga ligadas pelo número a tarefas desse responsável
    const pistas = (await db.execute(sql`select c.responsavel_nome nome, count(*)::int n from tarefa c join vobi_tarefa t on t.id_vobi = c.id_vobi
      where t.id_responsavel = ${x.id} and coalesce(c.responsavel_nome, '') <> '' group by c.responsavel_nome order by 2 desc limit 3`)).rows as { nome: string; n: number }[];
    semMapeamento.push({ ...x, id: Number(x.id), pistas });
  }

  // data de início prevista (Vobi) nos projetos ativos da base
  const projetos = (await db.execute(sql`select p.codigo, p.nome, p.status, p.inicio_previsto, p.criado_em,
      (p.codigo in ${SQL_ELEGIVEIS}) elegivel,
      exists (select 1 from projeto_sob_demanda d where d.codigo = p.codigo and d.situacao = 'integrado') sob_demanda
    from projeto p where p.nao_encontrado_desde is null and p.status_classe <> 'encerrado' order by p.nome`)).rows as
    { codigo: number; nome: string; status: string | null; inicio_previsto: string | null; criado_em: string | null; elegivel: boolean; sob_demanda: boolean }[];
  const comInicio = projetos.filter((p) => p.inicio_previsto);
  return {
    semResponsavel: { total: semResponsavel.length, projetos: agrupar(semResponsavel), semPrazoTambem: semResponsavel.filter((t) => !t.fim).length },
    semPrazo: { total: semPrazo.length, projetos: agrupar(semPrazo) },
    semMapeamento,
    inicio: {
      ativos: projetos.length, preenchidos: comInicio.length,
      pendentesNoRecorte: projetos.filter((p) => !p.inicio_previsto && p.elegivel && !p.sob_demanda), // entram hoje pelo "Criado em"
      foraSemData: projetos.filter((p) => !p.inicio_previsto && !p.elegivel), // fora do recorte e sem a data
    },
    abertas: lst.length,
  };
}
