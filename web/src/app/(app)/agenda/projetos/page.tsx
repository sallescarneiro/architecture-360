import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import * as P from "@/lib/agenda/producao";
import * as C from "@/lib/agenda/carteira";
import { dataCurta, dataHora, hojeLocal } from "@/lib/agenda/datas";
import { Button, PageHeader } from "@/components/ui";
import { curto } from "@/components/agenda/Producao";
import { SelSituacao, SelComunicacao } from "@/components/agenda/Carteira";
import { acaoFeitaAction, comFeitaAction, comNaAction, comPendenteAction, salvarAcompAction, solicitacaoAction } from "./actions";

const FILTROS: [string, string][] = [["todas", "todos"], ["venc", "ações vencidas"], ["com", "comunicação pendente"], ["sem", "sem entrega"], ["pau", "pausados ou aguardando cliente"], ["resp", "sem responsável"]];
const casa: Record<string, (l: C.LinhaProjeto) => boolean> = {
  todas: (l) => l.situacao !== "concluido", venc: (l) => l.acaoVencida, com: (l) => l.comunicacao === "pendente" && l.situacao !== "concluido",
  sem: (l) => l.situacao === "andamento" && !l.entrega, pau: (l) => l.situacao === "pausado" || l.situacao === "cliente", resp: (l) => !l.responsavelId && l.situacao !== "concluido",
};

