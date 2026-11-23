// Leitura agregada da operação de arquitetura para o Rucelle 360° (T-281, pedido de Rodrigo em 23/11/2026). SOMENTE LEITURA.
// Reaproveita o contrato a360.operacao.v1 e acrescenta (sem quebrar a v1) a situação da carteira, entregáveis, alertas
// e a carga da equipe nas próximas semanas. Decisão de Rodrigo: só totais da equipe — nada por arquiteta.
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { contagem } from "@/lib/consultas";
import { hojeIso, sqlForaDePausado, sqlStatusPrazo } from "@/lib/prazo";
import { capacidade } from "@/lib/servicos/capacidade";
import { panoramaParaContrato } from "@/lib/servicos/operacao";

const urlBase = () => (process.env.APP_URL ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "")).replace(/\/$/, "");
const dm = (d: unknown) => new Date(String(d)).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/** Temas de recomendação que citam pessoas pelo nome ficam fora da leitura do 360°. */
const TEMAS_POR_PESSOA = new Set(["Concentração de trabalho", "Padrão de atraso"]);

export async function operacaoPara360() {
  const base = await panoramaParaContrato();
  if (!base.carga) return { ...base, recomendacoes: [], complemento: null };
  const cid = base.carga.id;
  const prov = { origem: "a360" as const, natureza: "calculado" as const, dataReferencia: base.carga.dataExportacaoVobi, cargaId: cid };

  const [proj] = await contagem(`select count(*) filter (where status_classe='ativo')::int ativos, count(*) filter (where status_classe='pausado')::int pausados
    from projeto where ultima_carga=${cid}`);
  const sp = sqlStatusPrazo(hojeIso(), "t");
  const [comAtraso] = await contagem(`select count(distinct t.projeto_codigo)::int n from tarefa t where t.ultima_carga=${cid}
    and t.status not in ('concluido','cancelado') and t.orfa=false and ${sqlForaDePausado("t.projeto_codigo")}
    and ${sp} in ('atrasada_30','atrasada_8_30','atrasada_1_7')`);
  const ent = await db.execute(sql`select status, count(*)::int n from entregavel group by 1`);
  const al = await db.execute(sql`select prioridade, count(*)::int n from projeto_alerta
    where situacao in ('aberto','em_analise','esclarecimento','em_tratamento') group by 1`);
  const cap = await capacidade();
  // Itens com link direto para o problema no A360 (pedido de Rodrigo, 23/11/2026). Só projeto e título: sem nome de pessoa.
  const projVenc = await contagem(`select p.codigo, p.nome, count(*)::int n from tarefa t join projeto p on p.codigo=t.projeto_codigo
    where t.ultima_carga=${cid} and t.status not in ('concluido','cancelado') and t.orfa=false and ${sqlForaDePausado("t.projeto_codigo")}
    and ${sp} in ('atrasada_30','atrasada_8_30','atrasada_1_7') group by 1,2 order by 3 desc, 2 limit 30`);
  const alLista = await db.execute(sql`select a.id, a.titulo, a.prioridade, p.nome projeto from projeto_alerta a left join projeto p on p.codigo = a.projeto_codigo
    where a.situacao in ('aberto','em_analise','esclarecimento','em_tratamento')
    order by case a.prioridade when 'critico' then 0 when 'alto' then 1 when 'moderado' then 2 else 3 end, a.criado_em asc limit 30`);
  const entLista = await db.execute(sql`select e.id, e.titulo, e.atualizado_em, p.nome projeto from entregavel e left join projeto p on p.codigo = e.projeto_codigo
    where e.status = 'revisao_interna' order by e.atualizado_em asc limit 30`);
  const u = urlBase(), l = (path: string) => (u ? `${u}${path}` : null);

  const n = (rows: { rows: Record<string, unknown>[] }, chave: string, valor: string) => Number(rows.rows.find((r) => r[chave] === valor)?.n ?? 0);
  return {
    ...base,
    recomendacoes: base.recomendacoes.filter((r) => !TEMAS_POR_PESSOA.has(r.tema)),
    complemento: {
      proveniencia: prov,
      projetos: { ativos: Number(proj.ativos), pausados: Number(proj.pausados), comTarefaVencida: Number(comAtraso.n) },
      entregaveis: { emRevisaoInterna: n(ent, "status", "revisao_interna") },
      links: {
        sistema: u || null, alertasAbertos: l("/alertas?abertos=1"), tarefasVencidas: l("/tarefas?prazo=atrasadas"),
        entregaveisEmRevisao: l("/entregaveis?status=revisao_interna"), projetos: l("/projetos"),
      },
      problemas: {
        projetosComTarefaVencida: projVenc.map((r) => ({ codigo: Number(r.codigo), projeto: String(r.nome), tarefasVencidas: Number(r.n), link: l(`/tarefas?projeto=${Number(r.codigo)}&prazo=atrasadas`) })),
        alertas: alLista.rows.map((r) => ({ id: String(r.id), titulo: String(r.titulo), prioridade: String(r.prioridade), projeto: r.projeto ? String(r.projeto) : null, link: l(`/alertas/${r.id}`) })),
        entregaveisEmRevisao: entLista.rows.map((r) => ({ id: String(r.id), titulo: String(r.titulo), projeto: r.projeto ? String(r.projeto) : null, desde: dm(r.atualizado_em), link: l(`/entregaveis/${r.id}`) })),
      },
      alertasAbertos: { critico: n(al, "prioridade", "critico"), alto: n(al, "prioridade", "alto"), moderado: n(al, "prioridade", "moderado"), informativo: n(al, "prioridade", "informativo") },
      // Carga da equipe (sem nomes): tarefas abertas com prazo em cada uma das próximas semanas.
      equipe: cap ? {
        pessoasComTarefas: cap.pessoas.filter((p) => p.abertas > 0).length,
        abertas: cap.totais.abertas, atrasadas: cap.totais.atrasadas, semPrazo: cap.totais.semPrazo, semResponsavel: cap.semResponsavel.abertas,
        semanas: cap.semanas.map((s) => ({ rotulo: s.rotulo, inicio: s.inicio, tarefas: cap.totais.semanas[s.indice] ?? 0 })),
      } : null,
    },
  };
}
