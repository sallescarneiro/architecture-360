import Link from "next/link";
import type { ReactNode } from "react";
import { exigirUsuario, type Perfil } from "@/lib/auth";
import { linkVobiProjeto } from "@/lib/consultas";
import { STATUS_PRAZO, rotuloCurto } from "@/lib/prazo";
import { urlCom } from "@/lib/listas";
import { CADENCIA_AVISO_DIAS, ETAPAS_ENTREGA, PERIODOS, RISCO_REFACAO_FRACAO, type ContextoCarga, type Periodo, type ProjetoResumo, type TarefaResumo } from "@/lib/servicos/meu-dia";
import { painelExecutivo, painelOperacional, type PainelCoordenacao, type PainelGerencia, type Semana } from "@/lib/servicos/painel";
import { Ajuda, Empty, LinkButton, PageHeader, Stat } from "@/components/ui";

/**
 * Painel de Gestão (T-199, v2 aprovada em 08/11/2026). Camada visual apenas: números vêm de src/lib/servicos/painel.ts.
 * Visão executiva (gestão/admin) e operacional (coordenação) decididas no servidor; arquiteta não acessa (exigirUsuario).
 * Nada aqui é ranking, nota ou avaliação: carga por responsável é informação operacional importada do Vobi.
 */
export default async function PainelPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const u = await exigirUsuario(["admin", "gestao", "coordenacao"]);
  const sp = await searchParams;
  const periodo = (PERIODOS as readonly number[]).includes(Number(sp.periodo)) ? (Number(sp.periodo) as Periodo) : 14;
  if (u.perfil === "coordenacao") {
    const d = await painelOperacional(periodo);
    return d ? <Painel d={d} periodo={periodo} perfil={u.perfil} /> : <SemCarga />;
  }
  const d = await painelExecutivo(periodo);
  return d ? <Painel d={d} periodo={periodo} perfil={u.perfil} /> : <SemCarga />;
}

const fmt = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const fmtCurto = (iso: string) => { const [, m, d] = iso.split("-"); return `${Number(d)}/${Number(m)}`; };
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function SemCarga() {
  return (
    <>
      <PageHeader eyebrow="Architecture 360 · Painel de Gestão" title="Painel de Gestão" subtitle="Ainda não há carga de operação aceita." />
      <Empty action={<LinkButton href="/importacao" variant="primary">Importar do Vobi</LinkButton>}>Nenhuma carga de Projetos+Tarefas aceita ainda.</Empty>
    </>
  );
}

