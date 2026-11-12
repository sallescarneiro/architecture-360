import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import { ESTADO_VOBI, filaDe, historico, obterAtividade, podeGerirAgenda, PRIORIDADE_VOBI, STATUS_VOBI, TIPOS_INDEPENDENTE } from "@/lib/agenda/atividades";
import { dataHora } from "@/lib/agenda/datas";
import { NOME_CAMPO, type Campo } from "@/lib/vobi/reconciliar";
import { mapaResponsaveis } from "@/lib/vobi/espelho";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { cancelarAtividadeAction, resolverConflitoAction } from "../actions";

/** T-219 — detalhe da atividade. Arquiteta: só a própria (404 para as demais, inclusive pela URL). */
export default async function AtividadePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const { id } = await params;
  const sp = await searchParams;
  const a = /^\d+$/.test(id) ? await obterAtividade(u, Number(id)) : null;
  if (!a) notFound();
  const gestao = podeGerirAgenda(u.perfil);
  const volta = sp.volta?.startsWith("/agenda") ? sp.volta : "/agenda";
  const [resp] = await db.select({ nome: schema.usuarios.nome }).from(schema.usuarios).where(eq(schema.usuarios.id, a.responsavelId));
  const proj = a.projetoCodigo ? (await db.select({ nome: schema.projetos.nome }).from(schema.projetos).where(eq(schema.projetos.codigo, a.projetoCodigo)))[0] : null;
  const etapa = a.etapaVobiId ? (await db.select({ nome: schema.vobiEtapas.nome }).from(schema.vobiEtapas).where(eq(schema.vobiEtapas.idVobi, a.etapaVobiId)))[0] : null;
  const tarefa = a.tarefaVobiId ? (await db.select().from(schema.vobiTarefas).where(eq(schema.vobiTarefas.idVobi, a.tarefaVobiId)))[0] : null;
  const hist = await historico(a.id);
  const fila = gestao ? await filaDe(a.id) : [];
  const est = ESTADO_VOBI[a.estadoVobi] ?? ESTADO_VOBI.local;
  const vinculada = a.vinculo !== "independente";
  const { vobiParaUsuario } = await mapaResponsaveis();
  const nomes = new Map((await db.select({ id: schema.usuarios.id, nome: schema.usuarios.nome }).from(schema.usuarios)).map((x) => [x.id, x.nome]));
  const etapasNome = new Map((a.projetoCodigo ? await db.select().from(schema.vobiEtapas).where(eq(schema.vobiEtapas.idRefurbish, a.projetoCodigo)) : []).map((e) => [e.idVobi, e.nome]));
  const valor = (c: string, x: unknown): string => {
    if (x == null || x === "") return "—";
    if (c === "inicio" || c === "fim") return dataHora(new Date(String(x)));
    if (c === "status") return STATUS_VOBI[Number(x)] ?? String(x);
    if (c === "prioridade") return PRIORIDADE_VOBI[Number(x)] ?? String(x);
    if (c === "idEtapa") return etapasNome.get(Number(x)) ?? `etapa nº ${x}`;
    if (c === "idResponsavel") { const uid = vobiParaUsuario.get(Number(x)); return uid ? nomes.get(uid) ?? `nº ${x}` : `nº ${x} no Vobi`; }
    return String(x);
  };
  const avisos = [sp.criada && "Atividade programada.", sp.salva && "Alterações salvas.", sp.cancelada && "Atividade cancelada.", sp.resolvido && "Conflito resolvido."].filter(Boolean) as string[];
  const pend = Object.entries(a.pendentes ?? {});
  const conf = Object.entries(a.conflitos ?? {});

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader eyebrow={`Architecture 360 · Agenda · atividade ${a.id}`} title={a.titulo}
        subtitle={<>{vinculada ? "Tarefa do Vobi" : TIPOS_INDEPENDENTE[a.tipo] ?? a.tipo} · {resp?.nome} · {STATUS_VOBI[a.status]} · prioridade {PRIORIDADE_VOBI[a.prioridade]}</>}
        actions={<div className="flex flex-wrap gap-2">{gestao && a.status !== 5 && <LinkButton href={`/agenda/atividade/${a.id}/editar?volta=${encodeURIComponent(volta)}`} variant="primary">Alterar</LinkButton>}<LinkButton href={volta}>← Agenda</LinkButton></div>} />
      {avisos.map((t) => <div key={t} className="leitura"><b>OK</b>{t}</div>)}
      {sp.erro && <div className="leitura leitura-bad"><b>Erro</b>{sp.erro}</div>}

      <Card title="Programação">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-[var(--muted)]">Data de início</dt><dd>{!a.inicio ? "— (a tarefa no Vobi não tem início)" : a.diaInteiro ? a.inicio.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : dataHora(a.inicio)}</dd></div>
          <div><dt className="text-xs text-[var(--muted)]">Data de término (prazo)</dt><dd className="font-semibold">{a.diaInteiro ? a.fim.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : dataHora(a.fim)}</dd></div>
          <div><dt className="text-xs text-[var(--muted)]">Responsável</dt><dd>{resp?.nome}</dd></div>
          {a.estimadaHoras != null && <div><dt className="text-xs text-[var(--muted)]">Duração estimada</dt><dd>{a.estimadaHoras} h</dd></div>}
          {a.descricao && <div className="sm:col-span-2"><dt className="text-xs text-[var(--muted)]">Descrição</dt><dd className="whitespace-pre-wrap">{a.descricao}</dd></div>}
        </dl>
      </Card>

      {vinculada && (
        <Card title={<>Vínculo com o Vobi <Badge tone={est.tom}>{est.rotulo}</Badge></>} subtitle="Ligação pelos números do Vobi; nomes como estão no Vobi. Fase 0: escrita no Vobi desligada.">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-[var(--muted)]">Projeto</dt><dd>{a.projetoCodigo ? <Link className="underline" href={`/projetos/${a.projetoCodigo}`}>{proj?.nome ?? a.projetoCodigo}</Link> : "—"} <span className="text-[var(--muted)]">nº {a.projetoCodigo}</span></dd></div>
            <div><dt className="text-xs text-[var(--muted)]">Etapa</dt><dd>{etapa?.nome ?? "—"}{a.etapaVobiId && <span className="text-[var(--muted)]"> nº {a.etapaVobiId}</span>}</dd></div>
            <div><dt className="text-xs text-[var(--muted)]">Tarefa</dt><dd>{a.tarefaVobiId ? <>{tarefa?.nome ?? "—"} <span className="text-[var(--muted)]">nº {a.tarefaVobiId}</span></> : "ainda não criada no Vobi"}</dd></div>
            {tarefa && <div className="sm:col-span-3 text-xs text-[var(--muted)]">No Vobi agora: {STATUS_VOBI[tarefa.status ?? 1]} · término {tarefa.fim ? dataHora(tarefa.fim) : "—"} · última alteração no Vobi {tarefa.atualizadoVobiEm ? dataHora(tarefa.atualizadoVobiEm) : "—"} · lido em {dataHora(tarefa.vistoEm)}</div>}
          </dl>
          {conf.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              <b className="text-sm">Conflitos — o mesmo campo mudou no A360 e no Vobi</b>
              <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Campo</th><th>Programado no A360</th><th>No Vobi</th>{gestao && <th>Decisão</th>}</tr></thead><tbody>
                {conf.map(([c, x]) => (
                  <tr key={c}><td>{NOME_CAMPO[c as Campo] ?? c}</td><td>{valor(c, x.a360)}</td><td>{valor(c, x.vobi)}</td>
                    {gestao && <td><div className="flex gap-2">{(["a360", "vobi"] as const).map((e) => <form key={e} action={resolverConflitoAction}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="campo" value={c} /><input type="hidden" name="escolha" value={e} /><button className="btn btn-secondary btn-sm">{e === "a360" ? "vale o A360" : "vale o Vobi"}</button></form>)}</div></td>}</tr>
                ))}
              </tbody></table></div>
            </div>
          )}
          {pend.length > 0 && (
            <div className="mt-3 text-sm"><b>Aguardando envio ao Vobi</b> (escrita desligada): {pend.map(([c, x]) => `${NOME_CAMPO[c as Campo] ?? c}: ${valor(c, x)}`).join(" · ")}</div>
          )}
          {gestao && fila.length > 0 && <div className="mt-2 text-xs text-[var(--muted)]">Fila de envio: {fila.slice(0, 5).map((f) => `#${f.id} ${f.operacao} · ${f.estado}`).join(" · ")}</div>}
          {gestao && (() => { const sim = fila.find((f) => f.estado === "aguardando" && f.simulacao)?.simulacao; return sim ? (
            <div className="mt-3 text-sm"><b>Ensaio (Fase 1, nada enviado):</b> <Badge tone={sim.resultado === "pronto" ? "ok" : "bad"}>{sim.resultado}</Badge> {sim.metodo} {sim.caminho ?? ""}
              {sim.problemas.map((p, i) => <div key={i} className="text-xs">{p.nivel}: {p.texto}</div>)}
              <details className="text-xs"><summary>pedido que seria enviado</summary><pre className="whitespace-pre-wrap">{JSON.stringify(sim.corpo, null, 2)}</pre></details></div>) : null; })()}
        </Card>
      )}

      {gestao && a.status !== 5 && (
        <Card title="Cancelar atividade" subtitle={vinculada ? "Nada é excluído. Na tarefa do Vobi o pedido é Status = Cancelado (fica aguardando envio na Fase 0)." : "Nada é excluído: a atividade fica com status Cancelado e sai da agenda."}>
          <form action={cancelarAtividadeAction} className="flex flex-wrap items-center gap-3 text-sm">
            <input type="hidden" name="id" value={a.id} /><input type="hidden" name="volta" value={volta} />
            <label className="flex items-center gap-2"><input type="checkbox" name="confirmo" value="1" /> confirmo o cancelamento</label>
            <button className="btn btn-secondary btn-sm">Cancelar atividade</button>
          </form>
        </Card>
      )}

      <Card title="Histórico">
        <ul className="flex flex-col gap-1 text-sm">
          {hist.map(({ h, nome }) => <li key={h.id}><span className="text-[var(--muted)]">{dataHora(h.quando)} · {h.origem === "vobi" ? "Vobi" : h.origem === "sistema" ? "A360" : nome ?? "—"}:</span> {h.resumo}</li>)}
        </ul>
      </Card>
    </div>
  );
}
