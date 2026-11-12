import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario, veIndicadoresIndividuais } from "@/lib/auth";
import { contagem, linkVobiProjeto, ultimaCargaAceita } from "@/lib/consultas";
import { restricaoDe, sqlParticipa } from "@/lib/participacao";
import { STATUS_REUNIAO, encaminhamentosAbertosDe, fmtPeriodo, reunioesDoProjeto } from "@/lib/reunioes";
import { alertasDoProjeto, PRIORIDADES, SITUACOES } from "@/lib/alertas";
import { flagsDoProjeto } from "@/lib/flags";
import { STATUS as STATUS_ENT, TIPOS as TIPOS_ENT, doProjeto as entregaveisDoProjeto } from "@/lib/entregaveis";
import { ROTULO_VINCULO, TOM_VINCULO } from "@/lib/clientes";
import { minutosParaHoras } from "@/lib/importador/normalizacao";
import { hojeIso, statusPrazo } from "@/lib/prazo";
import { StatusPrazo } from "@/components/StatusPrazo";
import { urlCom } from "@/lib/listas";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";

/** Detalhe do projeto (somente leitura): dados do Vobi, cliente vinculado e tarefas da última carga. */
export default async function ProjetoPage({ params, searchParams }: { params: Promise<{ codigo: string }>; searchParams: Promise<{ vobi?: string }> }) {
  const u = await exigirUsuario();
  const gestao = veIndicadoresIndividuais(u.perfil);
  const { codigo } = await params;
  const p = (await db.select().from(schema.projetos).where(eq(schema.projetos.codigo, Number(codigo))).limit(1))[0];
  if (!p) notFound();
  const carga = await ultimaCargaAceita();
  const reunioes = await reunioesDoProjeto(p.codigo); // T-188
  const encaminhamentos = await encaminhamentosAbertosDe(reunioes.map((r) => r.id));
  const alertasProj = await alertasDoProjeto(p.codigo); const flagsProj = await flagsDoProjeto(p.codigo);
  const entregaveis = await entregaveisDoProjeto(p.codigo); // T-190
  const alertasAbertos = alertasProj.filter((a) => SITUACOES[a.situacao]?.aberto);
  if (!gestao) {
    // D-A (08/11/2026): arquiteta só abre projetos em que participa (colaboradora no Vobi ou responsável por tarefa). Verificado no servidor.
    const r = await restricaoDe(u.email);
    const ok = carga ? (await contagem(`select 1 from projeto p where p.codigo=${p.codigo} and ${sqlParticipa(r.email, r.nomes, carga.id, "p")}`)).length > 0 : false;
    if (!ok) redirect("/sem-permissao");
  }
  const cliente = p.clienteCodigo ? (await db.select().from(schema.clientesVobi).where(eq(schema.clientesVobi.codigo, p.clienteCodigo)).limit(1))[0] : null;
  const tarefas = await db.select().from(schema.tarefas)
    .where(and(eq(schema.tarefas.projetoCodigo, p.codigo), isNull(schema.tarefas.naoEncontradoDesde)))
    .orderBy(asc(schema.tarefas.etapaCsv), asc(schema.tarefas.dataFim), asc(schema.tarefas.nome)); // etapa original do Vobi (decisão de 10/11/2026: nomes preservados)
  // T-219 — projeto incorporado sob demanda: mostra o registro e onde estão as tarefas (Agenda) até a próxima carga aceita
  const sd = (await db.execute(sql`select d.solicitado_em, u.nome usuario,
      (select count(*)::int from vobi_tarefa t where t.id_refurbish = d.codigo) tarefas
    from projeto_sob_demanda d join usuario u on u.id = d.solicitado_por_id where d.codigo = ${p.codigo} and d.situacao = 'integrado' order by d.id limit 1`)).rows[0] as { solicitado_em: string; usuario: string; tarefas: number } | undefined;
  const avisoVobi = (await searchParams).vobi;
  const hoje = hojeIso();
  const prazos = new Map(tarefas.map((t) => [t.chave, statusPrazo(t.status, t.dataFim, hoje)]));
  const abertas = tarefas.filter((t) => prazos.get(t.chave)!.aberta);
  const vencidas = abertas.filter((t) => prazos.get(t.chave)!.atrasada).length;
  const horas = tarefas.reduce((a, t) => a + (t.horasRealizadasMin ?? 0), 0);

  const clienteBloco = p.vinculoClienteStatus === "ambiguo"
    ? <><Badge tone="warn">cliente ambíguo</Badge> &ldquo;{p.cliente}&rdquo; corresponde a mais de um cadastro{gestao && <> · <Link className="underline" href="/clientes#fila">decidir em Clientes</Link></>}</>
    : cliente
      ? <><Link className="font-semibold text-[var(--vinho)] underline" href={`/clientes/${cliente.codigo}`}>{cliente.nome}</Link> <span className="text-xs text-[var(--muted)]">cód. {cliente.codigo} · {cliente.cidade ? `${cliente.cidade}/${cliente.estado ?? ""}` : ""}</span> <Badge tone={TOM_VINCULO[p.vinculoClienteStatus]}>{ROTULO_VINCULO[p.vinculoClienteStatus]}</Badge></>
      : <><span className="text-[var(--muted)]">sem cliente associado</span>{p.cliente ? <> · no Vobi: &ldquo;{p.cliente}&rdquo; (sem cadastro correspondente{gestao && <> · <Link className="underline" href="/clientes#fila">associar</Link></>})</> : " · sem nome de cliente no Vobi"}</>;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Operação · Projeto" title={p.nome}
        subtitle={<>Cód. Vobi {p.codigo} · <Badge tone={p.statusClasse === "encerrado" ? "neutral" : p.statusClasse === "pausado" ? "warn" : "ok"}>{p.status}</Badge> · criado em {p.criadoEm ?? "—"}{p.metragem ? ` · ${p.metragem} m²` : ""}{p.etiquetas.length ? ` · ${p.etiquetas.join(", ")}` : ""}
          <span className="mt-1 block text-xs">Origem: Vobi{carga ? ` · exportação de ${carga.dataCarga.split("-").reverse().join("/")} (carga ${carga.id})` : ""} · prazos comparados com hoje{p.naoEncontradoDesde ? " · não encontrado na última exportação" : ""} <Badge tone="neutral">somente leitura</Badge></span></>}
        actions={<div className="flex gap-2"><Link href={`/projetos/${p.codigo}/linha-do-tempo`} className="btn btn-primary btn-sm">Linha do tempo</Link><a className="btn btn-secondary btn-sm" href={linkVobiProjeto(p.codigo)} target="_blank" rel="noreferrer">Abrir no Vobi ↗</a><Link href="/projetos" className="btn btn-secondary btn-sm">← Projetos</Link></div>} />
      {avisoVobi === "ja_existia" && <div className="leitura"><b>Vobi</b>Este projeto já fazia parte do A360 e da Agenda — nada foi duplicado.</div>}
      {sd && <div className="leitura"><b>Sob demanda</b>Incorporado do Vobi em {new Date(sd.solicitado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} por {sd.usuario}: {sd.tarefas} tarefas na <Link className="underline" href={`/agenda?projeto=${p.codigo}`}>Programação do Vobi (Agenda)</Link>. A lista de tarefas abaixo é a da carga e passa a incluí-las a partir da próxima carga aceita.</div>}

      {(alertasAbertos.length > 0 || flagsProj.some((f) => f.situacao === "aberta")) && (
        <div className="leitura"><b>Atenção</b>{alertasAbertos.length ? <>{alertasAbertos.length} alerta(s) de divergência aberto(s){alertasAbertos.some((a) => a.prioridade === "critico") ? " (há crítico)" : ""}: {alertasAbertos.slice(0, 2).map((a) => <Link key={a.id} className="underline" href={`/alertas/${a.id}`}>{a.titulo.slice(0, 70)}</Link>).reduce<React.ReactNode[]>((acc, x, i) => (i ? [...acc, " · ", x] : [x]), [])}. </> : null}{flagsProj.filter((f) => f.situacao === "aberta").length ? <>{flagsProj.filter((f) => f.situacao === "aberta").length} flag(s) de limitação de dados — <Link className="underline" href={`/projetos/${p.codigo}/linha-do-tempo#flags`}>ver na linha do tempo</Link>.</> : null}</div>
      )}

      <Card title="Cliente"><div className="text-sm">{clienteBloco}</div></Card>

      <Card title={`Reuniões (${reunioes.length})`} subtitle="registradas no A360 · pauta, ata, decisões e encaminhamentos · não altera o Vobi">
        <div className="flex flex-col gap-2 text-sm">
          {reunioes.length ? (
            <ul className="flex flex-col divide-y divide-[var(--line)]">{reunioes.slice(0, 8).map((r) => <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5"><span><Link className="underline" href={`/reunioes/${r.id}?volta=${encodeURIComponent(`/projetos/${p.codigo}`)}`}>{r.titulo}</Link> <span className="text-xs text-[var(--muted)]">· {STATUS_REUNIAO[r.status]?.rotulo}</span></span><span className="text-xs text-[var(--muted)]">{fmtPeriodo(r.inicio, r.fim)}</span></li>)}</ul>
          ) : <p className="text-[var(--muted)]">Nenhuma reunião registrada para este projeto.</p>}
          {encaminhamentos.length > 0 && <p className="text-xs text-[var(--txt-2)]"><b>{encaminhamentos.length}</b> encaminhamento(s) em aberto: {encaminhamentos.slice(0, 3).map((i) => i.texto.slice(0, 60)).join(" · ")}{encaminhamentos.length > 3 ? " …" : ""}</p>}
          <div className="flex gap-3 text-xs"><Link className="underline" href={`/reunioes/nova?projeto=${p.codigo}&volta=${encodeURIComponent(`/projetos/${p.codigo}`)}`}>+ Registrar reunião</Link>{reunioes.length > 0 && <Link className="underline" href={`/reunioes?projeto=${p.codigo}`}>ver todas</Link>}</div>
        </div>
      </Card>

      <Card title={`Entregáveis (${entregaveis.length})`} subtitle="layouts, apresentações e cadernos · versões, revisão interna e aprovação do cliente com evidência · registro interno">
        <div className="flex flex-col gap-2 text-sm">
          {entregaveis.length ? (
            <ul className="flex flex-col divide-y divide-[var(--line)]">{entregaveis.slice(0, 8).map((e) => <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5"><span><Link className="underline" href={`/entregaveis/${e.id}`}>{e.titulo}</Link> <span className="text-xs text-[var(--muted)]">· {TIPOS_ENT[e.tipo]}{e.versaoAtual ? ` · v${e.versaoAtual}` : ""}</span></span><Badge tone={STATUS_ENT[e.status]?.tom}>{STATUS_ENT[e.status]?.rotulo}</Badge></li>)}</ul>
          ) : <p className="text-[var(--muted)]">Nenhum entregável registrado para este projeto.</p>}
          <div className="flex gap-3 text-xs"><Link className="underline" href={`/entregaveis/novo?projeto=${p.codigo}`}>+ Registrar entregável</Link>{entregaveis.length > 0 && <Link className="underline" href={`/entregaveis?projeto=${p.codigo}&status=todos`}>ver todos</Link>}</div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Tarefas abertas" value={abertas.length} note={`de ${tarefas.length} na carga`} href={urlCom("/tarefas", {}, { projeto: p.codigo })} />
        <Stat label="Atrasadas" value={vencidas} tone={vencidas ? "bad" : "ok"} source="calc" href={urlCom("/tarefas", {}, { projeto: p.codigo, prazo: "atrasadas" })} />
        <Stat label="Horas realizadas" value={minutosParaHoras(horas)} note="acumuladas nas tarefas" />
        <Stat label="Colaboradores (Vobi)" value={p.colaboradores.length} note={p.colaboradores.join(", ") || "—"} />
      </div>

      <Card title="Tarefas (última carga)" subtitle="Fato importado do Vobi; não é medida de desempenho.">
        {tarefas.length ? (
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Etapa</th><th>Tarefa</th><th>Situação</th><th>Status Vobi</th>{gestao && <th>Responsável</th>}<th>Início</th><th>Fim</th><th>Horas</th></tr></thead>
            <tbody>{tarefas.map((t) => (
              <tr key={t.chave}>
                <td>{t.etapaCsv}</td><td>{t.nome}</td>
                <td><StatusPrazo info={prazos.get(t.chave)!} /></td>
                <td className="text-[var(--txt-2)]">{t.status}</td>
                {gestao && <td>{t.responsavelNome ?? "—"}</td>}
                <td>{t.dataInicio ?? "—"}</td><td>{t.dataFim ?? "—"}</td><td>{t.horasRealizadasMin ? minutosParaHoras(t.horasRealizadasMin) : "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>Nenhuma tarefa deste projeto na última carga.</Empty>}
      </Card>
    </div>
  );
}
