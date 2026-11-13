import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import * as P from "@/lib/agenda/producao";
import { dataCurta, dataHora, hojeLocal, somaDias } from "@/lib/agenda/datas";
import { Button, PageHeader } from "@/components/ui";
import { decidirIndispAction, indispAction } from "../quadro/actions";

const per = (i: { periodo: string; aPartirDe: string | null }) => i.periodo === "dia" ? "dia inteiro" : i.periodo === "hora" ? `a partir das ${i.aPartirDe}` : i.periodo === "manha" ? "manhã" : "tarde";
const SIT: Record<string, string> = { confirmada: "Confirmada", pendente: "Aguardando confirmação", recusada: "Pedido recusado", cancelada: "Cancelada" };

/** Etapa A — Indisponibilidades: gestão e coordenação registram e confirmam pedidos; atestado só aparece aqui (privacidade). */
export default async function IndisponibilidadesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  if (!P.gestor(u)) redirect("/agenda/semana");
  const sp = await searchParams;
  const [pessoas, lista, hist] = await Promise.all([P.pessoasComConfig(), P.listaIndisp(u, somaDias(hojeLocal(), -30)), P.historicoAgenda("indisponibilidade", 15)]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Agenda · disponibilidade" title="Indisponibilidades"
        subtitle="Férias, atestado, ausências e impedimentos. Aparecem no quadro da equipe e descontam da disponibilidade. Não movem nem cancelam atividades sozinhas: o quadro avisa e a coordenação decide. Pedido feito pela arquiteta só vale depois de confirmado." />
      {sp.erro && <div className="leitura leitura-bad" role="alert"><b>Atenção</b>{sp.erro}</div>}
      {sp.ok && <div className="leitura" role="status"><b>OK</b>{sp.ok}</div>}
      <div className="flex flex-wrap items-start gap-4">
        <section className="card flex min-w-0 max-w-[520px] flex-[1_1_380px] flex-col gap-3 p-4" aria-label="Registrar">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">Registrar indisponibilidade</h2>
          <form action={indispAction} className="flex flex-col gap-2.5">
            <input type="hidden" name="volta" value="/agenda/indisponibilidades" />
            <label className="block text-xs font-semibold text-[var(--txt-2)]">Pessoa<select name="pessoa" required className="input mt-1" defaultValue=""><option value="">Escolha a pessoa</option>{pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
            <label className="block text-xs font-semibold text-[var(--txt-2)]">Tipo<select name="tipo" required className="input mt-1" defaultValue="">{<option value="">Escolha o tipo</option>}{Object.entries(P.TIPOS_INDISP).map(([k, t]) => <option key={k} value={k}>{t.rotulo}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-semibold text-[var(--txt-2)]">Data inicial<input type="date" name="inicio" required className="input mt-1" /></label>
              <label className="block text-xs font-semibold text-[var(--txt-2)]">Data final<input type="date" name="fim" className="input mt-1" /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-semibold text-[var(--txt-2)]">Duração no dia<select name="periodo" className="input mt-1"><option value="dia">Dia inteiro</option><option value="manha">Manhã</option><option value="tarde">Tarde</option><option value="hora">A partir de um horário</option></select></label>
              <label className="block text-xs font-semibold text-[var(--txt-2)]">A partir de (se horário)<input type="time" name="a_partir_de" className="input mt-1" /></label>
            </div>
            <label className="block text-xs font-semibold text-[var(--txt-2)]">Observação<input name="obs" maxLength={300} className="input mt-1" placeholder="opcional; não registre diagnóstico de saúde" /></label>
            <p className="text-xs text-[var(--muted)]">Registrado por {u.nome}. Entra confirmada. Meio período ou a partir de um horário desconta 0,5 dia.</p>
            <Button variant="primary">Registrar</Button>
          </form>
        </section>
        <section className="card min-w-0 flex-[999_1_560px] p-4" aria-label="Registros">
          <h2 className="mb-2 font-[family-name:var(--font-display)] text-lg font-semibold">Pedidos, próximas e em curso</h2>
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Pessoa</th><th>Tipo</th><th>Período</th><th>Situação</th><th>Registro</th><th></th></tr></thead>
            <tbody>{lista.length === 0 && <tr><td colSpan={6} className="text-[var(--muted)]">Nenhum registro.</td></tr>}
              {lista.map((i) => (
                <tr key={i.id} className={i.situacao === "cancelada" || i.situacao === "recusada" ? "text-[var(--muted)]" : ""}>
                  <td><b>{i.pessoa}</b></td>
                  <td>{i.tipo}{i.privado && <span className="block text-[0.7rem] text-[var(--muted)]">no quadro: “Indisponível”</span>}{i.obs && <span className="block text-[0.7rem] text-[var(--muted)]">{i.obs}</span>}</td>
                  <td>{dataCurta(i.inicio)}{i.fim !== i.inicio ? ` a ${dataCurta(i.fim)}` : ""}<span className="block text-[0.7rem] text-[var(--muted)]">{per(i)}</span></td>
                  <td><span className={`inline-flex rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${i.situacao === "pendente" ? "bg-[#fff1d6] text-[#7a4b00]" : i.situacao === "confirmada" ? "bg-[#fff4f1] text-[#8a2f1d]" : "bg-[#efebe8] text-[#5f5752]"}`}>{SIT[i.situacao]}</span></td>
                  <td className="text-xs">{i.registradoPor}<span className="block text-[var(--muted)]">{dataHora(i.criadoEm)}{i.decididoPor && i.decididoPor !== i.registradoPor ? ` · decidido por ${i.decididoPor}` : ""}</span></td>
                  <td>
                    {i.situacao === "pendente" && <div className="flex flex-wrap gap-1.5">{(["confirmar", "recusar"] as const).map((ac) => <form key={ac} action={decidirIndispAction}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="acao" value={ac} /><input type="hidden" name="volta" value="/agenda/indisponibilidades" /><Button variant={ac === "confirmar" ? "primary" : "secondary"} className="btn-sm">{ac === "confirmar" ? "Confirmar" : "Recusar"}</Button></form>)}</div>}
                    {i.situacao === "confirmada" && <form action={decidirIndispAction}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="acao" value="cancelar" /><input type="hidden" name="volta" value="/agenda/indisponibilidades" /><Button variant="ghost" className="btn-sm">Cancelar</Button></form>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="mt-2 text-xs text-[var(--muted)]"><b>Privacidade:</b> o tipo “Atestado” e a observação só aparecem aqui (gestão e coordenação) e para a própria pessoa. No quadro da equipe aparece só “Indisponível”. Cancelar não apaga: fica no histórico.</p>
          {hist.length > 0 && <ul className="mt-3 flex flex-col gap-1 border-t border-[#f0e8e2] pt-2 text-xs">{hist.map((h, k) => <li key={k}><span className="text-[var(--muted)]">{dataHora(new Date(h.quando))}</span> · {h.resumo}{h.quem ? ` · ${h.quem}` : ""}</li>)}</ul>}
        </section>
      </div>
    </div>
  );
}
