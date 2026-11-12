import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import { ESTADO_VOBI, pendencias, podeGerirAgenda } from "@/lib/agenda/atividades";
import { dataHora } from "@/lib/agenda/datas";
import { NOME_CAMPO, type Campo } from "@/lib/vobi/reconciliar";
import { coberturaEnsaio } from "@/lib/vobi/ensaio";
import { Badge, Card, Empty, LinkButton, PageHeader, Stat } from "@/components/ui";
import { ensaiarAgoraAction } from "../atividade/actions";

/**
 * T-219 — Pendências com o Vobi: conflitos, divergências, fila de envio e o ENSAIO da Fase 1 (o pedido exato que seria
 * gravado no Vobi e os problemas que travariam o envio). Escrita no Vobi desligada: nada desta tela chama a API. Só gestão.
 */
export default async function PendenciasPage({ searchParams }: { searchParams: Promise<{ ensaio?: string }> }) {
  const u = await exigirUsuario();
  if (!podeGerirAgenda(u.perfil)) redirect("/sem-permissao");
  const sp = await searchParams;
  const pend = await pendencias();
  const fila = await db.select({ e: schema.vobiEnvios, titulo: schema.atividades.titulo }).from(schema.vobiEnvios)
    .innerJoin(schema.atividades, eq(schema.atividades.id, schema.vobiEnvios.atividadeId))
    .where(inArray(schema.vobiEnvios.estado, ["aguardando", "erro", "conflito"])).orderBy(desc(schema.vobiEnvios.id)).limit(200);
  const cob = await coberturaEnsaio();
  const prontos = fila.filter((f) => f.e.simulacao?.resultado === "pronto").length, bloqueados = fila.filter((f) => f.e.simulacao?.resultado === "bloqueado").length;
  const chamadas = fila.reduce((n, f) => n + (f.e.simulacao?.chamadas ?? 0), 0);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Agenda" title="Pendências com o Vobi" subtitle="Conflitos, divergências e o ensaio do envio (Fase 1). Escrita no Vobi desligada: nada desta tela grava no Vobi."
        actions={<div className="flex gap-2"><form action={ensaiarAgoraAction}><button className="btn btn-primary">Rodar ensaio agora</button></form><LinkButton href="/agenda">← Agenda</LinkButton></div>} />
      {sp.ensaio && <div className="leitura"><b>OK</b>Ensaio recalculado. Nenhuma chamada foi feita ao Vobi.</div>}

      <Card title={<>Ensaio do envio ao Vobi <Badge tone="info">Fase 1 · sem escrita</Badge></>} subtitle="Para cada pedido da fila: o pedido exato que seria gravado, montado com os dados reais do A360 e do espelho do Vobi, e o que impediria o envio. Também roda depois de cada programação e de cada leitura diária.">
        <div className="mb-3 grid gap-3 sm:grid-cols-4">
          <Stat label="Pedidos na fila" value={fila.length} />
          <Stat label="Prontos para enviar" value={prontos} tone="ok" />
          <Stat label="Bloqueados" value={bloqueados} tone={bloqueados ? "warn" : "neutral"} />
          <Stat label="Chamadas à API (estimativa)" value={chamadas} note="limite do Vobi: 1.000 por hora" />
        </div>
        {fila.length ? <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>#</th><th>Atividade</th><th>Operação</th><th>Resultado</th><th>Problemas</th><th>Pedido que seria enviado</th></tr></thead><tbody>
          {fila.map(({ e, titulo }) => (
            <tr key={e.id}><td>{e.id}</td><td><Link className="underline" href={`/agenda/atividade/${e.atividadeId}`}>{titulo}</Link></td><td>{e.operacao}</td>
              <td>{e.simulacao ? <Badge tone={e.simulacao.resultado === "pronto" ? "ok" : "bad"}>{e.simulacao.resultado}</Badge> : "—"}{e.simuladoEm && <div className="text-[0.7rem] text-[var(--muted)]">{dataHora(e.simuladoEm)}</div>}</td>
              <td className="text-xs">{e.simulacao?.problemas.length ? e.simulacao.problemas.map((p, i) => <div key={i}><b className={p.nivel === "bloqueia" ? "text-[var(--st-relevante)]" : ""}>{p.nivel === "bloqueia" ? "bloqueia" : "aviso"}:</b> {p.texto}</div>) : "nenhum"}</td>
              <td className="text-xs">{e.simulacao?.metodo ? <details><summary>{e.simulacao.metodo} {e.simulacao.caminho ?? "(sem tarefa)"}</summary><pre className="whitespace-pre-wrap text-[0.7rem]">{JSON.stringify(e.simulacao.corpo, null, 2)}</pre></details> : "—"}</td></tr>
          ))}
        </tbody></table></div> : <Empty>Nenhum pedido aguardando envio. Programe ou altere atividades ligadas ao Vobi para gerar pedidos.</Empty>}
      </Card>

      <Card title="Cobertura com os dados reais do Vobi" subtitle={`Das tarefas abertas lidas do Vobi, quantas poderiam ser programadas e enviadas hoje. Espelho: ${cob.espelho.tarefas} tarefas e ${cob.espelho.etapas} etapas${cob.espelho.lido_em ? `, lido em ${dataHora(new Date(cob.espelho.lido_em))}` : " — ainda não lido (a leitura das 06:00 preenche)"}.`}>
        {cob.espelho.tarefas ? (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Tarefas abertas" value={cob.abertas} />
              <Stat label="Programáveis e enviáveis" value={cob.programaveis} tone="ok" />
              <Stat label="Responsável sem acesso no A360" value={cob.responsavel_sem_acesso} tone={cob.responsavel_sem_acesso ? "warn" : "neutral"} note="indicar em Pessoas" />
              <Stat label="Sem responsável" value={cob.sem_responsavel} />
            </div>
            <div className="text-sm">Sem etapa: {cob.sem_etapa} · etapa desconhecida: {cob.etapa_desconhecida} · sem data de término: {cob.sem_termino} · término antes do início: {cob.termino_antes_inicio}</div>
            {cob.semAcesso.length > 0 && <div className="text-sm">Números do Vobi sem acesso no A360: {cob.semAcesso.map((x) => `nº ${x.id} (${x.n} tarefas)`).join(" · ")} — <Link className="underline" href="/pessoas">indicar em Pessoas</Link></div>}
          </div>
        ) : <Empty>O espelho do Vobi ainda está vazio. A leitura programada das 06:00 preenche.</Empty>}
      </Card>

      <Card title={`Conflitos e divergências (${pend.length})`}>
        {pend.length ? <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Atividade</th><th>Situação</th><th>Campos</th><th>Atualizada</th></tr></thead><tbody>
          {pend.map((a) => <tr key={a.id}><td><Link className="underline" href={`/agenda/atividade/${a.id}`}>{a.titulo}</Link></td><td><Badge tone={ESTADO_VOBI[a.estadoVobi]?.tom}>{ESTADO_VOBI[a.estadoVobi]?.rotulo}</Badge></td>
            <td>{Object.keys(a.conflitos ?? {}).map((c) => NOME_CAMPO[c as Campo] ?? c).join(", ") || (a.tarefaVobiId ? `tarefa nº ${a.tarefaVobiId}` : "—")}</td><td>{dataHora(a.atualizadoEm)}</td></tr>)}
        </tbody></table></div> : <Empty>Nenhum conflito ou divergência.</Empty>}
      </Card>
    </div>
  );
}
