import Link from "next/link";
import type { ReactNode } from "react";
import { exigirUsuario, type Perfil } from "@/lib/auth";
import { linkVobiProjeto } from "@/lib/consultas";
import { STATUS_PRAZO, rotuloCurto } from "@/lib/prazo";
import { urlCom } from "@/lib/listas";
import { CADENCIA_AVISO_DIAS, ETAPAS_ENTREGA, PERIODOS, RISCO_REFACAO_FRACAO, type ContextoCarga, type Periodo, type ProjetoResumo, type TarefaResumo } from "@/lib/servicos/meu-dia";
import { painelExecutivo, painelOperacional, type PainelCoordenacao, type PainelGerencia, type Semana } from "@/lib/servicos/painel";
import { indicadoresAlertas } from "@/lib/alertas";
import { contagemFlags } from "@/lib/flags";
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
  const [ind, cf] = await Promise.all([indicadoresAlertas(), contagemFlags()]);
  if (u.perfil === "coordenacao") {
    const d = await painelOperacional(periodo);
    return d ? <Painel d={d} periodo={periodo} perfil={u.perfil} ind={ind} cf={cf} /> : <SemCarga />;
  }
  const d = await painelExecutivo(periodo);
  return d ? <Painel d={d} periodo={periodo} perfil={u.perfil} ind={ind} cf={cf} /> : <SemCarga />;
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
type Barra = { rotulo: string; valor: number; destaque?: number; href?: string; hrefDestaque?: string; tom?: string; tip?: string; tipDestaque?: string };
/** Barras horizontais: a linha inteira é um link (quando há destino), com tooltip próprio (categoria · valor · %); o trecho "atrasadas" tem clique e tooltip separados. */
function Barras({ itens, legenda, cor = "var(--vinho)", corDestaque = "var(--st-relevante)", vazio = "nenhum", unidade = "tarefas" }: { itens: Barra[]; legenda?: ReactNode; cor?: string; corDestaque?: string; vazio?: string; unidade?: string }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  const total = itens.reduce((a, i) => a + i.valor, 0);
  if (!itens.length) return <p className="text-sm text-[var(--muted)]">{vazio}</p>;
  return (
    <div className="flex flex-col gap-1">
      {itens.map((i) => {
        const w = (i.valor / max) * 100, wd = i.destaque ? (i.destaque / max) * 100 : 0;
        const tip = i.tip ?? `${i.rotulo}\n${i.valor} ${unidade} · ${pct(i.valor, total)}% do total${i.destaque ? ` · ${i.destaque} atrasadas` : ""}`;
        const corpo = (
          <>
            <span className="gbar-rot truncate text-[0.8rem]">{i.rotulo}</span>
            <span className="relative block h-[14px] overflow-hidden rounded-[4px] bg-[var(--surface-2)]">
              <span className="absolute inset-y-0 left-0 rounded-[4px]" style={{ width: `${w}%`, background: i.tom ?? cor, opacity: 0.85 }} />
              {wd > 0 && <span className="absolute inset-y-0 left-0 rounded-[4px]" style={{ width: `${wd}%`, background: corDestaque }} />}
            </span>
            <span className="whitespace-nowrap text-right text-[0.8rem] font-semibold tabular-nums">{i.valor}</span>
          </>
        );
        return (
          <div key={i.rotulo} className="flex items-center gap-1">
            {i.href ? <Link href={i.href} className="gbar tip flex-1" data-tip={tip} aria-label={tip.replace(/\n/g, " · ")}>{corpo}</Link>
              : <span className="gbar tip flex-1" data-tip={tip} tabIndex={0}>{corpo}</span>}
            {i.destaque ? (
              i.hrefDestaque
                ? <Link href={i.hrefDestaque} className="tip tip-r w-[3.2rem] whitespace-nowrap text-right text-[0.78rem] font-semibold text-[var(--st-relevante)] underline-offset-2 hover:underline" data-tip={i.tipDestaque ?? `${i.rotulo}\n${i.destaque} atrasadas · ${pct(i.destaque, i.valor)}% das ${i.valor} abertas`}>· {i.destaque}</Link>
                : <span className="w-[3.2rem] text-right text-[0.78rem] font-semibold text-[var(--st-relevante)]">· {i.destaque}</span>
            ) : <span className="w-[3.2rem]" />}
          </div>
        );
      })}
      {legenda && <div className="mt-1 text-[0.72rem] text-[var(--muted)]">{legenda}</div>}
    </div>
  );
}

