import Link from "next/link";
import { exigirUsuario } from "@/lib/auth";
import { linkVobiProjeto, selo } from "@/lib/consultas";
import { STATUS_PRAZO, rotuloCurto } from "@/lib/prazo";
import { urlCom } from "@/lib/listas";
import {
  CADENCIA_AVISO_DIAS, ETAPAS_ENTREGA, PERIODOS, RISCO_REFACAO_FRACAO,
  meuDiaArquiteta, meuDiaCoordenacao, meuDiaGerencia, type ContextoCarga, type Contagens, type Periodo, type ProjetoResumo, type TarefaResumo,
} from "@/lib/servicos/meu-dia";
import { Selo } from "@/components/Selo";
import { Ajuda, Badge, Card, Empty, LinkButton, PageHeader, Stat } from "@/components/ui";

/**
 * Central de Trabalho / Meu Dia — hierarquia aprovada em T-196: saudação → atualização dos dados → alertas e decisões →
 * indicadores (clicáveis) → prazos e entregas → projetos a acompanhar → listas operacionais → limitações.
 * Camada visual apenas: números vêm de src/lib/servicos/meu-dia.ts; prazos pela regra única de src/lib/prazo.ts.
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
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function saudacao(nome: string, hoje: string) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date()));
  const s = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const d = new Date(hoje + "T12:00:00Z");
  return { titulo: `${s}, ${nome.split(" ")[0]}`, data: `${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}` };
}

function Cabecalho({ nome, perfil, ctx, periodo }: { nome: string; perfil: string; ctx: ContextoCarga; periodo: Periodo }) {
  const s = saudacao(nome, ctx.hoje);
  return (
    <>
      <PageHeader eyebrow="Architecture 360 · Central de Trabalho" title={s.titulo}
        subtitle={<>{perfil} · {s.data} · dados do Vobi exportados em <b>{fmt(ctx.carga.dataCarga)}</b> (carga {ctx.carga.id}{ctx.carga.confirmadoEm ? `, importada em ${ctx.carga.confirmadoEm.toLocaleDateString("pt-BR")}` : ""}) · prazos comparados com hoje <Ajuda texto="Os prazos são avaliados pela data de hoje (fuso de Brasília). Tarefas concluídas ou replanejadas no Vobi depois da exportação ainda aparecem com a situação antiga até a próxima carga." /> <Badge tone="neutral">Vobi · somente leitura</Badge></>}
        actions={<nav aria-label="Período" className="seg">{PERIODOS.map((p) => <Link key={p} href={p === 7 ? "/meu-dia" : `/meu-dia?periodo=${p}`} aria-current={periodo === p ? "page" : undefined}>{p} dias</Link>)}</nav>} />
      {ctx.desatualizado && (
        <div className="leitura mb-4"><b>Atenção</b>Dados com <b>{ctx.idadeDias} dias</b>. A cadência combinada é de duas cargas por semana (aviso acima de {CADENCIA_AVISO_DIAS} dias) — peça uma nova exportação do Vobi em <Link className="underline" href="/importacao">Importação</Link>.</div>
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

/** Indicadores clicáveis (abrem /tarefas filtrada). `base` = filtros fixos (ex.: responsável). */
function Kpis({ c, periodo, base, cob }: { c: Contagens; periodo: Periodo; base: Record<string, string | number>; cob: { comPrazo: number; total: number; carga: { id: number; dataCarga: string } } }) {
  const l = (prazo: string, extra: Record<string, string | number | boolean> = {}) => urlCom("/tarefas", base, { prazo, ...extra });
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Stat label="Atrasadas" value={c.atrasadas} tone={c.atrasadas ? "bad" : "ok"} source="calc" href={l("atrasadas")}
        note={<>&gt;30 d: <Link className="underline" href={l("atrasada_30")}>{c.a30}</Link> · 8–30: <Link className="underline" href={l("atrasada_8_30")}>{c.a8}</Link> · 1–7: <Link className="underline" href={l("atrasada_1_7")}>{c.a1}</Link></>} />
      <Stat label="Vencem hoje" value={c.hoje} tone={c.hoje ? "warn" : "neutral"} source="calc" href={l("hoje")} note={`de ${cob.comPrazo} tarefas com prazo (${cob.total ? Math.round((cob.comPrazo / cob.total) * 100) : 0}%)`} />
      <Stat label={`Vencem em ${periodo} dias`} value={c.periodo} tone={c.periodo ? "warn" : "neutral"} source="calc" href={l("abertas", { janela: periodo })} note={<>{c.hoje} hoje · {c.entregasPeriodo} são entregas <Ajuda texto={`Entrega = tarefa das etapas ${ETAPAS_ENTREGA.join(", ")}.`} /></>} />
      <Stat label="No prazo" value={c.noPrazo} tone="ok" source="calc" href={l("no_prazo")} note="prazo além de 7 dias" />
      <Stat label="Sem prazo" value={c.semPrazo} tone="neutral" source="calc" href={l("sem_prazo")} note="limitação da fonte, não é 'no prazo'" />
    </div>
  );
}

