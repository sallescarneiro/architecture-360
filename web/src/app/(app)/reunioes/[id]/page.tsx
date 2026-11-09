import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import { linkVobiProjeto } from "@/lib/consultas";
import { dataHora, hojeLocal } from "@/lib/agenda/datas";
import { STATUS_REUNIAO, TIPOS_ITEM, fmtPeriodo, historicoDe, itensDe, podeEditar, podeVer, prazoVencido, reuniaoPorId, type ItemReuniao } from "@/lib/reunioes";
import { Badge, Button, Card, LinkButton, PageHeader } from "@/components/ui";
import { adicionarItemAction, mudarStatusAction, salvarAtaAction, situacaoItemAction } from "../actions";

const seguro = (s?: string) => (s && s.startsWith("/") && !s.startsWith("//") ? s : "/reunioes");
const fmtDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Detalhe da reunião: dados, participantes, pauta, ata, decisões, aprovações, encaminhamentos e histórico imutável. */
export default async function ReuniaoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const { id } = await params; const sp = await searchParams; const volta = seguro(sp.volta);
  if (!/^\d+$/.test(id)) notFound();
  const r = await reuniaoPorId(Number(id)); if (!r) notFound();
  if (!(await podeVer(u, r))) redirect("/sem-permissao");
  const editavel = await podeEditar(u, r);
  const [itens, historico] = await Promise.all([itensDe(r.id), historicoDe(r.id)]);
  const projeto = r.projetoCodigo ? (await db.select({ codigo: schema.projetos.codigo, nome: schema.projetos.nome, status: schema.projetos.status }).from(schema.projetos).where(eq(schema.projetos.codigo, r.projetoCodigo)).limit(1))[0] ?? null : null;
  const cliente = r.clienteCodigo ? (await db.select({ codigo: schema.clientesVobi.codigo, nome: schema.clientesVobi.nome }).from(schema.clientesVobi).where(eq(schema.clientesVobi.codigo, r.clienteCodigo)).limit(1))[0] ?? null : null;
  const evento = r.eventoGoogleId && r.eventoUsuarioId === u.id ? (await db.select({ id: schema.eventosAgenda.id, htmlLink: schema.eventosAgenda.htmlLink, meet: schema.eventosAgenda.meetLink }).from(schema.eventosAgenda).where(eq(schema.eventosAgenda.googleId, r.eventoGoogleId)).limit(1))[0] ?? null : null;
  const hoje = hojeLocal();
  const st = STATUS_REUNIAO[r.status];
  const avisos: string[] = [];
  if (sp.criada) avisos.push(sp.agenda ? "Reunião registrada e compromisso criado na sua Google Agenda." : "Reunião registrada.");
  if (sp.editada) avisos.push("Dados da reunião atualizados.");
  if (sp.ata) avisos.push("Ata salva.");
  if (sp.item) avisos.push("Item registrado.");
  if (sp.status) avisos.push("Status atualizado.");
  const porTipo = (t: string) => itens.filter((i) => i.tipo === t);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Reuniões" title={r.titulo}
        subtitle={<>{fmtPeriodo(r.inicio, r.fim)}{r.local ? ` · ${r.local}` : ""} · <Badge tone={st?.tom ?? "neutral"}>{st?.rotulo ?? r.status}</Badge></>}
        actions={<div className="flex flex-wrap gap-2">
          {editavel && <LinkButton href={`/reunioes/${r.id}/editar?volta=${encodeURIComponent(volta)}`}>Editar dados</LinkButton>}
          {r.status === "planejada" && editavel && <form action={mudarStatusAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="volta" value={volta} /><input type="hidden" name="status" value="realizada" /><Button variant="primary">Marcar como realizada</Button></form>}
          <LinkButton href={volta}>← Voltar</LinkButton>
        </div>} />
      {avisos.map((a, i) => <div key={i} className="leitura"><b>OK</b>{a}</div>)}
      {sp.erro && <div className="leitura leitura-bad"><b>Atenção</b>{sp.erro}</div>}

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card title="Projeto e cliente" subtitle="Vobi, somente leitura — a reunião não altera nada lá">
          <div className="text-sm">
            {projeto ? <p><Link className="underline" href={`/projetos/${projeto.codigo}`}>{projeto.nome}</Link> <span className="text-[var(--muted)]">· {projeto.status}</span> <a className="ml-1 text-xs underline" href={linkVobiProjeto(projeto.codigo)} target="_blank" rel="noreferrer">Vobi ↗</a></p> : <p className="text-[var(--muted)]">Sem projeto (reunião interna/geral).</p>}
            {cliente && <p className="mt-1">Cliente: <Link className="underline" href={`/clientes/${cliente.codigo}`}>{cliente.nome}</Link></p>}
            <p className="mt-2 text-xs text-[var(--muted)]">Google Agenda: {evento ? <>ligada ao compromisso <Link className="underline" href={`/agenda/e/${evento.id}?volta=${encodeURIComponent(`/reunioes/${r.id}`)}`}>abrir na Agenda</Link>{evento.meet && <> · <a className="underline" href={evento.meet} target="_blank" rel="noreferrer">Meet ↗</a></>}</> : r.eventoGoogleId ? "ligada a um compromisso da agenda de outra pessoa" : "sem compromisso ligado"}</p>
          </div>
        </Card>
        <Card title={`Participantes (${r.participantes.length})`}>
          {r.participantes.length ? <ul className="flex flex-col gap-1 text-sm">{r.participantes.map((p, i) => <li key={i}>{p.nome}{p.email && p.email !== p.nome ? <span className="text-[var(--muted)]"> · {p.email}</span> : ""}{p.externo && <span className="tag ml-2">externo</span>}</li>)}</ul> : <p className="text-sm text-[var(--muted)]">Nenhum participante registrado.</p>}
        </Card>
      </div>

      <Card title="Pauta">{r.pauta ? <p className="whitespace-pre-wrap text-sm">{r.pauta}</p> : <p className="text-sm text-[var(--muted)]">Sem pauta registrada{editavel ? " — use “Editar dados”." : "."}</p>}</Card>

      <Card title="Ata" subtitle="o que foi tratado; cada versão fica no histórico" >
        <div id="ata">
          {editavel ? (
            <form action={salvarAtaAction} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={r.id} /><input type="hidden" name="volta" value={volta} />
              <textarea name="ata" rows={8} maxLength={20000} defaultValue={r.ata ?? ""} className="input" placeholder="Registre o que foi apresentado, discutido e combinado. Decisões, aprovações e encaminhamentos têm campos próprios abaixo." />
              <div className="flex justify-end"><Button variant="primary" className="btn-sm">Salvar ata</Button></div>
            </form>
          ) : r.ata ? <p className="whitespace-pre-wrap text-sm">{r.ata}</p> : <p className="text-sm text-[var(--muted)]">Sem ata.</p>}
        </div>
      </Card>

      {(["decisao", "aprovacao", "encaminhamento"] as const).map((tipo) => {
        const lista = porTipo(tipo), enc = tipo === "encaminhamento";
        return (
          <Card key={tipo} title={`${TIPOS_ITEM[tipo].plural} (${lista.length})`} subtitle={enc ? "o que ficou combinado de fazer, com quem e até quando — registro de acompanhamento no A360, não é tarefa do Vobi nem cobrança automática" : tipo === "aprovacao" ? "o que o cliente/gestão aprovou nesta reunião" : "o que ficou decidido"}>
            <div id={tipo} className="flex flex-col gap-3">
              {lista.length ? (
                <ul className="flex flex-col divide-y divide-[var(--line)]">{lista.map((i) => <Item key={i.id} i={i} r={{ id: r.id }} volta={volta} editavel={editavel} hoje={hoje} />)}</ul>
              ) : <p className="text-sm text-[var(--muted)]">Nenhum registro.</p>}
              {editavel && (
                <form action={adicionarItemAction} className="flex flex-col gap-2 rounded-[10px] border border-dashed border-[var(--line)] p-3">
                  <input type="hidden" name="id" value={r.id} /><input type="hidden" name="volta" value={volta} /><input type="hidden" name="tipo" value={tipo} />
                  <input name="texto" required maxLength={2000} className="input" placeholder={enc ? "ex.: Enviar revisão do layout da recepção" : tipo === "aprovacao" ? "ex.: Cliente aprovou o anteprojeto da área de musculação" : "ex.: Manter o piso vinílico na área de peso livre"} />
                  {enc && <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"><input name="responsavel" maxLength={120} className="input" placeholder="responsável (nome ou e-mail)" /><input type="date" name="prazo" className="input" /><Button variant="secondary" className="btn-sm">Adicionar</Button></div>}
                  {!enc && <div className="flex justify-end"><Button variant="secondary" className="btn-sm">Adicionar</Button></div>}
                </form>
              )}
            </div>
          </Card>
        );
      })}

      <Card title={`Histórico (${historico.length})`} subtitle="registro imutável: quem fez o quê e quando">
        <ul className="flex flex-col divide-y divide-[var(--line)] text-sm">{historico.map((h) => <li key={h.id} className="flex flex-wrap justify-between gap-2 py-1.5"><span>{h.resumo}</span><span className="text-xs text-[var(--muted)]">{h.quem} · {dataHora(h.quando)}</span></li>)}</ul>
      </Card>

      {r.status !== "cancelada" && editavel && (
        <form action={mudarStatusAction} className="self-end"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="volta" value={volta} /><input type="hidden" name="status" value="cancelada" /><button className="text-xs text-[var(--muted)] underline" type="submit">Cancelar esta reunião (fica no histórico)</button></form>
      )}
      {r.status === "cancelada" && (
        <form action={mudarStatusAction} className="self-end"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="volta" value={volta} /><input type="hidden" name="status" value="planejada" /><button className="text-xs underline" type="submit">Reabrir reunião</button></form>
      )}
    </div>
  );
}

