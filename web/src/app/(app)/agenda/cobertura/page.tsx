import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { podeGerirAgenda } from "@/lib/agenda/atividades";
import { apiConfigurada } from "@/lib/vobi/api";
import { diagnosticoCobertura } from "@/lib/vobi/cobertura";
import { Card, Empty, LinkButton, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * T-219 — Diagnóstico de cobertura: a programação existente no Vobi × o que está na Agenda do A360. Só leitura: lê as
 * tarefas pela API (GET) quando a gestão pede e compara; não grava nada no Vobi nem no banco. Condição para liberar escrita.
 */
export default async function CoberturaPage({ searchParams }: { searchParams: Promise<{ ler?: string }> }) {
  const u = await exigirUsuario();
  if (!podeGerirAgenda(u.perfil)) redirect("/sem-permissao");
  const sp = await searchParams;
  let d: Awaited<ReturnType<typeof diagnosticoCobertura>> | null = null, erro: string | null = null;
  if (sp.ler === "1" && apiConfigurada()) { try { d = await diagnosticoCobertura(); } catch (e) { erro = (e as Error).message; } }
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Agenda" title="Cobertura da programação do Vobi"
        subtitle="Quantas tarefas com data existem no Vobi e quantas estão representadas na Agenda do A360. Só leitura: nada é gravado no Vobi nem no A360."
        actions={<div className="flex gap-2"><LinkButton href="/agenda/cobertura?ler=1" variant="primary">Ler o Vobi agora (só leitura)</LinkButton><LinkButton href="/agenda/pendencias">Pendências</LinkButton></div>} />
      {erro && <div className="leitura leitura-bad"><b>Erro</b>{erro}</div>}
      {!d ? <Empty>Clique em “Ler o Vobi agora”. A leitura usa cerca de 25 chamadas da API (limite de 1.000 por hora) e leva até um minuto.</Empty> : (
        <>
          <Card title="Programação existente no Vobi (todas as tarefas)" subtitle={`Lido em ${new Date(d.lidoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · ${d.segundos} s · ~${d.chamadas} chamadas`}>
            <div className="grid gap-3 sm:grid-cols-5">
              <Stat label="Tarefas no Vobi" value={d.geral.total} />
              <Stat label="Com início e término" value={d.geral.ambas} />
              <Stat label="Só início" value={d.geral.soInicio} />
              <Stat label="Só término" value={d.geral.soTermino} />
              <Stat label="Sem data" value={d.geral.semData} note="não são descartadas" />
            </div>
            <div className="mt-3 overflow-x-auto"><table className="tbl"><thead><tr><th>Status no Vobi</th><th>Tarefas</th><th>Início e término</th><th>Só início</th><th>Só término</th><th>Sem data</th></tr></thead><tbody>
              {Object.entries(d.porStatus).map(([s, c]) => <tr key={s}><td>{s}</td><td>{c.total}</td><td>{c.ambas}</td><td>{c.soInicio}</td><td>{c.soTermino}</td><td>{c.semData}</td></tr>)}
            </tbody></table></div>
            <div className="mt-3 text-sm">Escopo: {d.escopo.projetoNoA360} em projetos que estão no A360 ({d.escopo.projetoAtivoNoA360} em projetos ativos) · {d.escopo.projetoForaDoA360} em projetos fora do A360 (antigos/arquivados, recorte 2026) · {d.escopo.semProjeto} sem projeto (tarefa geral).</div>
          </Card>
          <Card title="Tarefas com data em projetos do A360 × Agenda do A360">
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Tarefas com data (projetos do A360)" value={d.comDataNoA360.total} />
              <Stat label="Já na Agenda (vinculadas pelo número)" value={d.comDataNoA360.naAgenda} tone={d.comDataNoA360.naAgenda ? "ok" : "neutral"} note={pct(d.comDataNoA360.naAgenda, d.comDataNoA360.total)} />
              <Stat label="Precisam ser vinculadas" value={d.comDataNoA360.precisaVincular} tone="warn" />
              <Stat label="Sem nenhuma representação no A360" value={d.comDataNoA360.semRepresentacao} />
            </div>
            <div className="mt-3 text-sm">Representação atual: no espelho com número do Vobi {d.comDataNoA360.noEspelho} · como tarefa importada pela carga (sem número, por projeto + nome) {d.comDataNoA360.comoTarefaImportada} · correspondência ambígua (nome repetido no projeto) {d.comDataNoA360.importadaAmbigua}.</div>
            <div className="mt-1 text-sm">Agenda do A360 hoje: {d.a360.atividades} atividades ({d.a360.independentes} independentes, {d.a360.vinculadas} ligadas ao Vobi).</div>
          </Card>
          <Card title="Responsáveis (tarefas com data em projetos do A360)">
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Com acesso no A360" value={d.resp.comAcesso} tone="ok" />
              <Stat label="Nome conhecido, sem acesso ligado" value={d.resp.soNome} tone={d.resp.soNome ? "warn" : "neutral"} />
              <Stat label="Só número (não mapeado)" value={d.resp.desconhecido} tone={d.resp.desconhecido ? "warn" : "neutral"} />
              <Stat label="Sem responsável" value={d.resp.semResponsavel} />
            </div>
            {d.respPendentes.length > 0 && <div className="mt-3 text-sm">Pendentes: {d.respPendentes.map((r) => `nº ${r.id}${r.nome ? ` (${r.nome})` : ""}: ${r.n}`).join(" · ")} — <Link className="underline" href="/pessoas">Pessoas</Link></div>}
          </Card>
          <Card title={`Possíveis duplicidades no Vobi (${d.duplicidades.grupos} grupos, ${d.duplicidades.tarefas} tarefas)`} subtitle="Mesmo projeto, mesmo nome e mesmo dia de término. Não é erro por si: confira antes de vincular.">
            {d.duplicidades.exemplos.length ? <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Projeto</th><th>Nome (normalizado)</th><th>Término</th><th>Números no Vobi</th></tr></thead><tbody>
              {d.duplicidades.exemplos.map((x, i) => <tr key={i}><td>{x.projeto}</td><td>{x.nome}</td><td>{x.termino || "—"}</td><td>{x.ids.join(", ")}</td></tr>)}
            </tbody></table></div> : <Empty>Nenhuma.</Empty>}
          </Card>
        </>
      )}
    </div>
  );
}
