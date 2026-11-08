import Link from "next/link";
import { exigirUsuario } from "@/lib/auth";
import { linkVobiProjeto, selo } from "@/lib/consultas";
import {
  CADENCIA_AVISO_DIAS, ETAPAS_ENTREGA, JANELA_ENTREGAS_DIAS, RISCO_REFACAO_FRACAO,
  meuDiaArquiteta, meuDiaCoordenacao, meuDiaGerencia, type ContextoCarga, type ProjetoResumo, type TarefaResumo,
} from "@/lib/servicos/meu-dia";
import { Selo } from "@/components/Selo";
import { Alert, Badge, Card, Empty, LinkButton, PageHeader, Stat } from "@/components/ui";

/**
 * Central de Trabalho / Meu Dia (Fase 2). Camada visual apenas: todos os números vêm de src/lib/servicos/meu-dia.ts.
 * Sem ranking, nota ou cobrança; blocos sem fonte aparecem como indisponíveis; cada bloco diz a data dos dados.
 */
export default async function MeuDiaPage() {
  const u = await exigirUsuario();
  if (u.perfil === "arquiteta") return <Arquiteta email={u.email} nome={u.nome} />;
  if (u.perfil === "coordenacao") return <Coordenacao />;
  return <Gerencia />;
}

const fmt = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const TOM_SIT: Record<TarefaResumo["situacao"], "ok" | "warn" | "bad" | "info" | "neutral"> = { vencida: "bad", hoje: "warn", d7: "warn", d14: "info", futura: "neutral", sem_prazo: "neutral" };
const ROT_SIT: Record<TarefaResumo["situacao"], string> = { vencida: "vencida", hoje: "hoje", d7: "até 7 dias", d14: "até 14 dias", futura: "futura", sem_prazo: "sem prazo" };