function Item({ i, r, volta, editavel, hoje }: { i: ItemReuniao; r: { id: number }; volta: string; editavel: boolean; hoje: string }) {
  const enc = i.tipo === "encaminhamento";
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className={i.situacao === "cancelado" ? "line-through text-[var(--muted)]" : i.situacao === "feito" ? "text-[var(--txt-2)]" : ""}>{i.texto}</p>
        {enc && <p className="mt-0.5 text-xs text-[var(--muted)]">{i.responsavel ? `Responsável: ${i.responsavel}` : "Sem responsável definido"}{i.prazo && <> · prazo {fmtDia(i.prazo)}{prazoVencido(i.prazo, hoje) && i.situacao === "aberto" && <span className="st st-relevante ml-1"><i aria-hidden /> vencido</span>}</>}</p>}
      </div>
      {enc && (
        <div className="flex items-center gap-1">
          <Badge tone={i.situacao === "feito" ? "ok" : i.situacao === "cancelado" ? "neutral" : "warn"}>{i.situacao}</Badge>
          {editavel && i.situacao === "aberto" && <form action={situacaoItemAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="item" value={i.id} /><input type="hidden" name="volta" value={volta} /><input type="hidden" name="situacao" value="feito" /><button className="btn btn-secondary btn-sm" type="submit">Feito</button></form>}
          {editavel && i.situacao === "aberto" && <form action={situacaoItemAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="item" value={i.id} /><input type="hidden" name="volta" value={volta} /><input type="hidden" name="situacao" value="cancelado" /><button className="text-xs text-[var(--muted)] underline" type="submit">cancelar</button></form>}
          {editavel && i.situacao !== "aberto" && <form action={situacaoItemAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="item" value={i.id} /><input type="hidden" name="volta" value={volta} /><input type="hidden" name="situacao" value="aberto" /><button className="text-xs underline" type="submit">reabrir</button></form>}
        </div>
      )}
    </li>
  );
}