/** Etapa C — Projetos ativos: um projeto por linha, agrupado pela arquiteta responsável. Coordenação, gerência e administração. */
export default async function ProjetosAtivosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  if (!P.gestor(u)) redirect("/agenda/meus-projetos");
  const sp = await searchParams;
  const f = sp.f && casa[sp.f] ? sp.f : "todas";
  const pessoaF = /^\d+$/.test(sp.p ?? "") ? Number(sp.p) : null;
  const [linhas, pessoas, todas, tipos, tercs] = await Promise.all([C.linhasProjetos(), P.arquitetas(), P.pessoasComConfig(), C.tiposAcao(), C.terceirizados()]);
  const vis = linhas.filter((l) => casa[f](l) && (pessoaF === null || l.responsavelId === pessoaF));
  const q = (o: Record<string, string | number | null | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ f: f === "todas" ? null : f, p: pessoaF, ...o })) if (v != null && v !== "") p.set(k, String(v));
    const s = p.toString(); return s ? `/agenda/projetos?${s}` : "/agenda/projetos";
  };
  const selCod = /^\d+$/.test(sp.sel ?? "") ? Number(sp.sel) : null;
  const sel = selCod ? linhas.find((l) => l.codigo === selCod) ?? null : null;
  const hist = sel ? await C.historicoProjeto(sel.codigo) : [];
  const grupos = [...pessoas.map((p) => ({ id: p.id as number | null, nome: p.nome })), ...todas.filter((p) => p.perfil !== "arquiteta").map((p) => ({ id: p.id as number | null, nome: p.nome })), { id: null, nome: "Sem responsável definido" }]
    .map((g) => ({ ...g, itens: vis.filter((l) => l.responsavelId === g.id) })).filter((g) => g.itens.length);
  const hoje = hojeLocal(), volta = q({ sel: selCod });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Agenda de Produção · acompanhamento dos projetos" title="Projetos ativos"
        subtitle="Situação, etapa e próxima ação de cada projeto, por arquiteta responsável." />
      {sp.erro && <div className="leitura leitura-bad" role="alert"><b>Atenção</b>{sp.erro}</div>}
      {sp.ok && <div className="leitura" role="status"><b>OK</b>{sp.ok}</div>}
      <div className="flex flex-wrap gap-1 border-b border-[var(--line)]" role="group" aria-label="Filtros">
        {FILTROS.map(([k, t]) => {
          const n = linhas.filter((l) => casa[k](l) && (pessoaF === null || l.responsavelId === pessoaF)).length;
          return <Link key={k} href={q({ f: k === "todas" ? null : k })} aria-pressed={f === k}
            className={`-mb-px px-3 py-2.5 text-[0.84rem] no-underline ${f === k ? "border-b-2 border-[var(--vinho)] font-semibold text-[var(--vinho)]" : "text-[var(--txt-2)] hover:text-[var(--vinho)]"}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)} <span className={k === "venc" && n ? "font-semibold text-[var(--bad)]" : "text-[var(--muted)]"}>{n}</span></Link>;
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Arquiteta">
          {[{ id: null as number | null, nome: "Todas as arquitetas" }, ...pessoas.map((p) => ({ id: p.id as number | null, nome: p.nome.split(" ")[0] }))].map((p) => (
            <Link key={p.id ?? 0} href={q({ p: p.id })} aria-pressed={pessoaF === p.id}
              className={`rounded-full border px-3 py-1.5 text-[0.78rem] font-semibold no-underline ${pessoaF === p.id ? "border-[var(--vinho)] bg-[var(--vinho)] text-white" : "border-[var(--line)] bg-white text-[var(--txt-2)]"}`}>{p.nome}</Link>
          ))}
        </div>
        <span className="text-xs text-[var(--muted)]">Comunicação: semana de {C.rotuloSemana()} · hoje {dataCurta(hoje)}</span>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <section className="card min-w-0 flex-[999_1_640px] overflow-x-auto" aria-label="Projetos">
          <table className="w-full min-w-[760px] border-collapse text-[0.82rem]">
            <thead><tr className="text-left text-[0.6rem] uppercase tracking-[0.16em] text-[var(--vinho)]">
              {["Projeto", "Etapa", "Situação", "Entrega", "Próxima ação", "Comunicação"].map((h) => <th key={h} className="whitespace-nowrap border-b border-[var(--line)] px-3 py-3 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody>
              {grupos.map((g) => [
                <tr key={`g${g.id}`}><td colSpan={6} className="border-b border-[var(--line)] px-3 pb-2 pt-4 text-[0.8rem] font-semibold text-[var(--grafite)]">{g.nome} <span className="font-normal text-[var(--muted)]">· {g.itens.length}</span></td></tr>,
                ...g.itens.map((l) => (
                  <tr key={l.codigo} className={l.codigo === selCod ? "bg-[var(--rose-2)]" : ""}>
                    <td className="border-b border-[#f3ece8] px-3 py-3 align-top"><Link href={q({ sel: l.codigo })} scroll={false} className="font-bold text-[var(--vinho)] no-underline">{curto(l.nome)}</Link>
                      <span className="block text-[0.7rem] text-[var(--muted)]">{l.terceirizado ? `Terceirizado · ${l.terceirizado}` : l.cliente ?? `nº ${l.codigo}`}</span></td>
                    <td className="border-b border-[#f3ece8] px-3 py-3 align-top">{l.etapa ? P.etapa(l.etapa)?.n : <span className="text-[var(--muted)]">—</span>}</td>
                    <td className="border-b border-[#f3ece8] px-3 py-3 align-top"><SelSituacao s={l.situacao} /></td>
                    <td className="border-b border-[#f3ece8] px-3 py-3 align-top">{l.entrega ? <>{P.rotuloDia(l.entrega.dia)}<span className="block text-[0.7rem] text-[var(--muted)]">{l.entrega.quem.split(" ")[0]}{l.entrega.etapa ? ` · ${P.etapa(l.entrega.etapa)?.n}` : ""}</span></> : <span className="text-[var(--muted)]">{l.situacao === "andamento" ? "sem data" : "—"}</span>}</td>
                    <td className="border-b border-[#f3ece8] px-3 py-3 align-top">{l.acaoTipo ? <><span className={l.acaoVencida ? "font-semibold text-[var(--bad)]" : ""}>{l.acaoTipo}</span><span className="block text-[0.7rem] text-[var(--muted)]">{l.acaoQuem?.split(" ")[0]} · até {dataCurta(l.acaoAte!)}{l.acaoVencida ? " · vencida" : ""}</span></> : "—"}</td>
                    <td className="border-b border-[#f3ece8] px-3 py-3 align-top"><SelComunicacao s={l.comunicacao} /></td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
          {vis.length === 0 && <p className="p-4 text-sm text-[var(--muted)]">Nenhum projeto neste filtro.</p>}
        </section>

        {sel && (
          <aside className="card flex max-w-[400px] flex-[1_1_340px] flex-col gap-3 p-4" aria-label="Acompanhamento do projeto">
            <div className="flex items-start justify-between gap-2"><div><div className="eyebrow">Acompanhamento</div><h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">{curto(sel.nome)}</h2></div><Link href={q({ sel: null })} scroll={false} className="text-xs">fechar</Link></div>
            <span className="text-xs text-[var(--muted)]">nº {sel.codigo}{sel.cliente ? ` · ${sel.cliente}` : ""} · dados do projeto vêm do Vobi (só leitura)</span>
            <form action={salvarAcompAction} className="flex flex-col gap-2.5">
              <input type="hidden" name="codigo" value={sel.codigo} /><input type="hidden" name="volta" value={volta} />
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-semibold text-[var(--txt-2)]">Situação do projeto<select name="situacao" defaultValue={sel.situacao} className="input mt-1">{Object.entries(C.SITUACOES).map(([k, s]) => <option key={k} value={k}>{s.rotulo}</option>)}</select></label>
                <label className="block text-xs font-semibold text-[var(--txt-2)]">Etapa atual<select name="etapa" defaultValue={sel.etapa ?? ""} className="input mt-1"><option value="">—</option>{P.ETAPAS.map((e) => <option key={e.k} value={e.k}>{e.n}</option>)}</select></label>
              </div>
              <label className="block text-xs font-semibold text-[var(--txt-2)]">Responsável pelo projeto<select name="responsavel" defaultValue={sel.responsavelId ?? ""} className="input mt-1"><option value="">Sem responsável definido</option>{todas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
              <label className="block text-xs font-semibold text-[var(--txt-2)]">Produção terceirizada<select name="terceirizado" defaultValue={sel.terceirizadoId ?? ""} className="input mt-1"><option value="">Não</option>{tercs.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></label>
              <span className="text-xs text-[var(--muted)]">Executam neste mês (do quadro): {sel.executoras.length ? sel.executoras.join(", ") : "ninguém programado"}</span>
              <fieldset className="flex flex-col gap-2 rounded-[10px] border border-[#f0e8e2] bg-[#fbf7f4] p-2.5">
                <legend className="px-1 text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">Próxima ação de acompanhamento</legend>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-semibold text-[var(--txt-2)]">Ação<select name="acao" defaultValue={sel.acaoTipo ?? ""} className="input mt-1"><option value="">Nenhuma</option>{tipos.map((t) => <option key={t.id} value={t.nome}>{t.nome}</option>)}{sel.acaoTipo && !tipos.some((t) => t.nome === sel.acaoTipo) && <option value={sel.acaoTipo}>{sel.acaoTipo}</option>}</select></label>
                  <label className="block text-xs font-semibold text-[var(--txt-2)]">Até<input type="date" name="ate" defaultValue={sel.acaoAte ?? ""} className="input mt-1" /></label>
                </div>
                <label className="block text-xs font-semibold text-[var(--txt-2)]">Quem faz<select name="quem" defaultValue={sel.acaoQuemId ?? sel.responsavelId ?? ""} className="input mt-1"><option value="">Escolha</option>{todas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
              </fieldset>
              <Button variant="primary">Salvar</Button>
            </form>
            {sel.acaoTipo && <form action={acaoFeitaAction}><input type="hidden" name="codigo" value={sel.codigo} /><input type="hidden" name="volta" value={volta} /><Button variant="secondary" className="btn-sm">Marcar “{sel.acaoTipo}” como feita</Button></form>}
            <form action={comFeitaAction} className="flex flex-col gap-1.5 rounded-[10px] border border-[#f0e8e2] p-2.5">
              <input type="hidden" name="codigo" value={sel.codigo} /><input type="hidden" name="volta" value={volta} />
              <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">Comunicação com o cliente · semana de {C.rotuloSemana()}</span>
              <span className="text-xs">Agora: <SelComunicacao s={sel.comunicacao} /></span>
              <div className="flex flex-wrap gap-1.5"><Button variant="secondary" className="btn-sm" formAction={comFeitaAction}>Feita</Button><Button variant="secondary" className="btn-sm" formAction={comPendenteAction}>Pendente</Button><Button variant="secondary" className="btn-sm" formAction={comNaAction}>Não se aplica</Button></div>
            </form>
            <form action={solicitacaoAction} className="flex flex-col gap-1.5 rounded-[10px] border border-[#f0e8e2] p-2.5">
              <input type="hidden" name="codigo" value={sel.codigo} /><input type="hidden" name="volta" value={volta} />
              <label className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">Solicitação do cliente<textarea name="texto" rows={2} required maxLength={500} className="input mt-1 font-normal normal-case tracking-normal" placeholder="ex.: incluir layout dos vestiários" /></label>
              {sel.solicitacao && <span className="text-xs text-[var(--txt-2)]">Último pedido ({dataCurta(hojeLocal(sel.solicitacao.quando))}): {sel.solicitacao.texto}</span>}
              <span className="text-xs text-[var(--muted)]">Não vira tarefa sozinho: se exigir produção, a coordenação programa no quadro.</span>
              <Button variant="secondary" className="btn-sm self-start">Registrar pedido</Button>
            </form>
            <ul className="flex flex-col gap-1.5 border-t border-[#f0e8e2] pt-2 text-xs" aria-label="Histórico">
              {hist.length === 0 ? <li className="text-[var(--muted)]">Sem histórico ainda.</li> : hist.map((h, i) => <li key={i}><span className="text-[var(--muted)]">{dataHora(new Date(h.quando))}{h.quem ? ` · ${h.quem}` : ""}</span><br />{h.resumo}</li>)}
            </ul>
          </aside>
        )}
      </div>
      <p className="text-xs text-[var(--muted)]">Projetos vêm do cadastro do A360 (Vobi, só leitura); nada é importado da planilha e nada é gravado no Vobi. A próxima entrega vem do quadro da equipe. Responsável pelo projeto é quem acompanha; quem executa cada dia está no quadro.</p>
    </div>
  );
}