/** Colunas das próximas 4 semanas: cada coluna abre /tarefas filtrada pela janela daquela semana. */
function Colunas({ semanas, hoje, L }: { semanas: Semana[]; hoje: string; L: (base: string, q: Record<string, string | number | null | undefined | boolean>) => string }) {
  const max = Math.max(1, ...semanas.map((s) => s.tarefas));
  const total = semanas.reduce((a, s) => a + s.tarefas, 0);
  return (
    <figure className="m-0">
      <div className="gcol" role="list" aria-label="Tarefas com prazo nas próximas quatro semanas">
        {semanas.map((s, i) => {
          const h = Math.max(2, Math.round((s.tarefas / max) * 100));
          const tip = `${fmt(s.inicio)} a ${fmt(s.fim)}\n${s.tarefas} tarefas com prazo · ${pct(s.tarefas, total)}% das ${total} nas 4 semanas`;
          return (
            <Link key={s.inicio} role="listitem" href={L("/tarefas", { prazo: "abertas", de: i * 7, janela: i * 7 + 6 })} className="tip" data-tip={tip} aria-label={tip.replace(/\n/g, " · ")}>
              <span className="gcol-val">{s.tarefas}</span>
              <span className="gcol-bar" style={{ height: `${h}%`, background: i === 0 ? "var(--st-hoje)" : undefined }} />
              <span className="gcol-lab">{fmtCurto(s.inicio)}–{fmtCurto(s.fim)}<br />{i === 0 ? "esta semana" : `semana ${i + 1}`}</span>
            </Link>
          );
        })}
      </div>
      <figcaption className="mt-1 text-[0.72rem] text-[var(--muted)]">Tarefas abertas com prazo em cada janela de 7 dias a partir de hoje ({fmt(hoje)}). Atrasadas não entram aqui. Clique numa coluna para ver a lista.</figcaption>
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

function Criticos({ projetos, total, L }: { projetos: ProjetoResumo[]; total: number; L: (b: string, q: Record<string, string | number | null | undefined | boolean>) => string }) {
  const lista = projetos.slice(0, 8);
  return (
    <Bloco titulo="Projetos críticos" sub={`${projetos.length} de ${total} ativos · atrasadas ou refação alta`}
      acao={<Link className="text-[0.8rem] font-semibold text-[var(--vinho)]" href={L("/projetos", { situacao: "acompanhar" })}>Ver todos →</Link>}>
      {lista.length ? (
        <div className="overflow-x-auto"><table className="tbl">
          <thead><tr><th>Projeto · cliente</th><th>Atras.</th><th>Próx. prazo</th><th>Por quê</th><th></th></tr></thead>
          <tbody>{lista.map((p) => (
            <tr key={p.codigo}>
              <td><Link className="ent" href={`/projetos/${p.codigo}`}>{p.nome}</Link><span className="sub">{p.cliente ?? (p.vinculo === "ambiguo" ? "cliente ambíguo" : "sem cliente associado")}</span></td>
              <td>{p.atrasadas ? <Link className="num-relevante font-semibold underline" href={L("/tarefas", { projeto: p.codigo, prazo: "atrasadas" })}>{p.atrasadas}</Link> : <span className="text-[var(--muted)]">0</span>}</td>
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
function Painel({ d, periodo, perfil, ind, cf }: { d: PainelCoordenacao | PainelGerencia; periodo: Periodo; perfil: Perfil; ind: Awaited<ReturnType<typeof indicadoresAlertas>>; cf: Awaited<ReturnType<typeof contagemFlags>> }) {
  const executiva = perfil !== "coordenacao";
  const g = executiva ? (d as PainelGerencia) : null;
  const { ctx, panorama: p, cont } = d;
  const ativos = p.projetosAtivos.reduce((a, r) => a + r.valor, 0);
  const andamento = p.projetosAtivos.filter((r) => r.rotulo.toLowerCase() !== "pausado").reduce((a, r) => a + r.valor, 0);
  const pausados = ativos - andamento;
  const semResp = Math.max(0, cont.abertas - p.porPessoa.reduce((a, r) => a + r.abertas, 0)); // abertas sem responsável (fato importado)
  const sinais = g ? g.recomendacoes.length : 0;
  // Links para as listas levam a origem (volta=painel, vp=período): a lista mostra "← Painel de Gestão" e preserva o contexto.
  const L = (base: string, q: Record<string, string | number | null | undefined | boolean>) => urlCom(base, { volta: "painel", vp: periodo !== 14 ? periodo : null }, q);

  return (
    <div className="flex flex-col gap-3">
      <Cabecalho titulo={executiva ? "Painel de Gestão" : "Painel operacional"} ctx={ctx} periodo={periodo} executiva={executiva} />

      <div className={`grid gap-3 sm:grid-cols-2 ${executiva ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}>
        <Stat label="Projetos ativos" value={ativos} href={L("/projetos", {})} note={`${andamento} em andamento · ${pausados} pausados`} />
        {executiva && <Stat label="Encerrados" value={p.encerrados} tone="neutral" href={L("/projetos", { situacao: "encerrados" })} note={d.encerradosPorTipo.map((e) => `${e.valor} ${e.rotulo.toLowerCase()}`).join(" · ") || "—"} />}
        <Stat label="Tarefas atrasadas" value={cont.atrasadas} tone={cont.atrasadas ? "bad" : "ok"} source="calc" href={L("/tarefas", { prazo: "atrasadas" })}
          note={<>&gt;30 d <Link className="underline" href={L("/tarefas", { prazo: "atrasada_30" })}>{cont.a30}</Link> · 8–30 <Link className="underline" href={L("/tarefas", { prazo: "atrasada_8_30" })}>{cont.a8}</Link> · 1–7 <Link className="underline" href={L("/tarefas", { prazo: "atrasada_1_7" })}>{cont.a1}</Link></>} />
        <Stat label={`Entregas em ${periodo} dias`} value={cont.entregasPeriodo} tone={cont.entregasPeriodo ? "warn" : "neutral"} source="calc" href={L("/tarefas", { prazo: "abertas", janela: periodo, entregas: 1 })}
          note={<>de {cont.periodo} tarefas com prazo no período <Ajuda texto={`Entrega = tarefa das etapas ${ETAPAS_ENTREGA.join(", ")} com prazo entre hoje e ${periodo} dias. Só ${pct(p.comFim, p.total)}% das tarefas têm prazo no Vobi.`} /></>} />
        <Stat label="Exigem acompanhamento" value={d.risco.length} tone={d.risco.length ? "warn" : "ok"} source="calc" href={L("/projetos", { situacao: "acompanhar" })} note={<>de {ativos} ativos · atrasadas ou refação alta <Ajuda texto={`Refação alta = ≥ ${Math.round(RISCO_REFACAO_FRACAO * 100)}% das horas lançadas em Refação. O percentual não é exibido porque só ${pct(p.horas.comHoras, p.total)}% das tarefas têm horas (decisão D-C).`} /></>} />
        <Stat label="Sem prazo · sem resp." value={`${cont.semPrazo} · ${semResp}`} tone="neutral" href="/qualidade" note={`de ${cont.abertas} abertas · limitação da fonte, não falha de alguém`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Bloco titulo="Atraso por faixa" sub={`${cont.atrasadas} tarefas · dias desde o prazo`}>
          <Barras itens={[
            { rotulo: "mais de 30 dias", valor: cont.a30, href: L("/tarefas", { prazo: "atrasada_30" }), tom: "var(--st-critico)", tip: `Atrasadas há mais de 30 dias\n${cont.a30} tarefas · ${pct(cont.a30, cont.atrasadas)}% das ${cont.atrasadas} atrasadas` },
            { rotulo: "8 a 30 dias", valor: cont.a8, href: L("/tarefas", { prazo: "atrasada_8_30" }), tom: "var(--st-relevante)", tip: `Atrasadas há 8 a 30 dias\n${cont.a8} tarefas · ${pct(cont.a8, cont.atrasadas)}% das ${cont.atrasadas} atrasadas` },
            { rotulo: "1 a 7 dias", valor: cont.a1, href: L("/tarefas", { prazo: "atrasada_1_7" }), tom: "var(--st-recente)", tip: `Atrasadas há 1 a 7 dias\n${cont.a1} tarefas · ${pct(cont.a1, cont.atrasadas)}% das ${cont.atrasadas} atrasadas` },
          ]} legenda="Regra única de prazo; a cor nunca é o único sinal. Clique numa faixa para ver as tarefas." />
        </Bloco>
        <Bloco titulo="Prazos nas próximas 4 semanas" sub="tarefas abertas com prazo">
          <Colunas semanas={d.semanas} hoje={ctx.hoje} L={L} />
        </Bloco>
        <Bloco titulo="Projetos ativos por etapa" sub="status do projeto no Vobi">
          <Barras unidade="projetos" itens={p.projetosAtivos.map((r) => ({ rotulo: r.rotulo, valor: r.valor, href: L("/projetos", { status: r.rotulo }), tip: `${r.rotulo}\n${r.valor} projetos · ${pct(r.valor, ativos)}% dos ${ativos} ativos` }))} legenda="Etapa = status atual do projeto no Vobi (fato importado). Clique para ver os projetos." />
        </Bloco>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Bloco titulo="Gargalos por etapa" sub="tarefas abertas · atrasadas em destaque">
          <Barras itens={p.porEtapa.slice(0, 8).map((r) => ({ rotulo: r.rotulo, valor: r.abertas, destaque: r.vencidas, href: L("/tarefas", { etapa: r.rotulo }), hrefDestaque: L("/tarefas", { etapa: r.rotulo, prazo: "atrasadas" }), tip: `${r.rotulo}\n${r.abertas} abertas · ${pct(r.abertas, cont.abertas)}% das ${cont.abertas} abertas · ${r.vencidas} atrasadas` }))}
            legenda={<>Barra = abertas · trecho em vermelho = atrasadas. Clique na barra para as abertas, no número vermelho para as atrasadas. {p.porEtapa.length > 8 ? `Mostrando as 8 etapas com mais tarefas de ${p.porEtapa.length}.` : ""}</>} />
        </Bloco>
        <Bloco titulo="Carga operacional por responsável" sub="informação importada do Vobi · não é desempenho">
          <Barras itens={p.porPessoa.slice(0, 10).map((r) => ({ rotulo: r.rotulo, valor: r.abertas, destaque: r.vencidas, href: L("/tarefas", { resp: r.rotulo }), hrefDestaque: L("/tarefas", { resp: r.rotulo, prazo: "atrasadas" }), tip: `${r.rotulo}\n${r.abertas} tarefas abertas no Vobi · ${r.vencidas} atrasadas\ninformação importada, não desempenho` }))}
            legenda={<>Abertas · atrasadas em vermelho. Clique na barra para as abertas, no número vermelho para as atrasadas. {semResp} tarefas abertas sem responsável no Vobi ficam fora deste gráfico. Volume não considera complexidade, dependências nem alocação: não compara pessoas.</>} vazio="Nenhuma tarefa com responsável nesta carga." />
        </Bloco>
      </div>

      <Bloco titulo="Divergências e limitações de dados" sub="T-188 · a IA identifica, a gestão decide · nada altera o Vobi" acao={<Link className="text-[0.8rem] font-semibold text-[var(--vinho)]" href="/alertas">Central de alertas →</Link>}>
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {[
            { r: "Alertas abertos", v: ind.abertos, h: "/alertas?abertos=1", t: ind.abertos ? "relevante" : "ok" },
            { r: "Críticos", v: ind.criticos, h: "/alertas?abertos=1&prioridade=critico", t: ind.criticos ? "critico" : "ok" },
            { r: "Alta prioridade", v: ind.altos, h: "/alertas?abertos=1&prioridade=alto", t: ind.altos ? "relevante" : "ok" },
            { r: "Aguardando análise", v: ind.aguardando, h: "/alertas?situacao=aberto", t: "neutro" },
            { r: "Em tratamento", v: ind.tratamento, h: "/alertas?situacao=em_tratamento", t: "neutro" },
            { r: "Resolvidos", v: ind.resolvidos, h: "/alertas?situacao=resolvido", t: "ok" },
          ].map((k) => <Link key={k.r} href={k.h} className="tip rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 no-underline" data-tip={`${k.r}: ${k.v}`}><div className="text-[0.72rem] font-semibold text-[var(--muted)]">{k.r}</div><div className={`text-[1.3rem] font-bold num-${k.t}`}>{k.v}</div></Link>)}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.78rem] text-[var(--txt-2)]">
          <Link className="underline" href="/alertas#flags">{cf.abertas} flag(s) de limitação de dados abertas</Link>
          <span>{cf.projetosSemCobertura} projeto(s) sem cobertura suficiente para comparação</span>
          {ind.diasTratamento ? <span>tempo médio de tratamento: {ind.diasTratamento} dia(s)</span> : null}
          {ind.recorrentes.length ? <span>recorrentes: {ind.recorrentes.map((r) => `${r.categoria.replace(/_/g, " ")} (${r.n})`).join(", ")}</span> : null}
          <Link className="underline" href="/integracao-vobi">cobertura da integração Vobi</Link>
        </div>
        <p className="mt-1 text-[0.72rem] text-[var(--muted)]">Comparação antes/depois do início da produção não disponível: o Vobi exportado não informa quando a produção começa (flag registrada).</p>
      </Bloco>

      <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
        <Criticos projetos={d.risco} total={ativos} L={L} />
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