function TabelaTarefas({ tarefas, mostrarResponsavel, vazio, verTudo }: { tarefas: TarefaResumo[]; mostrarResponsavel?: boolean; vazio: string; verTudo?: string }) {
  if (!tarefas.length) return <Empty>{vazio}</Empty>;
  return (
    <>
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
              {mostrarResponsavel && <td>{t.responsavel ?? <span className="text-[var(--muted)]" title="O Vobi não informa responsável">sem responsável</span>}</td>}
              <td className="whitespace-nowrap"><a className="text-xs underline" href={linkVobiProjeto(t.projetoCodigo)} target="_blank" rel="noreferrer">Vobi ↗</a></td>
            </tr>
          );
        })}</tbody>
      </table></div>
      {verTudo && <div className="mt-2 text-right text-[0.8rem]"><Link className="font-semibold text-[var(--vinho)]" href={verTudo}>ver todas →</Link></div>}
    </>
  );
}

function TabelaProjetos({ projetos, motivos, vazio, verTudo, compacta }: { projetos: ProjetoResumo[]; motivos?: boolean; vazio: string; verTudo?: string; compacta?: boolean }) {
  if (!projetos.length) return <Empty>{vazio}</Empty>;
  if (compacta) return (
    <>
      <table className="tbl"><thead><tr><th>Projeto · cliente</th><th>Atrasadas</th><th>Por quê</th></tr></thead>
        <tbody>{projetos.map((p) => (
          <tr key={p.codigo}>
            <td><Link className="ent" href={`/projetos/${p.codigo}`}>{p.nome}</Link><span className="sub">{p.cliente ?? (p.vinculo === "ambiguo" ? "cliente ambíguo" : "sem cliente associado")}</span></td>
            <td>{p.atrasadas ? <Link className="num-relevante font-semibold underline" href={urlCom("/tarefas", {}, { projeto: p.codigo, prazo: "atrasadas" })}>{p.atrasadas}</Link> : <span className="text-[var(--muted)]">0</span>}</td>
            <td className="text-xs text-[var(--txt-2)]">{p.motivos.filter((m) => !m.includes("sem responsável")).join(" · ")}</td>
          </tr>
        ))}</tbody></table>
      {verTudo && <div className="mt-2 text-right text-[0.8rem]"><Link className="font-semibold text-[var(--vinho)]" href={verTudo}>ver todos →</Link></div>}
    </>
  );
  return (
    <>
      <div className="overflow-x-auto"><table className="tbl">
        <thead><tr><th>Projeto</th><th>Cliente</th><th>Status</th><th>Abertas</th><th>Atrasadas</th><th>Próximo prazo</th>{motivos && <th>Por quê</th>}<th></th></tr></thead>
        <tbody>{projetos.map((p) => (
          <tr key={p.codigo}>
            <td><Link className="ent" href={`/projetos/${p.codigo}`}>{p.nome}</Link></td>
            <td>{p.cliente ?? <span className="text-xs text-[var(--muted)]">{p.vinculo === "ambiguo" ? "cliente ambíguo" : "sem cliente associado"}</span>}</td>
            <td><Badge tone={p.statusClasse === "pausado" ? "warn" : "ok"}>{p.status}</Badge></td>
            <td><Link className="underline" href={urlCom("/tarefas", {}, { projeto: p.codigo })}>{p.abertas}</Link></td>
            <td>{p.atrasadas ? <Link className="num-relevante font-semibold underline" href={urlCom("/tarefas", {}, { projeto: p.codigo, prazo: "atrasadas" })}>{p.atrasadas}</Link> : <span className="text-[var(--muted)]">0</span>}</td>
            <td className="whitespace-nowrap">{p.proximoPrazo ? <>{fmt(p.proximoPrazo)}<span className="sub">{p.proximaEtapa}</span></> : <span className="text-[var(--muted)]">sem prazo aberto</span>}</td>
            {motivos && <td className="text-xs text-[var(--txt-2)]">{p.motivos.join(" · ")}</td>}
            <td className="whitespace-nowrap"><a className="text-xs underline" href={linkVobiProjeto(p.codigo)} target="_blank" rel="noreferrer">Vobi ↗</a></td>
          </tr>
        ))}</tbody>
      </table></div>
      {verTudo && <div className="mt-2 text-right text-[0.8rem]"><Link className="font-semibold text-[var(--vinho)]" href={verTudo}>ver todos →</Link></div>}
    </>
  );
}

