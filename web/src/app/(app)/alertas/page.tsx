import Link from "next/link";
import { exigirUsuario } from "@/lib/auth";
import { CLASSIFICACOES, PRIORIDADES, SITUACOES, indicadoresAlertas, listarAlertas } from "@/lib/alertas";
import { contagemFlags, flagsAbertas, TIPOS_FLAG } from "@/lib/flags";
import { dataHora } from "@/lib/agenda/datas";
import { Badge, Button, Card, Empty, LinkButton, PageHeader, Stat } from "@/components/ui";

/** Central de alertas (T-188 evolução, item 7): coordenação, gestão e admin. Arquiteta vê só alertas dos seus projetos (contexto, não cobrança). */
export default async function AlertasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const gestao = u.perfil !== "arquiteta";
  const f = { situacao: sp.situacao && SITUACOES[sp.situacao] ? sp.situacao : "", prioridade: sp.prioridade && PRIORIDADES[sp.prioridade] ? sp.prioridade : "", classificacao: sp.classificacao && CLASSIFICACOES[sp.classificacao] ? sp.classificacao : "", projeto: /^\d+$/.test(sp.projeto ?? "") ? Number(sp.projeto) : null, abertos: sp.abertos === "1" };
  const [lista, ind, flags, cf] = await Promise.all([listarAlertas(u, f), gestao ? indicadoresAlertas() : null, gestao ? flagsAbertas() : [], gestao ? contagemFlags() : null]);
  const qs = new URLSearchParams(Object.entries({ situacao: f.situacao, prioridade: f.prioridade, classificacao: f.classificacao, projeto: f.projeto ? String(f.projeto) : "", abertos: f.abertos ? "1" : "" }).filter(([, v]) => v)).toString();
  const atual = `/alertas${qs ? `?${qs}` : ""}`;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Alertas" title="Alertas e correção de rota"
        subtitle="Divergências identificadas pela IA e pelas verificações do A360 entre o que foi aprovado, decidido e registrado. A IA identifica e recomenda; a gestão decide; a produção executa. Nada altera o Vobi."
        actions={<div className="flex gap-2"><LinkButton href="/integracao-vobi">Cobertura Vobi</LinkButton><LinkButton href="/painel">← Painel</LinkButton></div>} />
      {ind && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Stat label="Abertos" value={ind.abertos} tone={ind.abertos ? "warn" : "ok"} href="/alertas?abertos=1" note={`em ${ind.projetos} projeto(s)`} />
          <Stat label="Críticos" value={ind.criticos} tone={ind.criticos ? "bad" : "ok"} href="/alertas?abertos=1&prioridade=critico" />
          <Stat label="Alta prioridade" value={ind.altos} tone={ind.altos ? "warn" : "ok"} href="/alertas?abertos=1&prioridade=alto" />
          <Stat label="Aguardando análise" value={ind.aguardando} tone="neutral" href="/alertas?situacao=aberto" />
          <Stat label="Em tratamento" value={ind.tratamento} tone="neutral" href="/alertas?situacao=em_tratamento" note={ind.diasTratamento ? `tempo médio de tratamento: ${ind.diasTratamento} d` : undefined} />
          <Stat label="Flags de limitação" value={cf?.abertas ?? 0} tone={cf?.abertas ? "warn" : "ok"} href="/alertas#flags" note={`${cf?.projetosSemCobertura ?? 0} projeto(s) sem cobertura suficiente`} />
        </div>
      )}
      <form method="get" className="card flex flex-wrap items-end gap-2 p-3">
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Situação<select name="situacao" className="input mt-1" defaultValue={f.situacao}><option value="">todas</option>{Object.entries(SITUACOES).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select></label>
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Prioridade<select name="prioridade" className="input mt-1" defaultValue={f.prioridade}><option value="">todas</option>{Object.entries(PRIORIDADES).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select></label>
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Classificação<select name="classificacao" className="input mt-1" defaultValue={f.classificacao}><option value="">todas</option>{Object.entries(CLASSIFICACOES).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select></label>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="abertos" value="1" defaultChecked={f.abertos} /> só abertos</label>
        {f.projeto && <input type="hidden" name="projeto" value={f.projeto} />}
        <Button variant="secondary" className="btn-sm">Filtrar</Button>{qs && <Link className="text-xs underline" href="/alertas">limpar</Link>}
      </form>
      {!lista.length ? <Empty>Nenhum alerta {qs ? "com esses filtros" : "registrado"}. Os alertas nascem da análise de divergências na linha do tempo de cada projeto.</Empty> : (
        <Card title={`Alertas (${lista.length})`}>
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Prioridade</th><th>Alerta</th><th>Projeto · cliente</th><th>Classificação</th><th>Situação</th><th>Identificado</th></tr></thead>
            <tbody>{lista.map((a) => (
              <tr key={a.id}>
                <td><span className={`st st-${PRIORIDADES[a.prioridade]?.tom ?? "neutro"}`}><i aria-hidden /> {PRIORIDADES[a.prioridade]?.rotulo}</span></td>
                <td><Link className="ent" href={`/alertas/${a.id}?volta=${encodeURIComponent(atual)}`}>{a.titulo}</Link><span className="sub">{a.categoria.replace(/_/g, " ")}{a.confianca != null ? ` · confiança ${a.confianca}%` : ""}{a.responsavel ? ` · ${a.responsavel}` : ""}{a.prazo ? ` · prazo ${a.prazo.split("-").reverse().join("/")}` : ""}</span></td>
                <td>{a.projetoNome ? <Link className="underline" href={`/projetos/${a.projetoCodigo}/linha-do-tempo`}>{a.projetoNome}</Link> : a.projetoCodigo}{a.clienteNome && <span className="sub">{a.clienteNome}</span>}</td>
                <td><Badge tone={CLASSIFICACOES[a.classificacao]?.tom ?? "neutral"}>{CLASSIFICACOES[a.classificacao]?.rotulo ?? a.classificacao}</Badge></td>
                <td><Badge tone={SITUACOES[a.situacao]?.tom ?? "neutral"}>{SITUACOES[a.situacao]?.rotulo ?? a.situacao}</Badge></td>
                <td className="whitespace-nowrap text-xs text-[var(--muted)]">{dataHora(a.criadoEm)}</td>
              </tr>))}</tbody>
          </table></div>
        </Card>
      )}
      {ind && ind.recorrentes.length > 0 && <Card title="Divergências recorrentes" subtitle="categorias com 2 ou mais ocorrências (confirmadas ou possíveis)"><ul className="flex flex-wrap gap-2 text-sm">{ind.recorrentes.map((r) => <li key={r.categoria} className="tag">{r.categoria.replace(/_/g, " ")} · {r.n}</li>)}</ul></Card>}
      {gestao && (
        <Card title={`Flags de limitação de dados abertas (${flags.length})`} subtitle="o que o A360 não consegue comparar · decisão consciente na linha do tempo do projeto ou no inventário">
          <div id="flags">{flags.length ? <ul className="flex flex-col divide-y divide-[var(--line)] text-sm">{flags.slice(0, 30).map((fl) => <li key={fl.id} className="py-1.5"><Link className="underline" href={fl.projetoCodigo ? `/projetos/${fl.projetoCodigo}/linha-do-tempo#flags` : "/integracao-vobi#flags"}>{fl.comparacao}</Link> <span className="text-xs text-[var(--muted)]">· {fl.projetoCodigo ? `projeto ${fl.projetoCodigo}` : "geral"} · {TIPOS_FLAG[fl.tipo] ?? fl.tipo} · {fl.dadoAusente.slice(0, 100)}</span></li>)}</ul> : <p className="text-sm text-[var(--muted)]">Nenhuma flag aberta.</p>}</div>
        </Card>
      )}
    </div>
  );
}
