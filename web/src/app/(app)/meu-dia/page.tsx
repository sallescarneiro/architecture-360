import Link from "next/link";
import type { ReactNode } from "react";
import { exigirUsuario } from "@/lib/auth";
import { linkVobiProjeto } from "@/lib/consultas";
import { STATUS_PRAZO, rotuloCurto } from "@/lib/prazo";
import { urlCom } from "@/lib/listas";
import {
  CADENCIA_AVISO_DIAS, ETAPAS_ENTREGA, PERIODOS, RISCO_REFACAO_FRACAO,
  meuDiaArquiteta, meuDiaCoordenacao, meuDiaGerencia, type ContextoCarga, type Contagens, type Periodo, type ProjetoResumo, type TarefaResumo,
} from "@/lib/servicos/meu-dia";
import { Ajuda, Badge, Empty, LinkButton, PageHeader, Stat } from "@/components/ui";

/**
 * Meu Dia enxuto (T-198): primeira dobra = saudação + data da carga · 3 KPIs · "Precisa da sua atenção" · 5–7 prioridades.
 * O resto fica recolhido. Camada visual apenas: números vêm de src/lib/servicos/meu-dia.ts, prazos da regra única.
 */
export default async function MeuDiaPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const periodo = (PERIODOS as readonly number[]).includes(Number(sp.periodo)) ? (Number(sp.periodo) as Periodo) : 7;
  if (u.perfil === "arquiteta") return <Arquiteta email={u.email} nome={u.nome} periodo={periodo} />;
  if (u.perfil === "coordenacao") return <Coordenacao nome={u.nome} periodo={periodo} />;
  return <Gerencia nome={u.nome} periodo={periodo} />;
}

const fmt = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function saudacao(nome: string, hoje: string) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date()));
  const s = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const d = new Date(hoje + "T12:00:00Z");
  return { titulo: `${s}, ${nome.split(" ")[0]}`, data: `${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}` };
}
const LIMITE_PRIORIDADES = 7;

function Cabecalho({ nome, perfil, ctx, periodo }: { nome: string; perfil: string; ctx: ContextoCarga; periodo: Periodo }) {
  const s = saudacao(nome, ctx.hoje);
  return (
    <>
      <PageHeader eyebrow="Architecture 360 · Central de Trabalho" title={s.titulo}
        subtitle={<>{perfil} · {s.data} · dados do Vobi de <b>{fmt(ctx.carga.dataCarga)}</b> <Ajuda texto={`Carga ${ctx.carga.id}${ctx.carga.confirmadoEm ? `, importada em ${ctx.carga.confirmadoEm.toLocaleDateString("pt-BR")}` : ""}. Prazos comparados com hoje (${fmt(ctx.hoje)}). Tarefas concluídas ou replanejadas no Vobi depois da exportação ainda aparecem com a situação antiga até a próxima carga. O Vobi é a fonte oficial e não é alterado aqui.`} /></>}
        actions={<nav aria-label="Período" className="seg">{PERIODOS.map((p) => <Link key={p} href={p === 7 ? "/meu-dia" : `/meu-dia?periodo=${p}`} aria-current={periodo === p ? "page" : undefined}>{p} dias</Link>)}</nav>} />
      {ctx.desatualizado && (
        <div className="leitura mb-3"><b>Dados</b>Exportação do Vobi com <b>{ctx.idadeDias} dias</b> (cadência combinada: 2× por semana, aviso acima de {CADENCIA_AVISO_DIAS}). <Link className="underline" href="/importacao">Importar nova exportação</Link>.</div>
      )}
    </>
  );
}

function SemCarga() {
  return (
    <>
      <PageHeader eyebrow="Architecture 360 · Central de Trabalho" title="Meu dia" subtitle="Ainda não há carga de operação aceita." />
      <Empty action={<LinkButton href="/importacao" variant="primary">Importar do Vobi</LinkButton>}>Nenhuma carga de Projetos+Tarefas aceita ainda.</Empty>
    </>
  );
}