function Limitacoes({ itens }: { itens: string[] }) {
  return <p className="card espera px-4 py-3 text-[0.78rem] text-[var(--muted)]"><b className="text-[var(--txt-2)]">Limitações desta carga:</b> {itens.join(" · ")}.</p>;
}

// ---------------------------------------------------------------------------
async function Arquiteta({ email, nome, periodo }: { email: string; nome: string; periodo: Periodo }) {
  const d = await meuDiaArquiteta(email, periodo);
  if (!d) return <SemCarga />;
  const { ctx } = d;
  const base = { resp: d.nomes[0] ?? "" };
  return (
    <div className="flex flex-col gap-4">
      <Cabecalho nome={nome} perfil="Arquiteta" ctx={ctx} periodo={periodo} />
      {!d.associacao || !d.cont ? (
        <div className="leitura"><b>Associação</b>Seu e-mail ({email}) ainda não está ligado a um nome do Vobi em Pessoas, então nada é inferido. Peça à gestão o mapeamento e esta página passará a mostrar seus projetos e tarefas.</div>
      ) : (
        <>
          <Kpis c={d.cont} periodo={periodo} base={base} cob={{ comPrazo: d.cont.abertas - d.cont.semPrazo, total: d.cont.abertas, carga: ctx.carga }} />
          <Card title={`Prazos e entregas · atrasadas e próximos ${periodo} dias`} subtitle="Em ordem de prazo. A ação acontece no Vobi; aqui é só a leitura.">
            <TabelaTarefas tarefas={d.atencao} vazio={`Nada atrasado nem com prazo nos próximos ${periodo} dias.`} verTudo={urlCom("/tarefas", base, { prazo: "abertas", ate: periodo })} />
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Meus projetos" subtitle={<>Ativos em que você é colaboradora no Vobi ou tem tarefa aberta como responsável ({d.nomes.join(", ")}).</>}>
              <TabelaProjetos projetos={d.projetos} vazio="Nenhum projeto ativo associado a você nesta carga." />
            </Card>
            <Card title={`Entregas · atrasadas e próximos ${periodo} dias`} subtitle={<>Tarefas das etapas de entrega <Ajuda texto={ETAPAS_ENTREGA.join(", ")} /></>}>
              <TabelaTarefas tarefas={d.entregas} vazio="Nenhuma entrega na janela." verTudo={urlCom("/tarefas", base, { prazo: "abertas", ate: periodo, entregas: true })} />
            </Card>
          </div>
          <Limitacoes itens={[`${d.cont.semPrazo} de ${d.cont.abertas} tarefas suas sem prazo no Vobi`, "agenda e reuniões: Fase 3 (Google Calendar)", "espera por cliente: Fase 4 (atas)", "arquivos: na aba Arquivos do projeto no Vobi"]} />
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
  return (
    <div className="flex flex-col gap-4">
      <Cabecalho nome={nome} perfil="Coordenação" ctx={ctx} periodo={periodo} />

      <Card title="Decidir agora" subtitle="Pendências que só a coordenação ou a gestão resolvem, na própria tela indicada. Nada disso altera o Vobi.">
        <ul className="grid gap-2 text-[0.86rem]">
          <li className="flex items-start gap-2"><span className="tag-solid decisao mt-0.5">Decisão</span><span>{d.decisoes.ambiguos} projeto(s) com cliente ambíguo → <Link className="underline" href="/clientes#fila">fila de vínculo em Clientes</Link></span></li>
          <li className="flex items-start gap-2"><span className="tag-solid dados mt-0.5">Dados</span><span>{d.decisoes.etapasNaoMapeadas} etapa(s) do Vobi não classificadas no fluxo → <Link className="underline" href="/qualidade">Qualidade dos dados</Link>{d.decisoes.orfas > 0 && <> · {d.decisoes.orfas} tarefa(s) sem projeto resolvido</>}</span></li>
          <li className="flex items-start gap-2"><span className="tag-solid mt-0.5">Pessoas</span><span>{d.decisoes.pessoasSemEmail} pessoa(s) do Vobi sem e-mail Rucelle → <Link className="underline" href="/pessoas">Pessoas</Link></span></li>
        </ul>
      </Card>

      <Kpis c={cont} periodo={periodo} base={{}} cob={{ comPrazo: p.comFim, total: p.total, carga: ctx.carga }} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <Card title={`Prazos e entregas · atrasadas e próximos ${periodo} dias`} subtitle="Por prazo. Responsável ausente é limitação da fonte, não falha de alguém.">
          <TabelaTarefas tarefas={d.atencao} mostrarResponsavel vazio="Nada atrasado nem com prazo na janela." verTudo={urlCom("/tarefas", {}, { prazo: "abertas", ate: periodo })} />
        </Card>
        <Card title="Projetos que exigem acompanhamento" subtitle={<>Alguma tarefa atrasada ou ≥ {Math.round(RISCO_REFACAO_FRACAO * 100)}% das horas em Refação. Sinal para olhar, não conclusão. <Ajuda texto="Tarefas sem responsável não contam como risco: metade das tarefas do Vobi não tem responsável." /></>}>
          <TabelaProjetos projetos={d.risco.slice(0, 8)} compacta vazio="Nenhum projeto acima dos limiares." verTudo="/projetos?situacao=acompanhar" />
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Equipe · tarefas abertas por responsável" subtitle={<>Carga de trabalho como fato importado, não desempenho <Ajuda texto="Volume sem complexidade, dependências e horas não compara pessoas. Uso: contextualizar carga e distribuição." /></>}>
          <table className="tbl"><thead><tr><th>Responsável</th><th>Abertas</th><th>Atrasadas</th><th>Hoje + 7 dias</th><th>Sem prazo</th></tr></thead><tbody>
            {p.porPessoa.map((r) => <tr key={r.rotulo}><td>{r.rotulo}</td><td><Link className="underline" href={urlCom("/tarefas", {}, { resp: r.rotulo })}>{r.abertas}</Link></td><td>{r.vencidas ? <Link className="num-relevante underline" href={urlCom("/tarefas", {}, { resp: r.rotulo, prazo: "atrasadas" })}>{r.vencidas}</Link> : 0}</td><td>{r.d7}</td><td className="text-[var(--muted)]">{r.semPrazo}</td></tr>)}
            {!p.porPessoa.length && <tr><td colSpan={5} className="text-[var(--muted)]">nenhuma</td></tr>}</tbody></table>
          <Selo s={selo(p.comResp, p.total, ctx.carga)} rotulo="tarefas com responsável" />
        </Card>
        <Card title="Gargalos por etapa" subtitle="Tarefas abertas e atrasadas por etapa do fluxo.">
          <table className="tbl"><thead><tr><th>Etapa</th><th>Abertas</th><th>Atrasadas</th></tr></thead><tbody>
            {p.porEtapa.map((r) => <tr key={r.rotulo}><td>{r.rotulo}</td><td><Link className="underline" href={urlCom("/tarefas", {}, { etapa: r.rotulo })}>{r.abertas}</Link></td><td>{r.vencidas ? <Link className="num-relevante underline" href={urlCom("/tarefas", {}, { etapa: r.rotulo, prazo: "atrasadas" })}>{r.vencidas}</Link> : 0}</td></tr>)}</tbody></table>
        </Card>
      </div>

      <Card title={`Entregas · atrasadas e próximos ${periodo} dias`} subtitle={<>Tarefas das etapas de entrega <Ajuda texto={ETAPAS_ENTREGA.join(", ")} /></>}>
        <TabelaTarefas tarefas={d.entregas} mostrarResponsavel vazio="Nenhuma entrega na janela." verTudo={urlCom("/tarefas", {}, { prazo: "abertas", ate: periodo, entregas: true })} />
      </Card>

      <Limitacoes itens={[`${p.total - p.comFim} de ${p.total} tarefas sem prazo (${p.total ? Math.round(((p.total - p.comFim) / p.total) * 100) : 0}%)`, `${p.total - p.comResp} sem responsável`, "agenda da equipe e conflitos: Fase 3", "espera por cliente ou decisão: Fase 4", "Vobi é a fonte oficial e não é alterado daqui"]} />
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
    <div className="flex flex-col gap-4">
      <Cabecalho nome={nome} perfil="Gerência" ctx={ctx} periodo={periodo} />

      <Card title="Decisões que exigem a gerência" subtitle="Itens que não são operação do dia a dia.">
        <ul className="grid gap-2 text-[0.86rem]">
          <li className="flex items-start gap-2"><span className={`tag-solid mt-0.5 ${ctx.desatualizado ? "dados" : "ok"}`}>Dados</span><span>{ctx.desatualizado ? <><b>Dados com {ctx.idadeDias} dias</b> — nova exportação do Vobi pendente (cadência: 2× por semana).</> : <>Dados com {ctx.idadeDias} dia(s) — dentro da cadência combinada (2× por semana).</>}</span></li>
          <li className="flex items-start gap-2"><span className="tag-solid decisao mt-0.5">Acesso</span><span>{d.usuarios.total} usuário(s) ativo(s) — {d.usuarios.gestao} gestão/coordenação, {d.usuarios.arquitetas} arquiteta(s). Piloto com arquitetas depende da validação da gerência e coordenação.</span></li>
          <li className="flex items-start gap-2"><span className="tag-solid decisao mt-0.5">Clientes</span><span>{d.decisoes.ambiguos} vínculo(s) ambíguo(s) aguardando a coordenação → <Link className="underline" href="/clientes#fila">Clientes</Link></span></li>
          <li className="flex items-start gap-2"><span className="tag-solid mt-0.5">Pessoas</span><span>{d.decisoes.pessoasSemEmail} pessoa(s) do Vobi sem e-mail Rucelle (afeta o &ldquo;Meu dia&rdquo; das arquitetas) → <Link className="underline" href="/pessoas">Pessoas</Link></span></li>
        </ul>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Projetos ativos" value={ativos} source="meta" href="/projetos" note={`${p.encerrados} encerrados`} />
        <Stat label="Atrasadas" value={cont.atrasadas} tone={cont.atrasadas ? "bad" : "ok"} source="calc" href="/tarefas?prazo=atrasadas" note={<Selo s={selo(p.comFim, p.total, ctx.carga)} rotulo="tarefas com prazo" />} />
        <Stat label={`Vencem em ${periodo} dias`} value={cont.periodo} tone={cont.periodo ? "warn" : "neutral"} source="calc" href={urlCom("/tarefas", {}, { janela: periodo })} note={`${cont.hoje} hoje · ${cont.entregasPeriodo} são entregas`} />
        <Stat label="Horas em Refação" value={`${pct(p.horas.refacaoMin, p.horas.totalMin)}%`} source="calc" note={<Selo s={selo(p.horas.comHoras, p.total, ctx.carga)} rotulo="tarefas com horas lançadas" />} />
        <Stat label="Exigem acompanhamento" value={d.risco.length} tone={d.risco.length ? "warn" : "ok"} source="calc" href="/projetos?situacao=acompanhar" note={`de ${d.projetos.length} projetos ativos`} />
      </div>

      <Card title={<>Riscos e gargalos <Badge tone="info">calculados · não são conclusões</Badge></>}
        subtitle="Sinais derivados dos dados importados. Não viram tarefas nem cobranças; quantidade não é produtividade, atraso não é desempenho e refação não é culpa.">
        {d.recomendacoes.length ? (
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Tema</th><th>Sinal</th><th>Leitura sugerida</th><th>Cuidado</th></tr></thead><tbody>
            {d.recomendacoes.map((r, i) => <tr key={i}><td className="whitespace-nowrap font-semibold">{r.tema}</td><td>{r.sinal}</td><td className="text-[var(--txt-2)]">{r.leitura}</td><td className="text-[0.76rem] text-[var(--muted)]">{r.cuidado}</td></tr>)}
          </tbody></table></div>
        ) : <Empty>Nenhum sinal acima dos limiares nesta carga.</Empty>}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <Card title={`Entregas · atrasadas e próximos ${periodo} dias`} subtitle={<>Tarefas das etapas de entrega. Ressalva: só {pct(p.comFim, p.total)}% das tarefas têm prazo no Vobi. <Ajuda texto={ETAPAS_ENTREGA.join(", ")} /></>}>
          <TabelaTarefas tarefas={d.entregas.slice(0, 12)} mostrarResponsavel vazio="Nenhuma entrega na janela." verTudo={urlCom("/tarefas", {}, { prazo: "abertas", ate: periodo, entregas: true })} />
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="Projetos ativos por etapa do fluxo">
            <table className="tbl"><tbody>{p.projetosAtivos.map((r) => <tr key={r.rotulo}><td>{r.rotulo}</td><td className="text-right font-semibold">{r.valor}</td></tr>)}</tbody></table>
          </Card>
          <Card title="Evolução entre cargas">
            {d.cargaAnterior ? <p className="text-sm text-[var(--txt-2)]">Carga anterior: {d.cargaAnterior.id} de {fmt(d.cargaAnterior.data_carga)}. O comparativo detalhado entra quando houver duas cargas com o mesmo layout.</p>
              : <p className="text-sm text-[var(--muted)]">Sem informação disponível — só existe uma carga de operação aceita; a evolução aparece a partir da segunda.</p>}
          </Card>
        </div>
      </div>

      <Card title="Projetos que exigem acompanhamento" subtitle={`Alguma tarefa atrasada ou ≥ ${Math.round(RISCO_REFACAO_FRACAO * 100)}% das horas em Refação; tarefas sem responsável não contam.`}>
        <TabelaProjetos projetos={d.risco.slice(0, 10)} motivos vazio="Nenhum projeto acima dos limiares." verTudo="/projetos?situacao=acompanhar" />
      </Card>

      <Limitacoes itens={[...p.limitacoes.map((l) => l.descricao.replace(/\.$/, "")), "agenda, reuniões e espera por cliente: Fases 3 e 4"]} />
    </div>
  );
}
