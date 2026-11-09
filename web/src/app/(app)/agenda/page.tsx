import Link from "next/link";
import { exigirUsuario } from "@/lib/auth";
import { agendaConfigurada } from "@/lib/agenda/cifra";
import { podeEscrever } from "@/lib/agenda/google";
import { conexaoDe, eventosDe, sincronizar } from "@/lib/agenda/sync";
import { dataCurta, dataHora, dataLonga, diaValido, fimDoDia, hojeLocal, inicioDoDia, inicioMes, inicioSemana, mesAno, somaDias, somaMeses } from "@/lib/agenda/datas";
import { Legenda, Mes, Semana } from "@/components/agenda/Calendario";
import { Empty, LinkButton, PageHeader } from "@/components/ui";
import { atualizarAgendaAction } from "./actions";

type Visao = "mes" | "semana" | "dia";

/**
 * Agenda (T-187 · Etapa 2): calendário mensal/semanal/diário da própria agenda, com navegação, Hoje, tipos, clique no
 * evento (detalhe) e clique em horário vazio (novo compromisso). Estado na URL (?v=&d=) — funciona sem JavaScript.
 * Só a agenda do usuário da sessão; permissões decididas no servidor. Google escreve só por ação explícita (D6).
 */
export default async function AgendaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const agora = new Date();
  const hoje = hojeLocal(agora);
  const v: Visao = sp.v === "mes" || sp.v === "dia" ? sp.v : "semana";
  const d = diaValido(sp.d) ? sp.d : hoje;
  const configurada = agendaConfigurada();
  const sinc = configurada ? await sincronizar(u.id) : null;
  const c = await conexaoDe(u.id);

  // dias exibidos
  let dias: string[], titulo: string, ant: string, prox: string;
  if (v === "mes") { const ini = inicioSemana(inicioMes(d)); dias = Array.from({ length: 42 }, (_, i) => somaDias(ini, i)); titulo = mesAno(d); ant = somaMeses(d, -1); prox = somaMeses(d, 1); }
  else if (v === "semana") { const ini = inicioSemana(d); dias = Array.from({ length: 7 }, (_, i) => somaDias(ini, i)); titulo = `${dataCurta(dias[0])} – ${dataCurta(dias[6])} · ${mesAno(dias[3])}`; ant = somaDias(d, -7); prox = somaDias(d, 7); }
  else { dias = [d]; titulo = dataLonga(d); ant = somaDias(d, -1); prox = somaDias(d, 1); }
  const url = (vv: Visao, dd: string) => `/agenda?v=${vv}&d=${dd}`;
  const atual = url(v, d);
  const eventos = c && c.estado !== "revogada" ? await eventosDe(u.id, inicioDoDia(dias[0]), fimDoDia(dias[dias.length - 1])) : [];

  const avisos: { tom: "ok" | "warn" | "bad"; texto: string }[] = [];
  if (sp.conectada) avisos.push({ tom: "ok", texto: "Google Agenda conectada e sincronizada." });
  if (sp.atualizada) avisos.push({ tom: "ok", texto: "Agenda atualizada agora." });
  if (sp.criado) avisos.push({ tom: "ok", texto: "Compromisso criado no Google Agenda." });
  if (sp.excluido) avisos.push({ tom: "ok", texto: "Compromisso excluído do Google Agenda." });
  if (sp.erro === "state") avisos.push({ tom: "bad", texto: "A conexão não pôde ser confirmada (sessão ou estado inválido). Tente conectar de novo." });
  else if (sp.erro === "access_denied") avisos.push({ tom: "warn", texto: "Você não concedeu a permissão no Google. Nada foi alterado." });
  else if (sp.erro === "nao_configurada") avisos.push({ tom: "bad", texto: "A integração com o Google ainda não está configurada neste ambiente." });
  else if (sp.erro) avisos.push({ tom: "bad", texto: "Não foi possível concluir a conexão com o Google. Tente novamente; se persistir, avise a gestão." });
  if (sp.sinc === "revogada" || c?.estado === "revogada") avisos.push({ tom: "warn", texto: "O Google recusou o acesso (token expirado ou revogado). Conecte novamente em Conexão." });
  else if (sp.sinc === "erro" || c?.estado === "erro") avisos.push({ tom: "warn", texto: `A última sincronização falhou; os compromissos mostrados são da última leitura bem-sucedida${c?.ultimaSincOkEm ? ` (${dataHora(c.ultimaSincOkEm)})` : ""}.` });
  const escrita = podeEscrever(c?.escopos);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader eyebrow="Architecture 360 · Agenda" title="Agenda"
        subtitle={c ? <>Google Agenda de <b>{c.emailGoogle}</b> · {c.ultimaSincOkEm ? <>sincronizada {dataHora(c.ultimaSincOkEm)}</> : "ainda não sincronizada"} · <Link className="underline" href="/agenda/conexao">conexão</Link>{c.estado !== "revogada" && <> · <form action={atualizarAgendaAction} className="inline"><input type="hidden" name="volta" value={atual} /><button className="underline" type="submit">atualizar agora</button></form></>}</> : "Sua agenda do Google Workspace dentro do A360."}
        actions={<div className="flex flex-wrap items-center gap-2">
          {c && c.estado !== "revogada" && (escrita
            ? <LinkButton href={`/agenda/novo?d=${v === "dia" ? d : hoje}&volta=${encodeURIComponent(atual)}`} variant="primary">+ Novo compromisso</LinkButton>
            : <LinkButton href="/agenda/conexao" variant="secondary">Reautorizar para criar</LinkButton>)}
          <LinkButton href="/meu-dia">← Meu dia</LinkButton>
        </div>} />

      {avisos.map((a, i) => <div key={i} className={`leitura${a.tom === "bad" ? " leitura-bad" : ""}`}><b>{a.tom === "ok" ? "OK" : "Atenção"}</b>{a.texto}</div>)}

      {!c ? (
        <Empty action={configurada ? <LinkButton href="/api/agenda/conectar" variant="primary">Conectar Google Agenda</LinkButton> : undefined}>
          Conecte sua Google Agenda para ver e marcar compromissos aqui. O A360 lê seus calendários e só grava quando você criar, editar ou excluir um compromisso.
        </Empty>
      ) : (
        <>
          <div className="card flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div className="flex items-center gap-1">
              <Link className="btn btn-secondary btn-sm" href={url(v, ant)} aria-label="Período anterior">‹</Link>
              <Link className="btn btn-secondary btn-sm" href={url(v, hoje)}>Hoje</Link>
              <Link className="btn btn-secondary btn-sm" href={url(v, prox)} aria-label="Próximo período">›</Link>
              <h2 className="ml-2 text-[0.95rem] font-bold">{titulo.charAt(0).toUpperCase() + titulo.slice(1)}</h2>
            </div>
            <nav aria-label="Visão" className="seg">
              <Link href={url("mes", d)} aria-current={v === "mes" ? "page" : undefined}>Mês</Link>
              <Link href={url("semana", d)} aria-current={v === "semana" ? "page" : undefined}>Semana</Link>
              <Link href={url("dia", d)} aria-current={v === "dia" ? "page" : undefined}>Dia</Link>
            </nav>
          </div>
          {v === "mes" ? <Mes dias={dias} eventos={eventos} hoje={hoje} mesRef={d} volta={atual} /> : <Semana dias={dias} eventos={eventos} hoje={hoje} volta={atual} agora={agora} />}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Legenda />
            {sinc?.motivo === "cache" && <span className="text-[0.72rem] text-[var(--muted)]">dados com menos de 10 min · eventos fora da janela de −7/+60 dias não são lidos</span>}
          </div>
        </>
      )}
      <p className="text-[0.74rem] text-[var(--muted)]">Origem: Google Calendar (seus calendários) · o A360 grava no Google só quando você cria, edita ou exclui aqui · eventos privados aparecem só como &ldquo;ocupado&rdquo; · Vobi somente leitura.</p>
    </div>
  );
}
