import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import * as P from "@/lib/agenda/producao";
import { dataHora, diaValido, hojeLocal, horaInput, inicioSemana, somaDias } from "@/lib/agenda/datas";
import { LinkButton, PageHeader } from "@/components/ui";
import { Bloco, ChipEtapa, curto, Entrega, SeloValidacao } from "@/components/agenda/Producao";
import { FormBloco } from "@/components/agenda/FormBloco";
import { criarBlocoAction, editarBlocoAction, modeloAction, reprogramarAction } from "./actions";

const FILTROS: [string, string][] = [["todas", "Tudo"], ["pend", "Aguardando validação"], ["dev", "Devolvidas"], ["ent", "Entregas"]];

/** Etapa A — Quadro da equipe: uma linha por arquiteta, colunas de segunda a sexta. Só gestão e coordenação. */
export default async function QuadroPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  if (!P.gestor(u)) redirect("/agenda/semana");
  const sp = await searchParams;
  const hoje = hojeLocal();
  const seg = inicioSemana(diaValido(sp.s) ? sp.s : hoje), dias = P.diasUteis(seg), sex = dias[4];
  const filtro = FILTROS.some(([k]) => k === sp.f) ? sp.f! : "todas";
  const q = (o: Record<string, string | number | null | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | number | null | undefined> = { s: seg, f: filtro === "todas" ? null : filtro, ...o };
    for (const [k, v] of Object.entries(base)) if (v != null && v !== "") p.set(k, String(v));
    const s = p.toString(); return s ? `/agenda/quadro?${s}` : "/agenda/quadro";
  };

  const [pessoas, feriados, indisp, projetos, nAguard, validadora] = await Promise.all([
    P.arquitetas(), P.feriadosEntre(seg, sex), P.indisponibilidadesEntre(seg, sex), P.projetosAtivos(), P.contagemValidacao(), P.podeValidar(u),
  ]);
  const blocos = await P.blocosEntre(seg, sex, pessoas.map((p) => p.id));
  const codigos = [...new Set(blocos.map((b) => b.projetoCodigo).filter((c): c is number => !!c))];
  const nomesProj = new Map((codigos.length ? await db.select({ c: schema.projetos.codigo, n: schema.projetos.nome }).from(schema.projetos).where(inArray(schema.projetos.codigo, codigos)) : []).map((p) => [p.c, p.n]));
  const casa = (b: P.Atividade) => filtro === "pend" ? b.validacao === "aguardando" : filtro === "dev" ? b.validacao === "devolvida" : filtro === "ent" ? b.entrega : true;

  // painel lateral
  const [novoP, novoD] = (sp.novo ?? "").split(":");
  const novo = /^\d+$/.test(novoP ?? "") && diaValido(novoD) ? { pessoa: pessoas.find((p) => p.id === Number(novoP)), dia: novoD } : null;
  const selId = /^\d+$/.test(sp.ver ?? sp.rep ?? "") ? Number(sp.ver ?? sp.rep) : null;
  const sel = selId ? (await db.select().from(schema.atividades).where(eq(schema.atividades.id, selId)))[0] ?? null : null;
  const hist = sel ? await db.select({ h: schema.atividadeHistorico, quem: schema.usuarios.nome }).from(schema.atividadeHistorico).leftJoin(schema.usuarios, eq(schema.usuarios.id, schema.atividadeHistorico.usuarioId)).where(eq(schema.atividadeHistorico.atividadeId, sel.id)).orderBy(desc(schema.atividadeHistorico.quando)).limit(12) : [];
  const selPessoa = sel ? pessoas.find((p) => p.id === sel.responsavelId) ?? null : null;
  const selProj = sel?.projetoCodigo ? nomesProj.get(sel.projetoCodigo) ?? (await db.select({ n: schema.projetos.nome }).from(schema.projetos).where(eq(schema.projetos.codigo, sel.projetoCodigo)))[0]?.n ?? null : null;
  const selCriou = sel?.criadoPorId ? (await db.select({ n: schema.usuarios.nome }).from(schema.usuarios).where(eq(schema.usuarios.id, sel.criadoPorId)))[0]?.n ?? "—" : "—";
  const selValidou = sel?.validadoPorId ? (await db.select({ n: schema.usuarios.nome }).from(schema.usuarios).where(eq(schema.usuarios.id, sel.validadoPorId)))[0]?.n ?? null : null;
  const diasRep = [...dias, ...P.diasUteis(somaDias(seg, 7))];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Agenda · programação da produção" title="Quadro da equipe"
        subtitle={<>Uma linha por arquiteta e os dias úteis. “+ Incluir” programa no dia; clique numa atividade para editar ou reprogramar. Programação da gestão e da coordenação entra confirmada; propostas das arquitetas autônomas passam pela validação.</>}
        actions={<div className="flex flex-wrap gap-2">
          <LinkButton href="/agenda/indisponibilidades">Indisponibilidades</LinkButton>
          {(validadora || P.gestor(u)) && <LinkButton href="/agenda/validacao" variant="primary">Fila de validação · {nAguard}</LinkButton>}
        </div>} />
      {sp.erro && <div className="leitura leitura-bad" role="alert"><b>Atenção</b>{sp.erro}</div>}
      {sp.ok && <div className="leitura" role="status"><b>OK</b>{sp.ok}{sp.aviso ? ` ${sp.aviso}` : ""}</div>}

      <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={q({ s: somaDias(seg, -7) })} className="btn btn-secondary btn-sm" aria-label="Semana anterior">‹</Link>
          <LinkButton href={q({ s: inicioSemana(hoje) })} className="btn-sm">Esta semana</LinkButton>
          <Link href={q({ s: somaDias(seg, 7) })} className="btn btn-secondary btn-sm" aria-label="Próxima semana">›</Link>
          <span className="ml-1 font-[family-name:var(--font-display)] text-lg font-semibold">{P.rotuloDia(seg)} a {P.rotuloDia(sex)}</span>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Destacar">
          {FILTROS.map(([k, t]) => <Link key={k} href={q({ f: k === "todas" ? null : k })} aria-current={filtro === k ? "true" : undefined}
            className={`rounded-full border px-3 py-1.5 text-[0.78rem] font-semibold no-underline ${filtro === k ? "border-[var(--vinho)] bg-[var(--vinho)] text-white" : "border-[var(--line)] bg-white text-[var(--txt-2)]"}`}>{t}</Link>)}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <section className="card min-w-0 flex-[999_1_720px] overflow-x-auto p-0" aria-label="Programação da semana">
          <div className="grid min-w-[960px] grid-cols-[190px_repeat(5,minmax(150px,1fr))]">
            <div className="sticky left-0 z-10 border-b border-[var(--line)] bg-[#fbf7f4] px-3 py-2 text-xs font-bold text-[var(--txt-2)]">Arquiteta</div>
            {dias.map((d) => {
              const fn = feriados.find((f) => f.data === d && (f.abrangencia === "nacional" || f.abrangencia === "recesso"));
              const fl = feriados.filter((f) => f.data === d && f.abrangencia !== "nacional" && f.abrangencia !== "recesso");
              return <div key={d} className={`border-b border-[var(--line)] px-3 py-2 text-xs font-bold text-[var(--txt-2)] ${fn ? "bg-[#e8f1f1]" : "bg-[#fbf7f4]"} ${d === hoje ? "text-[var(--vinho)]" : ""}`}>
                {P.rotuloDia(d)}{d === hoje && " · hoje"}
                {fn && <span className="block text-[0.66rem] font-semibold text-[#2f5f5f]">{fn.nome} · {P.ABRANGENCIA[fn.abrangencia].toLowerCase()}</span>}
                {fl.map((f) => <span key={f.id} className="block text-[0.66rem] font-semibold text-[#2f5f5f]">{f.nome} · {f.municipio ? `${f.municipio}/` : ""}{f.uf}</span>)}
              </div>;
            })}
            {pessoas.length === 0 && <div className="col-span-6 p-6 text-sm text-[var(--muted)]">Nenhuma arquiteta ativa cadastrada.</div>}
            {pessoas.map((p) => {
              let disp = 0, prog = 0, horas = 0;
              const cells = dias.map((d) => {
                const fer = feriados.find((f) => f.data === d && P.feriadoVale(f, p.cfg));
                const ind = indisp.find((i) => i.usuarioId === p.id && i.inicio <= d && i.fim >= d);
                disp += P.disponivelNoDia(d, p.cfg, feriados, indisp);
                const bl = blocos.filter((b) => b.responsavelId === p.id && P.diaDoBloco(b) === d);
                bl.forEach((b) => { if (b.validacao !== "rascunho" && b.validacao !== "devolvida") { prog += P.peso(b); horas += P.horasComHorario(b); } });
                const cheio = fer || (ind && ind.situacao === "confirmada" && ind.periodo === "dia");
                return (
                  <div key={d} className={`flex min-h-[118px] flex-col gap-1.5 border-b border-r border-[#f0e8e2] p-1.5 ${fer ? "bg-[repeating-linear-gradient(135deg,#eef5f5_0_8px,#e4eeee_8px_16px)]" : cheio ? "bg-[repeating-linear-gradient(135deg,#fbf1ee_0_8px,#f6e6e1_8px_16px)]" : "bg-white"}`}>
                    {fer && <span className="self-start rounded-md border border-[#cfe0e0] bg-white px-1.5 py-0.5 text-[0.68rem] font-bold text-[#2f5f5f]">Feriado · {fer.nome}</span>}
                    {ind && <span className={`self-start rounded-md px-1.5 py-0.5 text-[0.68rem] font-bold ${ind.situacao === "pendente" ? "border border-dashed border-[#d9a94a] bg-white text-[#7a4b00]" : "border border-[#efcfc6] bg-[#fff4f1] text-[#8a2f1d]"}`}>{P.rotuloIndispColetivo(ind)}</span>}
                    {bl.map((b) => <Bloco key={b.id} a={b} projeto={b.projetoCodigo ? nomesProj.get(b.projetoCodigo) ?? null : null} href={q({ ver: b.id })} selecionado={b.id === selId} apagado={!casa(b)} />)}
                    <Link href={q({ novo: `${p.id}:${d}` })} scroll={false} className="mt-auto flex min-h-[30px] items-center justify-center gap-1 rounded-lg border border-dashed border-[#d9cbc2] text-[0.72rem] font-semibold text-[#8a7d76] no-underline hover:border-[var(--vinho)] hover:bg-white hover:text-[var(--vinho)]" aria-label={`Incluir atividade para ${p.nome} em ${P.rotuloDia(d)}`}>+ Incluir</Link>
                  </div>
                );
              });
              return [
                <div key={`p${p.id}`} className="sticky left-0 z-10 flex flex-col gap-1 border-b border-r border-[#f0e8e2] bg-white p-2.5">
                  <b className="text-[0.82rem]">{p.nome}</b>
                  {P.administraConfig(u) ? (
                    <div className="flex flex-wrap gap-1" role="group" aria-label={`Modelo de programação de ${p.nome}`}>
                      {([["estruturada", "Estruturada"], ["autonoma", "Autônoma"]] as const).map(([k, t]) => (
                        <form key={k} action={modeloAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="modelo" value={k} /><input type="hidden" name="volta" value={q({})} />
                          <button aria-pressed={p.cfg.modelo === k} title={P.MODELOS[k].descricao} className={`rounded-full border px-2 py-0.5 text-[0.64rem] font-bold ${p.cfg.modelo === k ? (k === "autonoma" ? "border-[#1f5a3b] bg-[#e1f0e7] text-[#1f5a3b]" : "border-[#4b3470] bg-[#eae4f4] text-[#4b3470]") : "border-[var(--line)] bg-white text-[var(--muted)] hover:border-[var(--vinho)]"}`}>{t}</button></form>
                      ))}
                      {p.cfg.modelo === "indefinido" && <span className="text-[0.62rem] text-[var(--muted)]">a definir</span>}
                    </div>
                  ) : <span className={`self-start rounded-full px-2 text-[0.66rem] font-bold ${p.cfg.modelo === "autonoma" ? "bg-[#e1f0e7] text-[#1f5a3b]" : p.cfg.modelo === "estruturada" ? "bg-[#eae4f4] text-[#4b3470]" : "border border-dashed border-[#b9aea7] bg-[#efebe8] text-[#5f5752]"}`}>{p.cfg.modelo === "indefinido" ? "A definir · como estruturada" : P.MODELOS[p.cfg.modelo].rotulo}</span>}
                  <span className="text-[0.68rem] text-[var(--muted)]">{[p.cfg.municipio, p.cfg.uf].filter(Boolean).join("/") || "localidade não informada"}</span>
                  <span className={`text-[0.68rem] ${prog > disp ? "font-semibold text-[var(--bad)]" : "text-[var(--txt-2)]"}`}>Disponível {P.fmtDias(disp)} · programado {P.fmtProgramado(prog, horas)}</span>
                </div>,
                ...cells,
              ];
            })}
          </div>
        </section>

        {(novo || sel) && (
          <aside className="card flex min-w-0 max-w-[400px] flex-[1_1_330px] flex-col gap-3 p-4" aria-label="Painel da atividade">
            {novo && novo.pessoa && (<>
              <div className="eyebrow">Nova atividade</div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">{novo.pessoa.nome} · {P.rotuloDia(novo.dia)}</h2>
              <p className="text-xs text-[var(--muted)]">Entra direto na agenda dela como programação confirmada.</p>
              <FormBloco action={criarBlocoAction} volta={q({})} rotulo="Incluir na agenda" projetos={projetos} travarDia
                valores={{ pessoaId: novo.pessoa.id, dia: novo.dia, projetoCodigo: null, etapa: "", periodo: "dia", hi: "09:00", hf: "11:00", entrega: false, obs: "" }} />
              <p className="text-xs text-[var(--muted)]">Para ligar a uma tarefa do Vobi, use a <Link href={`/agenda/atividade/nova?d=${novo.dia}&pessoa=${novo.pessoa.id}`} className="underline">programação com vínculo ao Vobi</Link>.</p>
              <LinkButton href={q({})} variant="ghost">Cancelar</LinkButton>
            </>)}
            {sel && (<>
              <div className="eyebrow">{sp.rep ? "Reprogramar" : "Atividade"}</div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">{sel.etapaRucelle ? curto(selProj) : sel.titulo}</h2>
              <div className="flex flex-wrap items-center gap-1.5"><ChipEtapa k={sel.etapaRucelle} />{sel.entrega && <Entrega />}<SeloValidacao v={sel.validacao} sempre /></div>
              <dl className="grid grid-cols-[112px_1fr] gap-x-2.5 gap-y-1 text-[0.8rem]">
                <dt className="font-semibold text-[var(--muted)]">Execução</dt><dd>{selPessoa?.nome ?? "—"}</dd>
                <dt className="font-semibold text-[var(--muted)]">Dia</dt><dd>{P.rotuloDia(P.diaDoBloco(sel))} · {P.rotuloPeriodo(sel)}</dd>
                <dt className="font-semibold text-[var(--muted)]">Projeto</dt><dd>{selProj ?? "—"}{sel.projetoCodigo ? ` (nº ${sel.projetoCodigo})` : ""}</dd>
                <dt className="font-semibold text-[var(--muted)]">Etapa no Vobi</dt><dd>{sel.vinculo === "independente" ? "sem vínculo: a etapa Rucelle vale sozinha" : `tarefa nº ${sel.tarefaVobiId ?? "a criar"}${sel.etapaVobiId ? ` · etapa nº ${sel.etapaVobiId}` : ""}`}</dd>
                <dt className="font-semibold text-[var(--muted)]">Programada por</dt><dd>{selCriou}</dd>
                {selValidou && <><dt className="font-semibold text-[var(--muted)]">Validação</dt><dd>{selValidou} · {sel.validadoEm ? dataHora(sel.validadoEm) : ""}</dd></>}
                {sel.reprogramacoes > 0 && <><dt className="font-semibold text-[var(--muted)]">Reprogramada</dt><dd>{sel.reprogramacoes}×</dd></>}
              </dl>
              {sel.validacao === "devolvida" && sel.validacaoComentario && <div className="rounded-lg bg-[#fbe2dd] px-3 py-2 text-xs text-[#7d2416]"><b>Devolvida por {selValidou}:</b> {sel.validacaoComentario}</div>}
              {sel.impedimento && <div className="rounded-lg bg-[#fff1d6] px-3 py-2 text-xs text-[#7a4b00]"><b>Impedimento avisado:</b> {sel.impedimento}</div>}
              {sel.vinculo !== "independente" ? (
                <p className="text-sm">Atividade ligada ao Vobi: altere pela <Link href={`/agenda/atividade/${sel.id}`} className="underline">página da atividade</Link>.</p>
              ) : sel.status === 5 ? <p className="text-sm text-[var(--muted)]">Atividade cancelada.</p> : sp.rep ? (
                <form action={reprogramarAction} className="flex flex-col gap-2.5">
                  <input type="hidden" name="id" value={sel.id} /><input type="hidden" name="volta" value={q({ ver: sel.id })} />
                  <label className="block text-xs font-semibold text-[var(--txt-2)]">Novo dia<select name="novo_dia" required className="input mt-1" defaultValue=""><option value="">Escolha o dia</option>{diasRep.map((d) => <option key={d} value={d} disabled={d === P.diaDoBloco(sel)}>{P.rotuloDia(d)}</option>)}</select></label>
                  <label className="block text-xs font-semibold text-[var(--txt-2)]">Motivo<select name="motivo" required className="input mt-1" defaultValue=""><option value="">Escolha o motivo</option>{P.MOTIVOS_REPROG.map((m) => <option key={m}>{m}</option>)}</select></label>
                  <label className="block text-xs font-semibold text-[var(--txt-2)]">Detalhe (opcional)<input name="detalhe" maxLength={200} className="input mt-1" /></label>
                  {sel.validacao === "aprovada" && <p className="text-xs text-[var(--muted)]">Já aprovada: mudar o dia a devolve para validação.</p>}
                  <div className="flex flex-wrap gap-2"><button className="btn btn-primary">Confirmar reprogramação</button><LinkButton href={q({ ver: sel.id })} variant="ghost">Voltar</LinkButton></div>
                  <p className="text-xs text-[var(--muted)]">Para outra data, use “Dia” no formulário de edição.</p>
                </form>
              ) : (<>
                <FormBloco action={editarBlocoAction} id={sel.id} volta={q({ ver: sel.id })} rotulo="Salvar alterações" projetos={projetos}
                  pessoas={pessoas.map((p) => ({ id: p.id, nome: p.nome }))}
                  valores={{ pessoaId: sel.responsavelId, dia: P.diaDoBloco(sel), projetoCodigo: sel.projetoCodigo, etapa: sel.etapaRucelle ?? "", periodo: sel.periodo ?? (sel.diaInteiro ? "dia" : "hora"), hi: sel.inicio ? horaInput(sel.inicio) : "09:00", hf: horaInput(sel.fim), entrega: sel.entrega, obs: sel.descricao ?? "" }} />
                {sel.validacao === "aprovada" && <p className="text-xs text-[var(--muted)]">Já aprovada: mudar projeto, executora, etapa, dia, período ou entrega a devolve para validação. Observação não.</p>}
                <LinkButton href={q({ rep: sel.id })}>Reprogramar com motivo</LinkButton>
              </>)}
              <ul className="flex flex-col gap-2 border-t border-[#f0e8e2] pt-2.5 text-xs" aria-label="Histórico">
                {hist.map(({ h, quem }) => <li key={h.id}><span className="block">{h.resumo}</span><span className="text-[var(--muted)]">{quem ?? "sistema"} · {dataHora(h.quando)}</span></li>)}
              </ul>
              <LinkButton href={q({})} variant="ghost">Fechar</LinkButton>
            </>)}
          </aside>
        )}
      </div>

      <div className="card flex flex-wrap items-center gap-3 px-4 py-2.5 text-[0.72rem] text-[var(--txt-2)]" aria-label="Legenda">
        <b>Etapas</b>{P.ETAPAS.map((e) => <span key={e.k} className="inline-flex items-center gap-1"><ChipEtapa k={e.k} />{e.n}</span>)}
        <span className="inline-flex items-center gap-1"><Entrega /> entrega ao cliente</span>
        <span className="inline-flex flex-wrap items-center gap-1"><SeloValidacao v="aguardando" /><SeloValidacao v="aprovada" /><SeloValidacao v="devolvida" /><SeloValidacao v="rascunho" /> propostas de autônomas; sem selo = confirmada</span>
      </div>
      <p className="text-xs text-[var(--muted)]">Disponível = dias úteis − feriados da localidade − indisponibilidades confirmadas (meio período = 0,5). Pedido de ausência pendente aparece tracejado e não desconta. Programado = dia inteiro 1, manhã ou tarde 0,5; atividades com horário específico aparecem em horas, à parte; rascunhos e devolvidas não contam. Atestado aparece só como “Indisponível”. Nada aqui é enviado ao Vobi.</p>
    </div>
  );
}
