import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import { COMPARAVEIS, LACUNAS, RECEBIDOS, iaConfigurada } from "@/lib/vobi-cobertura";
import { TIPOS_FLAG, flagsGerais, garantirFlagsGerais } from "@/lib/flags";
import { dataHora } from "@/lib/agenda/datas";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { decidirFlagAction } from "../alertas/actions";

/** Inventário de cobertura da integração Vobi (T-188 evolução, 5.4): o que chega, o que compara, o que falta. Gestão. */
export default async function IntegracaoVobiPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario(["admin", "gestao", "coordenacao"]);
  void u;
  const sp = await searchParams;
  await garantirFlagsGerais();
  const flags = await flagsGerais();
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
      <Card title="Configuração do A360"><p className="text-sm">IA para atas e análise de divergências: {iaConfigurada() ? <Badge tone="ok">configurada</Badge> : <Badge tone="warn">não configurada (ANTHROPIC_API_KEY ausente) — extração por regras</Badge>}</p></Card>
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
