import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import { COMPARAVEIS, LACUNAS, RECEBIDOS, iaConfigurada } from "@/lib/vobi-cobertura";
import { TIPOS_FLAG, flagsGerais, garantirFlagsGerais } from "@/lib/flags";
import { dataHora } from "@/lib/agenda/datas";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { decidirFlagAction, validarIaAction } from "../alertas/actions";
import { resumoUso, ultimaValidacao, ultimosUsos } from "@/lib/transcricao/uso";
import { LIMITE_CHARS_IA, MODELO_PADRAO, PRECOS_USD_MTOK } from "@/lib/transcricao/ia";
import type { RelatorioValidacao } from "@/lib/transcricao/validacao-ia";
import { Button } from "@/components/ui";

/** Inventário de cobertura da integração Vobi (T-188 evolução, 5.4): o que chega, o que compara, o que falta. Gestão. */
export default async function IntegracaoVobiPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario(["admin", "gestao", "coordenacao"]);
  const [uso, usos, val] = await Promise.all([resumoUso(), ultimosUsos(15), ultimaValidacao()]);
  const rel = (val?.detalhes ?? null) as RelatorioValidacao | null;

  const sp = await searchParams;
  await garantirFlagsGerais();
  const flags = await flagsGerais();
  const flagIaAtual = flags.find((f) => f.chave === "geral.a360.ia");

  const n = (await db.execute(sql`select (select count(*)::int from projeto) projetos, (select count(*)::int from tarefa) tarefas, (select count(*)::int from cliente_vobi) clientes, (select count(*)::int from historico_alteracoes) mudancas, (select count(*)::int from carga where status='aceita') cargas, (select max(data_carga) from carga where status='aceita') ultima`)).rows[0] as Record<string, unknown>;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Integração Vobi" title="Cobertura da integração Vobi"
        subtitle={<>Exportações CSV manuais (Projetos, Tarefas, Clientes), somente leitura, sem API. {String(n.cargas)} cargas aceitas · última em {n.ultima ? String(n.ultima).split("-").reverse().join("/") : "—"} · {String(n.projetos)} projetos · {String(n.tarefas)} tarefas · {String(n.clientes)} clientes · {String(n.mudancas)} mudanças registradas entre cargas.</>}
        actions={<LinkButton href="/alertas">← Alertas</LinkButton>} />
      {sp.flag && <div className="leitura"><b>OK</b>Decisão sobre a flag registrada.</div>}
      {sp.erro && <div className="leitura leitura-bad"><b>Erro</b>{sp.erro}</div>}
      <Card title="O que o A360 recebe hoje"><table className="tbl"><thead><tr><th>Dados</th><th>Exportação</th><th>Usado para</th></tr></thead><tbody>{RECEBIDOS.map((r, i) => <tr key={i}><td>{r.campo}</td><td>{r.origem}</td><td className="text-[var(--txt-2)]">{r.uso}</td></tr>)}</tbody></table></Card>
      <Card title="O que o A360 consegue comparar" subtitle="com os dados atuais; cada comparação é indício, com evidência, nunca prova de conformidade"><ul className="list-disc pl-5 text-sm">{COMPARAVEIS.map((c, i) => <li key={i}>{c}</li>)}</ul></Card>
      <Card title="O que o A360 NÃO recebe" subtitle="necessário para comparar apresentação, aprovação e produção · origem: layouts das exportações; nada aqui presume endpoints ou campos da API do Vobi">
        <table className="tbl"><thead><tr><th>Dado ausente</th><th>Necessário para</th><th>Limitação</th><th>Alternativa real</th></tr></thead><tbody>{LACUNAS.map((l) => <tr key={l.chave}><td>{l.dado}</td><td className="text-[var(--txt-2)]">{l.necessarioPara}</td><td><Badge tone="warn">{TIPOS_FLAG[l.tipo]}</Badge></td><td className="text-xs text-[var(--txt-2)]">{l.alternativa ?? "—"}</td></tr>)}</tbody></table>
        <p className="mt-2 text-xs text-[var(--muted)]">Expansão possível: a Vobi responder às perguntas sobre API, identificadores de tarefa, horas e termos de uso (decisão D-06 pendente no Painel Mestre); ou ampliar as exportações, se a plataforma oferecer. Nenhuma dessas possibilidades foi confirmada com a Vobi.</p>
      </Card>
      <Card title="IA — configuração, validação e consumo" subtitle={`modelo configurado: ${MODELO_PADRAO} · preço público US$ ${PRECOS_USD_MTOK[MODELO_PADRAO]?.[0] ?? "?"}/${PRECOS_USD_MTOK[MODELO_PADRAO]?.[1] ?? "?"} por milhão de tokens (entrada/saída) · limite de ${LIMITE_CHARS_IA.toLocaleString("pt-BR")} caracteres por transcrição · teto diário estimado US$ ${uso.hoje.limite.toFixed(2)}`}>
        <div id="ia" className="flex flex-col gap-3 text-sm">
          <p>Chave no servidor: {iaConfigurada() ? <Badge tone="ok">presente</Badge> : <Badge tone="warn">ausente — extração por regras</Badge>} · Integração real: {flagIaAtual?.situacao === "resolvida" ? <Badge tone="ok">comprovada</Badge> : <Badge tone="warn">não comprovada (flag aberta)</Badge>}{uso.ultimaOk && <> · última chamada real OK em {dataHora(uso.ultimaOk)}</>}</p>
          {sp.validacao && <div className={`leitura${sp.validacao === "erro" ? " leitura-bad" : ""}`}><b>{sp.validacao === "ok" ? "OK" : "Falhou"}</b>{sp.validacao === "ok" ? "Validação real concluída com sucesso; relatório abaixo." : "A validação encontrou problemas; veja o relatório."}</div>}
          {u.perfil === "admin" && iaConfigurada() && <form action={validarIaAction}><Button variant="primary" className="btn-sm">Executar validação real da IA (transcrição fictícia)</Button></form>}
          {rel && (
            <div className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-xs">
              <p className="font-semibold">Última validação · {dataHora(new Date(rel.quando))} · ambiente {rel.ambiente} · {rel.ok ? <Badge tone="ok">sucesso</Badge> : <Badge tone="bad">falhou</Badge>}</p>
              <ul className="mt-1 list-disc pl-5">
                <li>Chave presente: {rel.chave.presente ? "sim" : "não"}</li>
                <li>/v1/models: {"erro" in rel.modelos ? rel.modelos.erro : `HTTP ${rel.modelos.httpStatus} · ${rel.modelos.duracaoMs} ms · ${rel.modelos.total} modelos · ${rel.modelos.modeloConfigurado} ${rel.modelos.disponivel ? "disponível" : "NÃO disponível"}`}</li>
                <li>Chamada de ata: {"erro" in rel.chamada ? rel.chamada.erro : `HTTP ${rel.chamada.httpStatus} · ${rel.chamada.duracaoMs} ms · modelo retornado ${rel.chamada.modeloRetornado} · ${rel.chamada.tokensEntrada} tokens de entrada · ${rel.chamada.tokensSaida} de saída · custo estimado US$ ${rel.chamada.custoUsd?.toFixed(6) ?? "—"}`}</li>
                <li>Reunião #{rel.reuniaoId} · transcrição #{rel.transcricaoId} · processamento #{rel.processamentoId}</li>
                {rel.ata && <li>Ata persistida (origem {rel.ata.origem}, {rel.ata.caracteres} caracteres): resumo {rel.ata.resumo ? "sim" : "não"} · {rel.ata.assuntos} assuntos · {rel.ata.decisoes} decisões · {rel.ata.aprovacoes} aprovações · {rel.ata.encaminhamentos} encaminhamentos ({rel.ata.comResponsavel} com responsável, {rel.ata.comPrazo} com prazo) · {rel.ata.pendencias} pendências · {rel.ata.duvidas} dúvidas</li>}
                {rel.itensPersistidos && <li>Itens persistidos em reuniao_item: {rel.itensPersistidos.decisao} decisões · {rel.itensPersistidos.aprovacao} aprovações · {rel.itensPersistidos.encaminhamento} encaminhamentos · {rel.itensPersistidos.comTrecho} com trecho · {rel.itensPersistidos.comResponsavel} com responsável · {rel.itensPersistidos.comPrazo} com prazo</li>}
                {rel.reprocessamento && <li>Reprocessamento: sem forçar → {rel.reprocessamento.reaproveitadoSemChamada ? "reaproveitou o resultado (nenhuma chamada)" : "FEZ nova chamada"}; forçado → {rel.reprocessamento.substituidos} itens não confirmados substituídos, {rel.reprocessamento.forcadoCriouItens ?? "—"} regravados, itens vigentes {rel.reprocessamento.vigentesAntes} → {rel.reprocessamento.vigentesDepois} (sem crescimento = sem duplicidade)</li>}
                <li>Flag &ldquo;IA não configurada&rdquo;: {rel.flagIa ?? "—"}</li>
                {rel.erros.length > 0 && <li className="text-[var(--st-critico)]">Erros: {rel.erros.join(" | ")}</li>}
              </ul>
            </div>
          )}
          <p>Consumo registrado: {uso.ok} chamadas OK · {uso.erros} erros · {uso.entrada.toLocaleString("pt-BR")} tokens de entrada · {uso.saida.toLocaleString("pt-BR")} de saída · custo estimado total US$ {uso.custo.toFixed(4)} · este mês US$ {uso.custoMes.toFixed(4)} · hoje US$ {uso.hoje.usd.toFixed(4)} de US$ {uso.hoje.limite.toFixed(2)}</p>
          {usos.length > 0 && <details className="fold"><summary>Últimas chamadas<small>{usos.length}</small></summary><div className="fold-body overflow-x-auto"><table className="tbl"><thead><tr><th>Quando</th><th>Tipo</th><th>Ref.</th><th>Modelo</th><th>HTTP</th><th>ms</th><th>Entrada</th><th>Saída</th><th>US$</th><th>Estado</th></tr></thead><tbody>{usos.map((x) => <tr key={x.id}><td className="whitespace-nowrap">{dataHora(x.quando)}</td><td>{x.tipo}</td><td>{x.referencia}</td><td>{x.modelo}</td><td>{x.httpStatus}</td><td>{x.duracaoMs}</td><td>{x.tokensEntrada}</td><td>{x.tokensSaida}</td><td>{x.custoEstimadoUsd?.toFixed(6)}</td><td>{x.estado}{x.erro ? ` · ${x.erro.slice(0, 80)}` : ""}</td></tr>)}</tbody></table></div></details>}
          <p className="text-xs text-[var(--muted)]">Preços conforme a página pública de modelos da Anthropic em 09/11/2026; o custo é estimativa a partir dos tokens devolvidos pela API — confira a fatura no console da Anthropic. A chave nunca é gravada em banco, logs ou relatórios.</p>
        </div>
      </Card>
      <Card title={`Flags gerais de limitação (${flags.filter((f) => f.situacao === "aberta").length} abertas)`} subtitle="uma por lacuna conhecida; encerram só por resolução ou aceite consciente com justificativa">
        <div id="flags" className="flex flex-col gap-2 text-sm">{flags.map((fl) => (
          <div key={fl.id} className={`rounded-[10px] border p-3 ${fl.situacao === "aberta" ? "border-[var(--st-relevante)]" : "border-[var(--line)] opacity-80"}`}>
            <p className="font-semibold">{fl.dadoAusente} <Badge tone={fl.situacao === "aberta" ? "warn" : fl.situacao === "aceita" ? "neutral" : "ok"}>{fl.situacao}</Badge></p>
            <p className="text-xs"><b>Comparação afetada:</b> {fl.comparacao} · <b>origem esperada:</b> {fl.origemEsperada} · <b>limitação:</b> {TIPOS_FLAG[fl.tipo]}</p>
            {fl.alternativa && <p className="text-xs"><b>Alternativa:</b> {fl.alternativa}</p>}
            <p className="text-xs text-[var(--muted)]">identificada em {dataHora(fl.identificadoEm)}{fl.decididoEm ? ` · decisão em ${dataHora(fl.decididoEm)}: ${fl.justificativa ?? ""}` : ""}</p>
            {fl.situacao === "aberta" && <form action={decidirFlagAction} className="mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={fl.id} /><input type="hidden" name="volta" value="/integracao-vobi" /><input name="justificativa" className="input flex-1" placeholder="justificativa da decisão" required minLength={5} /><button className="btn btn-secondary btn-sm" name="situacao" value="aceita" type="submit">Aceitar limitação</button><button className="btn btn-secondary btn-sm" name="situacao" value="resolvida" type="submit">Marcar resolvida</button></form>}
          </div>))}</div>
      </Card>
      <p className="text-[0.74rem] text-[var(--muted)]">Ausência de dado nunca é tratada como aprovação, conformidade ou inexistência de divergência. <Link className="underline" href="/qualidade">Qualidade dos dados</Link> trata da completude do que chega; esta página, do que não chega.</p>
    </div>
  );
}
