import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { podeGerirAgenda } from "@/lib/agenda/atividades";
import { apiConfigurada } from "@/lib/vobi/api";
import { diagnosticoCobertura, indicadoresCobertura } from "@/lib/vobi/cobertura";
import { ultimaCargaInicial } from "@/lib/vobi/espelho";
import { cargaInicialAction } from "./actions";
import { Card, Empty, LinkButton, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * T-219 — Diagnóstico de cobertura: a programação existente no Vobi × o que está na Agenda do A360. Só leitura: lê as
 * tarefas pela API (GET) quando a gestão pede e compara; não grava nada no Vobi nem no banco. Condição para liberar escrita.
 */
export default async function CoberturaPage({ searchParams }: { searchParams: Promise<{ ler?: string; carga?: string }> }) {
  const u = await exigirUsuario();
  if (!podeGerirAgenda(u.perfil)) redirect("/sem-permissao");
  const sp = await searchParams;
  let d: Awaited<ReturnType<typeof diagnosticoCobertura>> | null = null, erro: string | null = null;
  if (sp.ler === "1" && apiConfigurada()) { try { d = await diagnosticoCobertura(); } catch (e) { erro = (e as Error).message; } }
  const ind = await indicadoresCobertura();
  const ci = ultimaCargaInicial;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Agenda" title="Cobertura da programação do Vobi"
        subtitle="Recorte 2026: só projetos iniciados em 2026 entram na Agenda e na sincronização. Só leitura: nada é gravado no Vobi."
        actions={<div className="flex flex-wrap gap-2"><form action={cargaInicialAction}><button className="btn btn-primary" disabled={!!ci && !ci.fim}>{ci && !ci.fim ? "Carga inicial em andamento…" : "Carga inicial da Programação do Vobi"}</button></form><LinkButton href="/agenda/cobertura?ler=1">Diagnóstico direto no Vobi</LinkButton><LinkButton href="/agenda/pendencias">Pendências</LinkButton></div>} />
      {ci && <div className={`leitura${ci.erro ? " leitura-bad" : ""}`}><b>Carga inicial</b>{!ci.fim ? `em andamento desde ${new Date(ci.inicio).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })} — atualize a página em instantes (só leitura no Vobi).` : ci.erro ? `falhou: ${ci.erro}` : `concluída às ${new Date(ci.fim).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}: ${JSON.stringify(ci.resultado)}`}</div>}

      <Card title="Cobertura no A360 — recorte 2026 (projetos iniciados em 2026)" subtitle={`Tarefas dos projetos iniciados em 2026 guardadas com o número do Vobi${ind.importadas.lidoEm ? ` · última leitura ${new Date(ind.importadas.lidoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : " · ainda não importadas"}. Escrita no Vobi desligada.`}>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Importadas e identificadas" value={ind.importadas.total} note={`${ind.importadas.comData} com data · ${ind.importadas.semData} sem data`} />
          <Stat label="Vínculo confirmado (tarefa da carga ↔ nº Vobi)" value={ind.vinculo.cargaConfirmadas} tone="ok" note={`${ind.vinculo.atividades} programadas no A360`} />
          <Stat label="Pendentes de reconciliação" value={ind.pendentes.cargaSemVinculo + ind.pendentes.vobiSemCarga} tone="warn" note={`${ind.pendentes.ambiguasTarefas} em nomes repetidos`} />
          <Stat label="Responsáveis mapeados" value={ind.responsaveis.mapeados} tone="ok" note={`${ind.responsaveis.tarefasMapeadas} tarefas`} />
          <Stat label="Responsáveis sem mapeamento" value={ind.responsaveis.semMapeamento.length} tone={ind.responsaveis.semMapeamento.length ? "warn" : "neutral"} note={`${ind.pendentes.responsavelSoNumero} tarefas`} />
          <Stat label="Aptas para programação e envio" value={ind.aptas.aptas} tone="ok" note={`de ${ind.aptas.abertas} abertas`} />
        </div>
        <div className="mt-3 grid gap-1 text-sm">
          <div>Fora do recorte: {ind.foraDoRecorte.projetos} projetos do A360 iniciados antes de 2026 e {ind.foraDoRecorte.tarefasPreservadas} tarefas deles já copiadas — preservadas, sem atualização, fora da Agenda e dos indicadores.</div>
          <div>Por status: {ind.importadas.planejadas} planejadas · {ind.importadas.andamento} em andamento · {ind.importadas.concluidas} concluídas · {ind.importadas.canceladas} canceladas{ind.importadas.ausentes ? ` · ${ind.importadas.ausentes} não encontradas na última conferência (mantidas)` : ""}.</div>
          <div>Pendências de reconciliação: {ind.pendentes.cargaSemVinculo} tarefas da carga sem número do Vobi ({ind.pendentes.ambiguasGrupos} grupos com nome repetido, {ind.pendentes.ambiguasTarefas} tarefas — não associadas por aproximação) · {ind.pendentes.vobiSemCarga} tarefas do Vobi sem tarefa da carga correspondente ({ind.pendentes.vobiSemCargaComData} com data; {ind.pendentes.vobiSemCargaEncerrados} em projetos encerrados, que a carga não traz — estão na Agenda pelo número) · {ind.pendentes.responsavelSoNumero} com responsável só por número · {ind.pendentes.semResponsavel} sem responsável.</div>
          <div>Bloqueio por tarefa (abertas): {ind.aptas.bloqueadasResponsavel} por responsável sem mapeamento · {ind.aptas.bloqueadasSemResponsavel} sem responsável · {ind.aptas.semTermino} sem data de término. As demais não são afetadas.</div>
          {ind.responsaveis.semMapeamento.length > 0 && <div>Sem mapeamento: {ind.responsaveis.semMapeamento.map((r) => `nº ${r.id}${r.nome ? ` (${r.nome})` : ""}: ${r.tarefas} (${r.abertas} abertas)`).join(" · ")} — <Link className="underline" href="/pessoas">indicar em Pessoas</Link></div>}
          {ind.pendentes.ambiguasExemplos.length > 0 && <details><summary>Nomes repetidos (carga) — {ind.pendentes.ambiguasGrupos} grupos</summary><ul className="text-xs">{ind.pendentes.ambiguasExemplos.map((a) => <li key={a.k}>{a.k.split("|").join(" · ")} — {a.n} tarefas</li>)}</ul></details>}
        </div>
      </Card>
      {erro && <div className="leitura leitura-bad"><b>Erro</b>{erro}</div>}
      {!d ? <Empty>Diagnóstico direto no Vobi: clique em “Diagnóstico direto no Vobi”. A leitura usa cerca de 25 chamadas da API (limite de 1.000 por hora) e leva até um minuto.</Empty> : (
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
            <div className="mt-3 text-sm">Escopo: {d.escopo.projetoNoA360} em projetos iniciados em 2026 ({d.escopo.projetoAtivoNoA360} em projetos ativos) · {d.escopo.projetoForaDoA360} em projetos anteriores a 2026 (ficam só no Vobi; não contam como pendência) · {d.escopo.semProjeto} sem projeto (fora do escopo).</div>
          </Card>
          <Card title="Tarefas com data em projetos iniciados em 2026 × Agenda do A360">
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Tarefas com data (recorte 2026)" value={d.comDataNoA360.total} />
              <Stat label="Representadas na Agenda pelo número (Programação do Vobi)" value={d.comDataNoA360.noEspelho} tone="ok" note={pct(d.comDataNoA360.noEspelho, d.comDataNoA360.total)} />
              <Stat label="Programadas no A360 (atividades)" value={d.comDataNoA360.naAgenda} note="nascem em “Programar no A360”" />
              <Stat label="Sem nenhuma representação no A360" value={d.comDataNoA360.semRepresentacao} />
            </div>
            <div className="mt-3 text-sm">Representação atual: no espelho com número do Vobi {d.comDataNoA360.noEspelho} · como tarefa importada pela carga (sem número, por projeto + nome) {d.comDataNoA360.comoTarefaImportada} · correspondência ambígua (nome repetido no projeto) {d.comDataNoA360.importadaAmbigua}.</div>
            <div className="mt-1 text-sm">Agenda do A360 hoje: {d.a360.atividades} atividades ({d.a360.independentes} independentes, {d.a360.vinculadas} ligadas ao Vobi).</div>
          </Card>
          <Card title="Responsáveis (tarefas com data no recorte 2026)">
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
