import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import * as P from "@/lib/agenda/producao";
import { dataHora, diaSemanaCurto, hojeLocal, somaDias } from "@/lib/agenda/datas";
import { Button, PageHeader } from "@/components/ui";
import { desativarFeriadoAction, feriadoAction } from "../quadro/actions";

/** Etapa A — Feriados e recessos. Gestão cadastra; coordenação consulta. Cada feriado vale para quem trabalha na localidade dele. */
export default async function FeriadosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  if (!P.gestor(u)) redirect("/agenda/semana");
  const pode = P.administraConfig(u);
  const sp = await searchParams;
  const hoje = hojeLocal();
  const [lista, pessoas, hist] = await Promise.all([P.feriadosEntre(somaDias(hoje, -30), somaDias(hoje, 400)), P.pessoasComConfig(), P.historicoAgenda("feriado", 10)]);
  const afeta = (f: P.Feriado) => { const n = pessoas.filter((p) => p.perfil === "arquiteta" && P.feriadoVale(f, p.cfg)).map((p) => p.nome.split(" ")[0]); return f.abrangencia === "nacional" || f.abrangencia === "recesso" ? "todos" : n.length ? n.join(", ") : "ninguém hoje"; };
  const semLocal = pessoas.filter((p) => p.perfil === "arquiteta" && !p.cfg.uf).length;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={`Agenda · disponibilidade${pode ? "" : " · consulta"}`} title="Feriados e recessos"
        subtitle="Nacional e recesso da empresa valem para todos; estadual, para quem está no estado; municipal, para quem está no município. A localidade de cada pessoa fica em Pessoas da agenda." />
      {sp.erro && <div className="leitura leitura-bad" role="alert"><b>Atenção</b>{sp.erro}</div>}
      {sp.ok && <div className="leitura" role="status"><b>OK</b>{sp.ok}</div>}
      {semLocal > 0 && <div className="leitura" role="note">{semLocal} arquiteta(s) sem localidade informada: para elas só valem feriados nacionais e recessos.</div>}
      <div className="flex flex-wrap items-start gap-4">
        {pode && (
          <section className="card flex min-w-0 max-w-[480px] flex-[1_1_360px] flex-col gap-3 p-4" aria-label="Cadastrar">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">Cadastrar</h2>
            <form action={feriadoAction} className="flex flex-col gap-2.5">
              <input type="hidden" name="volta" value="/agenda/feriados" />
              <label className="block text-xs font-semibold text-[var(--txt-2)]">Nome<input name="nome" required maxLength={120} className="input mt-1" placeholder="ex.: Aniversário da cidade" /></label>
              <label className="block text-xs font-semibold text-[var(--txt-2)]">Data<input type="date" name="data" required className="input mt-1" /></label>
              <label className="block text-xs font-semibold text-[var(--txt-2)]">Abrangência<select name="abrangencia" className="input mt-1">{Object.entries(P.ABRANGENCIA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
              <div className="grid grid-cols-[90px_1fr] gap-2">
                <label className="block text-xs font-semibold text-[var(--txt-2)]">UF<input name="uf" maxLength={2} className="input mt-1 uppercase" placeholder="GO" /></label>
                <label className="block text-xs font-semibold text-[var(--txt-2)]">Município<input name="municipio" maxLength={80} className="input mt-1" placeholder="só para municipal" /></label>
              </div>
              <p className="text-xs text-[var(--muted)]">Confira a data na fonte oficial do estado ou município. Feriado cadastrado depois de já haver atividades no dia não move nada: o quadro avisa e a coordenação reprograma.</p>
              <Button variant="primary">Cadastrar feriado</Button>
            </form>
          </section>
        )}
        <section className="card min-w-0 flex-[999_1_520px] p-4" aria-label="Cadastrados">
          <h2 className="mb-2 font-[family-name:var(--font-display)] text-lg font-semibold">Próximos</h2>
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Data</th><th>Feriado</th><th>Abrangência</th><th>Afeta</th>{pode && <th></th>}</tr></thead>
            <tbody>{lista.length === 0 && <tr><td colSpan={5} className="text-[var(--muted)]">Nenhum feriado cadastrado.</td></tr>}
              {lista.map((f) => (
                <tr key={f.id}>
                  <td><b>{f.data.slice(8, 10)}/{f.data.slice(5, 7)}/{f.data.slice(0, 4)}</b><span className="block text-[0.7rem] text-[var(--muted)]">{diaSemanaCurto(f.data)}</span></td>
                  <td>{f.nome}</td>
                  <td>{P.ABRANGENCIA[f.abrangencia]}<span className="block text-[0.7rem] text-[var(--muted)]">{f.abrangencia === "municipal" ? `${f.municipio}/${f.uf}` : f.abrangencia === "estadual" ? f.uf : ""}</span></td>
                  <td className="text-xs">{afeta(f)}</td>
                  {pode && <td><form action={desativarFeriadoAction}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="volta" value="/agenda/feriados" /><Button variant="ghost" className="btn-sm">Remover</Button></form></td>}
                </tr>
              ))}
            </tbody>
          </table></div>
          {hist.length > 0 && <ul className="mt-3 flex flex-col gap-1 border-t border-[#f0e8e2] pt-2 text-xs">{hist.map((h, k) => <li key={k}><span className="text-[var(--muted)]">{dataHora(new Date(h.quando))}</span> · {h.resumo}{h.quem ? ` · ${h.quem}` : ""}</li>)}</ul>}
        </section>
      </div>
    </div>
  );
}
