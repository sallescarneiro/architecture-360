// Fase 5 — Capacidade e fluxo (T-189, autorizada por Rodrigo em 10/11/2026). Camada de serviços, independente da camada visual.
// Regras: só tarefas e projetos já importados do Vobi (somente leitura) + reuniões do A360 (Fase 4); prazos pela regra única
// (src/lib/prazo.ts); nada aqui é ranking, nota ou avaliação — carga por pessoa é informação operacional importada, ordenada por nome.
// O que não tem dado é declarado como limitação (horas estimadas, sem prazo, sem responsável, pessoas sem e-mail mapeado).
import { contagem } from "@/lib/consultas";
import { contextoCarga, ETAPAS_ENTREGA, type ContextoCarga } from "@/lib/servicos/meu-dia";
import { sqlForaDePausado, sqlStatusPrazo } from "@/lib/prazo";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const SEMANAS = 6;
const esc = (s: string) => s.replace(/'/g, "''");
const ABERTA = `t.status not in ('concluido','cancelado') and t.orfa=false and ${sqlForaDePausado("t.projeto_codigo")}`;
const ATRASADA = (sp: string) => `${sp} in ('atrasada_30','atrasada_8_30','atrasada_1_7')`;

export type SemanaRef = { indice: number; inicio: string; fim: string; rotulo: string };
export type Pessoa = {
  nome: string; email: string | null; mapeada: boolean;
  projetos: number; abertas: number; atrasadas: number; d7: number; semPrazo: number;
  horasEstimadasMin: number | null; tarefasComHoras: number;
  semanas: number[]; // tarefas com prazo em cada uma das próximas SEMANAS semanas
  reunioes7: number; // reuniões do A360 nos próximos 7 dias de que participa (por e-mail)
};
export type Etapa = { etapa: string; abertas: number; atrasadas: number; semResponsavel: number; semPrazo: number; projetos: number; pessoas: number; medianaAtrasoDias: number | null; d7: number };
export type Entrega = { chave: string; nome: string; etapa: string; dataFim: string; dias: number; projetoCodigo: number; projetoNome: string; cliente: string | null; responsavel: string | null; atrasada: boolean };
export type Capacidade = NonNullable<Awaited<ReturnType<typeof capacidade>>>;

function semanasRef(hoje: string): SemanaRef[] {
  const out: SemanaRef[] = [];
  for (let k = 0; k < SEMANAS; k++) {
    const d0 = new Date(hoje + "T12:00:00Z"); d0.setUTCDate(d0.getUTCDate() + k * 7);
    const d1 = new Date(d0); d1.setUTCDate(d1.getUTCDate() + 6);
    const f = (d: Date) => `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
    out.push({ indice: k, inicio: d0.toISOString().slice(0, 10), fim: d1.toISOString().slice(0, 10), rotulo: `${f(d0)}–${f(d1)}` });
  }
  return out;
}

export async function capacidade() {
  const ctx: ContextoCarga | null = await contextoCarga();
  if (!ctx) return null;
  const cid = ctx.carga.id, hoje = ctx.hoje;
  const sp = sqlStatusPrazo(hoje, "t");
  const semanas = semanasRef(hoje);
  const semanaCols = semanas.map((s) => `count(*) filter (where t.sem_fim=false and t.data_fim::date between date '${s.inicio}' and date '${s.fim}')::int s${s.indice}`).join(",\n");

  // 1. Distribuição por pessoa (responsável no Vobi). Projetos = em que é colaboradora OU responde por tarefa aberta.
  const pessoasRows = await contagem(`
    with resp as (
      select t.responsavel_nome nome, t.responsavel_email email,
        count(*)::int abertas, count(*) filter (where ${ATRASADA(sp)})::int atrasadas, count(*) filter (where ${sp} in ('vence_hoje','vence_7'))::int d7,
        count(*) filter (where ${sp}='sem_prazo')::int sem_prazo,
        sum(t.horas_estimadas_min) filter (where t.horas_estimadas_min>0)::int horas_est, count(*) filter (where t.horas_estimadas_min>0)::int com_horas,
        count(distinct t.projeto_codigo)::int proj_tarefas,
        ${semanaCols}
      from tarefa t where t.ultima_carga=${cid} and ${ABERTA} and t.sem_responsavel=false group by 1,2)
    select r.*, pv.email_rucelle,
      (select count(distinct p.codigo)::int from projeto p where p.ultima_carga=${cid} and p.status_classe<>'encerrado' and p.nao_encontrado_desde is null
         and (exists (select 1 from jsonb_array_elements_text(p.colaboradores) e where e=r.nome)
              or exists (select 1 from tarefa t2 where t2.projeto_codigo=p.codigo and t2.ultima_carga=${cid} and t2.status not in ('concluido','cancelado') and t2.orfa=false and t2.responsavel_nome=r.nome))) projetos
    from resp r left join pessoa_vobi pv on pv.nome_vobi=r.nome order by r.nome`);
  // reuniões próximas 7 dias por e-mail de participante
  const reun = (await db.execute(sql`select lower(p->>'email') email, count(distinct r.id)::int n from reuniao r, jsonb_array_elements(r.participantes) p
      where r.status='planejada' and r.inicio >= now() and r.inicio < now() + interval '7 days' and p->>'email' is not null group by 1`)).rows as { email: string; n: number }[];
  const reunPorEmail = new Map(reun.map((r) => [r.email, Number(r.n)]));
  const pessoas: Pessoa[] = pessoasRows.map((r) => {
    const email = (r.email_rucelle as string | null) ?? (r.email as string | null) ?? null;
    return {
      nome: String(r.nome), email, mapeada: Boolean(email),
      projetos: Number(r.projetos), abertas: Number(r.abertas), atrasadas: Number(r.atrasadas), d7: Number(r.d7), semPrazo: Number(r.sem_prazo),
      horasEstimadasMin: r.horas_est == null ? null : Number(r.horas_est), tarefasComHoras: Number(r.com_horas),
      semanas: semanas.map((s) => Number(r[`s${s.indice}`] ?? 0)),
      reunioes7: email ? reunPorEmail.get(email.toLowerCase()) ?? 0 : 0,
    };
  });

  // Tarefas abertas sem responsável (ficam fora da distribuição) — por semana também
  const [semResp] = await contagem(`select count(*)::int abertas, count(*) filter (where ${ATRASADA(sp)})::int atrasadas, ${semanaCols}
    from tarefa t where t.ultima_carga=${cid} and ${ABERTA} and t.sem_responsavel=true`);
  const semResponsavel = { abertas: Number(semResp.abertas), atrasadas: Number(semResp.atrasadas), semanas: semanas.map((s) => Number(semResp[`s${s.indice}`] ?? 0)) };

  // 2. Totais por semana (toda a equipe) + atrasadas + sem prazo
  const [tot] = await contagem(`select count(*)::int abertas, count(*) filter (where ${ATRASADA(sp)})::int atrasadas, count(*) filter (where ${sp}='sem_prazo')::int sem_prazo,
    count(*) filter (where t.horas_estimadas_min>0)::int com_horas, coalesce(sum(t.horas_estimadas_min) filter (where t.horas_estimadas_min>0),0)::int horas_est, ${semanaCols}
    from tarefa t where t.ultima_carga=${cid} and ${ABERTA}`);
  const totais = { abertas: Number(tot.abertas), atrasadas: Number(tot.atrasadas), semPrazo: Number(tot.sem_prazo), comHoras: Number(tot.com_horas), horasEstimadasMin: Number(tot.horas_est), semanas: semanas.map((s) => Number(tot[`s${s.indice}`] ?? 0)) };

  // 3. Entregas próximas (etapas de entrega) — atrasadas + próximas 6 semanas
  const entregasLista = ETAPAS_ENTREGA.map((e) => `'${esc(e)}'`).join(",");
  const fimJanela = semanas[SEMANAS - 1].fim;
  const entregas: Entrega[] = (await contagem(`select t.chave, t.nome, t.etapa_csv etapa, t.data_fim, (t.data_fim::date - date '${hoje}') dias, t.projeto_codigo, p.nome projeto_nome, c.nome cliente, t.responsavel_nome responsavel
    from tarefa t join projeto p on p.codigo=t.projeto_codigo left join cliente_vobi c on c.codigo=p.cliente_codigo
    where t.ultima_carga=${cid} and ${ABERTA} and t.sem_fim=false and t.etapa_canonica in (${entregasLista}) and t.data_fim::date <= date '${fimJanela}'
    order by t.data_fim, p.nome limit 200`)).map((r) => ({
      chave: String(r.chave), nome: String(r.nome), etapa: String(r.etapa), dataFim: String(r.data_fim), dias: Number(r.dias), projetoCodigo: Number(r.projeto_codigo), projetoNome: String(r.projeto_nome),
      cliente: (r.cliente as string | null) ?? null, responsavel: (r.responsavel as string | null) ?? null, atrasada: Number(r.dias) < 0 }));

  // 4. Fluxo por etapa — onde o trabalho está parado/concentrado
  const etapas: Etapa[] = (await contagem(`select coalesce(nullif(t.etapa_csv,''),'(sem etapa)') etapa, count(*)::int abertas, count(*) filter (where ${ATRASADA(sp)})::int atrasadas,
      count(*) filter (where t.sem_responsavel=true)::int sem_resp, count(*) filter (where ${sp}='sem_prazo')::int sem_prazo, count(*) filter (where ${sp} in ('vence_hoje','vence_7'))::int d7,
      count(distinct t.projeto_codigo)::int projetos, count(distinct t.responsavel_nome) filter (where t.sem_responsavel=false)::int pessoas,
      percentile_cont(0.5) within group (order by (date '${hoje}' - t.data_fim::date)) filter (where ${ATRASADA(sp)}) mediana_atraso
    from tarefa t where t.ultima_carga=${cid} and ${ABERTA} group by 1 order by 2 desc`)).map((r) => ({
      etapa: String(r.etapa ?? "(sem etapa)"), abertas: Number(r.abertas), atrasadas: Number(r.atrasadas), semResponsavel: Number(r.sem_resp), semPrazo: Number(r.sem_prazo), d7: Number(r.d7),
      projetos: Number(r.projetos), pessoas: Number(r.pessoas), medianaAtrasoDias: r.mediana_atraso == null ? null : Math.round(Number(r.mediana_atraso)) }));

  // 5. Projetos ativos sem ninguém respondendo por tarefa aberta (fluxo parado) — só fato importado
  const projetosSemResponsavel = (await contagem(`select p.codigo, p.nome, c.nome cliente, count(t.chave)::int abertas
    from projeto p left join cliente_vobi c on c.codigo=p.cliente_codigo join tarefa t on t.projeto_codigo=p.codigo and t.ultima_carga=${cid} and ${ABERTA}
    where p.ultima_carga=${cid} and p.status_classe<>'encerrado' and p.nao_encontrado_desde is null
    group by 1,2,3 having count(t.chave) filter (where t.sem_responsavel=false)=0 order by abertas desc limit 30`)).map((r) => ({ codigo: Number(r.codigo), nome: String(r.nome), cliente: (r.cliente as string | null) ?? null, abertas: Number(r.abertas) }));

  const [mapa] = await contagem(`select count(*)::int total, count(*) filter (where email_rucelle is null)::int sem_email from pessoa_vobi`);
  const limitacoes = {
    coberturaHoras: totais.abertas ? Math.round((totais.comHoras / totais.abertas) * 100) : 0,
    semPrazo: totais.semPrazo, semResponsavel: semResponsavel.abertas,
    pessoasVobi: Number(mapa.total), pessoasSemEmail: Number(mapa.sem_email),
    pessoasNaoMapeadas: pessoas.filter((p) => !p.mapeada).length,
  };
  return { ctx, semanas, pessoas, semResponsavel, totais, entregas, etapas, projetosSemResponsavel, limitacoes };
}