function Cabecalho({ titulo, ctx, periodo, executiva }: { titulo: string; ctx: ContextoCarga; periodo: Periodo; executiva: boolean }) {
  return (
    <>
      <PageHeader eyebrow="Architecture 360 · Painel de Gestão" title={titulo}
        subtitle={<>{executiva ? "Carteira, prazos, gargalos e decisões" : "Equipe, prazos, gargalos e projetos críticos"} · dados do Vobi de <b>{fmt(ctx.carga.dataCarga)}</b> (carga {ctx.carga.id}) · prazos comparados com hoje, {fmt(ctx.hoje)} <Ajuda texto={`Fonte: exportação do Vobi (somente leitura)${ctx.carga.confirmadoEm ? `, importada em ${ctx.carga.confirmadoEm.toLocaleDateString("pt-BR")}` : ""}. Todos os prazos seguem a regra única (atrasada = data de fim anterior a hoje). O que mudou no Vobi depois da exportação só aparece na próxima carga. Cada número leva à lista filtrada correspondente.`} /></>}
        actions={<nav aria-label="Período" className="seg">{PERIODOS.map((p) => <Link key={p} href={p === 14 ? "/painel" : `/painel?periodo=${p}`} aria-current={periodo === p ? "page" : undefined}>{p} dias</Link>)}</nav>} />
      {ctx.desatualizado && (
        <div className="leitura mb-3"><b>Dados</b>Exportação do Vobi com <b>{ctx.idadeDias} dias</b> (cadência combinada: 2× por semana, aviso acima de {CADENCIA_AVISO_DIAS}). <Link className="underline" href="/importacao">Importar nova exportação</Link>.</div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Gráficos próprios (sem biblioteca): barras horizontais com rótulo e número sempre visíveis; colunas SVG para as semanas.
// ---------------------------------------------------------------------------
type Barra = { rotulo: string; valor: number; destaque?: number; href?: string; tom?: string };
function Barras({ itens, legenda, cor = "var(--vinho)", corDestaque = "var(--st-relevante)", vazio = "nenhum" }: { itens: Barra[]; legenda?: ReactNode; cor?: string; corDestaque?: string; vazio?: string }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  if (!itens.length) return <p className="text-sm text-[var(--muted)]">{vazio}</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {itens.map((i) => {
        const w = (i.valor / max) * 100, wd = i.destaque ? (i.destaque / max) * 100 : 0;
        const rot = i.href ? <Link className="truncate underline-offset-2 hover:underline" href={i.href}>{i.rotulo}</Link> : <span className="truncate">{i.rotulo}</span>;
        return (
          <div key={i.rotulo} className="grid grid-cols-[minmax(7rem,11rem)_1fr_auto] items-center gap-2 text-[0.8rem]" title={`${i.rotulo}: ${i.valor}${i.destaque ? ` (${i.destaque} atrasadas)` : ""}`}>
            {rot}
            <div className="relative h-[14px] overflow-hidden rounded-[4px] bg-[var(--surface-2)]">
              <div className="absolute inset-y-0 left-0 rounded-[4px]" style={{ width: `${w}%`, background: i.tom ?? cor, opacity: 0.85 }} />
              {wd > 0 && <div className="absolute inset-y-0 left-0 rounded-[4px]" style={{ width: `${wd}%`, background: corDestaque }} />}
            </div>
            <span className="whitespace-nowrap text-right font-semibold tabular-nums">{i.valor}{i.destaque ? <span className="ml-1 font-medium text-[var(--st-relevante)]">· {i.destaque}</span> : null}</span>
          </div>
        );
      })}
      {legenda && <div className="mt-1 text-[0.72rem] text-[var(--muted)]">{legenda}</div>}
    </div>
  );
}

function Colunas({ semanas, hoje }: { semanas: Semana[]; hoje: string }) {
  const max = Math.max(1, ...semanas.map((s) => s.tarefas));
  const W = 320, H = 150, pad = 8, gw = (W - pad * 2) / semanas.length;
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tarefas com prazo nas próximas quatro semanas" className="block h-auto w-full max-w-[420px]">
        {semanas.map((s, i) => {
          const h = Math.round((s.tarefas / max) * (H - 54)), x = pad + i * gw + gw * 0.18, bw = gw * 0.64, y = H - 34 - h;
          return (
            <g key={s.inicio}>
              <title>{`${fmt(s.inicio)} a ${fmt(s.fim)}: ${s.tarefas} tarefa(s) com prazo`}</title>
              <rect x={x} y={y} width={bw} height={h} rx={4} fill={i === 0 ? "var(--st-hoje)" : "var(--vinho)"} opacity={0.88} />
              <text x={x + bw / 2} y={y - 6} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--txt)">{s.tarefas}</text>
              <text x={x + bw / 2} y={H - 18} textAnchor="middle" fontSize="10.5" fill="var(--txt-2)">{fmtCurto(s.inicio)}–{fmtCurto(s.fim)}</text>
              <text x={x + bw / 2} y={H - 5} textAnchor="middle" fontSize="9.5" fill="var(--muted)">{i === 0 ? "esta semana" : `semana ${i + 1}`}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-[0.72rem] text-[var(--muted)]">Tarefas abertas com prazo em cada janela de 7 dias a partir de hoje ({fmt(hoje)}). Atrasadas não entram aqui.</figcaption>
    </figure>
  );
}

function Bloco({ titulo, sub, children, acao, id }: { titulo: string; sub?: ReactNode; children: ReactNode; acao?: ReactNode; id?: string }) {
  return (
    <section id={id} className="card flex min-w-0 flex-col gap-2 p-4">
      <h2 className="flex flex-wrap items-baseline justify-between gap-2 text-[0.95rem] font-bold">
        <span>{titulo}{sub && <span className="ml-2 text-[0.76rem] font-medium text-[var(--muted)]">{sub}</span>}</span>
        {acao}
      </h2>
      {children}
    </section>
  );
}

function Fold({ titulo, resumo, children, id }: { titulo: string; resumo?: string; children: ReactNode; id?: string }) {
  return (
    <details className="fold" id={id}>
      <summary>{titulo}{resumo && <small>{resumo}</small>}</summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

type Item = { n: number; texto: string; href: string; destino: string };
function Decisoes({ itens, titulo }: { itens: Item[]; titulo: string }) {
  const vis = itens.filter((i) => i.n !== 0);
  return (
    <Bloco titulo={titulo}>
      {vis.length ? <div className="prio">{vis.map((i, k) => <Link key={k} href={i.href}><b>{i.n}</b><span>{i.texto}</span><span className="ir">{i.destino} ›</span></Link>)}</div>
        : <p className="text-sm text-[var(--muted)]">Nada pendente de decisão nesta carga.</p>}
    </Bloco>
  );
}

function Criticos({ projetos, total }: { projetos: ProjetoResumo[]; total: number }) {
  const lista = projetos.slice(0, 8);
  return (
    <Bloco titulo="Projetos críticos" sub={`${projetos.length} de ${total} ativos · atrasadas ou refação alta`}
      acao={<Link className="text-[0.8rem] font-semibold text-[var(--vinho)]" href="/projetos?situacao=acompanhar">Ver todos →</Link>}>
      {lista.length ? (
        <div className="overflow-x-auto"><table className="tbl">
          <thead><tr><th>Projeto · cliente</th><th>Atras.</th><th>Próx. prazo</th><th>Por quê</th><th></th></tr></thead>
          <tbody>{lista.map((p) => (
            <tr key={p.codigo}>
              <td><Link className="ent" href={`/projetos/${p.codigo}`}>{p.nome}</Link><span className="sub">{p.cliente ?? (p.vinculo === "ambiguo" ? "cliente ambíguo" : "sem cliente associado")}</span></td>
              <td>{p.atrasadas ? <Link className="num-relevante font-semibold underline" href={urlCom("/tarefas", {}, { projeto: p.codigo, prazo: "atrasadas" })}>{p.atrasadas}</Link> : <span className="text-[var(--muted)]">0</span>}</td>
              <td className="whitespace-nowrap">{p.proximoPrazo ? <>{fmt(p.proximoPrazo)}<span className="sub">{p.proximaEtapa}</span></> : <span className="text-[var(--muted)]">—</span>}</td>
              <td className="text-[0.8rem] text-[var(--txt-2)]">{p.motivos.map((m) => (m.includes("horas em Refação") ? "refação alta" : m)).join(" · ")}</td>
              <td className="whitespace-nowrap"><a className="text-xs underline" href={linkVobiProjeto(p.codigo)} target="_blank" rel="noreferrer">Vobi ↗</a></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <p className="text-sm text-[var(--muted)]">Nenhum projeto acima dos limiares nesta carga.</p>}
    </Bloco>
  );
}

function TabelaTarefas({ tarefas, vazio }: { tarefas: TarefaResumo[]; vazio: string }) {
  if (!tarefas.length) return <p className="text-sm text-[var(--muted)]">{vazio}</p>;
  return (
    <div className="overflow-x-auto"><table className="tbl">
      <thead><tr><th>Prazo</th><th>Situação</th><th>Tarefa</th><th>Etapa</th><th>Projeto · cliente</th><th>Responsável</th></tr></thead>
      <tbody>{tarefas.map((t) => { const meta = STATUS_PRAZO[t.prazo]; return (
        <tr key={t.chave}>
          <td className="whitespace-nowrap">{fmt(t.dataFim)}</td>
          <td><span className={`st st-${meta.tom}`} title={meta.rotulo}><i aria-hidden /> {rotuloCurto({ status: t.prazo, dias: t.dias, atrasada: meta.grupo === "atrasada", aberta: meta.grupo !== "fechada" })}</span></td>
          <td>{t.nome}</td><td>{t.etapa}</td>
          <td><Link className="ent" href={`/projetos/${t.projetoCodigo}`}>{t.projetoNome}</Link><span className="sub">{t.cliente ?? "sem cliente associado"}</span></td>
          <td>{t.responsavel ?? <span className="text-[var(--muted)]">sem responsável</span>}</td>
        </tr>); })}</tbody>
    </table></div>
  );
}

// ---------------------------------------------------------------------------
function Painel({ d, periodo, perfil }: { d: PainelCoordenacao | PainelGerencia; periodo: Periodo; perfil: Perfil }) {
  const executiva = perfil !== "coordenacao";
  const g = executiva ? (d as PainelGerencia) : null;
  const { ctx, panorama: p, cont } = d;
  const ativos = p.projetosAtivos.reduce((a, r) => a + r.valor, 0);
  const andamento = p.projetosAtivos.filter((r) => r.rotulo.toLowerCase() !== "pausado").reduce((a, r) => a + r.valor, 0);
  const pausados = ativos - andamento;
  const semResp = Math.max(0, cont.abertas - p.porPessoa.reduce((a, r) => a + r.abertas, 0)); // abertas sem responsável (fato importado)
  const sinais = g ? g.recomendacoes.length : 0;

  return (
    <div className="flex flex-col gap-3">
      <Cabecalho titulo={executiva ? "Painel de Gestão" : "Painel operacional"} ctx={ctx} periodo={periodo} executiva={executiva} />

      <div className={`grid gap-3 sm:grid-cols-2 ${executiva ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}>
        <Stat label="Projetos ativos" value={ativos} href="/projetos" note={`${andamento} em andamento · ${pausados} pausados`} />
        {executiva && <Stat label="Encerrados" value={p.encerrados} tone="neutral" href="/projetos?situacao=encerrados" note={d.encerradosPorTipo.map((e) => `${e.valor} ${e.rotulo.toLowerCase()}`).join(" · ") || "—"} />}
        <Stat label="Tarefas atrasadas" value={cont.atrasadas} tone={cont.atrasadas ? "bad" : "ok"} source="calc" href="/tarefas?prazo=atrasadas"
          note={<>&gt;30 d <Link className="underline" href="/tarefas?prazo=atrasada_30">{cont.a30}</Link> · 8–30 <Link className="underline" href="/tarefas?prazo=atrasada_8_30">{cont.a8}</Link> · 1–7 <Link className="underline" href="/tarefas?prazo=atrasada_1_7">{cont.a1}</Link></>} />
        <Stat label={`Entregas em ${periodo} dias`} value={cont.entregasPeriodo} tone={cont.entregasPeriodo ? "warn" : "neutral"} source="calc" href={urlCom("/tarefas", {}, { prazo: "abertas", janela: periodo, entregas: 1 })}
          note={<>de {cont.periodo} tarefas com prazo no período <Ajuda texto={`Entrega = tarefa das etapas ${ETAPAS_ENTREGA.join(", ")} com prazo entre hoje e ${periodo} dias. Só ${pct(p.comFim, p.total)}% das tarefas têm prazo no Vobi.`} /></>} />
        <Stat label="Exigem acompanhamento" value={d.risco.length} tone={d.risco.length ? "warn" : "ok"} source="calc" href="/projetos?situacao=acompanhar" note={<>de {ativos} ativos · atrasadas ou refação alta <Ajuda texto={`Refação alta = ≥ ${Math.round(RISCO_REFACAO_FRACAO * 100)}% das horas lançadas em Refação. O percentual não é exibido porque só ${pct(p.horas.comHoras, p.total)}% das tarefas têm horas (decisão D-C).`} /></>} />
        <Stat label="Sem prazo · sem resp." value={`${cont.semPrazo} · ${semResp}`} tone="neutral" href="/qualidade" note={`de ${cont.abertas} abertas · limitação da fonte, não falha de alguém`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Bloco titulo="Atraso por faixa" sub={`${cont.atrasadas} tarefas · dias desde o prazo`}>
          <Barras itens={[
            { rotulo: "mais de 30 dias", valor: cont.a30, href: "/tarefas?prazo=atrasada_30", tom: "var(--st-critico)" },
            { rotulo: "8 a 30 dias", valor: cont.a8, href: "/tarefas?prazo=atrasada_8_30", tom: "var(--st-relevante)" },
            { rotulo: "1 a 7 dias", valor: cont.a1, href: "/tarefas?prazo=atrasada_1_7", tom: "var(--st-recente)" },
          ]} legenda="Regra única de prazo; a cor nunca é o único sinal." />
        </Bloco>
        <Bloco titulo="Prazos nas próximas 4 semanas" sub="tarefas abertas com prazo">
          <Colunas semanas={d.semanas} hoje={ctx.hoje} />
        </Bloco>
        <Bloco titulo="Projetos ativos por etapa" sub="status do projeto no Vobi">
          <Barras itens={p.projetosAtivos.map((r) => ({ rotulo: r.rotulo, valor: r.valor, href: r.rotulo.toLowerCase() === "pausado" ? "/projetos?situacao=pausados" : undefined }))} legenda="Etapa = status atual do projeto no Vobi (fato importado)." />
        </Bloco>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Bloco titulo="Gargalos por etapa" sub="tarefas abertas · atrasadas em destaque">
          <Barras itens={p.porEtapa.slice(0, 8).map((r) => ({ rotulo: r.rotulo, valor: r.abertas, destaque: r.vencidas, href: urlCom("/tarefas", {}, { etapa: r.rotulo }) }))}
            legenda={<>Barra = abertas · trecho em vermelho = atrasadas. {p.porEtapa.length > 8 ? `Mostrando as 8 etapas com mais tarefas de ${p.porEtapa.length}.` : ""}</>} />
        </Bloco>
        <Bloco titulo="Carga operacional por responsável" sub="informação importada do Vobi · não é desempenho">
          <Barras itens={p.porPessoa.slice(0, 10).map((r) => ({ rotulo: r.rotulo, valor: r.abertas, destaque: r.vencidas, href: urlCom("/tarefas", {}, { resp: r.rotulo }) }))}
            legenda={<>Abertas · atrasadas em vermelho. {semResp} tarefas abertas sem responsável no Vobi ficam fora deste gráfico. Volume não considera complexidade, dependências nem alocação: não compara pessoas.</>} vazio="Nenhuma tarefa com responsável nesta carga." />
        </Bloco>
      </div>

      <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
        <Criticos projetos={d.risco} total={ativos} />
        {g ? (
          <Decisoes titulo="Decisões gerenciais" itens={[
            { n: d.decisoes.ambiguos, texto: "vínculos de cliente aguardam decisão", href: "/clientes#fila", destino: "Clientes" },
            { n: g.usuarios.gestao === 0 ? 1 : 0, texto: "acesso da gerência/coordenação ao A360 não criado (só o administrador)", href: "/pessoas", destino: "Pessoas" },
            { n: d.decisoes.pessoasSemEmail, texto: "pessoas do Vobi sem e-mail Rucelle associado", href: "/pessoas", destino: "Pessoas" },
            { n: d.decisoes.etapasNaoMapeadas, texto: "etapas do Vobi sem classificação no fluxo", href: "/qualidade", destino: "Qualidade" },
            { n: d.idadeCargaDias > CADENCIA_AVISO_DIAS ? d.idadeCargaDias : 0, texto: "dias desde a última carga (cadência 2× por semana)", href: "/importacao", destino: "Importação" },
            { n: sinais, texto: "sinais calculados de risco (concentração, atraso, gargalo, refação)", href: "#riscos", destino: "abrir" },
          ]} />
        ) : (
          <Decisoes titulo="Pendências da coordenação" itens={[
            { n: d.decisoes.ambiguos, texto: "vínculos de cliente aguardam decisão", href: "/clientes#fila", destino: "Clientes" },
            { n: d.decisoes.pessoasSemEmail, texto: "pessoas do Vobi sem e-mail Rucelle associado", href: "/pessoas", destino: "Pessoas" },
            { n: d.decisoes.etapasNaoMapeadas, texto: "etapas do Vobi sem classificação no fluxo", href: "/qualidade", destino: "Qualidade" },
            { n: d.idadeCargaDias > CADENCIA_AVISO_DIAS ? d.idadeCargaDias : 0, texto: "dias desde a última carga (cadência 2× por semana)", href: "/importacao", destino: "Importação" },
          ]} />
        )}
      </div>

      {g && (
        <Fold id="riscos" titulo="Riscos e gargalos" resumo={`${sinais} sinais calculados · não são conclusões`}>
          {g.recomendacoes.length ? (
            <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Tema</th><th>Sinal</th><th>Leitura</th><th>Cuidado</th></tr></thead><tbody>
              {g.recomendacoes.map((r, i) => <tr key={i}><td className="whitespace-nowrap font-semibold">{r.tema}</td><td>{r.sinal}</td><td className="text-[var(--txt-2)]">{r.leitura}</td><td className="text-[0.76rem] text-[var(--muted)]">{r.cuidado}</td></tr>)}
            </tbody></table></div>
          ) : <p className="text-sm text-[var(--muted)]">Nenhum sinal acima dos limiares nesta carga.</p>}
          <p className="mt-2 text-xs text-[var(--muted)]">Quantidade não é produtividade, atraso não é desempenho e refação não é culpa.</p>
        </Fold>
      )}
      <Fold titulo="Entregas no período" resumo={`atrasadas e próximos ${periodo} dias · etapas ${ETAPAS_ENTREGA.join(", ")}`}>
        <TabelaTarefas tarefas={d.entregas} vazio="Nenhuma entrega na janela." />
      </Fold>
      <Fold titulo="Refação e revisões" resumo={`${d.revisoes.tarefas} tarefas de revisão em ${d.revisoes.projetos} projetos · só contagem`}>
        <p className="mb-2 text-[0.8rem] text-[var(--txt-2)]">Tarefas com revisão R01+ ou na etapa Refação (fato importado). O motivo (cliente, escopo, interno) não existe no Vobi. Percentual de horas em Refação não é exibido: só {pct(p.horas.comHoras, p.total)}% das tarefas têm horas lançadas (decisão D-C, 08/11/2026).</p>
        <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Projeto</th><th>Cliente</th><th>Tarefas de revisão</th></tr></thead><tbody>
          {p.revisoes.map((r) => <tr key={r.codigo}><td><Link className="underline" href={`/projetos/${r.codigo}`}>{r.rotulo}</Link></td><td className="text-[var(--txt-2)]">{r.cliente}</td><td className="font-semibold">{r.valor}</td></tr>)}
          {!p.revisoes.length && <tr><td colSpan={3} className="text-[var(--muted)]">nenhuma</td></tr>}
        </tbody></table></div>
      </Fold>
      <Fold titulo="Qualidade dos dados" resumo={`${cont.semPrazo} sem prazo · ${semResp} sem responsável · ${d.decisoes.etapasNaoMapeadas} etapas não classificadas · ${d.decisoes.orfas} órfãs`}>
        <table className="tbl"><thead><tr><th>Classe</th><th>Tarefas</th><th>Entra em</th></tr></thead><tbody>
          {p.qualidade.map((q) => <tr key={q.classe}><td>{q.classe}</td><td>{q.tarefas}</td><td className="text-[var(--txt-2)]">{q.entraEm}</td></tr>)}
        </tbody></table>
        <p className="mt-2 text-xs"><Link className="underline" href="/qualidade">Abrir Qualidade dos dados →</Link></p>
      </Fold>
      {g && (
        <Fold titulo="Evolução entre cargas" resumo={g.cargaAnterior ? `carga anterior ${g.cargaAnterior.id} de ${fmt(g.cargaAnterior.data_carga)}` : "sem histórico real ainda"}>
          <p className="text-sm text-[var(--muted)]">{g.cargaAnterior ? "Comparativo detalhado entra quando houver duas cargas de operação com o mesmo layout." : "Só existe uma carga de operação aceita. A evolução (atrasadas, entregas, projetos ativos) aparece a partir da segunda carga — nenhum histórico é inventado."}</p>
        </Fold>
      )}
      <Fold titulo="Não disponível com os dados atuais" resumo={`${p.limitacoes.length} limitações declaradas`}>
        <ul className="list-disc space-y-1 pl-5 text-[0.85rem] text-[var(--txt-2)]">{p.limitacoes.map((l) => <li key={l.chave}>{l.descricao}</li>)}</ul>
      </Fold>
      <p className="text-[0.74rem] text-[var(--muted)]">Vobi · somente leitura · {pct(p.comFim, p.total)}% das tarefas têm prazo · {pct(p.comResp, p.total)}% têm responsável · Meu dia continua em <Link className="underline" href="/meu-dia">/meu-dia</Link>.</p>
    </div>
  );
}
