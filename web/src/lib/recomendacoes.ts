import { contagem } from "@/lib/consultas";
import { sqlStatusPrazo } from "@/lib/prazo";

/**
 * Recomendações gerenciais (seção 3 das diretrizes de 05/11/2026): sinais calculados a partir dos dados
 * importados, dirigidos à gestão e coordenação. São recomendações de análise, não conclusões nem tarefas.
 * Limiares são parâmetros iniciais e podem ser ajustados pela gestão.
 */
export type Recomendacao = { tema: string; sinal: string; leitura: string; cuidado: string };

const LIMIAR_CONCENTRACAO_PESSOA = 0.30; // fração das tarefas abertas (com responsável) numa só pessoa
const LIMIAR_VENCIDAS_PESSOA = 0.50;     // fração vencida entre as tarefas com prazo da pessoa
const LIMIAR_REFACAO_HORAS = 0.25;       // fração das horas de um projeto em Refação
const MIN_TAREFAS = 8;                   // evita sinais sobre bases muito pequenas

/** `hoje` = data real (AAAA-MM-DD, fuso da Rucelle); atraso pela regra única de src/lib/prazo.ts. */
export async function recomendacoes(cid: number, hoje: string): Promise<Recomendacao[]> {
  const out: Recomendacao[] = [];
  const abertas = `ultima_carga=${cid} and orfa=false and status not in ('concluido','cancelado')`;
  const atrasada = `${sqlStatusPrazo(hoje, "tarefa")} in ('atrasada_30','atrasada_8_30','atrasada_1_7')`;

  // Concentração / possível sobrecarga por pessoa
  const pessoas = await contagem(`select responsavel_nome k, count(*)::int abertas,
     sum(case when sem_fim=false then 1 else 0 end)::int com_prazo,
     count(*) filter (where ${atrasada})::int vencidas,
     count(distinct projeto_codigo)::int projetos
     from tarefa where ${abertas} and sem_responsavel=false group by 1`);
  const totalComResp = pessoas.reduce((a, r) => a + Number(r.abertas), 0);
  for (const r of pessoas) {
    const ab = Number(r.abertas), cp = Number(r.com_prazo), venc = Number(r.vencidas);
    if (totalComResp >= MIN_TAREFAS && ab / totalComResp >= LIMIAR_CONCENTRACAO_PESSOA) {
      out.push({ tema: "Concentração de trabalho", sinal: `${r.k} responde por ${Math.round((ab / totalComResp) * 100)}% das tarefas abertas com responsável (${ab} de ${totalComResp}), em ${r.projetos} projetos.`,
        leitura: "Vale analisar a distribuição de projetos e se há dependência de uma pessoa específica.",
        cuidado: "Metade das tarefas não tem responsável no Vobi; a concentração real pode ser diferente." });
    }
    if (cp >= MIN_TAREFAS && venc / cp >= LIMIAR_VENCIDAS_PESSOA) {
      out.push({ tema: "Padrão de atraso", sinal: `${r.k}: ${venc} de ${cp} tarefas com prazo estão vencidas (${Math.round((venc / cp) * 100)}%).`,
        leitura: "Situação para acompanhamento da coordenação: pode indicar sobrecarga, dependências externas ou prazos desatualizados no Vobi.",
        cuidado: "Atraso não significa baixo desempenho; verificar complexidade, dependências e se os prazos foram replanejados." });
    }
  }

  // Gargalo por etapa
  const etapas = await contagem(`select etapa_canonica k, count(*)::int abertas, count(*) filter (where ${atrasada})::int vencidas
     from tarefa where ${abertas} group by 1 order by 2 desc`);
  const totalAb = etapas.reduce((a, r) => a + Number(r.abertas), 0);
  const top = etapas[0];
  if (top && totalAb >= MIN_TAREFAS && Number(top.abertas) / totalAb >= 0.4) {
    out.push({ tema: "Gargalo por etapa", sinal: `${top.k} concentra ${Math.round((Number(top.abertas) / totalAb) * 100)}% das tarefas abertas (${top.abertas}), ${top.vencidas} vencidas.`,
      leitura: "Etapa candidata a análise de capacidade e sequenciamento.",
      cuidado: "Tarefas planejadas de projetos novos inflam a etapa; distinguir o que está em andamento do que apenas foi cadastrado." });
  }

  // Volume de refação por projeto
  const ref = await contagem(`select p.nome k, sum(t.horas_realizadas_min)::int min, sum(case when t.etapa_canonica='Refação' then t.horas_realizadas_min else 0 end)::int refacao,
     count(*) filter (where t.revisao>=1 or t.etapa_canonica='Refação')::int revisoes
     from tarefa t join projeto p on p.codigo=t.projeto_codigo where t.ultima_carga=${cid} and p.status_classe<>'encerrado' group by 1`);
  for (const r of ref) {
    const min = Number(r.min ?? 0), rf = Number(r.refacao ?? 0), rev = Number(r.revisoes ?? 0);
    if ((min >= 600 && rf / min >= LIMIAR_REFACAO_HORAS) || rev >= 8) {
      out.push({ tema: "Volume de refação", sinal: `${r.k}: ${rev} tarefas de revisão${min ? `, ${Math.round((rf / min) * 100)}% das horas em Refação` : ""}.`,
        leitura: "Vale entender a origem das revisões (cliente, escopo, interno) antes de qualquer conclusão.",
        cuidado: "Refação não significa responsabilidade individual; o motivo não existe no Vobi." });
    }
  }

  // Cobertura dos dados
  const [cob] = await contagem(`select count(*)::int total, sum(case when sem_responsavel then 1 else 0 end)::int sem_resp, sum(case when sem_fim then 1 else 0 end)::int sem_fim from tarefa where ${abertas}`);
  const tot = Number(cob.total);
  if (tot && Number(cob.sem_resp) / tot >= 0.5) {
    out.push({ tema: "Limitação dos indicadores", sinal: `${Math.round((Number(cob.sem_resp) / tot) * 100)}% das tarefas abertas não têm responsável e ${Math.round((Number(cob.sem_fim) / tot) * 100)}% não têm prazo no Vobi.`,
      leitura: "Os indicadores por pessoa e de prazo descrevem só a parte cadastrada; ler as conclusões com essa reserva.",
      cuidado: "Isto é uma característica da fonte, não uma pendência de ninguém." });
  }
  return out;
}
