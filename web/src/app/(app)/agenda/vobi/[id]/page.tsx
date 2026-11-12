import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import { podeGerirAgenda, PRIORIDADE_VOBI, STATUS_VOBI } from "@/lib/agenda/atividades";
import { dataHora } from "@/lib/agenda/datas";
import { mapaResponsaveis } from "@/lib/vobi/espelho";
import { NOME_CAMPO, type Campo } from "@/lib/vobi/reconciliar";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { programarDoVobiAction } from "../../atividade/actions";

/** T-219 — tarefa da Programação do Vobi (espelho, só leitura). Arquiteta: só as tarefas dela. Gestão: "Programar no A360". */
export default async function TarefaVobiPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^\d+$/.test(id)) notFound();
  const t = (await db.select().from(schema.vobiTarefas).where(eq(schema.vobiTarefas.idVobi, Number(id))))[0];
  if (!t) notFound();
  const gestao = podeGerirAgenda(u.perfil);
  const { vobiParaUsuario } = await mapaResponsaveis();
  const respUsuario = t.idResponsavel != null ? vobiParaUsuario.get(t.idResponsavel) : undefined;
  if (!gestao && respUsuario !== u.id) notFound(); // arquiteta não vê tarefa de outra pessoa
  const volta = sp.volta?.startsWith("/agenda") ? sp.volta : "/agenda";
  const [proj] = t.idRefurbish ? await db.select({ nome: schema.projetos.nome }).from(schema.projetos).where(eq(schema.projetos.codigo, t.idRefurbish)) : [];
  const [etapa] = t.idEtapa ? await db.select({ nome: schema.vobiEtapas.nome }).from(schema.vobiEtapas).where(eq(schema.vobiEtapas.idVobi, t.idEtapa)) : [];
  const [nomeVobi] = t.idResponsavel != null ? await db.select({ nome: schema.vobiResponsaveis.nome }).from(schema.vobiResponsaveis).where(eq(schema.vobiResponsaveis.idVobi, t.idResponsavel)) : [];
  const [usuario] = respUsuario ? await db.select({ nome: schema.usuarios.nome }).from(schema.usuarios).where(eq(schema.usuarios.id, respUsuario)) : [];
  const [ativ] = await db.select({ id: schema.atividades.id }).from(schema.atividades).where(eq(schema.atividades.tarefaVobiId, t.idVobi));
  const [carga] = await db.select({ chave: schema.tarefas.chave }).from(schema.tarefas).where(eq(schema.tarefas.idVobi, t.idVobi));
  const hist = await db.select().from(schema.vobiTarefaHistorico).where(eq(schema.vobiTarefaHistorico.idVobi, t.idVobi)).orderBy(desc(schema.vobiTarefaHistorico.id)).limit(50);
  const quando = (d: Date | null) => (d ? dataHora(d) : "—");
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader eyebrow={`Architecture 360 · Programação do Vobi · tarefa nº ${t.idVobi}`} title={t.nome}
        subtitle={<>{proj?.nome ?? `projeto nº ${t.idRefurbish}`} · {STATUS_VOBI[t.status ?? 1]} · prioridade {PRIORIDADE_VOBI[t.prioridade ?? 2] ?? "—"} · como está no Vobi (só leitura)</>}
        actions={<LinkButton href={volta}>← Agenda</LinkButton>} />
      {sp.erro && <div className="leitura leitura-bad"><b>Não programada</b>{sp.erro}</div>}
      <Card title="Dados no Vobi">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-[var(--muted)]">Projeto</dt><dd>{t.idRefurbish ? <Link className="underline" href={`/projetos/${t.idRefurbish}`}>{proj?.nome ?? t.idRefurbish}</Link> : "—"} <span className="text-[var(--muted)]">nº {t.idRefurbish}</span></dd></div>
          <div><dt className="text-xs text-[var(--muted)]">Etapa</dt><dd>{etapa?.nome ?? "—"}{t.idEtapa && <span className="text-[var(--muted)]"> nº {t.idEtapa}</span>}</dd></div>
          <div><dt className="text-xs text-[var(--muted)]">Responsável</dt><dd>{usuario?.nome ?? nomeVobi?.nome ?? "—"}{t.idResponsavel != null && <span className="text-[var(--muted)]"> nº {t.idResponsavel}</span>} {t.idResponsavel != null && !respUsuario && <Badge tone="warn">sem mapeamento em Pessoas</Badge>}{t.idResponsavel == null && <Badge tone="warn">sem responsável</Badge>}</dd></div>
          <div><dt className="text-xs text-[var(--muted)]">Data de início</dt><dd>{quando(t.inicio)}</dd></div>
          <div><dt className="text-xs text-[var(--muted)]">Data de término</dt><dd className="font-semibold">{quando(t.fim)}</dd></div>
          <div><dt className="text-xs text-[var(--muted)]">Duração / estimada / realizadas</dt><dd>{t.duracaoDias ?? "—"} dia(s) · {t.estimadaHoras ?? "—"} h · {t.realizadasHoras ?? "—"}</dd></div>
          <div className="sm:col-span-2 text-xs text-[var(--muted)]">Criada no Vobi {quando(t.criadoVobiEm)} · última alteração no Vobi {quando(t.atualizadoVobiEm)} · lida pelo A360 {quando(t.vistoEm)}{t.ausenteDesde ? ` · não encontrada na conferência de ${quando(t.ausenteDesde)} (mantida)` : ""} · {carga ? "vínculo confirmado com a tarefa da carga" : "sem tarefa da carga correspondente"}</div>
        </dl>
      </Card>
      {gestao && (ativ ? <div className="leitura"><b>Programada</b>Esta tarefa já está programada na <Link className="underline" href={`/agenda/atividade/${ativ.id}?volta=${encodeURIComponent(volta)}`}>atividade {ativ.id}</Link>.</div> : (
        <Card title="Programar no A360" subtitle="Cria a atividade com os valores exatos do Vobi (número, projeto, etapa, responsável, datas, horários, status e prioridade). Nada é enviado ao Vobi.">
          <form action={programarDoVobiAction}><input type="hidden" name="idVobi" value={t.idVobi} /><input type="hidden" name="volta" value={volta} /><button className="btn btn-primary">Programar no A360</button></form>
        </Card>))}
      <Card title="Histórico das leituras" subtitle="Mudanças vistas no Vobi a cada leitura (a primeira leitura não gera histórico).">
        {hist.length ? <ul className="flex flex-col gap-1 text-sm">{hist.map((h) => <li key={h.id}><span className="text-[var(--muted)]">{dataHora(h.lidoEm)} ·</span> {NOME_CAMPO[h.campo as Campo] ?? h.campo}: {h.antes ?? "—"} → {h.depois ?? "—"}</li>)}</ul> : <p className="text-sm text-[var(--muted)]">Sem mudanças registradas.</p>}
      </Card>
    </div>
  );
}
