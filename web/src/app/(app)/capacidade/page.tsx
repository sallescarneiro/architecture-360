import Link from "next/link";
import { exigirUsuario } from "@/lib/auth";
import { urlCom } from "@/lib/listas";
import { CADENCIA_AVISO_DIAS } from "@/lib/servicos/meu-dia";
import { capacidade, SEMANAS, type Capacidade, type Pessoa } from "@/lib/servicos/capacidade";
import { Ajuda, Badge, Card, Empty, LinkButton, PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Capacidade e fluxo — Architecture 360" };

/**
 * Fase 5 — Capacidade e fluxo (T-189). Ferramenta da coordenação: distribuição por pessoa, carga planejada por semana,
 * entregas próximas e fluxo por etapa, só com dados importados do Vobi (+ reuniões do A360). Camada visual: números em
 * src/lib/servicos/capacidade.ts. Sem ranking: pessoas em ordem alfabética; carga é informação operacional, não desempenho.
 */
export default async function CapacidadePage() {
  await exigirUsuario(["admin", "gestao", "coordenacao"]);
  const d = await capacidade();
  if (!d) return (<><PageHeader eyebrow="Architecture 360 · Coordenação" title="Capacidade e fluxo" subtitle="Ainda não há carga de operação aceita." /><Empty action={<LinkButton href="/importacao" variant="primary">Importar do Vobi</LinkButton>}>Nenhuma carga de Projetos+Tarefas aceita ainda.</Empty></>);
  return <Tela d={d} />;
}

const fmt = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const horas = (min: number | null) => (min == null ? "—" : `${Math.round(min / 60)} h`);
const tarefasHref = (m: Record<string, string | number | boolean | null | undefined>) => urlCom("/tarefas", {}, { volta: "/capacidade", ...m });

function Tela({ d }: { d: Capacidade }) {
  const { ctx, semanas, pessoas, semResponsavel, totais, entregas, etapas, projetosSemResponsavel, limitacoes } = d;
  const max = Math.max(1, ...pessoas.flatMap((p) => p.semanas), ...semResponsavel.semanas);
  const tom = (n: number) => (n === 0 ? "" : n >= max * 0.75 ? "bg-[#f3d9d2]" : n >= max * 0.4 ? "bg-[#f8e8e3]" : "bg-[var(--surface-2)]");
  const entregasAtrasadas = entregas.filter((e) => e.atrasada);
  const porSemana = semanas.map((s) => entregas.filter((e) => !e.atrasada && e.dataFim >= s.inicio && e.dataFim <= s.fim));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Architecture 360 · Coordenação" title="Capacidade e fluxo"
        subtitle={<>Distribuição do trabalho, carga planejada por semana, entregas e fluxo por etapa · dados do Vobi de <b>{fmt(ctx.carga.dataCarga)}</b> (carga {ctx.carga.id}) · hoje {fmt(ctx.hoje)} <Ajuda texto="Fonte: exportação do Vobi (somente leitura). Carga planejada = tarefas abertas com prazo na semana. Horas estimadas só quando o Vobi as traz. Nada aqui é nota, ranking ou avaliação: é a distribuição do trabalho como está registrada no Vobi, para a coordenação decidir redistribuições." /></>}
        actions={<div className="flex gap-2"><LinkButton href="/painel">Painel de Gestão</LinkButton><LinkButton href="/pessoas">Pessoas</LinkButton></div>} />
      {ctx.desatualizado && <div className="leitura"><b>Dados</b>Exportação do Vobi com <b>{ctx.idadeDias} dias</b> (cadência: 2× por semana, aviso acima de {CADENCIA_AVISO_DIAS}). <Link className="underline" href="/importacao">Importar nova exportação</Link>.</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Tarefas abertas" value={totais.abertas} href={tarefasHref({})} />
        <Stat label="Atrasadas" value={totais.atrasadas} tone={totais.atrasadas ? "bad" : "ok"} source="calc" href={tarefasHref({ prazo: "atrasadas" })} />
        <Stat label="Pessoas com tarefa aberta" value={pessoas.length} note={limitacoes.pessoasNaoMapeadas ? `${limitacoes.pessoasNaoMapeadas} sem e-mail mapeado` : "todas com e-mail mapeado"} tone={limitacoes.pessoasNaoMapeadas ? "warn" : undefined} href="/pessoas" />
        <Stat label="Sem responsável no Vobi" value={semResponsavel.abertas} tone={semResponsavel.abertas ? "warn" : "ok"} note="fora da distribuição" href={tarefasHref({ resp: "__sem__" })} />
        <Stat label="Cobertura de horas estimadas" value={`${limitacoes.coberturaHoras}%`} note={`${totais.comHoras} de ${totais.abertas} tarefas`} tone={limitacoes.coberturaHoras < 50 ? "warn" : "neutral"} source="calc" />
      </div>

      <Card title="Carga planejada por pessoa e semana" subtitle={<>Tarefas abertas com prazo em cada semana (próximas {SEMANAS}); atrasadas à parte. Ordem alfabética. Clique num número para abrir a lista. <Badge tone="neutral">informação operacional, não desempenho</Badge></>}>
        <div className="overflow-x-auto"><table className="tbl"><thead><tr>
          <th>Pessoa</th><th className="text-right">Projetos</th><th className="text-right">Abertas</th><th className="text-right">Atrasadas</th>
          {semanas.map((s) => <th key={s.indice} className="text-center" title={`${fmt(s.inicio)} a ${fmt(s.fim)}`}>{s.indice === 0 ? "esta semana" : s.rotulo}</th>)}
          <th className="text-right">Sem prazo</th><th className="text-right">Horas est.</th><th className="text-right">Reuniões 7d</th>
        </tr></thead><tbody>
          {pessoas.map((p: Pessoa) => (
            <tr key={p.nome}>
              <td className="font-semibold whitespace-nowrap">{p.nome}{!p.mapeada && <Badge tone="warn">sem e-mail</Badge>}</td>
              <td className="text-right">{p.projetos}</td>
              <td className="text-right"><Link className="underline" href={tarefasHref({ resp: p.nome })}>{p.abertas}</Link></td>
              <td className={`text-right ${p.atrasadas ? "font-semibold text-[var(--vinho)]" : "text-[var(--muted)]"}`}>{p.atrasadas ? <Link className="underline" href={tarefasHref({ resp: p.nome, prazo: "atrasadas" })}>{p.atrasadas}</Link> : 0}</td>
              {p.semanas.map((n, i) => <td key={i} className={`text-center ${tom(n)}`}>{n ? <Link className="underline" href={tarefasHref({ resp: p.nome, prazo: "abertas", de: i * 7, janela: i * 7 + 6 })}>{n}</Link> : <span className="text-[var(--muted)]">·</span>}</td>)}
              <td className="text-right text-[var(--muted)]">{p.semPrazo ? <Link className="underline" href={tarefasHref({ resp: p.nome, prazo: "sem_prazo" })}>{p.semPrazo}</Link> : 0}</td>
              <td className="text-right text-[var(--muted)]" title={p.horasEstimadasMin == null ? "O Vobi não trouxe horas estimadas para as tarefas desta pessoa" : `${p.tarefasComHoras} de ${p.abertas} tarefas com horas estimadas`}>{horas(p.horasEstimadasMin)}</td>
              <td className="text-right text-[var(--muted)]">{p.mapeada ? p.reunioes7 : <span title="Sem e-mail mapeado: reuniões não associáveis">—</span>}</td>
            </tr>
          ))}
          <tr className="opacity-80">
            <td className="whitespace-nowrap italic">Sem responsável no Vobi</td><td className="text-right">—</td>
            <td className="text-right"><Link className="underline" href={tarefasHref({ resp: "__sem__" })}>{semResponsavel.abertas}</Link></td>
            <td className="text-right">{semResponsavel.atrasadas}</td>
            {semResponsavel.semanas.map((n, i) => <td key={i} className={`text-center ${tom(n)}`}>{n || <span className="text-[var(--muted)]">·</span>}</td>)}
            <td className="text-right">—</td><td className="text-right">—</td><td className="text-right">—</td>
          </tr>
          <tr className="font-semibold">
            <td>Total da equipe</td><td className="text-right">—</td><td className="text-right">{totais.abertas}</td><td className="text-right">{totais.atrasadas}</td>
            {totais.semanas.map((n, i) => <td key={i} className="text-center">{n}</td>)}
            <td className="text-right">{totais.semPrazo}</td><td className="text-right">{horas(totais.horasEstimadasMin || null)}</td><td className="text-right">—</td>
          </tr>
        </tbody></table></div>
        {!pessoas.length && <Empty>Nenhuma tarefa aberta com responsável na última carga.</Empty>}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Fluxo por etapa" subtitle="Onde o trabalho está concentrado ou parado. Mediana de atraso = dias desde o prazo, só entre as atrasadas.">
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Etapa</th><th className="text-right">Abertas</th><th className="text-right">Atrasadas</th><th className="text-right">Mediana atraso</th><th className="text-right">7 dias</th><th className="text-right">Sem resp.</th><th className="text-right">Sem prazo</th><th className="text-right">Projetos</th><th className="text-right">Pessoas</th></tr></thead><tbody>
            {etapas.map((e) => (
              <tr key={e.etapa}>
                <td className="font-semibold"><Link className="underline" href={tarefasHref({ etapa: e.etapa })}>{e.etapa}</Link></td>
                <td className="text-right">{e.abertas}</td>
                <td className={`text-right ${e.atrasadas ? "font-semibold text-[var(--vinho)]" : "text-[var(--muted)]"}`}>{e.atrasadas ? <Link className="underline" href={tarefasHref({ etapa: e.etapa, prazo: "atrasadas" })}>{e.atrasadas}</Link> : 0}</td>
                <td className="text-right text-[var(--muted)]">{e.medianaAtrasoDias == null ? "—" : `${e.medianaAtrasoDias} d`}</td>
                <td className="text-right">{e.d7}</td>
                <td className={`text-right ${e.semResponsavel ? "text-[var(--terracota)]" : "text-[var(--muted)]"}`}>{e.semResponsavel ? <Link className="underline" href={tarefasHref({ etapa: e.etapa, resp: "__sem__" })}>{e.semResponsavel}</Link> : 0}</td>
                <td className="text-right text-[var(--muted)]">{e.semPrazo}</td>
                <td className="text-right">{e.projetos}</td><td className="text-right">{e.pessoas}</td>
              </tr>
            ))}
          </tbody></table></div>
        </Card>

        <Card title="Projetos ativos sem ninguém respondendo" subtitle="Projetos com tarefas abertas e nenhum responsável definido no Vobi — fluxo parado ou distribuição pendente. Fato importado; a decisão é da coordenação.">
          {projetosSemResponsavel.length ? (
            <ul className="divide-y divide-[var(--line)]">{projetosSemResponsavel.map((p) => (
              <li key={p.codigo} className="flex items-baseline justify-between gap-3 py-1.5 text-[0.88rem]"><span><Link className="font-semibold underline" href={`/projetos/${p.codigo}`}>{p.nome}</Link>{p.cliente && <span className="text-[var(--muted)]"> · {p.cliente}</span>}</span><Link className="whitespace-nowrap text-[var(--muted)] underline" href={tarefasHref({ projeto: p.codigo })}>{p.abertas} aberta(s)</Link></li>
            ))}</ul>
          ) : <Empty>Todos os projetos ativos com tarefa aberta têm ao menos um responsável no Vobi.</Empty>}
        </Card>
      </div>

      <Card title="Entregas próximas" subtitle={<>Tarefas das etapas de entrega com prazo nas próximas {SEMANAS} semanas (e as já atrasadas). O responsável é o do Vobi.</>}>
        {entregasAtrasadas.length > 0 && <BlocoEntregas titulo={`Atrasadas (${entregasAtrasadas.length})`} itens={entregasAtrasadas} tom="bad" />}
        {semanas.map((s, i) => porSemana[i].length ? <BlocoEntregas key={s.indice} titulo={`${i === 0 ? "Esta semana" : `Semana ${s.rotulo}`} (${porSemana[i].length})`} itens={porSemana[i]} /> : null)}
        {!entregas.length && <Empty>Nenhuma entrega com prazo no horizonte.</Empty>}
      </Card>

      <Card title="Limitações desta leitura" subtitle="O que falta na fonte para a capacidade ser medida com mais precisão. Ausência de dado não é conformidade.">
        <ul className="list-disc space-y-1 pl-5 text-[0.85rem] text-[var(--txt-2)]">
          <li>Horas estimadas presentes em <b>{limitacoes.coberturaHoras}%</b> das tarefas abertas ({totais.comHoras} de {totais.abertas}); por isso a carga é medida em quantidade de tarefas, não em horas.</li>
          <li><b>{limitacoes.semPrazo}</b> tarefas abertas sem prazo no Vobi ficam fora das semanas; <b>{limitacoes.semResponsavel}</b> sem responsável ficam fora da distribuição por pessoa.</li>
          <li>{limitacoes.pessoasSemEmail ? <><b>{limitacoes.pessoasSemEmail}</b> de {limitacoes.pessoasVobi} nomes do Vobi sem e-mail @rucelle mapeado (<Link className="underline" href="/pessoas">mapear em Pessoas</Link>) — para esses, reuniões não são associadas.</> : <>Todos os {limitacoes.pessoasVobi} nomes do Vobi têm e-mail mapeado.</>}</li>
          <li>Capacidade disponível (horas contratadas, ausências, férias) não existe em nenhuma fonte integrada; o A360 mostra a carga planejada, não a ocupação.</li>
          <li>A granularidade é a da exportação ({fmt(ctx.carga.dataCarga)}): mudanças feitas no Vobi depois disso só aparecem na próxima carga.</li>
        </ul>
      </Card>
    </div>
  );
}

function BlocoEntregas({ titulo, itens, tom }: { titulo: string; itens: Capacidade["entregas"]; tom?: "bad" }) {
  const LIM = 40; const mostrar = itens.slice(0, LIM);
  return (
    <div className="mb-4 last:mb-0">
      <h3 className={`mb-1.5 text-[0.78rem] font-semibold uppercase tracking-wide ${tom === "bad" ? "text-[var(--vinho)]" : "text-[var(--muted)]"}`}>{titulo}</h3>
      <div className="overflow-x-auto"><table className="tbl"><tbody>
        {mostrar.map((e) => (
          <tr key={e.chave}>
            <td className="whitespace-nowrap">{fmt(e.dataFim)}<span className="ml-1 text-xs text-[var(--muted)]">({e.dias < 0 ? `${-e.dias} d atrás` : e.dias === 0 ? "hoje" : `em ${e.dias} d`})</span></td>
            <td><Link className="font-semibold underline" href={`/projetos/${e.projetoCodigo}`}>{e.projetoNome}</Link>{e.cliente && <span className="text-[var(--muted)]"> · {e.cliente}</span>}</td>
            <td>{e.nome} <span className="text-xs text-[var(--muted)]">· {e.etapa}</span></td>
            <td className="whitespace-nowrap text-[var(--txt-2)]">{e.responsavel ?? <Badge tone="warn">sem responsável</Badge>}</td>
          </tr>
        ))}
      </tbody></table></div>
      {itens.length > LIM && <p className="mt-1 text-[0.78rem] text-[var(--muted)]">Mostrando {LIM} de {itens.length}. <Link className="underline" href={tarefasHref(tom === "bad" ? { prazo: "atrasadas", entregas: 1 } : { prazo: "abertas", entregas: 1, janela: SEMANAS * 7 })}>Ver todas em Tarefas</Link>.</p>}
    </div>
  );
}
