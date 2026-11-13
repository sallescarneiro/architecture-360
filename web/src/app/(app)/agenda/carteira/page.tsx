import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import * as P from "@/lib/agenda/producao";
import * as C from "@/lib/agenda/carteira";
import { dataCurta } from "@/lib/agenda/datas";
import { PageHeader } from "@/components/ui";
import { curto } from "@/components/agenda/Producao";
import { SelCarga, SelSituacao, corCarga } from "@/components/agenda/Carteira";

/** Etapa C — Carteira da equipe: carga, etapas, dias livres, entregas e ações vencidas por arquiteta. Distribuição, não avaliação. */
export default async function CarteiraPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  if (!P.gestor(u)) redirect("/agenda/meus-projetos");
  const sp = await searchParams;
  const linhas = await C.linhasProjetos();
  const { linhas: eq, ref, fora } = await C.carteira(linhas);
  const selId = /^\d+$/.test(sp.sel ?? "") ? Number(sp.sel) : eq.slice().sort((a, b) => b.projetos - a.projetos)[0]?.id ?? null;
  const sel = eq.find((x) => x.id === selId) ?? null;
  const ord = eq.slice().sort((a, b) => b.projetos - a.projetos), maior = ord[0], menor = ord[ord.length - 1];
  const esc = Math.max(ref.sob + 2, 10);
  const desequilibrio = maior && menor && maior.projetos - menor.projetos >= 3;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Agenda de Produção · visão gerencial · gestão e coordenação" title="Carteira da equipe"
        subtitle="Quantos projetos cada arquiteta é responsável, em que etapas, quantos dias livres ela tem nas próximas duas semanas e o que está atrasado. É informação de distribuição, não avaliação de pessoas." />
      {desequilibrio && <div className="leitura" role="note"><b>Desequilíbrio</b>{maior.nome.split(" ")[0]} tem {maior.projetos} projeto(s) e {menor.nome.split(" ")[0]} tem {menor.projetos}. A gerência decide se redistribui; o sistema não move nada sozinho.</div>}
      {fora.semResponsavel > 0 && <div className="leitura" role="note"><b>A definir</b>{fora.semResponsavel} projeto(s) ativo(s) sem responsável definido não entram na carga de ninguém. Defina em <Link href="/agenda/projetos?f=resp" className="underline">Projetos ativos</Link>.</div>}
      <section className="card flex flex-col gap-2 p-4" aria-label="Carga por arquiteta">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">Carga por arquiteta</h2>
          <span className="text-xs text-[var(--muted)]">Referência da gerência: {ref.alta} ou mais projetos = carga alta · {ref.sob} ou mais = sobrecarga{P.administraConfig(u) ? <> (ajustável em <Link href="/agenda/pessoas#regras" className="underline">Pessoas da agenda</Link>)</> : null}</span></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[980px] border-collapse text-[0.8rem]">
          <thead><tr className="bg-[#fbf7f4] text-left text-[0.64rem] uppercase tracking-wider text-[var(--muted)]">
            <th className="px-2.5 py-2 font-semibold">Arquiteta</th><th className="px-2.5 py-2 font-semibold">Projetos</th><th className="px-2.5 py-2 font-semibold">Carga</th>
            {P.ETAPAS.map((e) => <th key={e.k} className="px-1.5 py-2 text-center font-semibold" title={e.n}>{e.k}</th>)}
            <th className="px-2.5 py-2 font-semibold">Dias livres (2 sem.)</th><th className="px-2.5 py-2 font-semibold">Entregas 7 dias</th><th className="px-2.5 py-2 font-semibold">Ações vencidas</th>
          </tr></thead>
          <tbody>{eq.map((r) => (
            <tr key={r.id} className={r.id === selId ? "bg-[#fbf1ec]" : ""}>
              <td className="border-b border-[#f0e8e2] px-2.5 py-2"><Link href={`/agenda/carteira?sel=${r.id}`} scroll={false} className="font-bold text-[var(--vinho)] no-underline">{r.nome}</Link><span className="block text-[0.7rem] text-[var(--muted)]">{r.modelo}</span></td>
              <td className="border-b border-[#f0e8e2] px-2.5 py-2"><b>{r.projetos}</b>{r.semEtapa ? <span className="block text-[0.7rem] text-[var(--muted)]">{r.semEtapa} sem etapa</span> : null}</td>
              <td className="border-b border-[#f0e8e2] px-2.5 py-2"><div className="relative h-2 w-[110px] overflow-hidden rounded-full bg-[#efe7e1]" aria-hidden="true"><i className="block h-full" style={{ width: `${Math.min(100, (r.projetos / esc) * 100)}%`, background: corCarga(r.carga) }} /><span className="absolute top-0 h-full w-px bg-[#6f6763]" style={{ left: `${(ref.alta / esc) * 100}%` }} /></div><span className="mt-1 inline-block"><SelCarga c={r.carga} /></span></td>
              {P.ETAPAS.map((e) => <td key={e.k} className={`border-b border-[#f0e8e2] px-1.5 py-2 text-center ${r.porEtapa[e.k] ? "font-semibold" : "text-[#c9bdb6]"}`}>{r.porEtapa[e.k] ?? "·"}</td>)}
              <td className="border-b border-[#f0e8e2] px-2.5 py-2">{P.fmtDias(r.diasLivres)}{r.ausencia ? <span className="block text-[0.7rem] text-[var(--muted)]">{r.ausencia}</span> : null}</td>
              <td className="border-b border-[#f0e8e2] px-2.5 py-2">{r.entregas7 || "—"}</td>
              <td className={`border-b border-[#f0e8e2] px-2.5 py-2 ${r.acoesVencidas ? "font-bold text-[#9b2c1f]" : ""}`}>{r.acoesVencidas || "—"}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <p className="text-xs text-[var(--muted)]">Projetos = projetos em andamento ou aguardando cliente em que ela é a responsável, sem os terceirizados. Pausados e concluídos não contam. Dias livres = dias úteis disponíveis nas próximas duas semanas (feriados da localidade e ausências confirmadas) menos o que já está programado no quadro. Entregas = entregas programadas para ela nos próximos 7 dias.</p>
      </section>
      <div className="flex flex-wrap items-start gap-4">
        {sel && <section className="card flex flex-[2_1_420px] flex-col gap-2 p-4" aria-label={`Projetos de ${sel.nome}`}>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">Projetos de {sel.nome}</h2>
          {sel.lista.length === 0 ? <p className="text-sm text-[var(--muted)]">Nenhum projeto ativo com ela como responsável.</p> : (
            <ul className="flex flex-col gap-1.5 text-[0.84rem]">{sel.lista.map((l) => (
              <li key={l.codigo} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f0e8e2] pb-1.5">
                <span><Link href={`/agenda/projetos?sel=${l.codigo}`} className="font-bold no-underline">{curto(l.nome)}</Link> · {P.etapa(l.etapa)?.n ?? "sem etapa"}{l.terceirizado ? " (terceirizado)" : ""}</span>
                <span className="flex items-center gap-1.5 text-[0.72rem] text-[var(--muted)]"><SelSituacao s={l.situacao} />{l.entrega ? `entrega ${dataCurta(l.entrega.dia)}` : ""}{l.acaoTipo ? ` · ${l.acaoTipo}${l.acaoVencida ? " vencida" : ""}` : ""}</span>
              </li>))}</ul>
          )}
          <Link href={`/agenda/projetos?p=${sel.id}`} className="text-[0.8rem]">Abrir em Projetos ativos</Link>
        </section>}
        <section className="card flex flex-[1_1_280px] flex-col gap-2 p-4" aria-label="Fora da carga">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">Fora da carga</h2>
          <ul className="flex flex-col gap-1.5 text-[0.84rem]">
            {([["Terceirizados", fora.terceirizados, null], ["Pausados", fora.pausados, "pau"], ["Sem responsável definido", fora.semResponsavel, "resp"], ["Em andamento sem entrega programada", fora.semEntrega, "sem"]] as const).map(([t, n, f]) => (
              <li key={t} className="flex justify-between gap-2 border-b border-[#f0e8e2] pb-1.5">{f ? <Link href={`/agenda/projetos?f=${f}`}>{t}</Link> : <span>{t}</span>}<b>{n}</b></li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
