import Link from "next/link";
import { exigirUsuario, veIndicadoresIndividuais } from "@/lib/auth";
import { selo } from "@/lib/consultas";
import { minutosParaHoras } from "@/lib/importador/normalizacao";
import { panoramaOperacao } from "@/lib/servicos/operacao";
import { Selo } from "@/components/Selo";
import { Badge, Card, Empty, LinkButton, PageHeader, Stat } from "@/components/ui";

/**
 * Operação — camada visual apenas: todos os números vêm de `panoramaOperacao` (src/lib/servicos).
 * Não há ranking, nota, eficiência individual nem planejado × realizado (estimativas inexistentes).
 */
export default async function OperacaoPage() {
  const u = await exigirUsuario();
  const gestao = veIndicadoresIndividuais(u.perfil);
  const p = await panoramaOperacao({ incluirPessoas: gestao, emailRestrito: gestao ? undefined : u.email });
  if (!p) return (
    <>
      <PageHeader eyebrow="Architecture 360" title="Operação" subtitle="Leitura gerencial dos dados exportados do Vobi." />
      <Empty action={<LinkButton href="/importacao" variant="primary">Importar do Vobi</LinkButton>}>Nenhuma carga aceita ainda.</Empty>
    </>
  );
  const carga = p.carga;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const Lista = ({ itens }: { itens: { rotulo: string; valor: number }[] }) => (
    <table className="tbl"><tbody>{itens.map((r) => <tr key={r.rotulo}><td>{r.rotulo}</td><td className="text-right font-semibold">{r.valor}</td></tr>)}{!itens.length && <tr><td className="text-[var(--muted)]">nenhum</td></tr>}</tbody></table>
  );

  return (
    <>
      <PageHeader eyebrow="Architecture 360" title="Operação"
        subtitle={<>Dados do Vobi, carga {carga.id} de {carga.dataCarga}. Indicadores só onde há dado; cada bloco informa a base usada. <Badge tone="neutral">Vobi · somente leitura</Badge></>} />

      {gestao && (
        <Card className="mb-5" title={<>Recomendações para a gestão <Badge tone="info">calculadas · não são conclusões</Badge></>}
          subtitle="Sinais derivados dos dados importados, para análise da gestão e coordenação. Não viram tarefas nem cobranças; quantidade não é produtividade, atraso não é desempenho e refação não é culpa.">
          {p.recomendacoes.length ? (
            <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Tema</th><th>Sinal (indicador calculado)</th><th>Leitura sugerida</th><th>Cuidado</th></tr></thead><tbody>
              {p.recomendacoes.map((r, i) => <tr key={i}><td className="whitespace-nowrap font-semibold">{r.tema}</td><td>{r.sinal}</td><td className="text-[var(--txt-2)]">{r.leitura}</td><td className="text-[0.78rem] text-[var(--muted)]">{r.cuidado}</td></tr>)}
            </tbody></table></div>
          ) : <Empty>Nenhum sinal acima dos limiares nesta carga.</Empty>}
        </Card>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Projetos ativos" value={p.projetosAtivos.reduce((a, r) => a + r.valor, 0)} note={`${p.encerrados} encerrados (finalizados/cancelados)`} />
        <Stat label="Tarefas abertas vencidas" value={p.prazos.vencidas} source="calc" tone={p.prazos.vencidas ? "warn" : "ok"} note={<Selo s={selo(p.comFim, p.total, carga)} rotulo="tarefas com prazo" />} />
        <Stat label="A vencer em 7 / 30 dias" value={`${p.prazos.d7} / ${p.prazos.d30}`} source="calc" note={<Selo s={selo(p.comFim, p.total, carga)} rotulo="tarefas com prazo" />} />
        <Stat label="Tarefas com dados completos" value={p.completas} source="calc" pill={`${pct(p.completas, p.total)}%`} tone="neutral" note={<>de {p.total} · <Link className="underline" href="/qualidade">ver qualidade</Link></>} href="/qualidade" />
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <Card title="Projetos ativos por etapa do fluxo"><Lista itens={p.projetosAtivos} /></Card>
        <Card title="Tarefas por status"><Lista itens={p.tarefasStatus} /></Card>
      </div>

      <Card className="mb-5" title="Tarefas abertas por etapa">
        <table className="tbl"><thead><tr><th>Etapa</th><th>Abertas</th><th>Vencidas</th></tr></thead><tbody>
          {p.porEtapa.map((r) => <tr key={r.rotulo}><td>{r.rotulo}</td><td>{r.abertas}</td><td>{r.vencidas}</td></tr>)}</tbody></table>
        <Selo s={selo(p.comFim, p.total, carga)} rotulo="tarefas com prazo (coluna Vencidas)" />
      </Card>

      <Card className="mb-5" title={gestao ? "Tarefas abertas por responsável" : "Minhas tarefas abertas"}
        subtitle="Contagem de tarefas (fato importado), não medida de desempenho: volume sem complexidade, carga e dependências não compara pessoas. Uso: contextualizar carga e distribuição.">
        <table className="tbl"><thead><tr><th>Responsável</th><th>Abertas</th><th>Vencidas</th><th>Vencem em 7 dias</th></tr></thead><tbody>
          {p.porPessoa.map((r) => <tr key={r.rotulo}><td>{r.rotulo}</td><td>{r.abertas}</td><td>{r.vencidas}</td><td>{r.d7}</td></tr>)}
          {!p.porPessoa.length && <tr><td colSpan={4} className="text-[var(--muted)]">nenhuma</td></tr>}</tbody></table>
        <Selo s={selo(p.comResp, p.total, carga)} rotulo="tarefas com responsável" />
      </Card>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <Card title="Horas realizadas acumuladas por projeto"
          subtitle={`Total ${minutosParaHoras(p.horas.totalMin)} h, das quais ${minutosParaHoras(p.horas.refacaoMin)} h em Refação (${pct(p.horas.refacaoMin, p.horas.totalMin)}%). Horas agregadas por tarefa, sem data de lançamento.`}>
          <table className="tbl"><thead><tr><th>Projeto</th><th>Horas</th><th>Em Refação</th></tr></thead><tbody>
            {p.horas.porProjeto.map((r) => <tr key={r.codigo}><td>{r.rotulo}</td><td>{minutosParaHoras(r.min)}</td><td>{minutosParaHoras(r.refacaoMin)}</td></tr>)}</tbody></table>
          <Selo s={selo(p.horas.comHoras, p.total, carga)} rotulo="tarefas com horas lançadas" />
        </Card>
        <Card title="Tarefas de revisão por projeto (R01+ ou etapa Refação)" subtitle="Sinal de retrabalho, não causa: o motivo (cliente, interno, fornecedor) não existe no Vobi.">
          <table className="tbl"><thead><tr><th>Projeto</th><th>Tarefas</th></tr></thead><tbody>
            {p.revisoes.map((r) => <tr key={r.codigo}><td>{r.rotulo}</td><td>{r.valor}</td></tr>)}</tbody></table>
        </Card>
      </div>

      <Card title="Não disponível com os dados atuais">
        <ul className="list-disc space-y-1 pl-5 text-[0.85rem] text-[var(--txt-2)]">{p.limitacoes.map((l) => <li key={l.chave}>{l.descricao}</li>)}</ul>
      </Card>
    </>
  );
}
