// Painel de Gestão (T-199, proposta v2 aprovada em 08/11/2026) — camada de serviços, independente da camada visual.
// Reaproveita o panorama da operação e o serviço do Meu Dia; acrescenta só o que o painel precisa (encerrados por tipo,
// prazos por semana, resumo de revisões). Regras: só dados importados do Vobi; prazos pela regra única (src/lib/prazo.ts);
// carga por responsável é informação operacional importada, não desempenho; refação só como contagem (D-C).
import { contagem } from "@/lib/consultas";
import { meuDiaCoordenacao, meuDiaGerencia, type Periodo } from "@/lib/servicos/meu-dia";
import { diasEntre, sqlForaDePausado } from "@/lib/prazo";

export type Visao = "executiva" | "operacional";

export type Semana = { inicio: string; fim: string; tarefas: number };

async function extras(cid: number, hoje: string) {
  const ABERTA = `t.status not in ('concluido','cancelado') and t.orfa=false and ${sqlForaDePausado("t.projeto_codigo")}`;
  const enc = await contagem(`select status k, count(*)::int n from projeto where ultima_carga=${cid} and status_classe='encerrado' group by 1 order by 2 desc`);
  const semanas: Semana[] = [];
  for (let k = 0; k < 4; k++) {
    const [r] = await contagem(`select count(*)::int n from tarefa t where t.ultima_carga=${cid} and ${ABERTA} and t.sem_fim=false
      and t.data_fim::date >= date '${hoje}' + ${k * 7} and t.data_fim::date <= date '${hoje}' + ${k * 7 + 6}`);
    const d0 = new Date(hoje + "T12:00:00Z"); d0.setUTCDate(d0.getUTCDate() + k * 7);
    const d1 = new Date(d0); d1.setUTCDate(d1.getUTCDate() + 6);
    semanas.push({ inicio: d0.toISOString().slice(0, 10), fim: d1.toISOString().slice(0, 10), tarefas: Number(r.n) });
  }
  const [rev] = await contagem(`select count(*)::int tarefas, count(distinct projeto_codigo)::int projetos from tarefa where ultima_carga=${cid} and orfa=false and (revisao>=1 or etapa_canonica='Refação')`);
  return {
    encerradosPorTipo: enc.map((r) => ({ rotulo: String(r.k), valor: Number(r.n) })),
    semanas,
    revisoes: { tarefas: Number(rev.tarefas), projetos: Number(rev.projetos) },
  };
}

export type PainelCoordenacao = NonNullable<Awaited<ReturnType<typeof painelOperacional>>>;
export type PainelGerencia = NonNullable<Awaited<ReturnType<typeof painelExecutivo>>>;

/** Visão operacional (coordenação): equipe, gargalos, prazos, projetos críticos, entregas e qualidade — sem carteira encerrada nem decisões de acesso. */
export async function painelOperacional(periodo: Periodo) {
  const d = await meuDiaCoordenacao(periodo);
  if (!d || !d.panorama) return null;
  const x = await extras(d.ctx.carga.id, d.ctx.hoje);
  return { ...d, panorama: d.panorama, ...x, idadeCargaDias: diasEntre(d.ctx.carga.dataCarga, d.ctx.hoje) };
}

/** Visão executiva (gestão e administração): tudo da operacional + carteira encerrada, sinais de risco, acessos e carga anterior. */
export async function painelExecutivo(periodo: Periodo) {
  const d = await meuDiaGerencia(periodo);
  if (!d || !d.panorama) return null;
  const x = await extras(d.ctx.carga.id, d.ctx.hoje);
  return { ...d, panorama: d.panorama, ...x, idadeCargaDias: diasEntre(d.ctx.carga.dataCarga, d.ctx.hoje) };
}
