import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import * as P from "@/lib/agenda/producao";
import { dataCurta, dataHora, hojeLocal } from "@/lib/agenda/datas";
import { Button, PageHeader } from "@/components/ui";
import { configAction, substitutaAction } from "../quadro/actions";
import * as C from "@/lib/agenda/carteira";
import { desativarTercAction, desativarTipoAction, incluirTercAction, incluirTipoAction, regrasAction } from "../projetos/actions";

const PERFIL: Record<string, string> = { admin: "administração", gestao: "gestão", coordenacao: "coordenação", arquiteta: "arquiteta" };

/** Etapa A — Pessoas da agenda: localidade, almoço, modelo de programação e validadoras. Gestão altera; coordenação consulta. */
export default async function PessoasAgendaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  if (!P.gestor(u)) redirect("/agenda/semana");
  const pode = P.administraConfig(u);
  const sp = await searchParams;
  const [pessoas, hist, ref, tipos, tercs, histRegra, linhas] = await Promise.all([P.pessoasComConfig(), P.historicoAgenda("pessoa", 20), C.regras(), C.tiposAcao(), C.terceirizados(), P.historicoAgenda("regra", 10), C.linhasProjetos()]);
  const sel = pessoas.find((p) => String(p.id) === sp.p) ?? null;
  const hoje = hojeLocal();
  const validadoras = pessoas.filter((p) => p.cfg.validadora);
  const substitutas = pessoas.filter((p) => p.cfg.substitutaAte && p.cfg.substitutaAte >= hoje);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={`Agenda · configuração${pode ? "" : " · consulta"}`} title="Pessoas da agenda"
        subtitle="Localidade (para os feriados estaduais e municipais; sem localidade, só valem os nacionais), almoço e modelo de programação de cada pessoa, e quem valida as propostas. Ninguém recebe modelo automaticamente: “A definir” funciona como programação estruturada." />
      {sp.erro && <div className="leitura leitura-bad" role="alert"><b>Atenção</b>{sp.erro}</div>}
      {sp.ok && <div className="leitura" role="status"><b>OK</b>{sp.ok}</div>}
      <div className="flex flex-wrap items-start gap-4">
        <section className="card min-w-0 flex-[999_1_560px] p-4" aria-label="Pessoas">
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Pessoa</th><th>Localidade</th><th>Almoço</th><th>Modelo</th><th>Valida</th>{pode && <th></th>}</tr></thead>
            <tbody>{pessoas.map((p) => (
              <tr key={p.id} className={sel?.id === p.id ? "bg-[#fbf4f1]" : ""}>
                <td><b>{p.nome}</b><span className="block text-[0.7rem] text-[var(--muted)]">{PERFIL[p.perfil] ?? p.perfil}</span></td>
                <td>{[p.cfg.municipio, p.cfg.uf].filter(Boolean).join("/") || <span className="text-[var(--muted)]">não informada</span>}</td>
                <td>{p.cfg.almocoInicio && p.cfg.almocoFim ? `${p.cfg.almocoInicio}–${p.cfg.almocoFim}` : <span className="text-[var(--muted)]">—</span>}</td>
                <td>{p.perfil === "arquiteta" ? <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${p.cfg.modelo === "autonoma" ? "bg-[#e1f0e7] text-[#1f5a3b]" : p.cfg.modelo === "estruturada" ? "bg-[#eae4f4] text-[#4b3470]" : "border border-dashed border-[#b9aea7] bg-[#efebe8] text-[#5f5752]"}`}>{P.MODELOS[p.cfg.modelo].rotulo}</span> : <span className="text-[var(--muted)]">—</span>}</td>
                <td className="text-xs">{p.cfg.validadora ? "sim" : p.cfg.substitutaAte && p.cfg.substitutaAte >= hoje ? `substituta até ${dataCurta(p.cfg.substitutaAte)}` : "—"}</td>
                {pode && <td><Link href={`/agenda/pessoas?p=${p.id}`} className="btn btn-secondary btn-sm" scroll={false} aria-label={`Editar ${p.nome}`}>Editar</Link></td>}
              </tr>))}
            </tbody>
          </table></div>
          <h2 className="mb-1 mt-4 font-[family-name:var(--font-display)] text-lg font-semibold">Validação das propostas</h2>
          <p className="text-sm">Validam: <b>{validadoras.map((p) => p.nome).join(", ") || "ninguém marcado"}</b>{substitutas.length ? <> · substituta: <b>{substitutas.map((p) => `${p.nome} (até ${dataCurta(p.cfg.substitutaAte!)})`).join(", ")}</b></> : null}. Todas veem a mesma fila; qualquer uma decide.</p>
          {pode && (
            <form action={substitutaAction} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="volta" value="/agenda/pessoas" />
              <label className="block text-xs font-semibold text-[var(--txt-2)]">Substituta temporária<select name="id" required className="input mt-1" defaultValue=""><option value="">Escolha a pessoa</option>{pessoas.filter((p) => !p.cfg.validadora).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
              <label className="block text-xs font-semibold text-[var(--txt-2)]">Até (vazio encerra)<input type="date" name="ate" className="input mt-1" /></label>
              <Button variant="secondary" className="btn-sm">Salvar substituição</Button>
            </form>
          )}
          <h2 className="mb-1 mt-4 font-[family-name:var(--font-display)] text-lg font-semibold">Histórico de configuração</h2>
          {hist.length === 0 ? <p className="text-xs text-[var(--muted)]">Nenhuma alteração ainda.</p> : <ul className="flex flex-col gap-1 text-xs">{hist.map((h, k) => <li key={k}><span className="text-[var(--muted)]">{dataHora(new Date(h.quando))}</span> · {h.resumo}</li>)}</ul>}
        </section>
        {pode && sel && (
          <aside className="card flex min-w-0 max-w-[400px] flex-[1_1_330px] flex-col gap-3 p-4" aria-label="Editar pessoa">
            <div className="eyebrow">Editar</div>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">{sel.nome}</h2>
            <form action={configAction} className="flex flex-col gap-2.5">
              <input type="hidden" name="id" value={sel.id} /><input type="hidden" name="volta" value={`/agenda/pessoas?p=${sel.id}`} />
              <div className="grid grid-cols-[90px_1fr] gap-2">
                <label className="block text-xs font-semibold text-[var(--txt-2)]">UF<input name="uf" maxLength={2} defaultValue={sel.cfg.uf ?? ""} className="input mt-1 uppercase" /></label>
                <label className="block text-xs font-semibold text-[var(--txt-2)]">Município<input name="municipio" maxLength={80} defaultValue={sel.cfg.municipio ?? ""} className="input mt-1" /></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-semibold text-[var(--txt-2)]">Almoço · início<input type="time" name="almoco_inicio" defaultValue={sel.cfg.almocoInicio ?? ""} className="input mt-1" /></label>
                <label className="block text-xs font-semibold text-[var(--txt-2)]">Almoço · fim<input type="time" name="almoco_fim" defaultValue={sel.cfg.almocoFim ?? ""} className="input mt-1" /></label>
              </div>
              <fieldset className="flex flex-col gap-1.5"><legend className="mb-1 text-xs font-semibold text-[var(--txt-2)]">Modelo de programação</legend>
                {Object.entries(P.MODELOS).map(([k, m]) => (
                  <label key={k} className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-[var(--line)] bg-white p-2.5 text-xs text-[var(--txt-2)] has-[:checked]:border-2 has-[:checked]:border-[var(--vinho)] has-[:checked]:bg-[#fbf4f1]">
                    <input type="radio" name="modelo" value={k} defaultChecked={sel.cfg.modelo === k} className="mt-0.5 accent-[var(--vinho)]" />
                    <span><b className="block text-[0.82rem] text-[var(--txt)]">{m.rotulo}</b>{m.descricao}</span>
                  </label>
                ))}
              </fieldset>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="validadora" value="1" defaultChecked={sel.cfg.validadora} className="h-[18px] w-[18px] accent-[var(--vinho)]" />Valida propostas das arquitetas autônomas</label>
              <p className="text-xs text-[var(--muted)]">Mudar o modelo não altera atividades já programadas. Propostas aguardando validação continuam na fila.</p>
              <div className="flex flex-wrap gap-2"><Button variant="primary">Salvar</Button><Link href="/agenda/pessoas" className="btn btn-ghost">Fechar</Link></div>
            </form>
          </aside>
        )}
      </div>
      <section id="regras" className="flex flex-col gap-3" aria-label="Regras da carteira">
        <div><div className="eyebrow">Regras da carteira{pode ? "" : " · consulta"}</div><h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">Carga, tipos de ação e terceirizados</h2></div>
        <div className="flex flex-wrap items-start gap-4">
          <div className="card flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 p-4">
            <h3 className="font-semibold">Referência de carga</h3>
            {pode ? (
              <form action={regrasAction} className="flex flex-col gap-2.5">
                <input type="hidden" name="volta" value="/agenda/pessoas#regras" />
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-semibold text-[var(--txt-2)]">Carga alta a partir de<input type="number" name="alta" min={1} max={49} required defaultValue={ref.alta} className="input mt-1" /></label>
                  <label className="block text-xs font-semibold text-[var(--txt-2)]">Sobrecarga a partir de<input type="number" name="sob" min={2} max={50} required defaultValue={ref.sob} className="input mt-1" /></label>
                </div>
                <Button variant="primary" className="self-start">Salvar referência</Button>
              </form>
            ) : <p className="text-sm">Carga alta a partir de <b>{ref.alta}</b> projetos; sobrecarga a partir de <b>{ref.sob}</b>.</p>}
            <p className="text-xs text-[var(--muted)]">Projetos em andamento ou aguardando cliente em que a arquiteta é responsável, sem os terceirizados. A planilha usava 6 e 8. É referência visual: nada é bloqueado.</p>
          </div>
          <div className="card flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 p-4">
            <h3 className="font-semibold">Tipos de ação de acompanhamento</h3>
            <ul className="flex flex-col gap-1 text-sm">{tipos.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 border-b border-[#f0e8e2] pb-1">{t.nome}
                {pode && <form action={desativarTipoAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="volta" value="/agenda/pessoas#regras" /><button className="text-xs text-[var(--vinho)] underline" aria-label={`Desativar ${t.nome}`}>desativar</button></form>}</li>))}</ul>
            {pode && <form action={incluirTipoAction} className="flex gap-1.5"><input type="hidden" name="volta" value="/agenda/pessoas#regras" /><input name="nome" required maxLength={80} className="input min-w-0 flex-1" placeholder="novo tipo" /><Button variant="secondary" className="btn-sm">Incluir</Button></form>}
            <p className="text-xs text-[var(--muted)]">Sem duplicidade; desativado sai das novas ações e continua nas antigas.</p>
          </div>
          <div className="card flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 p-4">
            <h3 className="font-semibold">Terceirizados</h3>
            {tercs.length === 0 ? <p className="text-xs text-[var(--muted)]">Nenhum cadastrado.</p> : <ul className="flex flex-col gap-1 text-sm">{tercs.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 border-b border-[#f0e8e2] pb-1"><span>{t.nome}{t.contato ? <span className="block text-xs text-[var(--muted)]">{t.contato}</span> : null}</span>
                <span className="flex items-center gap-2 text-xs text-[var(--muted)]">{linhas.filter((l) => l.terceirizadoId === t.id).length} projeto(s){pode && <form action={desativarTercAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="volta" value="/agenda/pessoas#regras" /><button className="text-[var(--vinho)] underline" aria-label={`Desativar ${t.nome}`}>desativar</button></form>}</span></li>))}</ul>}
            {pode && <form action={incluirTercAction} className="flex flex-col gap-1.5"><input type="hidden" name="volta" value="/agenda/pessoas#regras" /><div className="grid grid-cols-2 gap-1.5"><input name="nome" required maxLength={120} className="input" placeholder="nome" /><input name="contato" maxLength={160} className="input" placeholder="contato" /></div><Button variant="secondary" className="btn-sm self-start">Incluir terceirizado</Button></form>}
            <p className="text-xs text-[var(--muted)]">Executor externo, sem acesso ao A360. O projeto terceirizado continua com uma arquiteta responsável que acompanha, e fica fora da carga dela.</p>
          </div>
        </div>
        {histRegra.length > 0 && <ul className="flex flex-col gap-1 text-xs">{histRegra.map((h, k) => <li key={k}><span className="text-[var(--muted)]">{dataHora(new Date(h.quando))}</span> · {h.resumo}</li>)}</ul>}
      </section>
    </div>
  );
}
