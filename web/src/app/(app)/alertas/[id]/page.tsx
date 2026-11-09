import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import { CATEGORIAS, CLASSIFICACOES, PRIORIDADES, SITUACOES, alertaPorId, historicoAlertaDe, podeVerAlerta } from "@/lib/alertas";
import { rotuloAcaoAlerta } from "@/lib/linha-do-tempo";
import { dataHora } from "@/lib/agenda/datas";
import { Badge, Button, Card, LinkButton, PageHeader } from "@/components/ui";
import { tratarAlertaAction } from "../actions";

const seguro = (s?: string) => (s && s.startsWith("/") && !s.startsWith("//") ? s : "/alertas");

/** Detalhe do alerta: evidências, classificação da IA, tratamento humano e histórico imutável. */
export default async function AlertaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const { id } = await params; const sp = await searchParams; const volta = seguro(sp.volta);
  if (!/^\d+$/.test(id)) notFound();
  const a = await alertaPorId(Number(id)); if (!a) notFound();
  if (!(await podeVerAlerta(u, a))) redirect("/sem-permissao");
  const gestao = u.perfil !== "arquiteta";
  const [hist, p] = await Promise.all([historicoAlertaDe(a.id), db.select({ nome: schema.projetos.nome }).from(schema.projetos).where(eq(schema.projetos.codigo, a.projetoCodigo)).limit(1)]);
  const aberto = SITUACOES[a.situacao]?.aberto ?? true;
  const F = ({ acao, children, campo }: { acao: string; children: React.ReactNode; campo?: "justificativa" | "esclarecimento" | "aprovacao" | "providencia" | "rota" }) => (
    <form action={tratarAlertaAction} className="flex flex-wrap items-end gap-2 rounded-[10px] border border-dashed border-[var(--line)] p-3">
      <input type="hidden" name="id" value={a.id} /><input type="hidden" name="volta" value={volta} /><input type="hidden" name="acao" value={acao} />
      {campo === "rota" ? <>
        <label className="block min-w-[16rem] flex-1 text-xs font-semibold text-[var(--txt-2)]">Correção de rota<textarea name="direcionamento" rows={2} required className="input mt-1" placeholder="o que deve ser feito para corrigir" /></label>
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Responsável pelo acompanhamento<input name="responsavel" className="input mt-1" placeholder="nome ou e-mail" /></label>
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Prazo<input type="date" name="prazo" className="input mt-1" /></label>
      </> : campo ? <label className="block min-w-[16rem] flex-1 text-xs font-semibold text-[var(--txt-2)]">{({ justificativa: "Justificativa", esclarecimento: "O que esclarecer e com quem", aprovacao: "Quem aprovou a alteração e quando", providencia: "Providência realizada" })[campo]}<input name="justificativa" required minLength={5} className="input mt-1" /></label> : null}
      <Button variant="secondary" className="btn-sm">{children}</Button>
    </form>
  );
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Alerta" title={a.titulo}
        subtitle={<><Link className="underline" href={`/projetos/${a.projetoCodigo}/linha-do-tempo`}>{p[0]?.nome ?? `projeto ${a.projetoCodigo}`}</Link> · {CATEGORIAS[a.categoria] ?? a.categoria} · identificado em {dataHora(a.criadoEm)} por {a.origem === "ia" ? "IA/verificação automática" : "gestão"}</>}
        actions={<LinkButton href={volta}>← Voltar</LinkButton>} />
      {sp.ok && <div className="leitura"><b>OK</b>Tratamento registrado no histórico e na linha do tempo do projeto.</div>}
      {sp.erro && <div className="leitura leitura-bad"><b>Erro</b>{sp.erro}</div>}
      <div className="flex flex-wrap gap-2 text-sm">
        <span className={`st st-${PRIORIDADES[a.prioridade]?.tom ?? "neutro"}`}><i aria-hidden /> prioridade {PRIORIDADES[a.prioridade]?.rotulo}</span>
        <Badge tone={CLASSIFICACOES[a.classificacao]?.tom ?? "neutral"}>{CLASSIFICACOES[a.classificacao]?.rotulo}</Badge>
        <Badge tone={SITUACOES[a.situacao]?.tom ?? "neutral"}>{SITUACOES[a.situacao]?.rotulo}</Badge>
        {a.confianca != null && <span className="tag">confiança da IA: {a.confianca}%</span>}
      </div>
      <Card title="Descrição"><p className="whitespace-pre-wrap text-sm">{a.descricao}</p>{a.impacto && <p className="mt-2 text-sm"><b>Possível impacto:</b> {a.impacto}</p>}</Card>
      <Card title={`Evidências (${a.evidencias.length})`} subtitle="registros originais que sustentam a identificação · A360 e Vobi">
        <ul className="flex flex-col divide-y divide-[var(--line)] text-sm">{a.evidencias.map((e, i) => <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5"><span><span className={`tl-origem tl-origem-${e.origem}`}>{e.origem === "a360" ? "A360" : "Vobi"}</span> <span className="tag">{e.tipo}</span> {e.link ? (e.link.startsWith("http") ? <a className="underline" href={e.link} target="_blank" rel="noreferrer">{e.rotulo} ↗</a> : <Link className="underline" href={e.link}>{e.rotulo}</Link>) : e.rotulo}{e.trecho && <span className="block text-xs italic text-[var(--muted)]">&ldquo;{e.trecho}&rdquo;</span>}</span><span className="text-xs text-[var(--muted)]">{e.data ?? ""}</span></li>)}</ul>
      </Card>
      {(a.direcionamento || a.responsavel || a.prazo) && <Card title="Direcionamento"><p className="text-sm">{a.direcionamento}</p><p className="mt-1 text-xs text-[var(--muted)]">{a.responsavel ? `Responsável pelo acompanhamento: ${a.responsavel}` : "Sem responsável definido"}{a.prazo ? ` · prazo ${a.prazo.split("-").reverse().join("/")}` : ""}</p></Card>}
      {gestao && (
        <Card title="Tratamento" subtitle="a IA identificou e recomendou; a decisão é da coordenação/gestão e fica registrada">
          <div className="flex flex-col gap-2">
            {aberto ? <>
              {a.situacao === "aberto" && <F acao="em_analise">Assumir análise</F>}
              {a.classificacao !== "divergencia_confirmada" && <F acao="confirmado">Confirmar divergência</F>}
              <F acao="descartado" campo="justificativa">Descartar identificação</F>
              <F acao="esclarecimento" campo="esclarecimento">Solicitar esclarecimento</F>
              <F acao="alteracao_aprovada" campo="aprovacao">Registrar alteração aprovada</F>
              <F acao="correcao_rota" campo="rota">Determinar correção de rota</F>
              <F acao="providencia" campo="providencia">Registrar providência</F>
              <F acao="encerrado" campo="justificativa">Encerrar com resultado</F>
            </> : <F acao="reaberto">Reabrir alerta</F>}
          </div>
        </Card>
      )}
      <Card title={`Histórico (${hist.length})`} subtitle="imutável: alerta original, classificação da IA, decisões humanas, justificativas, providências e encerramento">
        <ul className="flex flex-col divide-y divide-[var(--line)] text-sm">{hist.map((h) => <li key={h.id} className="flex flex-wrap justify-between gap-2 py-1.5"><span><b>{h.acao === "criado" ? "Alerta criado" : rotuloAcaoAlerta(h.acao)}</b>{h.justificativa ? ` — ${h.justificativa}` : ""}</span><span className="text-xs text-[var(--muted)]">{h.quem ?? "IA"} · {dataHora(h.quando)}</span></li>)}</ul>
      </Card>
      <p className="text-[0.74rem] text-[var(--muted)]">Alertas não atribuem culpa a pessoas nem medem desempenho; descrevem diferenças entre registros para que a gestão decida.</p>
    </div>
  );
}