type Item = { n: number | string; texto: string; href: string; destino: string; tipo?: "decisao" | "dados" | "neutro" };
/** Só o que exige ação, decisão ou acompanhamento concreto — itens com contagem zero não aparecem. */
function Atencao({ itens }: { itens: Item[] }) {
  const vis = itens.filter((i) => Number(i.n) !== 0);
  return (
    <section className="card p-4">
      <h2 className="mb-2 text-[0.95rem] font-bold">Precisa da sua atenção</h2>
      {vis.length ? (
        <div className="prio">{vis.map((i, k) => <Link key={k} href={i.href}><b>{i.n}</b><span>{i.texto}</span><span className="ir">{i.destino} ›</span></Link>)}</div>
      ) : <p className="text-sm text-[var(--muted)]">Nada pendente de decisão ou acompanhamento nesta carga.</p>}
    </section>
  );
}

function Prioridades({ tarefas, periodo, verTodas, mostrarResp }: { tarefas: TarefaResumo[]; periodo: Periodo; verTodas: string; mostrarResp?: boolean }) {
  const lista = tarefas.slice(0, LIMITE_PRIORIDADES);
  return (
    <section className="card p-4">
      <h2 className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-[0.95rem] font-bold">
        <span>Prioridades <span className="text-[0.78rem] font-medium text-[var(--muted)]">atrasadas e próximos {periodo} dias <Ajuda texto="Ordem: prazo mais antigo primeiro (atrasadas), depois as que vencem no período. Mesma regra de prazo das listas." /></span></span>
        <Link className="text-[0.8rem] font-semibold text-[var(--vinho)]" href={verTodas}>Ver todas →</Link>
      </h2>
      {lista.length ? lista.map((t) => {
        const meta = STATUS_PRAZO[t.prazo];
        return (
          <div className="tlin" key={t.chave}>
            <span className="whitespace-nowrap">{fmt(t.dataFim)}</span>
            <span className={`st st-${meta.tom}`} title={meta.rotulo}><i aria-hidden /> {rotuloCurto({ status: t.prazo, dias: t.dias, atrasada: meta.grupo === "atrasada", aberta: meta.grupo !== "fechada" })}</span>
            <span className="min-w-0"><span className="block truncate">{t.nome} <span className="text-[var(--muted)]">· {t.etapa}</span></span><span className="sub truncate"><Link className="underline" href={`/projetos/${t.projetoCodigo}`}>{t.projetoNome}</Link>{t.cliente ? ` · ${t.cliente}` : ""}{mostrarResp ? ` · ${t.responsavel ?? "sem responsável"}` : ""}</span></span>
            <a className="whitespace-nowrap text-xs underline" href={linkVobiProjeto(t.projetoCodigo)} target="_blank" rel="noreferrer">Vobi ↗</a>
          </div>
        );
      }) : <p className="text-sm text-[var(--muted)]">Nada atrasado nem com prazo nos próximos {periodo} dias.</p>}
    </section>
  );
}

