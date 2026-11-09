import Link from "next/link";
import { exigirUsuario, veIndicadoresIndividuais } from "@/lib/auth";
import { linkVobiProjeto } from "@/lib/consultas";
import { ROTULO_VINCULO, TOM_VINCULO } from "@/lib/clientes";
import { RISCO_REFACAO_FRACAO, SITUACOES_PROJETO, lerFiltrosProjetos, listarProjetos, urlCom, type ParamsLista } from "@/lib/listas";
import { Chips, Paginacao, Th, VazioFiltrado } from "@/components/lista";
import { Badge, Button, Empty, Input, LinkButton, PageHeader, Select } from "@/components/ui";

const fmt = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

/** Lista operacional de projetos (Vobi, última carga) com cliente, abertas, atrasadas e próximo prazo. */
export default async function ProjetosPage({ searchParams }: { searchParams: Promise<ParamsLista> }) {
  const u = await exigirUsuario();
  const gestao = veIndicadoresIndividuais(u.perfil);
  const f = lerFiltrosProjetos(await searchParams);
  const r = await listarProjetos(f);
  const base = "/projetos";
  const atual = { q: f.q, situacao: f.situacao !== "ativos" ? f.situacao : null, cliente: f.cliente, vinculo: f.vinculo, ord: f.ord !== "atrasadas" ? f.ord : null, dir: f.dir !== "desc" ? f.dir : null, pag: f.pag > 1 ? f.pag : null, n: f.n !== 25 ? f.n : null };
  if (!r.carga) return <><PageHeader eyebrow="Operação" title="Projetos" /><Empty action={<LinkButton href="/importacao" variant="primary">Importar do Vobi</LinkButton>}>Nenhuma carga aceita ainda.</Empty></>;
  const chips = [
    f.situacao !== "ativos" ? { chave: "situacao", rotulo: "Situação", valor: SITUACOES_PROJETO[f.situacao] } : null,
    f.q ? { chave: "q", rotulo: "Busca", valor: f.q } : null,
    f.cliente ? { chave: "cliente", rotulo: "Cliente", valor: r.linhas[0]?.clienteCodigo === f.cliente ? r.linhas[0].cliente : `cód. ${f.cliente}` } : null,
    f.vinculo ? { chave: "vinculo", rotulo: "Vínculo", valor: ROTULO_VINCULO[f.vinculo] } : null,
  ].filter(Boolean) as { chave: string; rotulo: string; valor: React.ReactNode }[];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Operação" title="Projetos"
        subtitle={<>Dados do Vobi de <b>{fmt(r.carga.dataCarga)}</b> (carga {r.carga.id}) · prazos comparados com hoje, {fmt(r.hoje)}. &ldquo;Exigem acompanhamento&rdquo; = alguma tarefa atrasada ou ≥ {Math.round(RISCO_REFACAO_FRACAO * 100)}% das horas em Refação; tarefas sem responsável não contam (limitação da fonte).</>}
        actions={<LinkButton href="/meu-dia">← Meu dia</LinkButton>} />

      <form method="get" action={base} className="card flex flex-wrap items-end gap-3 p-3 md:p-4">
        {f.situacao !== "ativos" && <input type="hidden" name="situacao" value={f.situacao} />}
        {f.cliente && <input type="hidden" name="cliente" value={f.cliente} />}
        <label className="block min-w-[14rem] flex-1 text-xs font-semibold text-[var(--txt-2)]">Buscar<Input name="q" defaultValue={f.q} placeholder="projeto, cliente ou código (sem acento)" className="mt-1" /></label>
        {gestao && <label className="block text-xs font-semibold text-[var(--txt-2)]">Vínculo com cliente<Select name="vinculo" defaultValue={f.vinculo} className="mt-1 w-56"><option value="">todos</option>{Object.entries(ROTULO_VINCULO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></label>}
        <Button className="btn-sm">Filtrar</Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Situação" className="seg flex-wrap">
          {Object.entries(SITUACOES_PROJETO).map(([k, v]) => <Link key={k} href={urlCom(base, atual, { situacao: k === "ativos" ? null : k, pag: null })} aria-current={f.situacao === k ? "page" : undefined}>{v}</Link>)}
        </nav>
        <Chips base={base} atual={atual} itens={chips} limparPara={base} />
      </div>

      <div className="card overflow-x-auto">
        {r.linhas.length ? (
          <table className="tbl">
            <thead><tr>
              <Th base={base} atual={atual} chave="projeto" ordAtual={f.ord} dirAtual={f.dir}>Projeto</Th>
              <Th base={base} atual={atual} chave="cliente" ordAtual={f.ord} dirAtual={f.dir}>Cliente</Th>
              <Th base={base} atual={atual} chave="status" ordAtual={f.ord} dirAtual={f.dir}>Status</Th>
              <Th base={base} atual={atual} chave="abertas" ordAtual={f.ord} dirAtual={f.dir}>Abertas</Th>
              <Th base={base} atual={atual} chave="atrasadas" ordAtual={f.ord} dirAtual={f.dir}>Atrasadas</Th>
              <th>Próx. 7 dias</th><th>Sem prazo</th>
              <Th base={base} atual={atual} chave="prazo" ordAtual={f.ord} dirAtual={f.dir}>Próximo prazo</Th>
              <th></th>
            </tr></thead>
            <tbody>{r.linhas.map((p) => (
              <tr key={p.codigo}>
                <td><Link className="ent" href={`/projetos/${p.codigo}`}>{p.nome}</Link><span className="sub">cód. {p.codigo}{p.acompanhar && <> · <span className="text-[var(--st-relevante)]">exige acompanhamento</span></>}</span></td>
                <td>{p.cliente ? <Link className="underline" href={`/clientes/${p.clienteCodigo}`}>{p.cliente}</Link> : <span className="text-[var(--muted)]">{p.vinculo === "ambiguo" ? "cliente ambíguo" : "sem cliente associado"}</span>}{p.vinculo === "manual" && <span className="sub"><Badge tone={TOM_VINCULO.manual}>decisão manual</Badge></span>}</td>
                <td><Badge tone={p.statusClasse === "encerrado" ? "neutral" : p.statusClasse === "pausado" ? "warn" : "ok"}>{p.status}</Badge></td>
                <td><Link className="underline" href={urlCom("/tarefas", {}, { projeto: p.codigo })}>{p.abertas}</Link></td>
                <td>{p.atrasadas ? <Link className={`font-semibold underline ${p.atrasadas ? "num-relevante" : ""}`} href={urlCom("/tarefas", {}, { projeto: p.codigo, prazo: "atrasadas" })}>{p.atrasadas}</Link> : <span className="text-[var(--muted)]">0</span>}</td>
                <td>{p.proximas ? <Link className="underline" href={urlCom("/tarefas", {}, { projeto: p.codigo, prazo: "proximas" })}>{p.proximas}</Link> : <span className="text-[var(--muted)]">0</span>}</td>
                <td className="text-[var(--muted)]">{p.semPrazo}</td>
                <td className="whitespace-nowrap">{p.proximoPrazo ? <>{fmt(p.proximoPrazo)}<span className="sub">{p.proximaEtapa}</span></> : <span className="text-[var(--muted)]">—</span>}</td>
                <td className="whitespace-nowrap"><a className="text-xs underline" href={linkVobiProjeto(p.codigo)} target="_blank" rel="noreferrer">Vobi ↗</a></td>
              </tr>
            ))}</tbody>
          </table>
        ) : <VazioFiltrado temFiltro={chips.length > 0} limparPara={base}>Nenhum projeto com estes filtros.</VazioFiltrado>}
      </div>
      <Paginacao base={base} atual={atual} total={r.total} pag={f.pag} n={f.n} />
    </div>
  );
}
