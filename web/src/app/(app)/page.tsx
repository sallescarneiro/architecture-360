import Link from "next/link";
import { exigirUsuario, veIndicadoresIndividuais } from "@/lib/auth";
import { contagem, selo, ultimaCargaAceita } from "@/lib/consultas";
import { minutosParaHoras } from "@/lib/importador/normalizacao";
import { Selo } from "@/components/Selo";

/**
 * Operação — somente indicadores suportados pelos dados (seção 3.1 da especificação v2.0).
 * Não há ranking, nota, eficiência individual nem planejado × realizado (estimativas inexistentes).
 */
export default async function OperacaoPage() {
  const u = await exigirUsuario();
  const carga = await ultimaCargaAceita();
  if (!carga) return <div><h1 className="text-2xl font-bold">Operação</h1><p className="text-sm text-[var(--muted)]">Nenhuma carga aceita ainda. <Link className="underline" href="/importacao">Importar do Vobi</Link>.</p></div>;
  const cid = carga.id;
  const hoje = carga.dataCarga; // atualidade = data da exportação
  const abertas = `status not in ('concluido','cancelado') and orfa=false`;

  const [tot] = await contagem(`select count(*)::int total, sum(case when classe_qualidade='completa' then 1 else 0 end)::int completas,
     sum(case when sem_fim=false and orfa=false then 1 else 0 end)::int com_fim,
     sum(case when sem_responsavel=false and orfa=false then 1 else 0 end)::int com_resp from tarefa where ultima_carga=${cid}`);
  const total = Number(tot.total), comFim = Number(tot.com_fim), comResp = Number(tot.com_resp);
  const projStatus = await contagem(`select status k, status_classe c, count(*)::int n from projeto where ultima_carga=${cid} group by 1,2 order by 2,3 desc`);
  const ativos = projStatus.filter((r) => r.c !== "encerrado");
  const tarStatus = await contagem(`select status k, count(*)::int n from tarefa where ultima_carga=${cid} and orfa=false group by 1 order by 2 desc`);
  const [prazos] = await contagem(`select
     sum(case when data_fim < '${hoje}' then 1 else 0 end)::int vencidas,
     sum(case when data_fim::date >= date '${hoje}' and data_fim::date < date '${hoje}' + 7 then 1 else 0 end)::int d7,
     sum(case when data_fim::date >= date '${hoje}' and data_fim::date < date '${hoje}' + 30 then 1 else 0 end)::int d30
     from tarefa where ultima_carga=${cid} and ${abertas} and sem_fim=false`);
  const porEtapa = await contagem(`select etapa_canonica k, count(*)::int abertas, sum(case when data_fim < '${hoje}' and sem_fim=false then 1 else 0 end)::int vencidas from tarefa where ultima_carga=${cid} and ${abertas} group by 1 order by 2 desc`);
  const porPessoa = veIndicadoresIndividuais(u.perfil)
    ? await contagem(`select responsavel_nome k, count(*)::int abertas, sum(case when data_fim < '${hoje}' and sem_fim=false then 1 else 0 end)::int vencidas,
        sum(case when data_fim::date >= date '${hoje}' and data_fim::date < date '${hoje}' + 7 then 1 else 0 end)::int d7
        from tarefa where ultima_carga=${cid} and ${abertas} and sem_responsavel=false group by 1 order by 2 desc`)
    : await contagem(`select responsavel_nome k, count(*)::int abertas, sum(case when data_fim < '${hoje}' and sem_fim=false then 1 else 0 end)::int vencidas,
        sum(case when data_fim::date >= date '${hoje}' and data_fim::date < date '${hoje}' + 7 then 1 else 0 end)::int d7
        from tarefa where ultima_carga=${cid} and ${abertas} and responsavel_email='${u.email.replace(/'/g, "''")}' group by 1`);
  const horasProj = await contagem(`select p.nome k, p.codigo, sum(t.horas_realizadas_min)::int min, sum(case when t.etapa_canonica='Refação' then t.horas_realizadas_min else 0 end)::int refacao
     from tarefa t join projeto p on p.codigo=t.projeto_codigo where t.ultima_carga=${cid} and t.horas_realizadas_min>0 group by 1,2 order by 3 desc limit 15`);
  const [horasTot] = await contagem(`select sum(horas_realizadas_min)::int min, sum(case when etapa_canonica='Refação' then horas_realizadas_min else 0 end)::int refacao,
     count(*) filter (where horas_realizadas_min>0)::int com_horas from tarefa where ultima_carga=${cid}`);
  const revisoes = await contagem(`select p.nome k, p.codigo, count(*)::int n from tarefa t join projeto p on p.codigo=t.projeto_codigo
     where t.ultima_carga=${cid} and (t.revisao>=1 or t.etapa_canonica='Refação') group by 1,2 order by 3 desc limit 15`);
  const minTot = Number(horasTot.min ?? 0), minRef = Number(horasTot.refacao ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Operação</h1>
        <p className="text-sm text-[var(--muted)]">Dados do Vobi, carga {cid} de {carga.dataCarga}. Indicadores só onde há dado; cada bloco informa a base usada.</p>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="card"><div className="text-xs text-[var(--muted)]">Projetos ativos</div><div className="text-3xl font-bold">{ativos.reduce((a, r) => a + Number(r.n), 0)}</div></div>
        <div className="card"><div className="text-xs text-[var(--muted)]">Tarefas vencidas</div><div className="text-3xl font-bold">{String(prazos.vencidas ?? 0)}</div><Selo s={selo(comFim, total, carga)} rotulo="tarefas com prazo" /></div>
        <div className="card"><div className="text-xs text-[var(--muted)]">A vencer em 7 / 30 dias</div><div className="text-3xl font-bold">{String(prazos.d7 ?? 0)} / {String(prazos.d30 ?? 0)}</div><Selo s={selo(comFim, total, carga)} rotulo="tarefas com prazo" /></div>
        <div className="card"><div className="text-xs text-[var(--muted)]">Tarefas completas</div><div className="text-3xl font-bold">{Number(tot.completas)}</div><div className="selo">de {total} · <Link className="underline" href="/qualidade">ver qualidade</Link></div></div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card"><div className="font-semibold mb-2">Projetos ativos por etapa do fluxo</div>
          <table className="w-full text-sm"><tbody>{ativos.map((r) => <tr key={String(r.k)}><td>{String(r.k)}</td><td className="text-right">{String(r.n)}</td></tr>)}</tbody></table>
          <div className="selo mt-2">Encerrados (finalizados/cancelados): {projStatus.filter((r) => r.c === "encerrado").reduce((a, r) => a + Number(r.n), 0)}</div></div>
        <div className="card"><div className="font-semibold mb-2">Tarefas por status</div>
          <table className="w-full text-sm"><tbody>{tarStatus.map((r) => <tr key={String(r.k)}><td>{String(r.k)}</td><td className="text-right">{String(r.n)}</td></tr>)}</tbody></table></div>
      </div>

      <div className="card"><div className="font-semibold mb-2">Tarefas abertas por etapa</div>
        <table className="w-full text-sm"><thead><tr><th>Etapa</th><th>Abertas</th><th>Vencidas</th></tr></thead><tbody>
          {porEtapa.map((r) => <tr key={String(r.k)}><td>{String(r.k)}</td><td>{String(r.abertas)}</td><td>{String(r.vencidas)}</td></tr>)}</tbody></table>
        <Selo s={selo(comFim, total, carga)} rotulo="tarefas com prazo (coluna Vencidas)" /></div>

      <div className="card"><div className="font-semibold mb-2">{veIndicadoresIndividuais(u.perfil) ? "Tarefas abertas por responsável" : "Minhas tarefas abertas"}</div>
        <p className="text-xs text-[var(--muted)] mb-2">Contagem de tarefas, não medida de desempenho: volume sem complexidade, carga e impedimentos não compara pessoas.</p>
        <table className="w-full text-sm"><thead><tr><th>Responsável</th><th>Abertas</th><th>Vencidas</th><th>Vencem em 7 dias</th></tr></thead><tbody>
          {porPessoa.map((r) => <tr key={String(r.k)}><td>{String(r.k)}</td><td>{String(r.abertas)}</td><td>{String(r.vencidas)}</td><td>{String(r.d7)}</td></tr>)}
          {!porPessoa.length && <tr><td colSpan={4} className="text-[var(--muted)]">nenhuma</td></tr>}</tbody></table>
        <Selo s={selo(comResp, total, carga)} rotulo="tarefas com responsável" /></div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card"><div className="font-semibold mb-2">Horas realizadas acumuladas por projeto</div>
          <p className="text-xs text-[var(--muted)] mb-2">Total {minutosParaHoras(minTot)} h, das quais {minutosParaHoras(minRef)} h em Refação ({minTot ? Math.round((minRef / minTot) * 100) : 0}%). Somente projetos ativos; horas agregadas por tarefa, sem data de lançamento.</p>
          <table className="w-full text-sm"><thead><tr><th>Projeto</th><th>Horas</th><th>Em Refação</th></tr></thead><tbody>
            {horasProj.map((r) => <tr key={String(r.codigo)}><td>{String(r.k)}</td><td>{minutosParaHoras(Number(r.min))}</td><td>{minutosParaHoras(Number(r.refacao))}</td></tr>)}</tbody></table>
          <Selo s={selo(Number(horasTot.com_horas ?? 0), total, carga)} rotulo="tarefas com horas lançadas" /></div>
        <div className="card"><div className="font-semibold mb-2">Tarefas de revisão por projeto (R01+ ou etapa Refação)</div>
          <p className="text-xs text-[var(--muted)] mb-2">Sinal de retrabalho, não causa: o motivo (cliente, interno, fornecedor) não existe no Vobi.</p>
          <table className="w-full text-sm"><thead><tr><th>Projeto</th><th>Tarefas</th></tr></thead><tbody>
            {revisoes.map((r) => <tr key={String(r.codigo)}><td>{String(r.k)}</td><td>{String(r.n)}</td></tr>)}</tbody></table></div>
      </div>

      <div className="card text-sm text-[var(--muted)]">
        <b>Não disponível com os dados atuais:</b> previsto × realizado em horas (estimativas quase inexistentes), horas por semana por pessoa (exige o CSV de Gestão de Horas), capacidade utilizada, tempo parado por etapa (exige várias cargas), produtividade ou eficiência individual (sem base; não será criado).
      </div>
    </div>
  );
}
