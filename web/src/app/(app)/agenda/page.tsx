import Link from "next/link";
import { exigirUsuario } from "@/lib/auth";
import { agendaConfigurada } from "@/lib/agenda/cifra";
import { CACHE_MIN, conexaoDe, eventosDe, sincronizar } from "@/lib/agenda/sync";
import { Badge, Button, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { atualizarAgendaAction, desconectarAgendaAction } from "./actions";

/**
 * Agenda (T-187 · Etapa 1): conexão OAuth por usuário, estado da conexão, última sincronização e a própria agenda
 * (hoje + 14 dias). Só a agenda do usuário da sessão — visão de equipe, classificação e associação a projetos vêm nas etapas 2–3.
 * Google Calendar é somente leitura: toda ação acontece no Google, por link.
 */
export default async function AgendaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const configurada = agendaConfigurada();
  // Sincronização sob demanda com cache (D5): ao abrir a tela, só se a última boa tiver mais de 10 minutos.
  const sinc = configurada ? await sincronizar(u.id) : null;
  const c = await conexaoDe(u.id);
  const agora = new Date();
  const inicioHoje = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora) + "T00:00:00-03:00");
  const ate = new Date(inicioHoje.getTime() + 15 * 86400_000);
  const eventos = c && c.estado !== "revogada" ? await eventosDe(u.id, inicioHoje, ate) : [];

  const avisos: { tom: "ok" | "warn" | "bad"; texto: string }[] = [];
  if (sp.conectada) avisos.push({ tom: "ok", texto: "Google Agenda conectada. A sincronização inicial foi feita." });
  if (sp.desconectada) avisos.push({ tom: "ok", texto: "Google Agenda desconectada: acesso revogado no Google e dados locais apagados." });
  if (sp.atualizada) avisos.push({ tom: "ok", texto: "Agenda atualizada agora." });
  if (sp.erro === "state") avisos.push({ tom: "bad", texto: "A conexão não pôde ser confirmada (sessão ou estado inválido). Tente conectar de novo." });
  else if (sp.erro === "access_denied") avisos.push({ tom: "warn", texto: "Você não concedeu a permissão no Google. Nada foi conectado." });
  else if (sp.erro === "nao_configurada") avisos.push({ tom: "bad", texto: "A integração com o Google ainda não está configurada neste ambiente." });
  else if (sp.erro) avisos.push({ tom: "bad", texto: "Não foi possível concluir a conexão com o Google. Tente novamente; se persistir, avise a gestão." });
  if (sp.sinc === "revogada") avisos.push({ tom: "warn", texto: "O Google recusou o acesso (token expirado ou revogado). Conecte novamente." });
  if (sp.sinc === "erro") avisos.push({ tom: "warn", texto: "A sincronização falhou; os eventos mostrados são da última sincronização bem-sucedida." });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Agenda" title="Agenda"
        subtitle={<>Sua agenda do Google Workspace, somente leitura. Marcar, mover ou cancelar continua sendo no Google Calendar. Eventos privados aparecem só como &ldquo;ocupado&rdquo;.</>}
        actions={<LinkButton href="/meu-dia">← Meu dia</LinkButton>} />

      {avisos.map((a, i) => <div key={i} className={`leitura${a.tom === "bad" ? " leitura-bad" : ""}`}><b>{a.tom === "ok" ? "OK" : "Atenção"}</b>{a.texto}</div>)}

      <Card title="Conexão com o Google Agenda" subtitle={configurada ? "OAuth por usuário · escopo somente leitura (calendar.readonly) · tokens cifrados no servidor" : "Integração não configurada neste ambiente"}>
        {!c ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--txt-2)]">Nenhuma agenda conectada. Ao conectar, o A360 passa a ler só a sua agenda principal; você pode desconectar quando quiser.</p>
            {configurada && <LinkButton href="/api/agenda/conectar" variant="primary">Conectar Google Agenda</LinkButton>}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-xs font-semibold text-[var(--muted)]">Estado</dt><dd>
                {c.estado === "conectada" && <Badge tone="ok">conectada</Badge>}
                {c.estado === "erro" && <Badge tone="warn">conectada · última sincronização falhou</Badge>}
                {c.estado === "revogada" && <Badge tone="bad">acesso revogado</Badge>}
              </dd></div>
              <div><dt className="text-xs font-semibold text-[var(--muted)]">Conta Google</dt><dd>{c.emailGoogle ?? "—"}</dd></div>
              <div><dt className="text-xs font-semibold text-[var(--muted)]">Última sincronização</dt><dd>{c.ultimaSincOkEm ? c.ultimaSincOkEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "ainda não sincronizada"}{c.ultimaSincOkEm && <span className="sub">{c.eventos} eventos na janela de −7 a +60 dias · cache de {CACHE_MIN} min</span>}</dd></div>
              <div><dt className="text-xs font-semibold text-[var(--muted)]">Conectada em</dt><dd>{c.conectadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</dd></div>
            </dl>
            {c.erro && <p className="text-xs text-[var(--st-relevante)]">{c.erro}{c.ultimaSincEm && c.ultimaSincEm !== c.ultimaSincOkEm ? ` (tentativa em ${c.ultimaSincEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })})` : ""}</p>}
            <div className="flex flex-wrap gap-2">
              {c.estado === "revogada"
                ? <LinkButton href="/api/agenda/conectar" variant="primary">Conectar novamente</LinkButton>
                : <form action={atualizarAgendaAction}><Button className="btn-sm" variant="secondary">Atualizar agora</Button></form>}
              <form action={desconectarAgendaAction}><Button className="btn-sm" variant="secondary">Desconectar</Button></form>
            </div>
            {sinc?.motivo === "cache" && <p className="text-xs text-[var(--muted)]">Dados com menos de {CACHE_MIN} minutos; use &ldquo;Atualizar agora&rdquo; se marcou algo há pouco.</p>}
          </div>
        )}
      </Card>

      <Card title="Próximos 14 dias" subtitle={c ? "Sua agenda principal · horário de Brasília" : undefined}>
        {!c ? <Empty>Conecte a Google Agenda para ver seus compromissos aqui.</Empty>
          : c.estado === "revogada" ? <Empty>Acesso revogado no Google — conecte novamente para voltar a ver a agenda.</Empty>
          : !eventos.length ? <Empty>Nenhum compromisso nos próximos 14 dias na sua agenda principal.</Empty>
          : <ListaEventos eventos={eventos} />}
      </Card>

      <p className="text-[0.74rem] text-[var(--muted)]">Origem: Google Calendar (agenda principal da conta conectada) · somente leitura · o A360 não cria, altera nem apaga eventos. Classificação por tipo, associação a projetos do Vobi e visão de equipe chegam nas próximas etapas.</p>
    </div>
  );
}

