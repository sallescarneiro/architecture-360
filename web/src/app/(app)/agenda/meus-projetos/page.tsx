import { exigirUsuario } from "@/lib/auth";
import * as P from "@/lib/agenda/producao";
import * as C from "@/lib/agenda/carteira";
import { dataCurta, hojeLocal } from "@/lib/agenda/datas";
import { Button, PageHeader } from "@/components/ui";
import { ChipEtapa, curto } from "@/components/agenda/Producao";
import { SelComunicacao, SelSituacao } from "@/components/agenda/Carteira";
import { acaoFeitaAction, comFeitaAction, comNaAction, solicitacaoAction } from "../projetos/actions";

/** Etapa C — Meus projetos: projetos em que a pessoa é a responsável, ou em que tem uma ação de acompanhamento para fazer. */
export default async function MeusProjetosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const [todas, etapas] = await Promise.all([C.linhasProjetos(), C.etapasDe(u.id)]);
  const hoje = hojeLocal();
  const meus = todas.filter((l) => l.situacao !== "concluido" && (l.responsavelId === u.id || l.acaoQuemId === u.id || etapas.has(l.codigo)))
    .sort((a, b) => Number(b.responsavelId === u.id) - Number(a.responsavelId === u.id));
  const volta = "/agenda/meus-projetos";
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={`Agenda de Produção · ${u.nome}`} title="Meus projetos"
        subtitle="Os projetos em que você é a responsável e também os projetos em nome de outra arquiteta em que você recebeu uma etapa no quadro. Aqui você marca as ações de acompanhamento como feitas, registra a comunicação da semana (projetos seus) e anota o que o cliente pediu. A situação e a etapa do projeto são da coordenação; você vê, não altera." />
      {sp.erro && <div className="leitura leitura-bad" role="alert"><b>Atenção</b>{sp.erro}</div>}
      {sp.ok && <div className="leitura" role="status"><b>OK</b>{sp.ok}</div>}
      {meus.length === 0 ? <div className="card p-4 text-sm text-[var(--muted)]">Nenhum projeto com você como responsável nem etapa sua programada no quadro.</div> : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3.5">
          {meus.map((l) => {
            const minha = l.responsavelId === u.id, minhasEt = etapas.get(l.codigo) ?? [];
            const proximas = minhasEt.filter((e) => e.dia >= hoje).slice(0, 4), ultima = minhasEt.filter((e) => e.dia < hoje).pop();
            return (
              <section key={l.codigo} className="card flex flex-col gap-2 p-4" aria-label={curto(l.nome)}>
                <div className="flex flex-wrap items-center gap-1.5"><ChipEtapa k={l.etapa} /><h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">{curto(l.nome)}</h2>{l.terceirizado && <span className="rounded bg-[#eef2fb] px-1 text-[0.62rem] font-bold text-[#2c4373]">TERCEIRIZADO</span>}</div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]"><SelSituacao s={l.situacao} />{P.etapa(l.etapa)?.n ?? "etapa não definida"} · próxima entrega: {l.entrega ? P.rotuloDia(l.entrega.dia) : "sem data"}</div>
                <div className="text-xs">{minha ? <b className="text-[var(--vinho)]">Você é a responsável</b> : <span className="text-[var(--muted)]">Responsável: <b>{l.responsavel ?? "não definida"}</b> · você tem etapa neste projeto</span>}{l.executoras.length > 1 ? <span className="text-[var(--muted)]"> · trabalham neste mês: {l.executoras.join(", ")}</span> : null}</div>
                {minhasEt.length > 0 && <div className="flex flex-col gap-1 rounded-[10px] border border-[#ece3dd] px-3 py-2 text-[0.78rem]">
                  <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[var(--muted)]">Suas etapas neste projeto</span>
                  {proximas.length ? proximas.map((e, i) => <span key={i} className="flex flex-wrap items-center gap-1.5"><ChipEtapa k={e.etapa} /><b>{P.rotuloDia(e.dia)}</b><span className="text-[var(--muted)]">{e.periodo}{e.etapa ? "" : ` · ${e.titulo}`}</span>{e.entrega && <span className="text-[0.66rem] font-bold text-[var(--vinho)]">ENTREGA</span>}{e.validacao === "aguardando" || e.validacao === "rascunho" ? <span className="text-[0.66rem] text-[var(--muted)]">({P.VALIDACAO[e.validacao].rotulo.toLowerCase()})</span> : null}</span>)
                    : <span className="text-[var(--muted)]">Nada programado daqui para frente{ultima ? `; última em ${dataCurta(ultima.dia)}` : ""}.</span>}
                </div>}
                <div className="flex flex-col gap-1.5 rounded-[10px] border border-[#f0e8e2] bg-[#fbf7f4] px-3 py-2 text-[0.8rem]">
                  {l.acaoTipo && (minha || l.acaoQuemId === u.id) ? <>
                    <span><b className={l.acaoVencida ? "text-[#9b2c1f]" : ""}>{l.acaoTipo}</b> <span className="text-xs text-[var(--muted)]">· {l.acaoQuem} · até {dataCurta(l.acaoAte!)}{l.acaoVencida ? " · vencida" : ""}</span></span>
                    <form action={acaoFeitaAction}><input type="hidden" name="codigo" value={l.codigo} /><input type="hidden" name="volta" value={volta} /><Button variant="secondary" className="btn-sm">Marcar como feita</Button></form>
                  </> : l.acaoTipo ? <span className="text-xs text-[var(--muted)]">Ação de acompanhamento: {l.acaoTipo} ({l.acaoQuem})</span> : <span className="text-xs font-bold text-[#21613a]">Nenhuma ação pendente</span>}
                </div>
                {minha && l.situacao !== "pausado" && (
                  <form action={comFeitaAction} className="flex flex-wrap items-center gap-1.5 text-xs">
                    <input type="hidden" name="codigo" value={l.codigo} /><input type="hidden" name="volta" value={volta} />
                    <span className="text-[var(--muted)]">Comunicação com o cliente nesta semana:</span><SelComunicacao s={l.comunicacao} />
                    {l.comunicacao !== "feita" && <Button variant="primary" className="btn-sm" formAction={comFeitaAction}>Registrar que comuniquei</Button>}
                    {l.comunicacao === "pendente" && <Button variant="ghost" className="btn-sm" formAction={comNaAction}>Não se aplica</Button>}
                  </form>
                )}
                {<form action={solicitacaoAction} className="flex flex-col gap-1.5">
                  <input type="hidden" name="codigo" value={l.codigo} /><input type="hidden" name="volta" value={volta} />
                  <label className="text-xs font-semibold text-[var(--txt-2)]">O cliente pediu (opcional)<span className="mt-1 flex gap-1.5"><input name="texto" required maxLength={500} className="input min-w-0 flex-1" placeholder="ex.: antecipar a apresentação do 3D" /><Button variant="secondary" className="btn-sm">Registrar</Button></span></label>
                  {l.solicitacao && <span className="text-xs text-[var(--muted)]">Último pedido: {l.solicitacao.texto} ({dataCurta(hojeLocal(l.solicitacao.quando))})</span>}
                </form>}
              </section>
            );
          })}
        </div>
      )}
      <p className="text-xs text-[var(--muted)]">Você não cria nem apaga ações: quem define a próxima ação é a coordenação. O pedido do cliente registrado aqui aparece para a coordenação em Projetos ativos. Nada disso é enviado ao Vobi.</p>
    </div>
  );
}
