import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import { contagem, linkVobiProjeto, ultimaCargaAceita } from "@/lib/consultas";
import { restricaoDe, sqlParticipa } from "@/lib/participacao";
import { TIPOS_LINHA, filtrar, linhaDoTempo, type Origem } from "@/lib/linha-do-tempo";
import { alertasDoProjeto, PRIORIDADES, SITUACOES } from "@/lib/alertas";
import { TIPOS_FLAG, flagsDoProjeto } from "@/lib/flags";
import { analisesDe } from "@/lib/analise";
import { dataHora } from "@/lib/agenda/datas";
import { Badge, Button, Card, Input, LinkButton, PageHeader } from "@/components/ui";
import { analisarProjetoAction } from "../../../reunioes/actions";
import { decidirFlagAction } from "../../../alertas/actions";

/** Linha do tempo única do projeto (T-188 evolução): A360 + Vobi, com filtros, alertas e flags. Mesma regra de acesso do projeto. */
export default async function LinhaDoTempoPage({ params, searchParams }: { params: Promise<{ codigo: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const { codigo } = await params; const sp = await searchParams;
  if (!/^\d+$/.test(codigo)) notFound();
  const p = (await db.select().from(schema.projetos).where(eq(schema.projetos.codigo, Number(codigo))).limit(1))[0];
  if (!p) notFound();
  const gestao = u.perfil !== "arquiteta";
  if (!gestao) { const carga = await ultimaCargaAceita(); const r = await restricaoDe(u.email); const ok = carga ? (await contagem(`select 1 from projeto p where p.codigo=${p.codigo} and ${sqlParticipa(r.email, r.nomes, carga.id, "p")}`)).length > 0 : false; if (!ok) redirect("/sem-permissao"); }
  const f = { origem: (sp.origem === "a360" || sp.origem === "vobi" ? sp.origem : "") as Origem | "", tipo: sp.tipo && TIPOS_LINHA[sp.tipo] ? sp.tipo : "", q: (sp.q ?? "").slice(0, 80) };
  const [tudo, alertas, flags, analises] = await Promise.all([linhaDoTempo(p.codigo), alertasDoProjeto(p.codigo), flagsDoProjeto(p.codigo), analisesDo(p.codigo)]);
  const lista = filtrar(tudo, f);
  const atual = `/projetos/${p.codigo}/linha-do-tempo${sp.origem || sp.tipo || sp.q ? `?${new URLSearchParams(Object.entries({ origem: f.origem, tipo: f.tipo, q: f.q }).filter(([, v]) => v)).toString()}` : ""}`;
  const porDia = new Map<string, typeof lista>();
  for (const a of lista) { const k = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full" }).format(a.quando); (porDia.get(k) ?? porDia.set(k, []).get(k)!).push(a); }
  const ultima = analises[0];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Projeto · Linha do tempo" title={p.nome}
        subtitle={<>{tudo.length} acontecimentos · {tudo.filter((a) => a.origem === "a360").length} do A360 · {tudo.filter((a) => a.origem === "vobi").length} do Vobi (exportação, somente leitura) · {alertas.filter((a) => SITUACOES[a.situacao]?.aberto).length} alertas abertos · {flags.filter((x) => x.situacao === "aberta").length} flags de limitação</>}
        actions={<div className="flex flex-wrap gap-2">
          {gestao && <form action={analisarProjetoAction}><input type="hidden" name="projeto" value={p.codigo} /><input type="hidden" name="volta" value={atual} /><Button variant="primary">Analisar divergências</Button></form>}
          <a className="btn btn-secondary" href={linkVobiProjeto(p.codigo)} target="_blank" rel="noreferrer">Vobi ↗</a>
          <LinkButton href={`/projetos/${p.codigo}`}>← Projeto</LinkButton>
        </div>} />
      {sp.analise && <div className={`leitura${sp.analise === "erro" ? " leitura-bad" : ""}`}><b>{sp.analise === "erro" ? "Falha" : "Análise"}</b>{sp.analise === "concluida" ? `Análise por IA concluída · ${sp.novos ?? 0} alerta(s) novo(s).` : sp.analise === "sem_ia" ? `IA não configurada: só as verificações determinísticas rodaram · ${sp.novos ?? 0} alerta(s) novo(s). Flag de limitação registrada.` : sp.analise === "processando" ? "Já há uma análise em andamento." : `A análise falhou: ${sp.erro ?? ""}. Flag de falha técnica registrada.`}</div>}
      {sp.flag && <div className="leitura"><b>OK</b>Decisão sobre a flag registrada.</div>}
      {sp.erro && !sp.analise && <div className="leitura leitura-bad"><b>Erro</b>{sp.erro}</div>}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-3">
          <form method="get" className="card flex flex-wrap items-end gap-2 p-3">
            <label className="block min-w-[12rem] flex-1 text-xs font-semibold text-[var(--txt-2)]">Buscar<Input name="q" defaultValue={f.q} placeholder="título, resumo ou participante" className="mt-1" /></label>
            <label className="block text-xs font-semibold text-[var(--txt-2)]">Origem<select name="origem" className="input mt-1" defaultValue={f.origem}><option value="">A360 + Vobi</option><option value="a360">A360</option><option value="vobi">Vobi</option></select></label>
            <label className="block text-xs font-semibold text-[var(--txt-2)]">Tipo<select name="tipo" className="input mt-1" defaultValue={f.tipo}><option value="">todos</option>{Object.entries(TIPOS_LINHA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <Button variant="secondary" className="btn-sm">Filtrar</Button>
            {(f.origem || f.tipo || f.q) && <Link className="text-xs underline" href={`/projetos/${p.codigo}/linha-do-tempo`}>limpar</Link>}
          </form>
          {!lista.length ? <Card title="Linha do tempo"><p className="text-sm text-[var(--muted)]">Nenhum acontecimento {f.q || f.origem || f.tipo ? "com esses filtros" : "registrado"}.</p></Card> : (
            <div className="flex flex-col gap-3">{[...porDia.entries()].map(([dia, acs]) => (
              <section key={dia} className="card p-4">
                <h2 className="mb-2 text-[0.78rem] font-bold uppercase tracking-wide text-[var(--txt-2)]">{dia}</h2>
                <ol className="tl">{acs.map((a) => (
                  <li key={a.id} className={`tl-item tl-${a.origem} ${a.destaque ? `tl-${a.destaque}` : ""}`}>
                    <div className="tl-meta"><span>{new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(a.quando)}{a.precisao !== "exata" && <span title={a.precisao === "carga" ? "data da exportação do Vobi em que a mudança apareceu" : "dia (sem hora na fonte)"}> ~</span>}</span><span className={`tl-origem tl-origem-${a.origem}`}>{a.origem === "a360" ? "A360" : "Vobi"}</span><span className="tag">{TIPOS_LINHA[a.tipo] ?? a.tipo}</span></div>
                    <div className="tl-corpo">
                      <p className="font-medium">{a.link ? (a.link.startsWith("http") ? <a className="underline" href={a.link} target="_blank" rel="noreferrer">{a.titulo} ↗</a> : <Link className="underline" href={a.link}>{a.titulo}</Link>) : a.titulo}</p>
                      {a.resumo && <p className="text-xs text-[var(--txt-2)]">{a.resumo}</p>}
                      {a.participantes && a.participantes.length > 0 && <p className="text-xs text-[var(--muted)]">{a.participantes.join(", ")}</p>}
                    </div>
                  </li>))}</ol>
              </section>))}</div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <Card title={`Alertas (${alertas.length})`} subtitle="divergências identificadas · tratamento pela coordenação/gestão">
            {alertas.length ? <ul className="flex flex-col divide-y divide-[var(--line)] text-sm">{alertas.slice(0, 10).map((a) => <li key={a.id} className="py-1.5"><Link className="underline" href={`/alertas/${a.id}?volta=${encodeURIComponent(atual)}`}>{a.titulo}</Link><div className="mt-0.5 flex flex-wrap gap-1 text-xs"><span className={`st st-${PRIORIDADES[a.prioridade]?.tom ?? "neutro"}`}><i aria-hidden /> {PRIORIDADES[a.prioridade]?.rotulo}</span><Badge tone={SITUACOES[a.situacao]?.tom ?? "neutral"}>{SITUACOES[a.situacao]?.rotulo}</Badge></div></li>)}</ul> : <p className="text-sm text-[var(--muted)]">Nenhum alerta. {gestao ? "Use “Analisar divergências” para cruzar os registros." : ""}</p>}
            {alertas.length > 10 && <p className="mt-2 text-xs"><Link className="underline" href={`/alertas?projeto=${p.codigo}`}>ver todos</Link></p>}
          </Card>
          <Card title={`Flags de limitação (${flags.filter((x) => x.situacao === "aberta").length} abertas)`} subtitle="o que o A360 não consegue comparar neste projeto e por quê">
            <div id="flags" className="flex flex-col gap-3 text-sm">
              {flags.length ? flags.map((fl) => (
                <div key={fl.id} className={`rounded-[10px] border p-3 ${fl.situacao === "aberta" ? "border-[var(--st-relevante)]" : "border-[var(--line)] opacity-80"}`}>
                  <p className="font-semibold">{fl.comparacao} <Badge tone={fl.situacao === "aberta" ? "warn" : fl.situacao === "aceita" ? "neutral" : "ok"}>{fl.situacao}</Badge></p>
                  <p className="text-xs"><b>Dado ausente:</b> {fl.dadoAusente}</p>
                  {fl.informacaoDisponivel && <p className="text-xs"><b>Disponível:</b> {fl.informacaoDisponivel}</p>}
                  <p className="text-xs"><b>Necessário:</b> {fl.informacaoNecessaria} · <b>origem esperada:</b> {fl.origemEsperada} · <b>limitação:</b> {TIPOS_FLAG[fl.tipo] ?? fl.tipo}</p>
                  {fl.analisesComprometidas && <p className="text-xs"><b>Consequência:</b> {fl.analisesComprometidas}</p>}
                  {fl.alternativa && <p className="text-xs"><b>Alternativa:</b> {fl.alternativa}</p>}
                  <p className="text-xs text-[var(--muted)]">identificada em {dataHora(fl.identificadoEm)}{fl.decididoEm ? ` · decisão em ${dataHora(fl.decididoEm)}: ${fl.justificativa ?? ""}` : ""}</p>
                  {gestao && fl.situacao === "aberta" && (
                    <form action={decidirFlagAction} className="mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={fl.id} /><input type="hidden" name="volta" value={atual} />
                      <input name="justificativa" className="input flex-1" placeholder="justificativa da decisão" required minLength={5} />
                      <button className="btn btn-secondary btn-sm" name="situacao" value="aceita" type="submit">Aceitar limitação</button>
                      <button className="btn btn-secondary btn-sm" name="situacao" value="resolvida" type="submit">Marcar resolvida</button>
                    </form>
                  )}
                </div>)) : <p className="text-[var(--muted)]">Nenhuma flag ainda — a análise gera as flags deste projeto.</p>}
            </div>
          </Card>
          <Card title="Análises" subtitle="execuções do cruzamento A360 × Vobi">
            {ultima ? <ul className="flex flex-col divide-y divide-[var(--line)] text-xs">{analises.map((a) => <li key={a.id} className="py-1"><b>{a.estado}</b>{a.provedor ? ` · ${a.provedor}${a.modelo ? ` (${a.modelo})` : ""}` : ""} · {a.alertasNovos} novos · {dataHora(a.iniciadoEm)}{a.erro ? ` · ${a.erro}` : ""}</li>)}</ul> : <p className="text-sm text-[var(--muted)]">Nenhuma análise executada.</p>}
          </Card>
        </div>
      </div>
      <p className="text-[0.74rem] text-[var(--muted)]">A360 reconstrói a história a partir dos próprios registros e das exportações do Vobi; datas marcadas com ~ são prazos planejados ou a data da exportação em que a mudança apareceu. Nada aqui altera o Vobi.</p>
    </div>
  );
}

async function analisesDo(codigo: number) { return analisesDe(codigo); }
