import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { podeGerirAgenda } from "@/lib/agenda/atividades";
import { qualidadeAgenda } from "@/lib/agenda/qualidade";
import { Card, LinkButton, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

const dia = (v: string | null) => (v ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(v)) : "—");
const dataIso = (v: string | null) => (v ? v.slice(0, 10).split("-").reverse().join("/") : "—");
const VOLTA = encodeURIComponent("/agenda/qualidade");

type Grupo = Awaited<ReturnType<typeof qualidadeAgenda>>["grupos"]["execucao"];
function lista(titulo: string, sub: string, g: Grupo, aberto: boolean) {
  return (
    <Card title={`${titulo} (${g.total})`} subtitle={sub}>
      {g.projetos.length === 0 ? <p className="text-sm text-[var(--muted)]">Nenhuma.</p> : g.projetos.map((p) => (
        <details key={p.projeto} className="border-t border-[var(--line)] py-2" open={aberto && g.projetos.length <= 5}>
          <summary className="cursor-pointer text-sm"><b>{p.nome}</b> — {p.tarefas.length} tarefa(s)</summary>
          <div className="overflow-x-auto"><table className="tbl mt-2">
            <thead><tr><th>Tarefa</th><th>Etapa</th><th>Status</th><th>Início</th><th>Prazo</th><th>Falta</th><th></th></tr></thead>
            <tbody>{p.tarefas.map((t) => (
              <tr key={t.id}><td>{t.nome}</td><td>{t.etapa ?? "—"}</td><td>{t.status === 2 ? "Em andamento" : "Planejado"}</td><td>{dia(t.inicio)}</td><td>{dia(t.fim)}</td>
                <td>{[t.resp == null ? "responsável" : "", !t.fim ? "prazo" : ""].filter(Boolean).join(" e ")}</td>
                <td><Link className="underline" href={`/agenda/atividade/nova?tarefa=${t.id}&volta=${VOLTA}`}>Programar</Link></td></tr>))}</tbody>
          </table></div>
        </details>
      ))}
    </Card>
  );
}

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

      <div className="leitura"><b>Como ler</b>Tarefa sem responsável ou sem prazo não é erro por si só. A maioria são etapas futuras do modelo do projeto, que serão programadas quando entrarem no planejamento de execução. Não atribua em massa para melhorar os números. Nada aqui gera cobrança ou aviso para as arquitetas.</div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Já deveriam estar em execução" value={q.grupos.execucao.total} tone={q.grupos.execucao.total ? "warn" : "ok"} note="falta responsável ou prazo — tratar primeiro" />
        <Stat label="Pendências de planejamento" value={q.grupos.planejamento.total} note="planejamento começado, mas incompleto" />
        <Stat label="Etapas futuras do modelo" value={q.grupos.futura.total} note="ainda não programadas — não é erro" />
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

      {lista("2. Já deveriam estar em execução", "A tarefa está em andamento, a data de início ou de término já passou, ou a etapa dela já começou — e falta responsável ou prazo. É o que a coordenação e a gerência devem olhar primeiro.", q.grupos.execucao, true)}
      {lista("3. Pendências de planejamento", "Alguém já começou a planejar (há data ou responsável), mas falta o outro dado. Completar quando a etapa for programada.", q.grupos.planejamento, true)}
      {lista("4. Etapas futuras do modelo do projeto", "Sem datas e sem responsável, numa etapa que ainda não começou. Ficam como estão até a etapa entrar no planejamento de execução.", q.grupos.futura, false)}

      <Card title="5. Data de início prevista no Vobi" subtitle="Critério híbrido provisório: projeto sem data de início prevista entra pelo “Criado em”. O A360 lê a data todos os dias; quando a equipe preencher no Vobi, a regra definitiva passa a valer para aquele projeto.">
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