function Fold({ titulo, resumo, children, aberto }: { titulo: string; resumo?: string; children: ReactNode; aberto?: boolean }) {
  return (
    <details className="fold" open={aberto}>
      <summary>{titulo}{resumo && <small>{resumo}</small>}</summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

function Nota({ itens }: { itens: string[] }) {
  return <p className="flex items-center gap-2 text-[0.74rem] text-[var(--muted)]"><Ajuda texto={itens.join(" · ")} /> Limitações desta carga e fontes ainda não integradas: passe o mouse no ⓘ.</p>;
}

function TabelaTarefas({ tarefas, mostrarResponsavel, vazio }: { tarefas: TarefaResumo[]; mostrarResponsavel?: boolean; vazio: string }) {
  if (!tarefas.length) return <p className="text-sm text-[var(--muted)]">{vazio}</p>;
  return (
    <div className="overflow-x-auto"><table className="tbl">
      <thead><tr><th>Prazo</th><th>Situação</th><th>Tarefa</th><th>Etapa</th><th>Projeto · cliente</th>{mostrarResponsavel && <th>Responsável</th>}<th></th></tr></thead>
      <tbody>{tarefas.map((t) => {
        const meta = STATUS_PRAZO[t.prazo];
        return (
          <tr key={t.chave}>
            <td className="whitespace-nowrap">{fmt(t.dataFim)}</td>
            <td><span className={`st st-${meta.tom}`} title={meta.rotulo}><i aria-hidden /> {rotuloCurto({ status: t.prazo, dias: t.dias, atrasada: meta.grupo === "atrasada", aberta: meta.grupo !== "fechada" })}</span></td>
            <td>{t.nome}</td><td>{t.etapa}</td>
            <td><Link className="ent" href={`/projetos/${t.projetoCodigo}`}>{t.projetoNome}</Link><span className="sub">{t.cliente ?? "sem cliente associado"}</span></td>
            {mostrarResponsavel && <td>{t.responsavel ?? <span className="text-[var(--muted)]">sem responsável</span>}</td>}
            <td className="whitespace-nowrap"><a className="text-xs underline" href={linkVobiProjeto(t.projetoCodigo)} target="_blank" rel="noreferrer">Vobi ↗</a></td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );
}

function TabelaProjetos({ projetos, vazio }: { projetos: ProjetoResumo[]; vazio: string }) {
  if (!projetos.length) return <p className="text-sm text-[var(--muted)]">{vazio}</p>;
  return (
    <div className="overflow-x-auto"><table className="tbl">
      <thead><tr><th>Projeto</th><th>Cliente</th><th>Status</th><th>Abertas</th><th>Atrasadas</th><th>Próximo prazo</th><th>Por quê</th><th></th></tr></thead>
      <tbody>{projetos.map((p) => (
        <tr key={p.codigo}>
          <td><Link className="ent" href={`/projetos/${p.codigo}`}>{p.nome}</Link></td>
          <td>{p.cliente ?? <span className="text-xs text-[var(--muted)]">{p.vinculo === "ambiguo" ? "cliente ambíguo" : "sem cliente associado"}</span>}</td>
          <td><Badge tone={p.statusClasse === "pausado" ? "warn" : "ok"}>{p.status}</Badge></td>
          <td><Link className="underline" href={urlCom("/tarefas", {}, { projeto: p.codigo })}>{p.abertas}</Link></td>
          <td>{p.atrasadas ? <Link className="num-relevante font-semibold underline" href={urlCom("/tarefas", {}, { projeto: p.codigo, prazo: "atrasadas" })}>{p.atrasadas}</Link> : <span className="text-[var(--muted)]">0</span>}</td>
          <td className="whitespace-nowrap">{p.proximoPrazo ? <>{fmt(p.proximoPrazo)}<span className="sub">{p.proximaEtapa}</span></> : <span className="text-[var(--muted)]">—</span>}</td>
          <td className="text-xs text-[var(--txt-2)]">{p.motivos.join(" · ")}</td>
          <td className="whitespace-nowrap"><a className="text-xs underline" href={linkVobiProjeto(p.codigo)} target="_blank" rel="noreferrer">Vobi ↗</a></td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

const faixas = (c: Contagens, base: Record<string, string | number>) => (
  <>&gt;30 d <Link className="underline" href={urlCom("/tarefas", base, { prazo: "atrasada_30" })}>{c.a30}</Link> · 8–30 <Link className="underline" href={urlCom("/tarefas", base, { prazo: "atrasada_8_30" })}>{c.a8}</Link> · 1–7 <Link className="underline" href={urlCom("/tarefas", base, { prazo: "atrasada_1_7" })}>{c.a1}</Link></>
);

// ---------------------------------------------------------------------------
async function Arquiteta({ email, nome, periodo }: { email: string; nome: string; periodo: Periodo }) {
  const d = await meuDiaArquiteta(email, periodo);
  if (!d) return <SemCarga />;
  const { ctx } = d;
  const base = { resp: d.nomes[0] ?? "" };
  return (
    <div className="flex flex-col gap-3">
      <Cabecalho nome={nome} perfil="Arquiteta" ctx={ctx} periodo={periodo} />
      {!d.associacao || !d.cont ? (
        <div className="leitura"><b>Associação</b>Seu e-mail ({email}) ainda não está ligado a um nome do Vobi em Pessoas; nada é inferido. Peça à gestão o mapeamento.</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Minhas atrasadas" value={d.cont.atrasadas} tone={d.cont.atrasadas ? "bad" : "ok"} source="calc" href={urlCom("/tarefas", base, { prazo: "atrasadas" })} note={d.cont.atrasadas ? faixas(d.cont, base) : "nenhuma"} />
            <Stat label={`Vencem em ${periodo} dias`} value={d.cont.periodo} tone={d.cont.periodo ? "warn" : "neutral"} source="calc" href={urlCom("/tarefas", base, { prazo: "abertas", janela: periodo })} note={`${d.cont.hoje} hoje · ${d.cont.entregasPeriodo} entregas`} />
            <Stat label="Sem prazo" value={d.cont.semPrazo} tone="neutral" source="calc" href={urlCom("/tarefas", base, { prazo: "sem_prazo" })} note={`de ${d.cont.abertas} abertas · limitação da fonte`} />
          </div>
          <Atencao itens={[
            { n: d.cont.atrasadas, texto: "tarefas suas atrasadas", href: urlCom("/tarefas", base, { prazo: "atrasadas" }), destino: "Tarefas" },
            { n: d.cont.hoje, texto: "vencem hoje", href: urlCom("/tarefas", base, { prazo: "hoje" }), destino: "Tarefas" },
            { n: d.entregas.length, texto: `entregas atrasadas ou nos próximos ${periodo} dias`, href: urlCom("/tarefas", base, { prazo: "abertas", ate: periodo, entregas: true }), destino: "Tarefas" },
          ]} />
          <Prioridades tarefas={d.atencao} periodo={periodo} verTodas={urlCom("/tarefas", base, { prazo: "abertas", ate: periodo })} />
          <Fold titulo="Meus projetos" resumo={`${d.projetos.length} ativos · como colaboradora ou responsável`}><TabelaProjetos projetos={d.projetos} vazio="Nenhum projeto ativo associado a você nesta carga." /></Fold>
          <Fold titulo="Entregas" resumo={`atrasadas e próximos ${periodo} dias`}><TabelaTarefas tarefas={d.entregas} vazio="Nenhuma entrega na janela." /></Fold>
          <Nota itens={[`${d.cont.semPrazo} de ${d.cont.abertas} tarefas suas sem prazo no Vobi`, `entrega = tarefa das etapas ${ETAPAS_ENTREGA.join(", ")}`, "agenda e reuniões: Fase 3 (Google Calendar)", "espera por cliente: Fase 4", "arquivos: aba Arquivos do projeto no Vobi", "Vobi · somente leitura"]} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
async function Coordenacao({ nome, periodo }: { nome: string; periodo: Periodo }) {
  const d = await meuDiaCoordenacao(periodo);
  if (!d || !d.panorama) return <SemCarga />;
  const { ctx, panorama: p, cont } = d;
  const decisoes = d.decisoes.ambiguos + d.decisoes.etapasNaoMapeadas + d.decisoes.pessoasSemEmail + d.decisoes.orfas;
  return (
    <div className="flex flex-col gap-3">
      <Cabecalho nome={nome} perfil="Coordenação" ctx={ctx} periodo={periodo} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Atrasadas" value={cont.atrasadas} tone={cont.atrasadas ? "bad" : "ok"} source="calc" href="/tarefas?prazo=atrasadas" note={faixas(cont, {})} />
        <Stat label={`Vencem em ${periodo} dias`} value={cont.periodo} tone={cont.periodo ? "warn" : "neutral"} source="calc" href={urlCom("/tarefas", {}, { prazo: "abertas", janela: periodo })} note={`${cont.hoje} hoje · ${cont.entregasPeriodo} entregas`} />
        <Stat label="Decisões pendentes" value={decisoes} tone={decisoes ? "info" : "ok"} href="#atencao" note={`${d.decisoes.ambiguos} vínculos · ${d.decisoes.etapasNaoMapeadas} etapas · ${d.decisoes.pessoasSemEmail} pessoas`} />
      </div>
      <div id="atencao">
        <Atencao itens={[
          { n: d.decisoes.ambiguos, texto: "projetos com cliente ambíguo — escolher o cadastro", href: "/clientes#fila", destino: "Clientes" },
          { n: d.decisoes.etapasNaoMapeadas, texto: "etapas do Vobi não classificadas no fluxo", href: "/qualidade", destino: "Qualidade" },
          { n: d.decisoes.orfas, texto: "tarefas sem projeto resolvido", href: "/qualidade", destino: "Qualidade" },
          { n: d.decisoes.pessoasSemEmail, texto: "pessoas do Vobi sem e-mail Rucelle", href: "/pessoas", destino: "Pessoas" },
          { n: d.risco.length, texto: "projetos exigem acompanhamento (atrasadas ou refação alta)", href: "/projetos?situacao=acompanhar", destino: "Projetos" },
        ]} />
      </div>
      <Prioridades tarefas={d.atencao} periodo={periodo} verTodas={urlCom("/tarefas", {}, { prazo: "abertas", ate: periodo })} mostrarResp />
      <Fold titulo="Projetos que exigem acompanhamento" resumo={`${d.risco.length} de ${d.projetos.length} ativos · atrasadas ou ≥ ${Math.round(RISCO_REFACAO_FRACAO * 100)}% em Refação`}><TabelaProjetos projetos={d.risco} vazio="Nenhum projeto acima dos limiares." /></Fold>
      <Fold titulo="Equipe" resumo="tarefas abertas por responsável · carga, não desempenho">
        <table className="tbl"><thead><tr><th>Responsável</th><th>Abertas</th><th>Atrasadas</th><th>Hoje + 7 dias</th><th>Sem prazo</th></tr></thead><tbody>
          {p.porPessoa.map((r) => <tr key={r.rotulo}><td>{r.rotulo}</td><td><Link className="underline" href={urlCom("/tarefas", {}, { resp: r.rotulo })}>{r.abertas}</Link></td><td>{r.vencidas ? <Link className="num-relevante underline" href={urlCom("/tarefas", {}, { resp: r.rotulo, prazo: "atrasadas" })}>{r.vencidas}</Link> : 0}</td><td>{r.d7}</td><td className="text-[var(--muted)]">{r.semPrazo}</td></tr>)}
        </tbody></table>
        <p className="mt-2 text-xs text-[var(--muted)]">Volume sem complexidade, dependências e horas não compara pessoas. Base: {p.comResp} de {p.total} tarefas com responsável.</p>
      </Fold>
      <Fold titulo="Gargalos por etapa" resumo="abertas e atrasadas">
        <table className="tbl"><thead><tr><th>Etapa</th><th>Abertas</th><th>Atrasadas</th></tr></thead><tbody>
          {p.porEtapa.map((r) => <tr key={r.rotulo}><td>{r.rotulo}</td><td><Link className="underline" href={urlCom("/tarefas", {}, { etapa: r.rotulo })}>{r.abertas}</Link></td><td>{r.vencidas ? <Link className="num-relevante underline" href={urlCom("/tarefas", {}, { etapa: r.rotulo, prazo: "atrasadas" })}>{r.vencidas}</Link> : 0}</td></tr>)}</tbody></table>
      </Fold>
      <Fold titulo="Entregas" resumo={`atrasadas e próximos ${periodo} dias`}><TabelaTarefas tarefas={d.entregas} mostrarResponsavel vazio="Nenhuma entrega na janela." /></Fold>
      <Nota itens={[`${p.total - p.comFim} de ${p.total} tarefas sem prazo (${p.total ? Math.round(((p.total - p.comFim) / p.total) * 100) : 0}%)`, `${p.total - p.comResp} sem responsável — limitação da fonte, não falha de alguém`, `entrega = tarefa das etapas ${ETAPAS_ENTREGA.join(", ")}`, "agenda da equipe: Fase 3", "espera por cliente ou decisão: Fase 4", "Vobi · somente leitura"]} />
    </div>
  );
}

// ---------------------------------------------------------------------------
async function Gerencia({ nome, periodo }: { nome: string; periodo: Periodo }) {
  const d = await meuDiaGerencia(periodo);
  if (!d || !d.panorama) return <SemCarga />;
  const { ctx, panorama: p, cont } = d;
  const ativos = p.projetosAtivos.reduce((a, r) => a + r.valor, 0);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  return (
    <div className="flex flex-col gap-3">
      <Cabecalho nome={nome} perfil="Gerência" ctx={ctx} periodo={periodo} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Atrasadas" value={cont.atrasadas} tone={cont.atrasadas ? "bad" : "ok"} source="calc" href="/tarefas?prazo=atrasadas" note={faixas(cont, {})} />
        <Stat label={`Vencem em ${periodo} dias`} value={cont.periodo} tone={cont.periodo ? "warn" : "neutral"} source="calc" href={urlCom("/tarefas", {}, { prazo: "abertas", janela: periodo })} note={`${cont.hoje} hoje · ${cont.entregasPeriodo} entregas`} />
        <Stat label="Projetos a acompanhar" value={d.risco.length} tone={d.risco.length ? "warn" : "ok"} source="calc" href="/projetos?situacao=acompanhar" note={`de ${ativos} ativos · ${pct(p.horas.refacaoMin, p.horas.totalMin)}% das horas em Refação`} />
      </div>
      <Atencao itens={[
        { n: d.decisoes.ambiguos, texto: "vínculos de cliente aguardam a coordenação", href: "/clientes#fila", destino: "Clientes" },
        { n: d.usuarios.gestao === 0 ? 1 : 0, texto: "acesso da gerência/coordenação ao A360 ainda não criado (só o administrador)", href: "/pessoas", destino: "Pessoas" },
        { n: d.recomendacoes.length, texto: "sinais de risco calculados para análise", href: "#riscos", destino: "ver" },
        { n: d.decisoes.pessoasSemEmail, texto: "pessoas do Vobi sem e-mail Rucelle", href: "/pessoas", destino: "Pessoas" },
      ]} />
      <Prioridades tarefas={d.atencao} periodo={periodo} verTodas={urlCom("/tarefas", {}, { prazo: "abertas", ate: periodo })} mostrarResp />
      <div id="riscos">
        <Fold titulo="Riscos e gargalos" resumo={`${d.recomendacoes.length} sinais calculados · não são conclusões`}>
          {d.recomendacoes.length ? (
            <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Tema</th><th>Sinal</th><th>Leitura</th><th>Cuidado</th></tr></thead><tbody>
              {d.recomendacoes.map((r, i) => <tr key={i}><td className="whitespace-nowrap font-semibold">{r.tema}</td><td>{r.sinal}</td><td className="text-[var(--txt-2)]">{r.leitura}</td><td className="text-[0.76rem] text-[var(--muted)]">{r.cuidado}</td></tr>)}
            </tbody></table></div>
          ) : <p className="text-sm text-[var(--muted)]">Nenhum sinal acima dos limiares nesta carga.</p>}
          <p className="mt-2 text-xs text-[var(--muted)]">Quantidade não é produtividade, atraso não é desempenho e refação não é culpa.</p>
        </Fold>
      </div>
      <Fold titulo="Projetos que exigem acompanhamento" resumo={`${d.risco.length} · atrasadas ou ≥ ${Math.round(RISCO_REFACAO_FRACAO * 100)}% das horas em Refação`}><TabelaProjetos projetos={d.risco} vazio="Nenhum projeto acima dos limiares." /></Fold>
      <Fold titulo="Equipe" resumo="tarefas abertas por responsável · carga, não desempenho">
        <table className="tbl"><thead><tr><th>Responsável</th><th>Abertas</th><th>Atrasadas</th><th>Hoje + 7 dias</th><th>Sem prazo</th></tr></thead><tbody>
          {p.porPessoa.map((r) => <tr key={r.rotulo}><td>{r.rotulo}</td><td><Link className="underline" href={urlCom("/tarefas", {}, { resp: r.rotulo })}>{r.abertas}</Link></td><td>{r.vencidas ? <Link className="num-relevante underline" href={urlCom("/tarefas", {}, { resp: r.rotulo, prazo: "atrasadas" })}>{r.vencidas}</Link> : 0}</td><td>{r.d7}</td><td className="text-[var(--muted)]">{r.semPrazo}</td></tr>)}
        </tbody></table>
      </Fold>
      <Fold titulo="Projetos ativos por etapa e evolução" resumo={`${ativos} ativos · ${p.encerrados} encerrados`}>
        <div className="grid gap-4 md:grid-cols-2">
          <table className="tbl"><tbody>{p.projetosAtivos.map((r) => <tr key={r.rotulo}><td>{r.rotulo}</td><td className="text-right font-semibold">{r.valor}</td></tr>)}</tbody></table>
          <p className="text-sm text-[var(--muted)]">{d.cargaAnterior ? `Carga anterior: ${d.cargaAnterior.id} de ${fmt(d.cargaAnterior.data_carga)}. Comparativo detalhado entra quando houver duas cargas com o mesmo layout.` : "Evolução entre cargas: sem informação disponível — só existe uma carga de operação aceita."}</p>
        </div>
      </Fold>
      <Fold titulo="Entregas" resumo={`atrasadas e próximos ${periodo} dias · só ${pct(p.comFim, p.total)}% das tarefas têm prazo`}><TabelaTarefas tarefas={d.entregas} mostrarResponsavel vazio="Nenhuma entrega na janela." /></Fold>
      <Nota itens={[...p.limitacoes.map((l) => l.descricao.replace(/\.$/, "")), `${pct(p.comFim, p.total)}% das tarefas têm prazo · ${pct(p.comResp, p.total)}% têm responsável`, "agenda, reuniões e espera por cliente: Fases 3 e 4", "Vobi · somente leitura"]} />
    </div>
  );
}
