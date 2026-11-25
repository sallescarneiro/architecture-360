import Link from "next/link";
import { hexAtividade, hexEvento } from "@/lib/agenda/cores";
import { exigirUsuario } from "@/lib/auth";
import { agendaConfigurada } from "@/lib/agenda/cifra";
import { podeEscrever } from "@/lib/agenda/google";
import { conexaoDe, eventosDe, sincronizar } from "@/lib/agenda/sync";
import { dataCurta, dataHora, dataLonga, hora, diaValido, fimDoDia, hojeLocal, inicioDoDia, inicioMes, inicioSemana, mesAno, somaDias, somaMeses } from "@/lib/agenda/datas";
import { contagemFila, listarAtividades, pendencias, pessoasDaAgenda, podeGerirAgenda, programacaoVobi, semDataVobi, apoioVinculo, type Atividade } from "@/lib/agenda/atividades";
import { deEvento, Legenda, Mes, Semana, type ItemCal } from "@/components/agenda/Calendario";
import { Badge, LinkButton, PageHeader } from "@/components/ui";
import { atualizarAgendaAction } from "./actions";
import { configs } from "@/lib/agenda/producao";

type Visao = "mes" | "semana" | "dia";
const TOM_VINCULADA = "var(--vinho)", TOM_INDEPENDENTE = "var(--st-ok)", TOM_PRAZO = "var(--st-breve)";
const STATUS_V: Record<number, string> = { 1: "Planejado", 2: "Em andamento", 4: "Concluído", 5: "Cancelado" };
const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

/**
 * Agenda (T-187 + T-219). Uma só agenda: compromissos do Google + atividades programadas pela gestão + (opcional) prazos de
 * tarefas do Vobi. Gestão (Rodrigo, Flavia, Thais, Ana Paula) vê todas as pessoas ou uma; arquiteta vê só a própria —
 * a regra é aplicada no servidor (o filtro ?pessoa= é ignorado para quem não é gestão). Vobi: Fase 0, sem escrita.
 */