function Cabecalho({ titulo, ctx, extra }: { titulo: string; ctx: ContextoCarga; extra?: React.ReactNode }) {
  return (
    <>
      <PageHeader eyebrow="Architecture 360 · Central de Trabalho" title={titulo}
        subtitle={<>Dados do Vobi exportados em <b>{fmt(ctx.carga.dataCarga)}</b> (carga {ctx.carga.id}{ctx.carga.confirmadoEm ? `, importada em ${ctx.carga.confirmadoEm.toLocaleDateString("pt-BR")}` : ""}) · prazos comparados com hoje, {fmt(ctx.hoje)}. Tarefas concluídas no Vobi depois da exportação ainda aparecem abertas. <Badge tone="neutral">Vobi · somente leitura</Badge></>}
        actions={<div className="flex gap-2"><LinkButton href="/panorama">Panorama</LinkButton>{extra}</div>} />
      {ctx.desatualizado && (
        <Alert kind="warn"><span><b>Dados com {ctx.idadeDias} dias.</b> A cadência combinada é de duas cargas por semana (aviso acima de {CADENCIA_AVISO_DIAS} dias). Peça uma nova exportação do Vobi em <Link className="underline" href="/importacao">Importação</Link>.</span></Alert>
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

function Indisponivel({ titulo, motivo }: { titulo: string; motivo: string }) {
  return (
    <div className="rounded-[12px] border border-dashed border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-[0.82rem] text-[var(--muted)]">
      <span className="font-semibold">{titulo}</span> · sem informação disponível — {motivo}
    </div>
  );
}

function TabelaTarefas({ tarefas, mostrarResponsavel, vazio }: { tarefas: TarefaResumo[]; mostrarResponsavel?: boolean; vazio: string }) {
  if (!tarefas.length) return <Empty>{vazio}</Empty>;
  return (
    <div className="overflow-x-auto"><table className="tbl">
      <thead><tr><th>Prazo</th><th>Tarefa</th><th>Etapa</th><th>Projeto · cliente</th>{mostrarResponsavel && <th>Responsável</th>}<th>Status</th><th></th></tr></thead>
      <tbody>{tarefas.map((t) => (
        <tr key={t.chave}>
          <td className="whitespace-nowrap"><Badge tone={TOM_SIT[t.situacao]}>{fmt(t.dataFim)}</Badge> <span className="text-xs text-[var(--muted)]">{ROT_SIT[t.situacao]}</span></td>
          <td>{t.nome}</td><td>{t.etapa}</td>
          <td><Link className="underline" href={`/projetos/${t.projetoCodigo}`}>{t.projetoNome}</Link>{t.cliente && <div className="text-xs text-[var(--muted)]">{t.cliente}</div>}</td>
          {mostrarResponsavel && <td>{t.responsavel ?? <span className="text-[var(--muted)]">sem responsável</span>}</td>}
          <td>{t.status}</td>
          <td className="whitespace-nowrap"><a className="text-xs underline" href={linkVobiProjeto(t.projetoCodigo)} target="_blank" rel="noreferrer">Vobi ↗</a></td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

function TabelaProjetos({ projetos, motivos, vazio }: { projetos: (ProjetoResumo & { motivos?: string[] })[]; motivos?: boolean; vazio: string }) {
  if (!projetos.length) return <Empty>{vazio}</Empty>;
  return (
    <div className="overflow-x-auto"><table className="tbl">
      <thead><tr><th>Projeto</th><th>Cliente</th><th>Status</th><th>Abertas</th><th>Vencidas</th><th>Próximo prazo</th>{motivos && <th>Por quê</th>}<th></th></tr></thead>
      <tbody>{projetos.map((p) => (
        <tr key={p.codigo}>
          <td><Link className="font-semibold text-[var(--vinho)] underline" href={`/projetos/${p.codigo}`}>{p.nome}</Link></td>
          <td>{p.cliente ?? <span className="text-xs text-[var(--muted)]">{p.vinculo === "ambiguo" ? "cliente ambíguo" : "sem cliente associado"}</span>}</td>
          <td><Badge tone={p.statusClasse === "pausado" ? "warn" : "ok"}>{p.status}</Badge></td>
          <td>{p.abertas}</td><td className={p.vencidas ? "font-semibold text-[var(--warn)]" : ""}>{p.vencidas}</td>
          <td className="whitespace-nowrap">{p.proximoPrazo ? <>{fmt(p.proximoPrazo)} <span className="text-xs text-[var(--muted)]">{p.proximaEtapa}</span></> : <span className="text-[var(--muted)]">sem prazo aberto</span>}</td>
          {motivos && <td className="text-xs text-[var(--txt-2)]">{p.motivos?.join(" · ")}</td>}
          <td className="whitespace-nowrap"><a className="text-xs underline" href={linkVobiProjeto(p.codigo)} target="_blank" rel="noreferrer">Vobi ↗</a></td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

// ---------------------------------------------------------------------------
async function Arquiteta({ email, nome }: { email: string; nome: string }) {
  const d = await meuDiaArquiteta(email);
  if (!d) return <SemCarga />;
  const { ctx } = d;
  return (
    <div className="flex flex-col gap-5">
      <Cabecalho titulo={`Meu dia · ${nome.split(" ")[0]}`} ctx={ctx} />
      {!d.associacao ? (
        <Alert kind="info"><span><b>Sem associação confiável com o Vobi.</b> Seu e-mail ({email}) ainda não está ligado a um nome do Vobi em Pessoas. Nada é inferido: peça à gestão para fazer o mapeamento e esta página passará a mostrar seus projetos e tarefas.</span></Alert>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Vencidas" value={d.resumo.vencidas} tone={d.resumo.vencidas ? "bad" : "ok"} source="calc" note={<Selo s={selo(d.resumo.abertas - d.resumo.semPrazo, d.resumo.abertas, ctx.carga)} rotulo="minhas tarefas abertas com prazo" />} />
            <Stat label="Vencem até 7 dias" value={d.resumo.d7} tone={d.resumo.d7 ? "warn" : "neutral"} source="calc" note={`inclui ${d.resumo.hoje} para hoje`} />
            <Stat label="Tarefas abertas" value={d.resumo.abertas} note={`${d.resumo.semPrazo} sem prazo no Vobi`} />
            <Stat label="Meus projetos ativos" value={d.projetos.length} note={`como responsável ou colaboradora (${d.nomes.join(", ")})`} />
          </div>
          <Card title="Precisa de atenção" subtitle="Tarefas vencidas ou com prazo até 7 dias, em ordem de prazo. A ação acontece no Vobi; aqui é só a leitura.">
            <TabelaTarefas tarefas={d.tarefas.filter((t) => ["vencida", "hoje", "d7"].includes(t.situacao))} vazio="Nada vencido nem para os próximos 7 dias." />
          </Card>
          <Card title="Meus projetos" subtitle="Projetos ativos em que você é colaboradora no Vobi ou tem tarefa aberta como responsável.">
            <TabelaProjetos projetos={d.projetos} vazio="Nenhum projeto ativo associado a você nesta carga." />
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title={`Próximas entregas (${JANELA_ENTREGAS_DIAS} dias)`} subtitle={`Tarefas das etapas ${ETAPAS_ENTREGA.join(", ")} com prazo na janela.`}>
              <TabelaTarefas tarefas={d.entregas} vazio="Nenhuma entrega na janela." />
            </Card>
            <Card title="Demais tarefas abertas" subtitle="Com prazo além de 7 dias ou sem prazo no Vobi.">
              <TabelaTarefas tarefas={d.tarefas.filter((t) => !["vencida", "hoje", "d7"].includes(t.situacao))} vazio="Nenhuma." />
            </Card>
          </div>
        </>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <Indisponivel titulo="Agenda de hoje e reuniões" motivo="integração com o Google Calendar prevista na Fase 3." />
        <Indisponivel titulo="Aguardando cliente ou terceiros" motivo="registro de reuniões e atas previsto na Fase 4; o Vobi não exporta esse dado." />
        <Indisponivel titulo="Arquivos do projeto" motivo="o CSV do Vobi não traz a pasta; use a aba Arquivos do projeto no Vobi." />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
async function Coordenacao() {
  const d = await meuDiaCoordenacao();
  if (!d || !d.panorama) return <SemCarga />;
  const { ctx, panorama: p } = d;
  return (
    <div className="flex flex-col gap-5">
      <Cabecalho titulo="Meu dia · Coordenação" ctx={ctx} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Tarefas abertas vencidas" value={d.prazosHoje.vencidas} tone={d.prazosHoje.vencidas ? "bad" : "ok"} source="calc" note={<Selo s={selo(p.comFim, p.total, ctx.carga)} rotulo="tarefas com prazo" />} />
        <Stat label="Vencem até 7 dias" value={d.prazosHoje.d7} tone={d.prazosHoje.d7 ? "warn" : "neutral"} source="calc" />
        <Stat label="Projetos que exigem acompanhamento" value={d.risco.length} tone={d.risco.length ? "warn" : "ok"} source="calc" note={`de ${d.projetos.length} ativos`} href="#acompanhamento" />
        <Stat label="Decisões pendentes" value={d.decisoes.ambiguos + d.decisoes.etapasNaoMapeadas + d.decisoes.pessoasSemEmail} tone="info" note="vínculos, etapas e pessoas" href="#decisoes" />
      </div>

      <Card id="decisoes" title="Decidir agora" subtitle="Pendências que só a coordenação ou a gestão resolvem, na própria tela indicada. Nada disso altera o Vobi.">
        <ul className="grid gap-2 text-[0.88rem]">
          <li>{d.decisoes.ambiguos} projeto(s) com cliente ambíguo → <Link className="underline" href="/clientes#fila">fila de vínculo em Clientes</Link></li>
          <li>{d.decisoes.etapasNaoMapeadas} etapa(s) do Vobi ainda não classificadas no fluxo → <Link className="underline" href="/qualidade">Qualidade dos dados</Link></li>
          <li>{d.decisoes.pessoasSemEmail} pessoa(s) do Vobi sem e-mail Rucelle → <Link className="underline" href="/pessoas">Pessoas</Link></li>
          {d.decisoes.orfas > 0 && <li>{d.decisoes.orfas} tarefa(s) sem projeto resolvido → <Link className="underline" href="/qualidade">Qualidade dos dados</Link></li>}
        </ul>
      </Card>

      <Card id="acompanhamento" title="Projetos que exigem acompanhamento"
        subtitle={`Regra: alguma tarefa vencida ou ≥ ${Math.round(RISCO_REFACAO_FRACAO * 100)}% das horas em Refação. Tarefas sem responsável não contam como risco (metade das tarefas do Vobi não tem responsável). É sinal para olhar, não conclusão.`}>
        <TabelaProjetos projetos={d.risco} motivos vazio="Nenhum projeto acima dos limiares." />
      </Card>

      <Card title={`Entregas nos próximos ${JANELA_ENTREGAS_DIAS} dias (e vencidas)`} subtitle={`Tarefas das etapas ${ETAPAS_ENTREGA.join(", ")}, por prazo.`}>
        <TabelaTarefas tarefas={d.entregas} mostrarResponsavel vazio="Nenhuma entrega na janela." />
        <Selo s={selo(p.comFim, p.total, ctx.carga)} rotulo="tarefas com prazo" />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Equipe · tarefas abertas por responsável" subtitle="Carga de trabalho como fato importado, não desempenho: volume sem complexidade, dependências e horas não compara pessoas.">
          <table className="tbl"><thead><tr><th>Responsável</th><th>Abertas</th><th>Vencidas</th><th>7 dias</th></tr></thead><tbody>
            {p.porPessoa.map((r) => <tr key={r.rotulo}><td>{r.rotulo}</td><td>{r.abertas}</td><td>{r.vencidas}</td><td>{r.d7}</td></tr>)}
            {!p.porPessoa.length && <tr><td colSpan={4} className="text-[var(--muted)]">nenhuma</td></tr>}</tbody></table>
          <Selo s={selo(p.comResp, p.total, ctx.carga)} rotulo="tarefas com responsável" />
          <p className="mt-1 text-xs text-[var(--muted)]">Prazos desta tabela avaliados na data da exportação ({fmt(ctx.carga.dataCarga)}).</p>
        </Card>
        <Card title="Gargalos por etapa" subtitle="Tarefas abertas e vencidas por etapa do fluxo.">
          <table className="tbl"><thead><tr><th>Etapa</th><th>Abertas</th><th>Vencidas</th></tr></thead><tbody>
            {p.porEtapa.map((r) => <tr key={r.rotulo}><td>{r.rotulo}</td><td>{r.abertas}</td><td>{r.vencidas}</td></tr>)}</tbody></table>
        </Card>
      </div>

      <Card title="Todos os projetos ativos" subtitle="Com cliente, tarefas abertas, vencidas e próximo prazo. Ordem: mais vencidas primeiro.">
        <TabelaProjetos projetos={d.projetos} vazio="Nenhum projeto ativo." />
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Indisponivel titulo="Agenda da equipe e conflitos de reunião" motivo="integração com o Google Calendar prevista na Fase 3." />
        <Indisponivel titulo="Espera por cliente ou por decisão" motivo="registro de reuniões previsto na Fase 4; o Vobi não exporta esse dado." />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
async function Gerencia() {
  const d = await meuDiaGerencia();
  if (!d || !d.panorama) return <SemCarga />;
  const { ctx, panorama: p } = d;
  const ativos = p.projetosAtivos.reduce((a, r) => a + r.valor, 0);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const refacaoAlta = d.projetos.filter((x) => (x.refacaoFracao ?? 0) >= RISCO_REFACAO_FRACAO);
  const semResp = d.projetos.filter((x) => x.semResponsavel > 0);
  return (
    <div className="flex flex-col gap-5">
      <Cabecalho titulo="Meu dia · Gerência" ctx={ctx} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Projetos ativos" value={ativos} note={`${p.encerrados} encerrados`} />
        <Stat label="Tarefas abertas vencidas" value={d.prazosHoje.vencidas} tone={d.prazosHoje.vencidas ? "bad" : "ok"} source="calc" note={<Selo s={selo(p.comFim, p.total, ctx.carga)} rotulo="tarefas com prazo" />} />
        <Stat label="Horas em Refação" value={`${pct(p.horas.refacaoMin, p.horas.totalMin)}%`} source="calc" note={<Selo s={selo(p.horas.comHoras, p.total, ctx.carga)} rotulo="tarefas com horas lançadas" />} />
        <Stat label="Projetos que exigem acompanhamento" value={d.risco.length} tone={d.risco.length ? "warn" : "ok"} source="calc" note={`de ${d.projetos.length} ativos`} />
      </div>

      <Card title="Decisões que exigem a gerência" subtitle="Itens que não são operação do dia a dia.">
        <ul className="grid gap-2 text-[0.88rem]">
          <li>{ctx.desatualizado ? <><b>Dados com {ctx.idadeDias} dias</b> — nova exportação do Vobi pendente (cadência: 2× por semana).</> : <>Dados com {ctx.idadeDias} dia(s) — dentro da cadência combinada (2× por semana).</>}</li>
          <li>Acesso ao A360: {d.usuarios.total} usuário(s) ativo(s) — {d.usuarios.gestao} gestão/coordenação, {d.usuarios.arquitetas} arquiteta(s). Piloto com arquitetas depende da validação da gerência e coordenação.</li>
          <li>{d.decisoes.ambiguos} vínculo(s) de cliente ambíguo(s) aguardando a coordenação → <Link className="underline" href="/clientes#fila">Clientes</Link>.</li>
          <li>{d.decisoes.pessoasSemEmail} pessoa(s) do Vobi sem e-mail Rucelle (afeta o &ldquo;Meu dia&rdquo; das arquitetas) → <Link className="underline" href="/pessoas">Pessoas</Link>.</li>
        </ul>
      </Card>

      <Card title={<>Riscos e gargalos <Badge tone="info">calculados · não são conclusões</Badge></>}
        subtitle="Sinais derivados dos dados importados. Não viram tarefas nem cobranças; quantidade não é produtividade, atraso não é desempenho e refação não é culpa.">
        {d.recomendacoes.length ? (
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Tema</th><th>Sinal</th><th>Leitura sugerida</th><th>Cuidado</th></tr></thead><tbody>
            {d.recomendacoes.map((r, i) => <tr key={i}><td className="whitespace-nowrap font-semibold">{r.tema}</td><td>{r.sinal}</td><td className="text-[var(--txt-2)]">{r.leitura}</td><td className="text-[0.78rem] text-[var(--muted)]">{r.cuidado}</td></tr>)}
          </tbody></table></div>
        ) : <Empty>Nenhum sinal acima dos limiares nesta carga.</Empty>}
        <div className="mt-3 grid gap-2 text-[0.84rem] text-[var(--txt-2)] md:grid-cols-3">
          <div><b>{d.projetos.filter((x) => x.vencidas > 0).length}</b> projetos ativos com tarefa vencida</div>
          <div><b>{semResp.length}</b> projetos com tarefas sem responsável no Vobi (limitação da fonte)</div>
          <div><b>{refacaoAlta.length}</b> projetos com ≥ {Math.round(RISCO_REFACAO_FRACAO * 100)}% das horas em Refação</div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title={`Entregas e atrasos nos próximos ${JANELA_ENTREGAS_DIAS} dias`} subtitle={`Tarefas das etapas ${ETAPAS_ENTREGA.join(", ")}. Ressalva: só ${pct(p.comFim, p.total)}% das tarefas têm prazo no Vobi.`}>
          <TabelaTarefas tarefas={d.entregas.slice(0, 20)} mostrarResponsavel vazio="Nenhuma entrega na janela." />
          {d.entregas.length > 20 && <p className="mt-2 text-xs text-[var(--muted)]">Mostrando 20 de {d.entregas.length}; lista completa na visão da coordenação.</p>}
        </Card>
        <Card title="Projetos ativos por etapa do fluxo">
          <table className="tbl"><tbody>{p.projetosAtivos.map((r) => <tr key={r.rotulo}><td>{r.rotulo}</td><td className="text-right font-semibold">{r.valor}</td></tr>)}</tbody></table>
          <Card className="mt-4" title="Evolução entre cargas">
            {d.cargaAnterior ? <p className="text-sm text-[var(--txt-2)]">Carga anterior: {d.cargaAnterior.id} de {fmt(d.cargaAnterior.data_carga)}. Comparativo detalhado entra na próxima iteração, quando houver duas cargas com o mesmo layout.</p>
              : <p className="text-sm text-[var(--muted)]">Sem informação disponível — só existe uma carga de operação aceita; a evolução aparece a partir da segunda.</p>}
          </Card>
        </Card>
      </div>

      <Card title="Projetos que exigem acompanhamento" subtitle={`Regra: alguma tarefa vencida ou ≥ ${Math.round(RISCO_REFACAO_FRACAO * 100)}% das horas em Refação; tarefas sem responsável não contam.`}>
        <TabelaProjetos projetos={d.risco} motivos vazio="Nenhum projeto acima dos limiares." />
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Indisponivel titulo="Capacidade e previsibilidade" motivo="depende de jornada/alocação do People e de histórico de cargas (Fase 5)." />
        <Indisponivel titulo="Agenda, reuniões e espera por cliente" motivo="Fases 3 e 4." />
      </div>
      <Card title="Não disponível com os dados atuais">
        <ul className="list-disc space-y-1 pl-5 text-[0.85rem] text-[var(--txt-2)]">{p.limitacoes.map((l) => <li key={l.chave}>{l.descricao}</li>)}</ul>
      </Card>
    </div>
  );
}
