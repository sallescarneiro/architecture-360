import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import * as P from "@/lib/agenda/producao";
import { diaValido, hojeLocal, horaInput, inicioSemana, somaDias } from "@/lib/agenda/datas";
import { Button, LinkButton, PageHeader } from "@/components/ui";
import { ChipEtapa, curto, Entrega, SeloValidacao } from "@/components/agenda/Producao";
import { FormBloco } from "@/components/agenda/FormBloco";
import { andamentoAction, descartarAction, editarBlocoAction, enviarAction, criarBlocoAction, indispAction } from "../quadro/actions";

const STATUS: Record<number, string> = { 1: "Planejada", 2: "Em andamento", 4: "Concluída" };

/** Etapa A — Minha semana: a agenda de produção da arquiteta (estruturada ou autônoma). Gestão pode abrir a de qualquer pessoa. */
export default async function SemanaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const gestor = P.gestor(u);
  const pid = gestor && /^\d+$/.test(sp.pessoa ?? "") ? Number(sp.pessoa) : u.id;
  const pessoa = (await db.select({ id: schema.usuarios.id, nome: schema.usuarios.nome }).from(schema.usuarios).where(eq(schema.usuarios.id, pid)))[0];
  const cfg = await P.configDe(pid);
  const aut = P.autonoma(cfg) && pid === u.id;
  const hoje = hojeLocal(), seg = inicioSemana(diaValido(sp.s) ? sp.s : hoje), dias = P.diasUteis(seg), sex = dias[4];
  const base = (o: Record<string, string | number | null | undefined> = {}) => {
    const p = new URLSearchParams(); for (const [k, v] of Object.entries({ s: seg, pessoa: pid !== u.id ? pid : null, ...o })) if (v != null && v !== "") p.set(k, String(v));
    return `/agenda/semana?${p.toString()}`;
  };
  const [blocos, feriados, indisp, projetos] = await Promise.all([P.blocosEntre(seg, sex, [pid]), P.feriadosEntre(seg, sex), P.indisponibilidadesEntre(seg, sex), aut ? P.projetosAtivos() : Promise.resolve([])]);
  const codigos = [...new Set(blocos.map((b) => b.projetoCodigo).filter((c): c is number => !!c))];
  const nomes = new Map((codigos.length ? await db.select({ c: schema.projetos.codigo, n: schema.projetos.nome }).from(schema.projetos).where(inArray(schema.projetos.codigo, codigos)) : []).map((p) => [p.c, p.n]));
  const validadores = new Map((await db.select({ id: schema.usuarios.id, n: schema.usuarios.nome }).from(schema.usuarios)).map((x) => [x.id, x.n]));
  const disp = dias.reduce((a, d) => a + P.disponivelNoDia(d, cfg, feriados, indisp), 0);
  const conf = blocos.filter((b) => b.validacao === "confirmada" || b.validacao === "aprovada").reduce((a, b) => a + P.peso(b, cfg.jornadaHoras), 0);
  const editar = /^\d+$/.test(sp.editar ?? "") ? blocos.find((b) => b.id === Number(sp.editar) && b.criadoPorId === u.id && b.validacao !== "confirmada") ?? null : null;
  const minhasInd = pid === u.id ? await P.listaIndisp(u, somaDias(hoje, -7)) : [];
  const modelo = cfg.modelo === "autonoma" ? "autonoma" : "estruturada";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={`Agenda · ${pessoa?.nome ?? ""}`} title={pid === u.id ? "Minha semana" : `Semana de ${pessoa?.nome ?? ""}`}
        subtitle={<>Programação de produção de {P.rotuloDia(seg)} a {P.rotuloDia(sex)}. Compromissos do Google e prazos do Vobi continuam na <Link href="/agenda" className="underline">Agenda</Link>.</>}
        actions={gestor ? <LinkButton href={`/agenda/quadro?s=${seg}`}>Quadro da equipe</LinkButton> : undefined} />
      {sp.erro && <div className="leitura leitura-bad" role="alert"><b>Atenção</b>{sp.erro}</div>}
      {sp.ok && <div className="leitura" role="status"><b>OK</b>{sp.ok}{sp.aviso ? ` ${sp.aviso}` : ""}</div>}

      <div className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ${modelo === "autonoma" ? "bg-[#e8f4ec] text-[#1f4f35]" : "bg-[#f1edf8] text-[#3f2b60]"}`}>
        <div><b className="block">{modelo === "autonoma" ? "Programação autônoma" : "Programação estruturada"}{cfg.modelo === "indefinido" ? " (modelo ainda “A definir”)" : ""}</b>
          {modelo === "autonoma" ? "Você propõe suas atividades. Cada uma vai para validação (Ana Paula ou Thaís) e só entra na programação confirmada depois de aprovada. O que a coordenação programar para você já entra confirmado."
            : "A coordenação programa a sua semana. Aqui você acompanha e atualiza o andamento: iniciar, concluir ou avisar um impedimento."}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={base({ s: somaDias(seg, -7) })} className="btn btn-secondary btn-sm" aria-label="Semana anterior">‹</Link>
        <LinkButton href={base({ s: inicioSemana(hoje) })} className="btn-sm">Esta semana</LinkButton>
        <Link href={base({ s: somaDias(seg, 7) })} className="btn btn-secondary btn-sm" aria-label="Próxima semana">›</Link>
        <span className="ml-1 text-sm text-[var(--txt-2)]">Disponível {P.fmtDias(disp)} · programado e confirmado {P.fmtDias(conf)}{cfg.almocoInicio && cfg.almocoFim ? ` · almoço ${cfg.almocoInicio}–${cfg.almocoFim}` : ""}</span>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-3" aria-label="Dias da semana">
          {dias.map((d) => {
            const fer = feriados.find((f) => f.data === d && P.feriadoVale(f, cfg));
            const ind = indisp.find((i) => i.usuarioId === pid && i.inicio <= d && i.fim >= d);
            const bl = blocos.filter((b) => P.diaDoBloco(b) === d);
            return (
              <div key={d} className={`card flex flex-col gap-2 p-3 ${d === hoje ? "ring-2 ring-[rgba(91,13,13,.18)]" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">{P.rotuloDia(d)}{d === hoje ? " · hoje" : ""}</b>
                  <span className="flex flex-wrap gap-1.5">
                    {fer && <span className="rounded-md border border-[#cfe0e0] bg-[#eef5f5] px-2 py-0.5 text-[0.7rem] font-bold text-[#2f5f5f]">Feriado · {fer.nome}</span>}
                    {ind && <span className="rounded-md border border-[#efcfc6] bg-[#fff4f1] px-2 py-0.5 text-[0.7rem] font-bold text-[#8a2f1d]">{ind.situacao === "pendente" ? "Seu pedido de ausência · aguardando confirmação" : (P.TIPOS_INDISP[ind.tipo]?.rotulo ?? "Indisponível")}</span>}
                  </span>
                </div>
                {bl.length === 0 && !fer && <p className="text-xs text-[var(--muted)]">Nada programado.</p>}
                {bl.map((b) => {
                  const minha = b.criadoPorId === u.id && b.validacao !== "confirmada";
                  const confirmada = b.validacao === "confirmada" || b.validacao === "aprovada";
                  return (
                    <div key={b.id} className={`flex flex-col gap-1.5 rounded-[10px] bg-white p-2.5 ${b.entrega ? "border-2 border-[var(--vinho)]" : b.validacao === "rascunho" ? "border border-dashed border-[#b9aea7]" : "border border-[var(--line)]"}`}>
                      <span className="flex flex-wrap items-center gap-1.5"><ChipEtapa k={b.etapaRucelle} /><b>{b.etapaRucelle ? curto(nomes.get(b.projetoCodigo ?? 0)) : b.titulo}</b>{b.entrega && <Entrega />}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--txt-2)]">{P.rotuloPeriodo(b)} · {P.etapa(b.etapaRucelle)?.n ?? "atividade"}<SeloValidacao v={b.validacao} sempre />{confirmada && <span className="font-semibold">{b.impedimento ? "Impedimento avisado" : STATUS[b.status]}</span>}</span>
                      {b.descricao && <span className="text-xs text-[var(--muted)]">{b.descricao}</span>}
                      {b.validacao === "devolvida" && b.validacaoComentario && <div className="rounded-lg bg-[#fbe2dd] px-2.5 py-1.5 text-xs text-[#7d2416]"><b>Devolvida por {validadores.get(b.validadoPorId ?? 0) ?? "validação"}:</b> {b.validacaoComentario}</div>}
                      {b.validacao === "aprovada" && b.validacaoComentario && <span className="text-xs text-[#21613a]">Aprovada por {validadores.get(b.validadoPorId ?? 0)}: “{b.validacaoComentario}”</span>}
                      {b.impedimento && <span className="text-xs text-[#7a4b00]">Impedimento: {b.impedimento}</span>}
                      <div className="flex flex-wrap gap-1.5">
                        {pid === u.id && b.vinculo === "independente" && confirmada && b.status === 1 && <form action={andamentoAction}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="volta" value={base()} /><input type="hidden" name="acao" value="iniciar" /><Button variant="secondary" className="btn-sm">Iniciar</Button></form>}
                        {pid === u.id && b.vinculo === "independente" && confirmada && b.status === 2 && <form action={andamentoAction}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="volta" value={base()} /><input type="hidden" name="acao" value="concluir" /><Button variant="secondary" className="btn-sm">Concluir</Button></form>}
                        {pid === u.id && b.vinculo === "independente" && confirmada && b.status !== 4 && !b.impedimento && (
                          <form action={andamentoAction} className="flex flex-wrap gap-1.5"><input type="hidden" name="id" value={b.id} /><input type="hidden" name="volta" value={base()} /><input name="texto" required maxLength={300} placeholder="impedimento (ex.: aguardando planta)" className="input min-h-[34px] w-56 py-1 text-xs" /><input type="hidden" name="acao" value="impedimento" /><Button variant="secondary" className="btn-sm">Avisar impedimento</Button></form>
                        )}
                        {pid === u.id && b.impedimento && <form action={andamentoAction}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="volta" value={base()} /><input type="hidden" name="acao" value="retomar" /><Button variant="secondary" className="btn-sm">Impedimento resolvido</Button></form>}
                        {minha && (b.validacao === "rascunho" || b.validacao === "devolvida") && <form action={enviarAction}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="volta" value={base()} /><Button variant="primary" className="btn-sm">{b.validacao === "devolvida" ? "Reenviar para validação" : "Enviar para validação"}</Button></form>}
                        {minha && b.validacao !== "aguardando" && <LinkButton href={base({ editar: b.id })} className="btn-sm">Editar</LinkButton>}
                        {minha && b.validacao === "rascunho" && <form action={descartarAction}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="volta" value={base()} /><Button variant="ghost" className="btn-sm">Descartar</Button></form>}
                        {b.vinculo !== "independente" && <span className="text-xs text-[var(--muted)]">Ligada ao Vobi: o andamento é registrado no Vobi.</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </section>

        <aside className="flex min-w-0 max-w-[400px] flex-[1_1_320px] flex-col gap-4">
          {editar && (
            <section className="card flex flex-col gap-2 p-4" aria-label="Editar proposta">
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">Editar proposta</h2>
              {editar.validacao === "aprovada" && <p className="text-xs text-[var(--muted)]">Já aprovada: mudar projeto, etapa, dia, período ou entrega a devolve para validação. Observação não.</p>}
              <FormBloco action={editarBlocoAction} id={editar.id} volta={base()} rotulo="Salvar" projetos={await P.projetosAtivos()} jornada={cfg.jornadaHoras}
                valores={{ pessoaId: pid, dia: P.diaDoBloco(editar), projetoCodigo: editar.projetoCodigo, etapa: editar.etapaRucelle ?? "", periodo: editar.periodo ?? "dia", hi: editar.inicio ? horaInput(editar.inicio) : "09:00", hf: horaInput(editar.fim), entrega: editar.entrega, obs: editar.descricao ?? "" }} />
              <LinkButton href={base()} variant="ghost">Cancelar</LinkButton>
            </section>
          )}
          {aut && !editar && (
            <section className="card flex flex-col gap-2 p-4" aria-label="Propor atividade">
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">Propor atividade</h2>
              <p className="text-xs text-[var(--muted)]">Fica como rascunho até você enviar para validação.</p>
              <FormBloco action={criarBlocoAction} volta={base()} rotulo="Salvar rascunho" projetos={projetos} jornada={cfg.jornadaHoras}
                valores={{ pessoaId: u.id, dia: dias.find((d) => d >= hoje) ?? dias[0], projetoCodigo: null, etapa: "", periodo: "dia", hi: "09:00", hf: "11:00", entrega: false, obs: "" }} />
            </section>
          )}
          {pid === u.id && (
            <section className="card flex flex-col gap-2 p-4" aria-label="Pedir ausência">
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">{gestor ? "Registrar minha ausência" : "Pedir ausência"}</h2>
              <form action={indispAction} className="flex flex-col gap-2">
                <input type="hidden" name="volta" value={base()} /><input type="hidden" name="pessoa" value={u.id} />
                <label className="block text-xs font-semibold text-[var(--txt-2)]">Tipo<select name="tipo" className="input mt-1" defaultValue="folga">{Object.entries(P.TIPOS_INDISP).map(([k, t]) => <option key={k} value={k}>{t.rotulo}</option>)}</select></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-semibold text-[var(--txt-2)]">De<input type="date" name="inicio" required className="input mt-1" /></label>
                  <label className="block text-xs font-semibold text-[var(--txt-2)]">Até<input type="date" name="fim" className="input mt-1" /></label>
                </div>
                <label className="block text-xs font-semibold text-[var(--txt-2)]">Duração no dia<select name="periodo" className="input mt-1"><option value="dia">Dia inteiro</option><option value="manha">Manhã</option><option value="tarde">Tarde</option></select></label>
                <label className="block text-xs font-semibold text-[var(--txt-2)]">Observação<input name="obs" maxLength={300} className="input mt-1" placeholder="opcional; não informe diagnóstico" /></label>
                <Button variant="secondary">{gestor ? "Registrar" : "Enviar pedido à coordenação"}</Button>
              </form>
              {!gestor && <p className="text-xs text-[var(--muted)]">Até a coordenação confirmar, o pedido aparece como pendente e não conta como ausência. Atestado aparece para a equipe só como “Indisponível”.</p>}
              {minhasInd.length > 0 && <ul className="flex flex-col gap-1 border-t border-[#f0e8e2] pt-2 text-xs">{minhasInd.slice(0, 6).map((i) => <li key={i.id}>{i.tipo} · {i.inicio.slice(8, 10)}/{i.inicio.slice(5, 7)}{i.fim !== i.inicio ? ` a ${i.fim.slice(8, 10)}/${i.fim.slice(5, 7)}` : ""} · <b>{i.situacao === "pendente" ? "aguardando confirmação" : i.situacao}</b></li>)}</ul>}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