export default async function AgendaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const gestao = podeGerirAgenda(u.perfil);
  const agora = new Date();
  const hoje = hojeLocal(agora);
  const v: Visao = sp.v === "mes" || sp.v === "dia" ? sp.v : "semana";
  const d = diaValido(sp.d) ? sp.d : hoje;
  const todasPessoas = await pessoasDaAgenda();
  // Agenda compartilhada (decisão de Rodrigo em 23/11/2026): todos veem a agenda de todos, menos a da direção (perfil
  // administração: Rodrigo e Flávia), que não aparece para ninguém além dela mesma. Só a gestão programa; a arquiteta só vê.
  const pessoas = todasPessoas.filter((p) => p.perfil !== "admin" || p.id === u.id);
  const escolhida = sp.pessoa && /^\d+$/.test(sp.pessoa) && pessoas.some((p) => p.id === Number(sp.pessoa)) ? Number(sp.pessoa) : null;
  // quem está sendo visto: uma pessoa, ou a visão consolidada (gestão abre na equipe; arquiteta abre na própria agenda)
  const pessoaSel = escolhida ?? (sp.pessoa === "eu" ? u.id : sp.pessoa === "equipe" || sp.pessoa === "todos" ? null : gestao ? null : u.id);
  const consolidada = pessoaSel === null;
  // visão consolidada: "Equipe de projetos" (padrão: arquitetas, coordenação e quem valida) ou "Empresa inteira" (?pessoa=todos)
  const cfgs = await configs();
  const equipe = pessoas.filter((p) => p.perfil === "arquiteta" || p.perfil === "coordenacao" || cfgs.get(p.id)?.validadora).map((p) => p.id);
  const empresa = consolidada && sp.pessoa === "todos";
  const grupo: number[] = consolidada ? (empresa ? pessoas.map((p) => p.id) : equipe) : [pessoaSel!];
  // Google: na visão da equipe fica desligado por padrão (as agendas compartilhadas repetem os mesmos compromissos)
  const comGoogle = consolidada ? sp.google === "1" : sp.google !== "0";
  const projetoSel = sp.projeto && /^\d+$/.test(sp.projeto) ? Number(sp.projeto) : null;
  const comVobi = sp.vobi !== "0"; // "Programação do Vobi" aparece por padrão (T-219)

  const configurada = agendaConfigurada();
  const sinc = configurada && (pessoaSel === u.id || consolidada) ? await sincronizar(u.id) : null;
  const c = await conexaoDe(u.id);

  let dias: string[], titulo: string, ant: string, prox: string;
  if (v === "mes") { const ini = inicioSemana(inicioMes(d)); dias = Array.from({ length: 42 }, (_, i) => somaDias(ini, i)); titulo = mesAno(d); ant = somaMeses(d, -1); prox = somaMeses(d, 1); }
  else if (v === "semana") { const ini = inicioSemana(d); dias = Array.from({ length: 7 }, (_, i) => somaDias(ini, i)); titulo = `${dataCurta(dias[0])} – ${dataCurta(dias[6])} · ${mesAno(dias[3])}`; ant = somaDias(d, -7); prox = somaDias(d, 7); }
  else { dias = [d]; titulo = dataLonga(d); ant = somaDias(d, -1); prox = somaDias(d, 1); }
  const de = inicioDoDia(dias[0]), ate = fimDoDia(dias[dias.length - 1]);
  const params = (o: Record<string, string | number | null | undefined>) => {
    const base: Record<string, string | number | null | undefined> = { v, d, pessoa: pessoaSel !== null ? (pessoaSel === u.id && !gestao ? undefined : pessoaSel) : empresa ? "todos" : gestao ? undefined : "equipe", projeto: projetoSel ?? undefined, vobi: comVobi ? undefined : 0, google: consolidada ? (comGoogle ? 1 : undefined) : (comGoogle ? undefined : 0), ...o };
    return "/agenda?" + Object.entries(base).filter(([, x]) => x !== undefined && x !== null && x !== "").map(([k, x]) => `${k}=${encodeURIComponent(String(x))}`).join("&");
  };
  const atual = params({});
  const nomePor = new Map(pessoas.map((p) => [p.id, p.nome]));

  // 1. atividades do A360
  const ativs: Atividade[] = await listarAtividades(u, { responsavelIds: grupo, de, ate, projeto: projetoSel });
  const nomeProj = new Map(gestao ? (await apoioVinculo()).projetos.map((p) => [p.codigo, p.nome.replace(/^.*?-\s*/, "").slice(0, 28)] as [number, string]) : []);
  const comProjeto = (t: string, codigo: number | null | undefined) => (consolidada && codigo && nomeProj.get(codigo) ? `${nomeProj.get(codigo)} · ${t}` : t);
  // atividade de um dia = bloco no horário; atividade de vários dias = marca de início e marca de prazo (o prazo é o que a gestão acompanha)
  const itens: ItemCal[] = ativs.flatMap((a) => {
    const base = {
      privado: false, local: null, tipo: "atividade", href: gestao || a.responsavelId === u.id ? `/agenda/atividade/${a.id}?volta=${encodeURIComponent(atual)}` : params({ v: "dia", d: hojeLocal(a.fim) }), // atividade de colega: só a visão do dia
      tom: a.vinculo === "independente" ? TOM_INDEPENDENTE : TOM_VINCULADA, cor: hexAtividade(a), quem: consolidada ? iniciais(nomePor.get(a.responsavelId) ?? "?") : undefined, classe: "ev-ativ",
      dica: `${a.vinculo === "independente" ? "Atividade independente" : "Tarefa do Vobi"} · ${nomePor.get(a.responsavelId) ?? ""} · ${a.titulo} · prazo ${dataHora(a.fim)}`,
    };
    const ini = a.inicio ?? a.fim; // tarefa do Vobi só com término: aparece como prazo
    const d0 = hojeLocal(ini), d1 = hojeLocal(a.fim);
    if (d0 === d1) return [{ ...base, chave: `a${a.id}`, inicio: ini, fim: a.fim, diaInteiro: a.diaInteiro || !a.inicio, titulo: comProjeto(a.inicio ? a.titulo : `prazo · ${a.titulo}`, a.projetoCodigo) }];
    const marcas: ItemCal[] = [{ ...base, chave: `a${a.id}f`, inicio: inicioDoDia(d1), fim: fimDoDia(d1), diaInteiro: true, titulo: comProjeto(`prazo ${a.diaInteiro ? "" : `${hora(a.fim)} `}· ${a.titulo}`, a.projetoCodigo) }];
    if (a.inicio && a.inicio >= de) marcas.push({ ...base, chave: `a${a.id}i`, inicio: inicioDoDia(d0), fim: fimDoDia(d0), diaInteiro: true, titulo: `início · ${a.titulo}`, classe: "ev-ativ ev-inicio" });
    return marcas;
  });
  // 2. Google Agenda (espelho já sincronizado de cada pessoa; só a própria é lida do Google agora)
  if (comGoogle && !projetoSel) {
    const quem = grupo;
    for (const id of quem) {
      const evs = await eventosDe(id, de, ate);
      const cals = id === u.id ? c?.calendarios : (await conexaoDe(id))?.calendarios; // T-310: cor da agenda quando o evento não tem cor própria
      for (const e of evs) {
        const it = deEvento(e, atual, consolidada ? iniciais(nomePor.get(id) ?? "?") : undefined);
        it.cor = hexEvento(e, cals ?? []) ?? "#039be5"; // sem cor do evento nem da agenda: Pavão, o padrão do Google
        if (id !== u.id) it.href = params({ v: "dia", d: hojeLocal(e.inicio) }); // compromisso de outra pessoa: só a visão do dia
        itens.push(it);
      }
    }
  }
  // 3. Programação do Vobi: tarefas com data ainda não programadas no A360 (só leitura; as programadas aparecem como atividade)
  let semNumero = 0;
  let semData: Awaited<ReturnType<typeof semDataVobi>> = [];
  if (comVobi) {
    const idsVobi = consolidada ? pessoas.filter((p) => grupo.includes(p.id)).flatMap((p) => p.idsVobi) : (() => { const p = pessoas.find((x) => x.id === pessoaSel); if (!p?.idsVobi.length) semNumero = 1; return p?.idsVobi ?? []; })();
    const porVobi = new Map(pessoas.flatMap((p) => p.idsVobi.map((i) => [i, p.nome] as [number, string])));
    for (const { t, projeto } of await programacaoVobi({ idsVobi, de, ate, projeto: projetoSel })) {
      const feita = t.status === 4 || t.status === 5;
      const base = {
        privado: false, local: null, tipo: "programacao_vobi", href: `/agenda/vobi/${t.idVobi}?volta=${encodeURIComponent(atual)}`, tom: TOM_PRAZO, classe: `ev-prazo${feita ? " ev-feito" : ""}`,
        quem: consolidada ? iniciais(porVobi.get(t.idResponsavel ?? -1) ?? "?") : undefined,
        dica: `Programação do Vobi · nº ${t.idVobi} · ${projeto ?? ""} · ${t.nome} · ${STATUS_V[t.status ?? 1] ?? ""}${t.idResponsavel != null && !porVobi.has(t.idResponsavel) ? ` · responsável nº ${t.idResponsavel} não mapeado` : ""}`,
      };
      const ini = t.inicio ?? t.fim!, fim = t.fim ?? t.inicio!;
      const d0 = hojeLocal(ini), d1 = hojeLocal(fim);
      const rot = (x: string) => `${feita ? `${STATUS_V[t.status!]} · ` : ""}${consolidada && projeto ? `${String(projeto).replace(/^.*?-\s*/, "").slice(0, 28)} · ` : ""}${x}`;
      if (d0 === d1 && t.inicio && t.fim && hora(t.inicio) !== "00:00") itens.push({ ...base, chave: `v${t.idVobi}`, inicio: t.inicio, fim: t.fim, diaInteiro: false, titulo: rot(t.nome) });
      else {
        if (t.fim) itens.push({ ...base, chave: `v${t.idVobi}f`, inicio: inicioDoDia(d1), fim: fimDoDia(d1), diaInteiro: true, titulo: rot(`término · ${t.nome}`) });
        if (t.inicio && d0 !== d1 && t.inicio >= de) itens.push({ ...base, chave: `v${t.idVobi}i`, inicio: inicioDoDia(d0), fim: fimDoDia(d0), diaInteiro: true, titulo: rot(`início · ${t.nome}`), classe: `${base.classe} ev-inicio` });
        if (t.inicio && !t.fim) itens.push({ ...base, chave: `v${t.idVobi}i`, inicio: inicioDoDia(d0), fim: fimDoDia(d0), diaInteiro: true, titulo: rot(`início (sem término) · ${t.nome}`) });
      }
    }
    if (pessoaSel !== null) semData = await semDataVobi({ idsVobi, projeto: projetoSel });
  }

  const [pend, fila] = gestao ? [await pendencias(), await contagemFila()] : [[], 0];
  const projetos = gestao ? (await apoioVinculo()).projetos : [];
  const novo = gestao ? (dia: string, h?: string) => `/agenda/atividade/nova?d=${dia}${h ? `&h=${h}` : ""}${pessoaSel ? `&pessoa=${pessoaSel}` : ""}${projetoSel ? `&projeto=${projetoSel}` : ""}&volta=${encodeURIComponent(atual)}` : undefined;
  const escritaGoogle = podeEscrever(c?.escopos);
  const nomeSel = pessoaSel ? nomePor.get(pessoaSel) : null;

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
  else if (sp.sinc === "erro" || c?.estado === "erro") avisos.push({ tom: "warn", texto: `A última sincronização do Google falhou; os compromissos mostrados são da última leitura bem-sucedida${c?.ultimaSincOkEm ? ` (${dataHora(c.ultimaSincOkEm)})` : ""}.` });
  if (configurada && !c && (pessoaSel === u.id || !gestao)) avisos.push({ tom: "warn", texto: "Sua Google Agenda ainda não está conectada ao A360: seus compromissos do Google não aparecem aqui nem para a coordenação. Use “conectar minha Google Agenda”, logo abaixo do título (uma vez só)." });
  // Google de outra pessoa: só aparece se ela mesma conectou a própria conta (Agenda › Conexão), uma vez
  if (gestao && comGoogle && !projetoSel) {
    const alvo = grupo ?? pessoas.map((p) => p.id);
    const sem: string[] = [];
    for (const id of alvo) { if (id === u.id) continue; const cx = await conexaoDe(id); if (!cx || cx.estado === "revogada") sem.push((nomePor.get(id) ?? "").split(" ")[0]); }
    if (sem.length) avisos.push({ tom: "warn", texto: `${consolidada ? `Sem Google Agenda conectada: ${sem.join(", ")}.` : `${nomeSel} ainda não conectou a Google Agenda ao A360.`} Cada pessoa conecta a própria conta uma vez, em Agenda › Conexão (com o login dela); até lá aparecem só a programação do A360 e a do Vobi.` });
  }
  if (semNumero) avisos.push({ tom: "warn", texto: `${nomeSel} ainda não tem o número do Vobi identificado em Pessoas: os prazos do Vobi dela não aparecem.` });

  return (
    <div className="flex flex-col gap-3">
      <PageHeader eyebrow="Architecture 360 · Agenda" title={consolidada ? (empresa ? "Agenda da empresa" : "Agenda da equipe de projetos") : pessoaSel !== u.id ? `Agenda de ${nomeSel}` : "Minha agenda"}
        subtitle={<>{gestao ? "Programação das atividades das arquitetas, compromissos do Google e prazos do Vobi numa só agenda." : "Suas atividades programadas pela gestão e seus compromissos do Google."}
          {c ? <> · Google de <b>{c.emailGoogle}</b>{c.ultimaSincOkEm ? <> sincronizado {dataHora(c.ultimaSincOkEm)}</> : ""} · <Link className="underline" href="/agenda/conexao">conexão</Link>{c.estado !== "revogada" && <> · <form action={atualizarAgendaAction} className="inline"><input type="hidden" name="volta" value={atual} /><button className="underline" type="submit">atualizar agora</button></form></>}</>
            : configurada ? <> · <Link className="underline" href="/api/agenda/conectar">conectar minha Google Agenda</Link></> : null}</>}
        actions={<div className="flex flex-wrap items-center gap-2">
          {gestao ? <LinkButton href="/agenda/quadro">Quadro da equipe</LinkButton> : <LinkButton href="/agenda/semana">Minha semana de produção</LinkButton>}
          {gestao && <LinkButton href={novo!(v === "dia" ? d : hoje)} variant="primary">+ Nova atividade</LinkButton>}
          {c && c.estado !== "revogada" && escritaGoogle && <LinkButton href={`/agenda/novo?d=${v === "dia" ? d : hoje}&volta=${encodeURIComponent(atual)}`} variant="secondary">+ Compromisso no Google</LinkButton>}
          {gestao && <LinkButton href="/agenda/qualidade" variant="secondary">Qualidade dos dados</LinkButton>}
          {gestao && (pend.length > 0 || fila > 0) && <LinkButton href="/agenda/pendencias" variant="secondary">Vobi: {pend.length} pendência(s) · {fila} aguardando envio</LinkButton>}
        </div>} />

      {avisos.map((a, i) => <div key={i} className={`leitura${a.tom === "bad" ? " leitura-bad" : ""}`}><b>{a.tom === "ok" ? "OK" : "Atenção"}</b>{a.texto}</div>)}

      {(
        <form method="get" action="/agenda" className="card flex flex-wrap items-end gap-3 px-3 py-2">
          <input type="hidden" name="v" value={v} /><input type="hidden" name="d" value={d} />
          <label className="w-[26rem] max-w-full text-xs font-semibold text-[var(--txt-2)]">Pessoa
            <select name="pessoa" defaultValue={pessoaSel ?? (empresa ? "todos" : gestao ? "" : "equipe")} className="input mt-1">
              {!gestao && <option value="">Minha agenda</option>}
              <option value={gestao ? "" : "equipe"}>Equipe de projetos (arquitetas, coordenação e gerência)</option>
              <option value="todos">Empresa inteira</option>
              {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.perfil !== "arquiteta" ? " · gestão" : ""}{p.idVobi ? "" : " · sem nº Vobi"}</option>)}
            </select>
          </label>
          {gestao && <label className="w-96 max-w-full text-xs font-semibold text-[var(--txt-2)]">Projeto
            <select name="projeto" defaultValue={projetoSel ?? ""} className="input mt-1">
              <option value="">Todos</option>
              {projetos.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome} — nº {p.codigo}{p.cliente ? ` · ${p.cliente}` : ""}</option>)}
            </select>
          </label>}
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="vobi" value="0" defaultChecked={!comVobi} /> esconder Programação do Vobi</label>
          {consolidada
            ? <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="google" value="1" defaultChecked={comGoogle} /> mostrar compromissos do Google</label>
            : <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="google" value="0" defaultChecked={!comGoogle} /> esconder Google</label>}
          <button className="btn btn-secondary btn-sm mb-1" type="submit">Filtrar</button>
        </form>
      )}

      <div className="card flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-1">
          <Link className="btn btn-secondary btn-sm" href={params({ d: ant })} aria-label="Período anterior">‹</Link>
          <Link className="btn btn-secondary btn-sm" href={params({ d: hoje })}>Hoje</Link>
          <Link className="btn btn-secondary btn-sm" href={params({ d: prox })} aria-label="Próximo período">›</Link>
          <h2 className="ml-2 text-[0.95rem] font-bold">{titulo.charAt(0).toUpperCase() + titulo.slice(1)}</h2>
        </div>
        <nav aria-label="Visão" className="seg">
          <Link href={params({ v: "mes" })} aria-current={v === "mes" ? "page" : undefined}>Mês</Link>
          <Link href={params({ v: "semana" })} aria-current={v === "semana" ? "page" : undefined}>Semana</Link>
          <Link href={params({ v: "dia" })} aria-current={v === "dia" ? "page" : undefined}>Dia</Link>
        </nav>
      </div>
      {v === "mes" ? <Mes dias={dias} eventos={itens} hoje={hoje} mesRef={d} volta={atual} novo={novo} /> : <Semana dias={dias} eventos={itens} hoje={hoje} volta={atual} agora={agora} novo={novo} />}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[0.72rem] text-[var(--muted)]">
          <span>Cores: as mesmas do Google Agenda (compromissos com a cor que têm lá; atividades na cor da etapa ou na escolhida)</span>{comVobi && <Badge color={TOM_PRAZO}>Programação do Vobi (ainda não programada no A360)</Badge>}
          {consolidada && <span>· iniciais = pessoa · nome curto do projeto antes da atividade</span>}
        </div>
        {comGoogle && <Legenda />}
      </div>
      {sinc?.motivo === "cache" && <span className="text-[0.72rem] text-[var(--muted)]">Google: dados com menos de 10 min · eventos fora da janela de −7/+60 dias não são lidos</span>}
      {semData.length > 0 && (
        <details className="card px-3 py-2"><summary className="cursor-pointer text-sm font-semibold">Tarefas do Vobi sem data ({semData.length}) — não aparecem no calendário, mas não são descartadas</summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm">{semData.map(({ t, projeto }) => <li key={t.idVobi}><Link className="underline" href={`/agenda/vobi/${t.idVobi}?volta=${encodeURIComponent(atual)}`}>{t.nome}</Link> <span className="text-[var(--muted)]">· {projeto} · nº {t.idVobi} · {STATUS_V[t.status ?? 1]}</span></li>)}</ul>
        </details>
      )}
      <p className="text-[0.74rem] text-[var(--muted)]">
        {gestao ? "Clique num horário vazio para programar uma atividade. " : ""}Prazo da atividade = Data de término, o mesmo campo da tarefa no Vobi.
        Vobi: <b>escrita desligada (Fase 0)</b> — as mudanças em atividades ligadas ao Vobi ficam registradas como “aguardando envio”; nada é gravado no Vobi.
      </p>
    </div>
  );
}
