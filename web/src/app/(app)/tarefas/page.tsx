import Link from "next/link";
import { exigirUsuario, veIndicadoresIndividuais } from "@/lib/auth";
import { linkVobiProjeto } from "@/lib/consultas";
import { FILTROS_PRAZO, STATUS_PRAZO, rotuloCurto } from "@/lib/prazo";
import { lerFiltrosTarefas, listarTarefas, urlCom, type ParamsLista } from "@/lib/listas";
import { Chips, Paginacao, Th, VazioFiltrado } from "@/components/lista";
import { Button, Empty, Input, LinkButton, PageHeader, Select } from "@/components/ui";

const fmt = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

/** Lista operacional de tarefas (Vobi, última carga). Filtros na URL; destino do drill-down dos KPIs. */
export default async function TarefasPage({ searchParams }: { searchParams: Promise<ParamsLista> }) {
  const u = await exigirUsuario();
  const gestao = veIndicadoresIndividuais(u.perfil);
  const f = lerFiltrosTarefas(await searchParams);
  const r = await listarTarefas(f, gestao ? undefined : { email: u.email });
  const base = "/tarefas";
  const atual = { q: f.q, prazo: f.prazo, etapa: f.etapa, resp: f.resp, projeto: f.projeto, cliente: f.cliente, janela: f.janela, ate: f.ate, entregas: f.entregas, ord: f.ord !== "prazo" ? f.ord : null, dir: f.dir !== "asc" ? f.dir : null, pag: f.pag > 1 ? f.pag : null, n: f.n !== 25 ? f.n : null };
  if (!r.carga) return <><PageHeader eyebrow="Operação" title="Tarefas" /><Empty action={<LinkButton href="/importacao" variant="primary">Importar do Vobi</LinkButton>}>Nenhuma carga aceita ainda.</Empty></>;

  const chips = [
    f.prazo !== "abertas" ? { chave: "prazo", rotulo: "Prazo", valor: FILTROS_PRAZO[f.prazo].rotulo } : null,
    f.q ? { chave: "q", rotulo: "Busca", valor: f.q } : null,
    f.etapa ? { chave: "etapa", rotulo: "Etapa", valor: f.etapa } : null,
    f.resp ? { chave: "resp", rotulo: "Responsável", valor: f.resp === "__sem__" ? "sem responsável" : f.resp } : null,
    f.projeto ? { chave: "projeto", rotulo: "Projeto", valor: r.linhas[0]?.projetoCodigo === f.projeto ? r.linhas[0].projetoNome : `cód. ${f.projeto}` } : null,
    f.cliente ? { chave: "cliente", rotulo: "Cliente", valor: r.linhas[0]?.clienteCodigo === f.cliente ? r.linhas[0].cliente : `cód. ${f.cliente}` } : null,
    f.janela ? { chave: "janela", rotulo: "Vencem", valor: `de hoje a ${f.janela} dias` } : null,
    f.ate ? { chave: "ate", rotulo: "Prazo", valor: `atrasadas e até ${f.ate} dias` } : null,
    f.entregas ? { chave: "entregas", rotulo: "Só entregas", valor: "sim" } : null,
  ].filter(Boolean) as { chave: string; rotulo: string; valor: React.ReactNode }[];
  const temFiltro = chips.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Operação" title="Tarefas"
        subtitle={<>Dados do Vobi de <b>{fmt(r.carga.dataCarga)}</b> (carga {r.carga.id}) · prazos comparados com hoje, {fmt(r.hoje)}. {gestao ? "Todas as tarefas da carga." : "Só as tarefas em que você é responsável."} Tarefas concluídas no Vobi após a exportação ainda aparecem abertas.</>}
        actions={<LinkButton href="/meu-dia">← Meu dia</LinkButton>} />

      <form method="get" action={base} className="card flex flex-wrap items-end gap-3 p-3 md:p-4">
        <input type="hidden" name="prazo" value={f.prazo} />
        {f.projeto && <input type="hidden" name="projeto" value={f.projeto} />}
        {f.cliente && <input type="hidden" name="cliente" value={f.cliente} />}
        <label className="block min-w-[14rem] flex-1 text-xs font-semibold text-[var(--txt-2)]">Buscar<Input name="q" defaultValue={f.q} placeholder="projeto, cliente ou tarefa (sem acento)" className="mt-1" /></label>
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Etapa<Select name="etapa" defaultValue={f.etapa} className="mt-1 w-56"><option value="">todas</option>{r.etapas.map((e) => <option key={e} value={e}>{e}</option>)}</Select></label>
        {gestao && <label className="block text-xs font-semibold text-[var(--txt-2)]">Responsável<Select name="resp" defaultValue={f.resp} className="mt-1 w-52"><option value="">todos</option><option value="__sem__">sem responsável (Vobi)</option>{r.responsaveis.map((e) => <option key={e} value={e}>{e}</option>)}</Select></label>}
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Vencem<Select name="janela" defaultValue={f.janela ?? ""} className="mt-1 w-44"><option value="">qualquer data</option><option value="7">de hoje a 7 dias</option><option value="14">de hoje a 14 dias</option><option value="30">de hoje a 30 dias</option></Select></label>
        {f.ate && <input type="hidden" name="ate" value={f.ate} />}
        <label className="flex items-center gap-2 pb-2 text-xs font-semibold text-[var(--txt-2)]"><input type="checkbox" name="entregas" value="1" defaultChecked={f.entregas} /> só entregas</label>
        <Button className="btn-sm">Filtrar</Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Prazo" className="seg flex-wrap">
          {(["abertas", "atrasadas", "hoje", "7d", "no_prazo", "sem_prazo"] as const).map((k) => (
            <Link key={k} href={urlCom(base, atual, { prazo: k, pag: null })} aria-current={f.prazo === k ? "page" : undefined}>{FILTROS_PRAZO[k].rotulo}</Link>
          ))}
        </nav>
        <Chips base={base} atual={atual} itens={chips} limparPara={base} />
      </div>

      <div className="card overflow-x-auto">
        {r.linhas.length ? (
          <table className="tbl">
            <thead><tr>
              <Th base={base} atual={atual} chave="prazo" ordAtual={f.ord} dirAtual={f.dir}>Prazo</Th>
              <Th base={base} atual={atual} chave="status" ordAtual={f.ord} dirAtual={f.dir}>Situação</Th>
              <Th base={base} atual={atual} chave="tarefa" ordAtual={f.ord} dirAtual={f.dir}>Tarefa</Th>
              <Th base={base} atual={atual} chave="etapa" ordAtual={f.ord} dirAtual={f.dir}>Etapa</Th>
              <Th base={base} atual={atual} chave="projeto" ordAtual={f.ord} dirAtual={f.dir}>Projeto · cliente</Th>
              {gestao && <Th base={base} atual={atual} chave="resp" ordAtual={f.ord} dirAtual={f.dir}>Responsável</Th>}
              <th>Status Vobi</th><th></th>
            </tr></thead>
            <tbody>{r.linhas.map((t) => {
              const meta = STATUS_PRAZO[t.prazo];
              return (
                <tr key={t.chave}>
                  <td className="whitespace-nowrap">{fmt(t.dataFim)}</td>
                  <td><span className={`st st-${meta.tom}`} title={meta.rotulo}><i aria-hidden /> {rotuloCurto({ status: t.prazo, dias: t.dias, atrasada: meta.grupo === "atrasada", aberta: meta.grupo !== "fechada" })}</span></td>
                  <td>{t.nome}</td>
                  <td>{t.etapa}</td>
                  <td><Link className="ent" href={`/projetos/${t.projetoCodigo}`}>{t.projetoNome}</Link><span className="sub">{t.cliente ?? "sem cliente associado"}</span></td>
                  {gestao && <td>{t.responsavel ?? <span className="text-[var(--muted)]" title="O Vobi não informa responsável para esta tarefa">sem responsável</span>}</td>}
                  <td className="text-[var(--txt-2)]">{t.status}</td>
                  <td className="whitespace-nowrap"><a className="text-xs underline" href={linkVobiProjeto(t.projetoCodigo)} target="_blank" rel="noreferrer" title="Abrir as tarefas do projeto no Vobi">Vobi ↗</a></td>
                </tr>
              );
            })}</tbody>
          </table>
        ) : <VazioFiltrado temFiltro={temFiltro} limparPara={base}>Nenhuma tarefa com {temFiltro ? "estes filtros" : "este critério"}.</VazioFiltrado>}
      </div>
      <Paginacao base={base} atual={atual} total={r.total} pag={f.pag} n={f.n} />
      <p className="text-xs text-[var(--muted)]">Tarefas sem projeto resolvido (órfãs) ficam fora desta lista; veja <Link className="underline" href="/qualidade">Qualidade dos dados</Link>. Responsável ausente é limitação da fonte, não falha de alguém.</p>
    </div>
  );
}