type Ev = Awaited<ReturnType<typeof eventosDe>>[number];

function ListaEventos({ eventos }: { eventos: Ev[] }) {
  const fmtDia = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" });
  const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const porDia = new Map<string, Ev[]>();
  for (const e of eventos) { const k = fmtDia.format(e.inicio); (porDia.get(k) ?? porDia.set(k, []).get(k)!).push(e); }
  return (
    <div className="flex flex-col gap-3">
      {[...porDia.entries()].map(([dia, lista]) => (
        <section key={dia}>
          <h3 className="mb-1 text-[0.78rem] font-bold uppercase tracking-wide text-[var(--txt-2)]">{dia}</h3>
          <ul className="flex flex-col divide-y divide-[var(--line)]">
            {lista.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5 text-sm">
                <span className="w-[7.5rem] shrink-0 tabular-nums text-[var(--txt-2)]">{e.diaInteiro ? "dia inteiro" : `${fmtHora.format(e.inicio)}–${fmtHora.format(e.fim)}`}</span>
                {e.privado ? (
                  <span className="italic text-[var(--muted)]">ocupado <span className="tag">privado</span></span>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 font-medium">{e.titulo}{e.status === "tentative" && <span className="tag ml-1">provisório</span>}</span>
                    {e.local && <span className="text-[var(--txt-2)]">{e.local}</span>}
                    {e.participantes.length > 0 && <span className="text-xs text-[var(--muted)]">{e.participantes.length} participante{e.participantes.length > 1 ? "s" : ""}{e.externos ? ` · ${e.externos} externo${e.externos > 1 ? "s" : ""}` : ""}</span>}
                    {e.meetLink && <a className="text-xs underline" href={e.meetLink} target="_blank" rel="noreferrer">Meet ↗</a>}
                    {e.htmlLink && <a className="text-xs underline" href={e.htmlLink} target="_blank" rel="noreferrer">Google Agenda ↗</a>}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-xs text-[var(--muted)]"><Link className="underline" href="https://calendar.google.com" target="_blank">Abrir o Google Calendar ↗</Link></p>
    </div>
  );
}
