import Link from "next/link";
import { exigirUsuario } from "@/lib/auth";
import { agendaConfigurada } from "@/lib/agenda/cifra";
import { ESCOPO_ESCRITA, podeEscrever } from "@/lib/agenda/google";
import { CACHE_MIN, conexaoDe } from "@/lib/agenda/sync";
import { dataHora } from "@/lib/agenda/datas";
import { Badge, Button, Card, LinkButton, PageHeader } from "@/components/ui";
import { atualizarAgendaAction, desconectarAgendaAction } from "../actions";

/** Conexão com o Google Agenda (Etapa 1, preservada): estado, conta, última sincronização, conectar/reautorizar/desconectar. */
export default async function ConexaoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const configurada = agendaConfigurada();
  const c = await conexaoDe(u.id);
  const escrita = podeEscrever(c?.escopos);
  const avisos: { tom: "ok" | "warn" | "bad"; texto: string }[] = [];
  if (sp.desconectada) avisos.push({ tom: "ok", texto: "Google Agenda desconectada: acesso revogado no Google e dados locais apagados." });
  if (sp.atualizada) avisos.push({ tom: "ok", texto: "Agenda atualizada agora." });
  if (sp.sinc === "revogada") avisos.push({ tom: "warn", texto: "O Google recusou o acesso (token expirado ou revogado). Conecte novamente." });
  if (sp.sinc === "erro") avisos.push({ tom: "warn", texto: "A sincronização falhou; os eventos mostrados são da última sincronização bem-sucedida." });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Agenda" title="Conexão com o Google Agenda"
        subtitle="OAuth por usuário · cada pessoa conecta a própria conta @rucelle.com.br · tokens cifrados no servidor · desconecte quando quiser"
        actions={<LinkButton href="/agenda">← Agenda</LinkButton>} />
      {avisos.map((a, i) => <div key={i} className={`leitura${a.tom === "bad" ? " leitura-bad" : ""}`}><b>{a.tom === "ok" ? "OK" : "Atenção"}</b>{a.texto}</div>)}

      <Card title="Estado da conexão" subtitle={configurada ? `Permissões: leitura da agenda${escrita ? " + criar/editar/excluir eventos" : ""}` : "Integração não configurada neste ambiente"}>
        {!c ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--txt-2)]">Nenhuma agenda conectada. Ao conectar, o A360 lê seus calendários e pode criar, editar e excluir compromissos seus, sempre a seu comando.</p>
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
              <div><dt className="text-xs font-semibold text-[var(--muted)]">Última sincronização</dt><dd>{c.ultimaSincOkEm ? dataHora(c.ultimaSincOkEm) : "ainda não sincronizada"}{c.ultimaSincOkEm && <span className="sub">{c.eventos} eventos na janela de −7 a +60 dias · cache de {CACHE_MIN} min</span>}</dd></div>
              <div><dt className="text-xs font-semibold text-[var(--muted)]">Conectada em</dt><dd>{dataHora(c.conectadoEm)}</dd></div>
            </dl>
            {c.calendarios.length > 0 && (
              <div className="text-sm"><span className="text-xs font-semibold text-[var(--muted)]">Calendários lidos</span>
                <ul className="mt-1 flex flex-wrap gap-1.5">{c.calendarios.map((k) => <li key={k.id} className="tag" title={k.id}>{k.nome}{k.primario ? " · principal" : ""} · {k.acesso === "owner" || k.acesso === "writer" ? "edição" : "leitura"}</li>)}</ul>
              </div>
            )}
            {c.erro && <p className="text-xs text-[var(--st-relevante)]">{c.erro}{c.ultimaSincEm && c.ultimaSincEm.getTime() !== c.ultimaSincOkEm?.getTime() ? ` (tentativa em ${dataHora(c.ultimaSincEm)})` : ""}</p>}
            {c.estado !== "revogada" && !escrita && (
              <div className="leitura"><b>Permissão</b>Esta conexão só lê a agenda. Para criar, editar e excluir compromissos pelo A360, <Link className="underline" href="/api/agenda/conectar">reautorize</Link> concedendo a permissão de edição de eventos ({ESCOPO_ESCRITA.split("/").pop()}).</div>
            )}
            <div className="flex flex-wrap gap-2">
              {c.estado === "revogada"
                ? <LinkButton href="/api/agenda/conectar" variant="primary">Conectar novamente</LinkButton>
                : <>{!escrita && <LinkButton href="/api/agenda/conectar" variant="primary">Reautorizar com edição</LinkButton>}
                    <form action={atualizarAgendaAction}><input type="hidden" name="volta" value="/agenda/conexao" /><Button className="btn-sm" variant="secondary">Atualizar agora</Button></form></>}
              <form action={desconectarAgendaAction}><Button className="btn-sm" variant="secondary">Desconectar</Button></form>
            </div>
          </div>
        )}
      </Card>
      <p className="text-[0.74rem] text-[var(--muted)]">O A360 escreve no Google só quando você cria, edita ou exclui um compromisso aqui, e registra quem fez o quê e quando (sem o conteúdo). O Vobi continua somente leitura.</p>
    </div>
  );
}
