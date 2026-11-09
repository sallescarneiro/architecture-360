import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { podeEscrever } from "@/lib/agenda/google";
import { podeEditar } from "@/lib/agenda/operacoes";
import { conexaoDe, eventoDe, projetosParaAssociacao } from "@/lib/agenda/sync";
import { dataHora, dataLonga, diaDe, duracao, hora } from "@/lib/agenda/datas";
import { voltaDe } from "@/lib/agenda/formulario";
import { linkVobiProjeto } from "@/lib/consultas";
import { Tipo } from "@/components/agenda/Calendario";
import { Button, Card, LinkButton, PageHeader } from "@/components/ui";
import { associarProjetoAction } from "../../actions";

const RESPOSTA: Record<string, string> = { accepted: "aceito", declined: "recusou", tentative: "talvez", needsAction: "sem resposta" };

/** Detalhe do compromisso: só do próprio usuário. Privado → só horário. Editar/excluir só para o organizador com permissão de escrita. */
export default async function EventoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const { id } = await params;
  const sp = await searchParams;
  const volta = voltaDe(sp);
  if (!/^\d+$/.test(id)) notFound();
  const e = await eventoDe(u.id, Number(id));
  if (!e) notFound();
  const c = await conexaoDe(u.id);
  const editavel = podeEditar(e, c);
  const projetos = await projetosParaAssociacao();
  const projeto = e.projetoCodigo ? projetos.find((p) => p.codigo === e.projetoCodigo) ?? null : null;
  const cal = c?.calendarios.find((k) => k.id === e.calendarioId);
  const avisos: string[] = [];
  if (sp.criado) avisos.push("Compromisso criado no Google Agenda.");
  if (sp.editado) avisos.push("Alterações gravadas no Google Agenda.");
  if (sp.associado) avisos.push("Associação a projeto atualizada.");
  const mesmoDia = diaDe(e.inicio) === diaDe(new Date(e.fim.getTime() - 1));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Agenda" title={e.privado ? "Ocupado" : e.titulo ?? "(sem título)"}
        subtitle={<>{dataLonga(diaDe(e.inicio))}{e.diaInteiro ? " · dia inteiro" : <> · {hora(e.inicio)}–{mesmoDia ? "" : `${dataLonga(diaDe(new Date(e.fim.getTime() - 1)))} `}{hora(e.fim)} · {duracao(e.inicio, e.fim)}</>}</>}
        actions={<div className="flex flex-wrap gap-2">
          {editavel && <LinkButton href={`/agenda/e/${e.id}/editar?volta=${encodeURIComponent(volta)}`} variant="primary">Editar</LinkButton>}
          {editavel && <LinkButton href={`/agenda/e/${e.id}/excluir?volta=${encodeURIComponent(volta)}`}>Excluir</LinkButton>}
          <LinkButton href={volta}>← Voltar</LinkButton>
        </div>} />
      {avisos.map((a, i) => <div key={i} className="leitura"><b>OK</b>{a}</div>)}
      {sp.erro && <div className="leitura leitura-bad"><b>Erro</b>{sp.erro}</div>}

      {e.privado ? (
        <Card title="Evento privado"><p className="text-sm text-[var(--txt-2)]">Marcado como privado no Google: o A360 guarda só o horário. Título, participantes e local não são lidos nem exibidos.</p></Card>
      ) : (
        <>
          <Card title="Detalhes">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs font-semibold text-[var(--muted)]">Tipo</dt><dd><Tipo tipo={e.tipo} /></dd></div>
              <div><dt className="text-xs font-semibold text-[var(--muted)]">Local</dt><dd>{e.local ?? <span className="text-[var(--muted)]">—</span>}</dd></div>
              <div><dt className="text-xs font-semibold text-[var(--muted)]">Organizador</dt><dd>{e.souOrganizador ? "você" : e.organizadorEmail ?? "—"}</dd></div>
              <div><dt className="text-xs font-semibold text-[var(--muted)]">Calendário de origem</dt><dd>{cal?.nome ?? e.calendarioId}{cal?.primario ? " (principal)" : ""}</dd></div>
              <div><dt className="text-xs font-semibold text-[var(--muted)]">Reunião online</dt><dd>{e.meetLink ? <a className="underline" href={e.meetLink} target="_blank" rel="noreferrer">Entrar no Google Meet ↗</a> : <span className="text-[var(--muted)]">sem link</span>}</dd></div>
              <div><dt className="text-xs font-semibold text-[var(--muted)]">Status de sincronização</dt><dd>lido do Google em {dataHora(e.sincronizadoEm)}{e.atualizadoGoogleEm && <span className="sub">última alteração no Google: {dataHora(e.atualizadoGoogleEm)}</span>}{e.recorrenteDe && <span className="sub">ocorrência de um evento recorrente</span>}{e.status === "tentative" && <span className="sub">provisório</span>}</dd></div>
            </dl>
            {e.descricao && <div className="mt-3"><div className="text-xs font-semibold text-[var(--muted)]">Descrição</div><p className="mt-1 whitespace-pre-wrap text-sm">{e.descricao}</p></div>}
            <p className="mt-3 text-xs"><a className="underline" href={e.htmlLink ?? "https://calendar.google.com"} target="_blank" rel="noreferrer">Abrir no Google Calendar ↗</a>{!editavel && !e.privado && <span className="text-[var(--muted)]"> · você não é o organizador: alterações só pelo Google</span>}</p>
          </Card>

          <Card title={`Participantes (${e.participantes.length})`}>
            {e.participantes.length ? (
              <ul className="flex flex-col divide-y divide-[var(--line)] text-sm">
                {e.participantes.map((p) => <li key={p.email} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5"><span>{p.nome ? <>{p.nome} <span className="text-[var(--muted)]">{p.email}</span></> : p.email}{p.externo && <span className="tag ml-2">externo</span>}</span><span className="text-xs text-[var(--muted)]">{RESPOSTA[p.resposta ?? ""] ?? ""}</span></li>)}
              </ul>
            ) : <p className="text-sm text-[var(--muted)]">Sem participantes além de você.</p>}
          </Card>

          <Card title="Projeto / cliente (Vobi)" subtitle="associação guardada no A360; o Vobi não é alterado">
            <div className="flex flex-col gap-2 text-sm">
              {projeto ? (
                <p><Link className="underline" href={`/projetos/${projeto.codigo}`}>{projeto.nome}</Link>{projeto.cliente && <span className="text-[var(--txt-2)]"> · {projeto.cliente}</span>} <a className="ml-1 text-xs underline" href={linkVobiProjeto(projeto.codigo)} target="_blank" rel="noreferrer">Vobi ↗</a>
                  {e.projetoOrigem === "sugestao" && <span className="tag ml-2" title="Associação sugerida pelo título; confirme ou corrija">sugestão automática</span>}
                  {e.projetoOrigem === "manual" && <span className="tag ml-2">confirmado</span>}</p>
              ) : <p className="text-[var(--muted)]">Nenhum projeto associado.</p>}
              <form action={associarProjetoAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={e.id} /><input type="hidden" name="volta" value={volta} />
                <label className="block min-w-[16rem] flex-1 text-xs font-semibold text-[var(--txt-2)]">{projeto ? (e.projetoOrigem === "sugestao" ? "Confirmar ou corrigir" : "Alterar") : "Associar a um projeto"}
                  <select name="projeto" className="input mt-1" defaultValue={e.projetoCodigo ?? ""}><option value="">— nenhum —</option>{projetos.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome}{p.cliente ? ` · ${p.cliente}` : ""} ({p.codigo})</option>)}</select>
                </label>
                <Button className="btn-sm" variant="secondary">{e.projetoOrigem === "sugestao" ? "Confirmar" : "Salvar"}</Button>
              </form>
            </div>
          </Card>
        </>
      )}
      {c && !podeEscrever(c.escopos) && !e.privado && e.souOrganizador && <p className="text-xs text-[var(--muted)]">Para editar ou excluir pelo A360, <Link className="underline" href="/agenda/conexao">reautorize a conexão com permissão de edição</Link>.</p>}
    </div>
  );
}
