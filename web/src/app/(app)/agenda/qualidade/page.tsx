import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { podeGerirAgenda } from "@/lib/agenda/atividades";
import { qualidadeAgenda } from "@/lib/agenda/qualidade";
import { Badge, Card, LinkButton, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

const dia = (v: string | null) => (v ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(v)) : "—");
const dataIso = (v: string | null) => (v ? v.slice(0, 10).split("-").reverse().join("/") : "—");
const VOLTA = encodeURIComponent("/agenda/qualidade");

/** T-219 — Qualidade dos dados da Agenda (só gestão): o que impede a programação e o envio, tarefa a tarefa. */
export default async function QualidadePage() {
  const u = await exigirUsuario();
  if (!podeGerirAgenda(u.perfil)) redirect("/sem-permissao");
  const q = await qualidadeAgenda();
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Agenda" title="Qualidade dos dados da Agenda"
        subtitle="O que falta para cada tarefa do Vobi poder ser programada e, no futuro, enviada: responsável, prazo e data de início prevista. Nada aqui grava no Vobi."
        actions={<div className="flex flex-wrap gap-2"><LinkButton href="/agenda/cobertura">Cobertura</LinkButton><LinkButton href="/agenda">← Agenda</LinkButton></div>} />

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Tarefas abertas no recorte" value={q.abertas} note="planejadas ou em andamento, projetos ativos" />
        <Stat label="Sem responsável" value={q.semResponsavel.total} tone={q.semResponsavel.total ? "warn" : "ok"} note={`${q.semResponsavel.semPrazoTambem} delas também sem prazo`} />
        <Stat label="Sem prazo (data de término)" value={q.semPrazo.total} tone={q.semPrazo.total ? "warn" : "ok"} />
        <Stat label="Responsáveis sem mapeamento" value={q.semMapeamento.length} tone={q.semMapeamento.length ? "warn" : "ok"} />
      </div>

      <Card title={`1. Responsáveis do Vobi sem pessoa no A360 (${q.semMapeamento.length})`} subtitle="Mapeie em Pessoas: escolha quem é cada número. As pistas ajudam a identificar a pessoa.">
        {q.semMapeamento.length === 0 ? <p className="text-sm text-[var(--muted)]">Todos os responsáveis das tarefas do recorte estão mapeados.</p> : (
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Nº no Vobi</th><th>Nome no Vobi</th><th>Tarefas (abertas)</th><th>Última data</th><th>Projetos</th><th>Pista da carga</th></tr></thead>
            <tbody>{q.semMapeamento.map((x) => (
              <tr key={x.id}><td>{x.id}</td><td>{x.nome ?? "—"}</td><td>{x.tarefas} ({x.abertas})</td><td>{dia(x.ultima)}</td>
                <td className="text-xs">{x.projetos}</td>
                <td className="text-xs">{x.pistas.length ? x.pistas.map((p) => `${p.nome} (${p.n})`).join(" · ") : "sem pista"}</td></tr>))}</tbody>
          </table></div>
        )}
        <div className="mt-2"><LinkButton href="/pessoas">Mapear em Pessoas</LinkButton></div>
      </Card>

      <Card title={`2. Tarefas abertas sem responsável (${q.semResponsavel.total})`} subtitle="“Atribuir” abre a programação da tarefa com os dados do Vobi: escolha a responsável (e o prazo, se faltar). A atribuição fica no A360 e entra na fila “aguardando envio ao Vobi”; nada é gravado no Vobi enquanto a escrita estiver desligada.">
        {q.semResponsavel.projetos.length === 0 ? <p className="text-sm text-[var(--muted)]">Nenhuma.</p> : q.semResponsavel.projetos.map((g) => (
          <details key={g.projeto} className="border-t border-[var(--line)] py-2">
            <summary className="cursor-pointer text-sm"><b>{g.nome}</b> — {g.tarefas.length} tarefa(s)</summary>
            <div className="overflow-x-auto"><table className="tbl mt-2">
              <thead><tr><th>Tarefa</th><th>Etapa</th><th>Prazo</th><th></th></tr></thead>
              <tbody>{g.tarefas.map((t) => (
                <tr key={t.id}><td>{t.nome}</td><td>{t.etapa ?? "—"}</td><td>{t.fim ? dia(t.fim) : <Badge tone="warn">sem prazo</Badge>}</td>
                  <td><Link className="underline" href={`/agenda/atividade/nova?tarefa=${t.id}&volta=${VOLTA}`}>Atribuir</Link></td></tr>))}</tbody>
            </table></div>
          </details>
        ))}
      </Card>

      <Card title={`3. Tarefas abertas sem prazo (${q.semPrazo.total})`} subtitle="Sem data de término a tarefa não aparece na agenda nem pode ser enviada. Defina o prazo no Vobi ou ao programar a tarefa no A360.">
        {q.semPrazo.projetos.length === 0 ? <p className="text-sm text-[var(--muted)]">Nenhuma.</p> : q.semPrazo.projetos.map((g) => (
          <details key={g.projeto} className="border-t border-[var(--line)] py-2">
            <summary className="cursor-pointer text-sm"><b>{g.nome}</b> — {g.tarefas.length} tarefa(s)</summary>
            <ul className="mt-2 text-sm">{g.tarefas.map((t) => (
              <li key={t.id}>{t.nome}{t.etapa ? ` · ${t.etapa}` : ""}{t.resp == null ? " · sem responsável" : ""} — <Link className="underline" href={`/agenda/atividade/nova?tarefa=${t.id}&volta=${VOLTA}`}>Programar</Link></li>))}</ul>
          </details>
        ))}
      </Card>

      <Card title="4. Data de início prevista no Vobi" subtitle="Critério híbrido provisório: projeto sem data de início prevista entra pelo “Criado em”. O A360 lê a data todos os dias; quando a equipe preencher no Vobi, a regra definitiva passa a valer para aquele projeto.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Projetos ativos com a data preenchida" value={q.inicio.preenchidos} note={`de ${q.inicio.ativos} (${pct(q.inicio.preenchidos, q.inicio.ativos)})`} tone={q.inicio.preenchidos === q.inicio.ativos ? "ok" : "warn"} />
          <Stat label="No recorte só pelo “Criado em”" value={q.inicio.pendentesNoRecorte.length} note="preencher a data de início prevista no Vobi" />
          <Stat label="Fora do recorte e sem a data" value={q.inicio.foraSemData.length} note="se começar em 2026, preencher no Vobi" />
        </div>
        {q.inicio.pendentesNoRecorte.length > 0 && (
          <details className="mt-3"><summary className="cursor-pointer text-sm">Projetos do recorte sem data de início prevista ({q.inicio.pendentesNoRecorte.length})</summary>
            <ul className="mt-2 text-sm">{q.inicio.pendentesNoRecorte.map((p) => <li key={p.codigo}><Link className="underline" href={`/projetos/${p.codigo}`}>{p.nome}</Link> · nº {p.codigo} · criado em {dataIso(p.criado_em)}</li>)}</ul>
          </details>
        )}
        {q.inicio.foraSemData.length > 0 && (
          <details className="mt-2"><summary className="cursor-pointer text-sm">Projetos ativos fora do recorte, sem data de início prevista ({q.inicio.foraSemData.length})</summary>
            <ul className="mt-2 text-sm">{q.inicio.foraSemData.map((p) => <li key={p.codigo}><Link className="underline" href={`/projetos/${p.codigo}`}>{p.nome}</Link> · nº {p.codigo} · criado em {dataIso(p.criado_em)}</li>)}</ul>
          </details>
        )}
      </Card>
    </div>
  );
}
