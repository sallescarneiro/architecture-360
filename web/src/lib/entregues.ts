// "Já entregue" de um projeto (pedido de Rodrigo em 23/11/2026): o que o Vobi já marca como concluído, organizado por etapa,
// com as apresentações/entregas ao cliente em destaque e os entregáveis aprovados pelo cliente no A360. Só leitura.
import { sql } from "drizzle-orm";
import { db } from "@/db";

const ORDEM = ["Programa de Necessidades", "Conceito e Layout", "ESTUDO VOLUMÉTRICO", "Imagens 3D", "Vídeo 3D", "Projeto Executivo Civil", "Detalhamento de Interiores", "Documentação", "Projeto Legal", "Refação"];
const posicao = (e: string) => { const i = ORDEM.findIndex((o) => o.toLowerCase() === e.toLowerCase()); return i < 0 ? 99 : i; };
/** Tarefa que é entrega ao cliente: apresentação, entrega, envio ou emissão. */
export const ehEntregaAoCliente = (nome: string) => /^(apresenta|entrega|envio|emiss)/i.test(nome.trim());

export type EtapaEntrega = { etapa: string; total: number; concluidas: number; situacao: "concluida" | "andamento" | "nao_iniciada" };
export type TarefaEntregue = { nome: string; etapa: string; previsto: string | null; registradaEm: string | null; primeiraLeitura: boolean; responsavel: string | null; entrega: boolean };

export async function jaEntregue(codigo: number) {
  const rows = (await db.execute(sql`
    select t.chave, t.nome, coalesce(nullif(t.etapa_canonica, ''), '(sem etapa)') etapa, t.status, t.data_fim, t.responsavel_nome,
      (select min(c.data_carga) from historico_alteracoes h join carga c on c.id = h.carga_id
        where h.entidade = 'tarefa' and h.chave = t.chave and h.campo = 'status' and h.valor_novo = 'concluido') concluida_em,
      (select c.data_carga from carga c where c.id = t.primeira_carga) primeira
    from tarefa t where t.projeto_codigo = ${codigo} and t.nao_encontrado_desde is null and t.orfa = false`)).rows as
    { chave: string; nome: string; etapa: string; status: string | null; data_fim: string | null; responsavel_nome: string | null; concluida_em: string | null; primeira: string | null }[];
  const porEtapa = new Map<string, { total: number; concluidas: number }>();
  for (const r of rows) {
    if (r.status === "cancelado") continue;
    const e = porEtapa.get(r.etapa) ?? { total: 0, concluidas: 0 };
    e.total++; if (r.status === "concluido") e.concluidas++;
    porEtapa.set(r.etapa, e);
  }
  const etapas: EtapaEntrega[] = [...porEtapa].map(([etapa, e]) => ({ etapa, ...e, situacao: e.concluidas === e.total ? "concluida" as const : e.concluidas > 0 ? "andamento" as const : "nao_iniciada" as const }))
    .sort((a, b) => posicao(a.etapa) - posicao(b.etapa) || a.etapa.localeCompare(b.etapa));
  const tarefas: TarefaEntregue[] = rows.filter((r) => r.status === "concluido").map((r) => ({
    nome: r.nome, etapa: r.etapa, previsto: r.data_fim, registradaEm: r.concluida_em ?? r.primeira, primeiraLeitura: !r.concluida_em,
    responsavel: r.responsavel_nome, entrega: ehEntregaAoCliente(r.nome),
  })).sort((a, b) => (b.registradaEm ?? "").localeCompare(a.registradaEm ?? "") || (b.previsto ?? "").localeCompare(a.previsto ?? ""));
  const aprovados = (await db.execute(sql`select id, titulo, versao_atual, atualizado_em from entregavel where projeto_codigo = ${codigo} and status = 'aprovado_cliente' order by atualizado_em desc`)).rows as
    { id: number; titulo: string; versao_atual: number; atualizado_em: string }[];
  return { etapas, tarefas, entregas: tarefas.filter((t) => t.entrega), aprovados };
}
