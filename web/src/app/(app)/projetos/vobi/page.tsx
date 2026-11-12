import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { podeGerirAgenda } from "@/lib/agenda/atividades";
import { apiConfigurada } from "@/lib/vobi/api";
import { buscarNoVobi, pedidosSobDemanda, previaProjeto } from "@/lib/vobi/sobDemanda";
import { incorporarAction } from "./actions";
import { Badge, Button, Card, Empty, Input, LinkButton, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const fmt = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const SIT: Record<string, { r: string; t: "ok" | "warn" | "bad" | "neutral" }> = {
  integrado: { r: "Integrado", t: "ok" }, ja_existia: { r: "Já existia", t: "neutral" }, falhou: { r: "Falhou", t: "bad" },
};

/**
 * T-219 — Buscar projeto no Vobi (só gestão). Procura por nome ou número, inclusive projetos anteriores a 2026 e arquivados,
 * mostra os dados e incorpora ao A360 com tarefas, etapas, responsáveis, datas e status. Só leitura no Vobi.
 */
export default async function BuscarVobiPage({ searchParams }: { searchParams: Promise<{ q?: string; codigo?: string; erro?: string }> }) {
  const u = await exigirUsuario();
  if (!podeGerirAgenda(u.perfil)) redirect("/sem-permissao");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const codigo = Number(sp.codigo);
  let busca: Awaited<ReturnType<typeof buscarNoVobi>> | null = null, pv: Awaited<ReturnType<typeof previaProjeto>> = null, erro = sp.erro ?? null;
  if (apiConfigurada()) {
    try {
      if (Number.isInteger(codigo) && codigo > 0) pv = await previaProjeto(codigo);
      else if (q) busca = await buscarNoVobi(q);
    } catch (e) { erro = (e as Error).message; }
  }
  const pedidos = await pedidosSobDemanda();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Operação · Projetos" title="Buscar projeto no Vobi"
        subtitle="Para incorporar ao A360 um projeto que não entrou pelo recorte 2026 (anterior a 2026, sem data de início prevista ou arquivado). Só leitura no Vobi: nada é gravado lá."
        actions={<LinkButton href="/projetos">← Projetos</LinkButton>} />
      {!apiConfigurada() && <div className="leitura leitura-bad"><b>API</b>A integração com a API do Vobi não está configurada.</div>}
      {erro && <div className="leitura leitura-bad"><b>Erro</b>{erro}</div>}
      <Card>
        <form className="flex flex-wrap items-end gap-2" action="/projetos/vobi">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">Nome ou número do projeto no Vobi<Input name="q" defaultValue={q} placeholder="ex.: Smart Fit Bueno ou 34512" required /></label>
          <Button type="submit">Buscar no Vobi</Button>
        </form>
        <p className="mt-2 text-xs text-[var(--muted)]">Pelo número a leitura é direta. Pelo nome, o A360 lê a lista completa de projetos do Vobi (inclusive arquivados) e filtra aqui — a API do Vobi não busca por nome.</p>
      </Card>

      {busca && (busca.resultados.length === 0 ? <Empty>{busca.aviso ?? "Nenhum projeto encontrado com esse nome no Vobi."}</Empty> : (
        <Card title={`Resultados no Vobi (${busca.total})`} subtitle={busca.aviso}>
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Nº Vobi</th><th>Projeto</th><th>Cliente</th><th>Status no Vobi</th><th>Início previsto</th><th>Criado em</th><th>No A360</th><th></th></tr></thead>
            <tbody>{busca.resultados.map((p) => (
              <tr key={p.codigo}>
                <td>{p.codigo}</td><td>{p.nome}</td><td>{p.cliente || "—"}</td><td>{p.status}</td><td>{fmt(p.inicioPrevisto)}</td><td>{fmt(p.criadoEm)}</td>
                <td>{p.elegivel || p.incorporado ? <Badge tone="ok">Na Agenda</Badge> : p.noA360 ? <Badge tone="warn">Na base, fora do recorte</Badge> : <Badge tone="neutral">Não</Badge>}</td>
                <td>{p.elegivel || p.incorporado ? <Link className="underline" href={`/projetos/${p.codigo}`}>Abrir</Link> : <Link className="underline" href={`/projetos/vobi?codigo=${p.codigo}`}>Conferir e incorporar</Link>}</td>
              </tr>))}</tbody>
          </table></div>
        </Card>
      ))}

      {Number.isInteger(codigo) && codigo > 0 && !pv && !erro && <Empty>O Vobi não devolveu o projeto {codigo}.</Empty>}
      {pv && (
        <Card title={`${pv.info.nome} · nº ${pv.info.codigo} no Vobi`} subtitle={`Cliente: ${pv.info.cliente || "—"} · status no Vobi: ${pv.info.status} · início previsto ${fmt(pv.info.inicioPrevisto)} · criado em ${fmt(pv.info.criadoEm)}`}>
          {pv.info.elegivel || pv.info.incorporado ? (
            <div className="leitura"><b>Já faz parte</b>Este projeto já está no A360 e na Agenda. <Link className="underline" href={`/projetos/${pv.info.codigo}`}>Abrir o projeto</Link></div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <Stat label="Tarefas" value={pv.resumo.tarefas} note={`${pv.resumo.comData} com data · ${pv.resumo.semData} sem data`} />
                <Stat label="Etapas" value={pv.resumo.etapas} />
                <Stat label="Responsáveis" value={pv.resumo.responsaveis.length} note={`${pv.resumo.semResponsavel} tarefas sem responsável`} />
                <Stat label="Por status" value={Object.values(pv.resumo.porStatus).reduce((a, b) => a + b, 0)} note={Object.entries(pv.resumo.porStatus).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(" · ") || "—"} />
              </div>
              {pv.resumo.etapasNomes.length > 0 && <p className="mt-3 text-sm">Etapas: {pv.resumo.etapasNomes.join(" · ")}</p>}
              {pv.resumo.responsaveis.length > 0 && <p className="mt-1 text-sm">Responsáveis: {pv.resumo.responsaveis.map((r) => `${r.nome ?? `Vobi #${r.id}`}${r.acesso ? "" : " (sem mapeamento)"} — ${r.tarefas}`).join(" · ")}</p>}
              <div className="leitura mt-3"><b>O que acontece</b>
                {pv.info.noA360 ? "O projeto já está na base do A360 (fora do recorte). " : "O projeto entra na base do A360 (colaboradores e etiquetas não vêm pela API). "}
                As tarefas e etapas passam para a Agenda com os números do Vobi; o projeto fica elegível para a sincronização bidirecional futura e a carga diária não o marca como ausente. Nada é gravado no Vobi. O pedido fica registrado com seu nome, data e hora.</div>
              <form action={incorporarAction} className="mt-3 flex gap-2">
                <input type="hidden" name="codigo" value={pv.info.codigo} />
                <Button type="submit">Confirmar incorporação ao A360</Button>
                <LinkButton href="/projetos/vobi">Cancelar</LinkButton>
              </form>
            </>
          )}
        </Card>
      )}

      <Card title="Pedidos de incorporação" subtitle="Quem pediu, quando e a situação de cada integração.">
        {pedidos.length === 0 ? <p className="text-sm text-[var(--muted)]">Nenhum pedido ainda.</p> : (
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Quando</th><th>Projeto</th><th>Nº Vobi</th><th>Pedido por</th><th>Situação</th><th>Detalhe</th></tr></thead>
            <tbody>{pedidos.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.solicitado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                <td><Link className="underline" href={`/projetos/${p.codigo}`}>{p.nome}</Link></td><td>{p.codigo}</td><td>{p.usuario}</td>
                <td><Badge tone={SIT[p.situacao]?.t ?? "neutral"}>{SIT[p.situacao]?.r ?? p.situacao}</Badge></td>
                <td className="text-xs">{p.situacao === "integrado" ? `${p.detalhe.tarefas ?? "?"} tarefas · ${p.detalhe.etapas ?? "?"} etapas` : String(p.detalhe.erro ?? p.detalhe.motivo ?? "")}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
