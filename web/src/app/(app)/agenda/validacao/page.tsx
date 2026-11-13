import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import * as P from "@/lib/agenda/producao";
import { dataHora, inicioSemana } from "@/lib/agenda/datas";
import { Button, PageHeader } from "@/components/ui";
import { ChipEtapa, curto, Entrega, SeloValidacao } from "@/components/agenda/Producao";
import { aprovarAction, devolverAction } from "../quadro/actions";

const ABAS: [string, string][] = [["aguardando", "Aguardando"], ["devolvida", "Devolvidas"], ["aprovada", "Aprovadas"], ["historico", "Histórico"]];

/** Etapa A — Fila de validação: propostas das arquitetas autônomas. Decidem Ana Paula, Thaís ou substituta designada; a gestão acompanha. */
export default async function ValidacaoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const valida = await P.podeValidar(u);
  if (!valida && !P.gestor(u)) redirect("/agenda/semana");
  const sp = await searchParams;
  const aba = ABAS.some(([k]) => k === sp.aba) ? sp.aba! : "aguardando";
  const [cont, lista, hist] = await Promise.all([
    Promise.all(["aguardando", "devolvida", "aprovada"].map(async (s) => [s, (await P.fila(s)).length] as const)),
    aba === "historico" ? Promise.resolve([]) : P.fila(aba),
    aba === "historico" ? P.historicoValidacao() : Promise.resolve([]),
  ]);
  const n = Object.fromEntries(cont);
  const selId = /^\d+$/.test(sp.sel ?? "") ? Number(sp.sel) : (lista[0]?.id as number | undefined) ?? null;
  const sel = lista.find((x) => Number(x.id) === selId) ?? null;
  let contexto: { titulo: string; periodo: string }[] = [], disp = "", prog = "";
  if (sel) {
    const dia = P.diaDoBloco({ fim: new Date(String(sel.fim)) } as P.Atividade);
    const pid = Number(sel.responsavel_id), cfg = await P.configDe(pid);
    const outros = (await P.blocosEntre(dia, dia, [pid])).filter((b) => b.id !== Number(sel.id));
    contexto = outros.map((b) => ({ titulo: `${P.etapa(b.etapaRucelle)?.n ?? "Atividade"} · ${b.titulo.split(" · ").pop()}`, periodo: P.rotuloPeriodo(b) + (b.validacao !== "confirmada" ? ` (${P.VALIDACAO[b.validacao].rotulo.toLowerCase()})` : "") }));
    const seg = inicioSemana(dia), dias = P.diasUteis(seg);
    const [fer, ind, bl] = await Promise.all([P.feriadosEntre(seg, dias[4]), P.indisponibilidadesEntre(seg, dias[4]), P.blocosEntre(seg, dias[4], [pid])]);
    disp = P.fmtDias(dias.reduce((a, d) => a + P.disponivelNoDia(d, cfg, fer, ind), 0));
    const vb = bl.filter((b) => b.validacao !== "rascunho" && b.validacao !== "devolvida");
    prog = P.fmtProgramado(vb.reduce((a, b) => a + P.peso(b), 0), vb.reduce((a, b) => a + P.horasComHorario(b), 0));
  }
  const url = (o: Record<string, string | number | undefined>) => `/agenda/validacao?${new URLSearchParams(Object.entries({ aba, ...o }).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString()}`;
  const ativ = (x: Record<string, unknown>) => ({ periodo: x.periodo as string | null, inicio: x.inicio ? new Date(String(x.inicio)) : null, fim: new Date(String(x.fim)), diaInteiro: !!x.dia_inteiro });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Agenda · validação de atividades" title="Fila de validação"
        subtitle="Atividades propostas pelas arquitetas com programação autônoma. Cada uma é decidida sozinha: aprovar (observação opcional) ou devolver para ajuste (justificativa obrigatória). Ana Paula e Thaís decidem; qualquer uma assume a fila. O histórico grava quem decidiu, com data e hora." />
      {sp.erro && <div className="leitura leitura-bad" role="alert"><b>Atenção</b>{sp.erro}</div>}
      {sp.ok && <div className="leitura" role="status"><b>OK</b>{sp.ok}</div>}
      {!valida && <div className="leitura" role="note">Você acompanha a fila e o histórico. Decidem Ana Paula, Thaís ou uma substituta designada pela gestão em <Link href="/agenda/pessoas" className="underline">Pessoas da agenda</Link>.</div>}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Situação">
        {ABAS.map(([k, t]) => <Link key={k} role="tab" aria-selected={aba === k} href={`/agenda/validacao?aba=${k}`}
          className={`rounded-full border px-3 py-1.5 text-[0.8rem] font-semibold no-underline ${aba === k ? "border-[var(--vinho)] bg-[var(--vinho)] text-white" : "border-[var(--line)] bg-white text-[var(--txt-2)]"}`}>{t}{k !== "historico" ? ` (${n[k] ?? 0})` : ""}</Link>)}
      </div>

      {aba === "historico" ? (
        <section className="card p-4" aria-label="Histórico de validação">
          {hist.length === 0 ? <p className="text-sm text-[var(--muted)]">Nenhuma decisão registrada ainda.</p> : (
            <ul className="flex flex-col gap-2.5 text-[0.84rem]">{hist.map((h, i) => <li key={i} className="grid grid-cols-[130px_1fr] gap-3 border-b border-[#f0e8e2] pb-2"><span className="text-xs text-[var(--muted)]">{dataHora(new Date(h.quando))}</span><span><b>{h.titulo}</b> — {h.resumo}{h.quem ? <span className="text-[var(--muted)]"> · {h.quem}</span> : null}</span></li>)}</ul>
          )}
        </section>
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          <section className="card min-w-0 flex-[999_1_560px] p-0" aria-label="Atividades">
            {lista.length === 0 && <p className="p-6 text-center text-sm text-[var(--muted)]">Nada aqui. Quando uma arquiteta autônoma enviar uma proposta, ela aparece nesta fila.</p>}
            {lista.map((x) => (
              <Link key={String(x.id)} href={url({ sel: Number(x.id) })} scroll={false}
                className={`grid grid-cols-[150px_1fr_auto] items-center gap-3 border-b border-[#f0e8e2] px-4 py-3 text-[0.84rem] text-[var(--txt)] no-underline hover:bg-[#fbf7f4] max-sm:grid-cols-1 ${Number(x.id) === selId ? "bg-[#f8efe9] shadow-[inset_3px_0_0_var(--vinho)]" : ""}`}>
                <span className="font-bold">{String(x.pessoa)}<span className="block text-[0.72rem] font-medium text-[var(--muted)]">atualizada {dataHora(new Date(String(x.atualizado_em)))}</span></span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-1.5"><ChipEtapa k={x.etapa_rucelle as string} /><b>{curto(x.projeto_nome as string)}</b>{!!x.entrega && <Entrega />}</span>
                  <span className="text-xs text-[var(--muted)]">{P.rotuloDia(P.diaDoBloco(ativ(x) as P.Atividade))} · {P.rotuloPeriodo(ativ(x))}</span>
                </span>
                <SeloValidacao v={String(x.validacao)} />
              </Link>
            ))}
          </section>
          {sel && (
            <aside className="card flex min-w-0 max-w-[400px] flex-[1_1_340px] flex-col gap-3 p-4" aria-label="Decisão">
              <div className="eyebrow">{String(sel.pessoa)} propõe</div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">{curto(sel.projeto_nome as string)}</h2>
              <dl className="grid grid-cols-[110px_1fr] gap-x-2.5 gap-y-1 text-[0.8rem]">
                <dt className="font-semibold text-[var(--muted)]">Etapa</dt><dd>{P.etapa(sel.etapa_rucelle as string)?.n ?? "—"}</dd>
                <dt className="font-semibold text-[var(--muted)]">Dia</dt><dd>{P.rotuloDia(P.diaDoBloco(ativ(sel) as P.Atividade))} · {P.rotuloPeriodo(ativ(sel))}</dd>
                <dt className="font-semibold text-[var(--muted)]">Entrega</dt><dd>{sel.entrega ? "Sim, entrega ao cliente" : "Não"}</dd>
                {!!sel.descricao && <><dt className="font-semibold text-[var(--muted)]">Observação</dt><dd>{String(sel.descricao)}</dd></>}
                <dt className="font-semibold text-[var(--muted)]">Situação</dt><dd><SeloValidacao v={String(sel.validacao)} sempre /></dd>
              </dl>
              <div className="flex flex-col gap-1.5 rounded-[10px] border border-[#f0e8e2] bg-[#fbf7f4] p-2.5">
                <b className="text-xs">O dia dela</b>
                {contexto.length ? contexto.map((c, i) => <span key={i} className="rounded-md border border-[var(--line)] bg-white px-2 py-1 text-xs">{c.titulo} · {c.periodo}</span>) : <span className="text-xs text-[var(--muted)]">Nenhuma outra atividade neste dia.</span>}
                <span className="text-xs text-[var(--muted)]">Semana: disponível {disp} · programado {prog}</span>
              </div>
              {sel.validacao === "aguardando" && valida && (
                <form action={aprovarAction} className="flex flex-col gap-2.5">
                  <input type="hidden" name="id" value={String(sel.id)} /><input type="hidden" name="volta" value="/agenda/validacao" />
                  <label className="block text-xs font-semibold text-[var(--txt-2)]">Observação ou justificativa da devolução<textarea name="comentario" rows={3} maxLength={1000} className="input mt-1" placeholder="Obrigatória para devolver. Opcional para aprovar." /></label>
                  <div className="flex flex-wrap gap-2">
                    <Button formAction={aprovarAction} variant="primary">Aprovar</Button>
                    <Button formAction={devolverAction} variant="secondary">Devolver para ajuste</Button>
                  </div>
                </form>
              )}
              {sel.validacao !== "aguardando" && (
                <p className="text-sm"><b>{sel.validacao === "aprovada" ? "Aprovada" : "Devolvida"}{sel.validado_por_nome ? ` por ${String(sel.validado_por_nome)}` : ""}</b>{sel.validado_em ? ` em ${dataHora(new Date(String(sel.validado_em)))}` : ""}{sel.validacao_comentario ? <span className="block text-[var(--muted)]">“{String(sel.validacao_comentario)}”</span> : null}</p>
              )}
              <p className="text-xs text-[var(--muted)]">Aprovada, entra na programação confirmada e conta na disponibilidade. Mudança de projeto, executora, etapa, dia, período ou entrega depois disso volta para esta fila.</p>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
