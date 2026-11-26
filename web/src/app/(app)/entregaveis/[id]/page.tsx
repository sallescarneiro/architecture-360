import Link from "next/link";
import { coberturasAtivas, dataBr, papeis } from "@/lib/cobertura";
import { notFound, redirect } from "next/navigation";
import { db, schema } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { exigirUsuario } from "@/lib/auth";
import { ETAPAS_REVISAO, podeCorrigirAnexo, podeRevisarEtapa, EVIDENCIAS, STATUS, TIPOS, aprovacoesDe, comentariosDe, gestao, historicoDe, lerLinks, podeEditar, podeVer, porId, versoesDe } from "@/lib/entregaveis";
import { reuniaoPorId, reunioesDoProjeto } from "@/lib/reunioes";
import { linkVobiProjeto } from "@/lib/consultas";
import { Alert, Badge, Button, Card, LinkButton, PageHeader } from "@/components/ui";
import { aprovacaoClienteAction, aprovacaoInternaAction, ajustesInternaAction, comentarAction, adicionarLinksAction, corrigirAnexoAction, novaVersaoAction, statusEntregavelAction } from "../actions";

export default async function EntregavelPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const { id } = await params; const sp = await searchParams;
  const e = /^\d+$/.test(id) ? await porId(Number(id)) : null;
  if (!e) notFound();
  if (!(await podeVer(u, e))) redirect("/sem-permissao");
  const edita = await podeEditar(u, e);
  const [versoes, aprovacoes, comentarios, historico, projeto, reuniaoApres, reunioesProj] = await Promise.all([versoesDe(e.id), aprovacoesDe(e.id), comentariosDe(e.id), historicoDe(e.id),
    db.select({ nome: schema.projetos.nome, cliente: schema.clientesVobi.nome }).from(schema.projetos).leftJoin(schema.clientesVobi, eq(schema.clientesVobi.codigo, schema.projetos.clienteCodigo)).where(eq(schema.projetos.codigo, e.projetoCodigo)).limit(1).then((r) => r[0] ?? null),
    e.reuniaoId ? reuniaoPorId(e.reuniaoId) : Promise.resolve(null), reunioesDoProjeto(e.projetoCodigo)]);
  const itensAprovacao = reunioesProj.length ? await db.select({ id: schema.itensReuniao.id, texto: schema.itensReuniao.texto, reuniaoId: schema.itensReuniao.reuniaoId }).from(schema.itensReuniao).where(and(inArray(schema.itensReuniao.reuniaoId, reunioesProj.map((r) => r.id)), eq(schema.itensReuniao.tipo, "aprovacao"), eq(schema.itensReuniao.confirmado, true))) : [];
  const revisora = e.revisorId ? (await db.select({ nome: schema.usuarios.nome }).from(schema.usuarios).where(eq(schema.usuarios.id, e.revisorId)).limit(1))[0]?.nome ?? null : null;
  const revisa = await podeRevisarEtapa(u, e);
  const travaAnexo = e.versaoAtual ? await podeCorrigirAnexo(e, e.versaoAtual) : "sem versão"; // T-312
  const ausentes = await coberturasAtivas(); const meusPapeis = await papeis(u); // T-301 // T-292: só quem é da etapa atual da cadeia
  const etapaAtual = e.status === "revisao_interna" ? e.etapaRevisao ?? "coordenacao" : null;
  const aprovadasNaVersao = new Set(aprovacoes.filter((a) => a.instancia === "interna" && a.decisao === "aprovado" && a.versaoNumero === e.versaoAtual && a.nivel).map((a) => a.nivel!));
  const responsavel = e.responsavelId ? (await db.select({ nome: schema.usuarios.nome }).from(schema.usuarios).where(eq(schema.usuarios.id, e.responsavelId)).limit(1))[0]?.nome ?? null : null;
  const fmt = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  const st = STATUS[e.status];
  const OK: Record<string, string> = { criado: "Entregável registrado.", anexo: "Anexo corrigido. A troca ficou registrada no histórico.", criado_v1: "Entregável registrado com a versão 1. Já está na revisão interna.", editado: "Dados salvos.", versao: "Versão registrada.", links: "Links acrescentados à versão.", status: "Situação atualizada.", interna: "Revisão interna registrada.", cliente: "Resposta do cliente registrada com evidência.", comentario: "Comentário registrado." };
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const aprovClienteAtual = aprovacoes.find((a) => a.instancia === "cliente" && a.decisao === "aprovado" && a.versaoNumero === e.versaoAtual);
  const podeInterna = revisa;
  const podeCliente = edita && e.versaoAtual >= 1 && ["enviado_cliente", "aprovado_interno", "ajustes_cliente", "aprovado_cliente"].includes(e.status);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`Architecture 360 · Entregáveis · ${TIPOS[e.tipo]}`} title={e.titulo}
        subtitle={<><Link className="underline" href={`/projetos/${e.projetoCodigo}`}>{projeto?.nome ?? `projeto ${e.projetoCodigo}`}</Link>{projeto?.cliente && <> · {projeto.cliente}</>} · <a className="underline" href={linkVobiProjeto(e.projetoCodigo)} target="_blank" rel="noreferrer">Vobi ↗</a> · responsável: {responsavel ?? "—"}{revisora && <> · revisão sênior: {revisora}</>} · <Badge tone={st.tom}>{st.rotulo}</Badge>{e.versaoAtual ? <> · versão atual v{e.versaoAtual}</> : " · sem versão registrada"}</>}
        actions={<div className="flex gap-2">{edita && <LinkButton href={`/entregaveis/${e.id}/editar`}>Editar</LinkButton>}<LinkButton href="/entregaveis">← Entregáveis</LinkButton></div>} />
      {sp.ok && OK[sp.ok] && <Alert kind="success">{OK[sp.ok]}</Alert>}
      {sp.erro && <Alert>{sp.erro}</Alert>}
      {e.descricao && <div className="leitura"><b>Escopo</b>{e.descricao}</div>}
      {reuniaoApres && <div className="text-[0.85rem] text-[var(--txt-2)]">Reunião de apresentação: <Link className="underline" href={`/reunioes/${reuniaoApres.id}`}>{reuniaoApres.titulo}</Link></div>}
      {aprovClienteAtual && <div className="leitura"><b>Aprovado</b>Versão v{e.versaoAtual} aprovada pelo cliente em {aprovClienteAtual.evidenciaData?.split("-").reverse().join("/")} por {aprovClienteAtual.evidenciaQuem} — evidência: {EVIDENCIAS[aprovClienteAtual.evidenciaTipo ?? "outro"]}.</div>}

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-5">
          <Card title={`Versões (${versoes.length})`} subtitle="Cada versão fica registrada; uma versão nova depois de aprovação volta para revisão interna.">
            {versoes.length ? (
              <ul className="divide-y divide-[var(--line)]">{versoes.map((v) => (
                <li key={v.id} className="py-2 text-[0.88rem]">
                  <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-semibold">v{v.numero}{v.numero === e.versaoAtual && <Badge tone="info">atual</Badge>}</span><span className="text-xs text-[var(--muted)]">{fmt(v.enviadoEm)}</span></div>
                  {v.descricao && <p className="text-[var(--txt-2)]">{v.descricao}</p>}
                  <div className="flex flex-wrap gap-3 text-xs">{lerLinks(v.link).map((l, i) => <a key={i} className="underline" href={l.url} target="_blank" rel="noreferrer">{l.nome} ↗</a>)}{v.nomeArquivo && <a className="underline" href={`/api/entregaveis/arquivo?v=${v.id}`}>baixar {v.nomeArquivo} ({Math.round((v.tamanho ?? 0) / 1024)} KB)</a>}</div>
                  {edita && v.numero === e.versaoAtual && !travaAnexo && (
                    <details className="mt-1 text-xs"><summary className="cursor-pointer font-semibold text-[var(--vinho)]">trocar arquivo ou corrigir links (antes do envio)</summary>
                      <form action={corrigirAnexoAction} className="mt-1.5 flex flex-col gap-2"><input type="hidden" name="id" value={e.id} /><input type="hidden" name="versao" value={v.id} />
                        <label className="font-semibold text-[var(--txt-2)]">Links desta versão (um por linha)<textarea name="links" rows={3} className="input mt-1" defaultValue={v.link ?? ""} placeholder={"Planta baixa: https://drive.google.com/..."} /></label>
                        <label className="font-semibold text-[var(--txt-2)]">{v.nomeArquivo ? `Trocar o arquivo (${v.nomeArquivo}) por outro` : "Anexar arquivo"} (até 15 MB)<input type="file" name="arquivo" className="input mt-1" /></label>
                        {v.nomeArquivo && <label className="flex items-center gap-2"><input type="checkbox" name="remover" value="1" className="h-4 w-4 accent-[var(--vinho)]" />Remover o arquivo atual sem colocar outro</label>}
                        <p className="text-[var(--muted)]">Vale só enquanto ninguém aprovou esta versão. A troca fica registrada no histórico.</p>
                        <div><Button variant="secondary" className="btn-sm">Salvar correção</Button></div></form>
                    </details>
                  )}
                  {edita && v.numero === e.versaoAtual && travaAnexo && e.status !== "cancelado" && <p className="mt-1 text-xs text-[var(--muted)]">Para trocar o arquivo agora, registre uma versão nova ({travaAnexo.replace(/;.*$/, "").toLowerCase()}).</p>}
                  {edita && v.numero === e.versaoAtual && (
                    <details className="mt-1 text-xs"><summary className="cursor-pointer text-[var(--vinho)]">+ acrescentar links a esta versão</summary>
                      <form action={adicionarLinksAction} className="mt-1.5 flex flex-col gap-1.5"><input type="hidden" name="id" value={e.id} /><input type="hidden" name="versao" value={v.id} />
                        <textarea name="links" rows={3} required className="input" placeholder={"um por linha; pode pôr um nome antes\nPlanta baixa: https://drive.google.com/...\nImagens 3D: https://drive.google.com/..."} />
                        <div><Button variant="secondary" className="btn-sm">Acrescentar</Button></div></form>
                    </details>
                  )}
                </li>
              ))}</ul>
            ) : <p className="text-[0.85rem] text-[var(--muted)]">Nenhuma versão ainda.</p>}
            {edita && (
              <form action={novaVersaoAction} className="mt-3 grid gap-2 border-t border-[var(--line)] pt-3" encType="multipart/form-data">
                <input type="hidden" name="id" value={e.id} />
                <label className="text-xs font-semibold text-[var(--txt-2)]">Nova versão — o que mudou<textarea name="descricao" rows={2} className="input mt-1" maxLength={2000} placeholder="ex.: v2 com piso emborrachado na área de peso livre, conforme pedido do cliente" /></label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-[var(--txt-2)]">Links (Drive, Vobi…) — um por linha<textarea name="link" rows={3} className="input mt-1" placeholder={"pode pôr um nome antes do link\nPlanta baixa: https://drive.google.com/...\nImagens 3D: https://drive.google.com/..."} /></label>
                  <label className="text-xs font-semibold text-[var(--txt-2)]">ou arquivo (até 15 MB)<input name="arquivo" type="file" className="input mt-1" /></label>
                </div>
                <div><Button variant="secondary">Registrar versão v{e.versaoAtual + 1}</Button></div>
              </form>
            )}
          </Card>

          <Card title={`Aprovações (${aprovacoes.length})`} subtitle="Revisão interna em etapas (arquiteta sênior, coordenação, gerência) e resposta do cliente, sempre com evidência. Nada aqui é presumido.">
            {e.status === "revisao_interna" && (
              <ol className="cadeia mb-3" aria-label="Etapas da revisão interna">
                {(["senior", "coordenacao", "gerencia"] as const).map((k) => {
                  const feito = aprovadasNaVersao.has(k), atual = etapaAtual === k;
                  return <li key={k} className={feito ? "feito" : atual ? "atual" : ""}>{feito ? "✓ " : atual ? "● " : ""}{ETAPAS_REVISAO[k]}{k === "senior" && revisora ? ` (${revisora.split(" ")[0]})` : ""}</li>;
                })}
              </ol>
            )}
            {aprovacoes.length ? (
              <ul className="divide-y divide-[var(--line)]">{aprovacoes.map((a) => (
                <li key={a.id} className="py-2 text-[0.88rem]">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span><Badge tone={a.decisao === "aprovado" ? "ok" : a.decisao === "ajustes" ? "warn" : "bad"}>{a.instancia === "interna" ? (a.nivel ? ETAPAS_REVISAO[a.nivel]?.toLowerCase() ?? "interna" : "interna") : "cliente"} · {a.decisao === "aprovado" ? "aprovado" : a.decisao === "ajustes" ? "ajustes" : "reprovado"}</Badge> <span className="font-semibold">v{a.versaoNumero}</span></span>
                    <span className="text-xs text-[var(--muted)]">{fmt(a.registradoEm)} · registrado por {a.quem}</span>
                  </div>
                  {a.instancia === "cliente" && <p className="text-[var(--txt-2)]">Cliente: {a.evidenciaQuem} em {a.evidenciaData?.split("-").reverse().join("/")} · evidência: {EVIDENCIAS[a.evidenciaTipo ?? "outro"]}{a.itemReuniaoId && <> · <Link className="underline" href={`/reunioes/${itensAprovacao.find((i) => i.id === a.itemReuniaoId)?.reuniaoId ?? ""}#aprovacao`}>item de reunião #{a.itemReuniaoId}</Link></>}{a.nomeArquivo && <> · <a className="underline" href={`/api/entregaveis/arquivo?a=${a.id}`}>baixar evidência</a></>}</p>}
                  {a.evidenciaTexto && <blockquote className="mt-1 border-l-2 border-[var(--line-2)] pl-2 text-[0.84rem] italic text-[var(--txt-2)]">{a.evidenciaTexto}</blockquote>}
                  {a.observacao && <p className="text-[var(--txt-2)]">{a.observacao}</p>}
                </li>
              ))}</ul>
            ) : <p className="text-[0.85rem] text-[var(--muted)]">Nenhuma aprovação registrada.</p>}

            {podeInterna && (
              <form action={aprovacaoInternaAction} className="mt-3 grid gap-2 border-t border-[var(--line)] pt-3">
                <input type="hidden" name="id" value={e.id} />
                <div className="text-xs font-semibold text-[var(--txt-2)]">Revisão interna da v{e.versaoAtual} · etapa: {ETAPAS_REVISAO[etapaAtual ?? "coordenacao"]}</div>
                <textarea name="observacao" rows={2} className="input" maxLength={2000} placeholder="observações (obrigatório ao pedir ajustes)" />
                <div className="flex gap-2"><Button formAction={aprovacaoInternaAction} variant="primary">{etapaAtual === "gerencia" ? "Aprovar internamente" : etapaAtual === "coordenacao" && u.perfil !== "admin" && meusPapeis.has("gestao") ? "Aprovar internamente (coordenação e gerência)" : etapaAtual === "senior" ? "Aprovar e seguir" : u.perfil !== "admin" && meusPapeis.has("coordenacao") && meusPapeis.has("gestao") ? "Aprovar internamente (coordenação e gerência)" : "Aprovar e seguir"}</Button><Button formAction={ajustesInternaAction} variant="secondary">Pedir ajustes</Button></div>
              </form>
            )}
            {e.status === "revisao_interna" && ausentes.filter((c) => (etapaAtual === "coordenacao" && c.ausentePerfil === "coordenacao") || (etapaAtual === "gerencia" && c.ausentePerfil === "gestao")).map((c) => <p key={c.ausenteId} className="mt-2 text-[0.8rem] text-[var(--txt-2)]">{c.ausenteNome} está ausente até {dataBr(c.ate)}: {c.cobreNome} responde por esta etapa.</p>)}
            {!revisa && e.status === "revisao_interna" && <p className="mt-2 text-[0.8rem] text-[var(--muted)]">Aguardando a revisão da etapa: {ETAPAS_REVISAO[etapaAtual ?? "coordenacao"].toLowerCase()}{etapaAtual === "senior" && revisora ? ` (${revisora})` : ""}.</p>}

            {podeCliente && (
              <form action={aprovacaoClienteAction} className="mt-3 grid gap-2 border-t border-[var(--line)] pt-3" encType="multipart/form-data">
                <input type="hidden" name="id" value={e.id} />
                <div className="text-xs font-semibold text-[var(--txt-2)]">Resposta do cliente sobre a v{e.versaoAtual} <span className="font-normal text-[var(--muted)]">— exige evidência</span></div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="text-xs font-semibold text-[var(--txt-2)]">Decisão<select name="decisao" className="input mt-1"><option value="aprovado">aprovou</option><option value="ajustes">pediu ajustes</option><option value="reprovado">reprovou</option></select></label>
                  <label className="text-xs font-semibold text-[var(--txt-2)]">Como chegou<select name="tipo" className="input mt-1" required>{Object.entries(EVIDENCIAS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                  <label className="text-xs font-semibold text-[var(--txt-2)]">Data<input name="data" type="date" className="input mt-1" required defaultValue={hoje} max={hoje} /></label>
                </div>
                <label className="text-xs font-semibold text-[var(--txt-2)]">Quem respondeu pelo cliente<input name="quem" className="input mt-1" required maxLength={120} placeholder="nome (e cargo) de quem aprovou" /></label>
                <label className="text-xs font-semibold text-[var(--txt-2)]">Trecho da evidência (cole o e-mail/mensagem ou descreva a aprovação verbal)<textarea name="texto" rows={3} className="input mt-1" maxLength={6000} /></label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-[var(--txt-2)]">Arquivo da evidência (print, PDF, e-mail exportado)<input name="arquivo" type="file" className="input mt-1" /></label>
                  {itensAprovacao.length > 0 && <label className="text-xs font-semibold text-[var(--txt-2)]">Item de aprovação de reunião do A360<select name="item_reuniao" className="input mt-1"><option value="">— nenhum —</option>{itensAprovacao.map((i) => <option key={i.id} value={i.id}>#{i.id} {i.texto.slice(0, 80)}</option>)}</select></label>}
                </div>
                <textarea name="observacao" rows={2} className="input" maxLength={2000} placeholder="condições ou observações (opcional)" />
                <div><Button variant="primary">Registrar resposta do cliente</Button></div>
              </form>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card title="Situação" subtitle="Aprovações mudam a situação automaticamente; aqui só os passos de fluxo.">
            <div className="flex flex-wrap gap-2 text-[0.85rem]">
              {edita && e.status === "em_elaboracao" && e.versaoAtual >= 1 && <form action={statusEntregavelAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="revisao_interna" /><Button variant="secondary" className="btn-sm">Enviar para revisão interna</Button></form>}
              {edita && e.status === "aprovado_interno" && <form action={statusEntregavelAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="enviado_cliente" /><Button variant="primary" className="btn-sm">Marcar como enviado ao cliente</Button></form>}
              {edita && e.status === "ajustes_cliente" && <form action={statusEntregavelAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="em_elaboracao" /><Button variant="secondary" className="btn-sm">Voltar para elaboração</Button></form>}
              {gestao(u) && e.status !== "cancelado" && (
                <details className="w-full"><summary className="cursor-pointer text-[var(--muted)]">Cancelar entregável…</summary>
                  <form action={statusEntregavelAction} className="mt-2 flex flex-col gap-2"><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="cancelado" /><input name="justificativa" className="input" required minLength={5} placeholder="justificativa (obrigatória)" /><div><Button variant="danger" className="btn-sm">Confirmar cancelamento</Button></div></form>
                </details>
              )}
              {gestao(u) && e.status === "cancelado" && <form action={statusEntregavelAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="em_elaboracao" /><Button variant="secondary" className="btn-sm">Reabrir</Button></form>}
            </div>
            <ol className="mt-3 flex flex-wrap gap-1 text-[0.72rem] text-[var(--muted)]">{["em_elaboracao", "revisao_interna", "aprovado_interno", "enviado_cliente", "aprovado_cliente"].map((s, i) => <li key={s} className={s === e.status ? "font-semibold text-[var(--vinho)]" : ""}>{i ? "→ " : ""}{STATUS[s].rotulo}</li>)}</ol>
          </Card>

          <Card title={`Comentários (${comentarios.length})`}>
            {comentarios.length ? <ul className="divide-y divide-[var(--line)]">{comentarios.map((c) => <li key={c.id} className="py-1.5 text-[0.85rem]"><span className="font-semibold">{c.autor}</span> <span className="text-xs text-[var(--muted)]">{fmt(c.quando)}</span><p className="text-[var(--txt-2)]">{c.texto}</p></li>)}</ul> : <p className="text-[0.85rem] text-[var(--muted)]">Nenhum comentário.</p>}
            <form action={comentarAction} className="mt-2 flex gap-2"><input type="hidden" name="id" value={e.id} /><input name="texto" className="input" required maxLength={2000} placeholder="comentário interno" /><Button variant="secondary" className="btn-sm">Enviar</Button></form>
          </Card>

          <Card title="Histórico" subtitle="Imutável: cada ação é uma linha nova.">
            <ol className="divide-y divide-[var(--line)] text-[0.82rem]">{historico.map((h) => <li key={h.id} className="py-1.5"><span className="text-xs text-[var(--muted)]">{fmt(h.quando)} · {h.quem}</span><br />{h.resumo}</li>)}</ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
