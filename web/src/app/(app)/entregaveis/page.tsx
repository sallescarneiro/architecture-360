import Link from "next/link";
import { exigirUsuario } from "@/lib/auth";
import { STATUS, TIPOS, contagens, gestao, lerFiltros, listar } from "@/lib/entregaveis";
import { Badge, Card, Empty, LinkButton, PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Entregáveis — Architecture 360" };

/**
 * Fase 6 — Aprovações internas de entregáveis (T-190). Lista com filtros; arquiteta vê os projetos em que participa,
 * coordenação/gestão veem tudo. Nada aqui chega ao cliente: é registro interno com evidência.
 */
export default async function EntregaveisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const u = await exigirUsuario();
  const f = lerFiltros(await searchParams);
  const [lista, cont] = await Promise.all([listar(u, f), gestao(u) ? contagens() : Promise.resolve(null)]);
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const href = (m: Record<string, string | number | null>) => { const p = new URLSearchParams(); const t = { projeto: f.projeto, status: f.status, tipo: f.tipo, q: f.q, ...m }; for (const [k, v] of Object.entries(t)) if (v !== null && v !== "" && !(k === "status" && v === "abertos")) p.set(k, String(v)); const s = p.toString(); return `/entregaveis${s ? `?${s}` : ""}`; };
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Architecture 360 · Entregáveis" title="Entregáveis e aprovações" subtitle="Layouts, apresentações e cadernos com versões, revisão interna e aprovação do cliente registrada com evidência. Registro interno: nada é enviado ao cliente por aqui." actions={<LinkButton href="/entregaveis/novo" variant="primary">+ Novo entregável</LinkButton>} />
      {cont && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Em aberto" value={cont.abertos} href={href({ status: "abertos" })} />
          <Stat label="Aguardando revisão interna" value={cont.aguardandoInterna} tone={cont.aguardandoInterna ? "warn" : "neutral"} href={href({ status: "revisao_interna" })} />
          <Stat label="Aguardando o cliente" value={cont.aguardandoCliente} tone="info" href={href({ status: "enviado_cliente" })} />
          <Stat label="Ajustes pedidos pelo cliente" value={cont.ajustesCliente} tone={cont.ajustesCliente ? "bad" : "neutral"} href={href({ status: "ajustes_cliente" })} />
        </div>
      )}
      <Card title="Modelos institucionais" subtitle="Base para os arquivos entregáveis da rucelle. Uso opcional: o timbrado não é obrigatório em todos os documentos.">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <a className="btn btn-secondary" href="/api/modelos/timbrado">Baixar papel timbrado rucelle (.docx)</a>
          <span className="text-[var(--muted)]">Abra no Word ou no Google Docs e escreva no corpo: cabeçalho com a marca e rodapé com os contatos já vêm prontos. As atas de reunião também podem ser exportadas com o timbrado.</span>
        </div>
      </Card>
      <Card>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-[var(--txt-2)]">Situação<select name="status" className="input mt-1" defaultValue={f.status}><option value="abertos">Em aberto</option><option value="todos">Todos</option>{Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.rotulo}</option>)}</select></label>
          <label className="text-xs font-semibold text-[var(--txt-2)]">Tipo<select name="tipo" className="input mt-1" defaultValue={f.tipo}><option value="">todos</option>{Object.entries(TIPOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {f.projeto && <input type="hidden" name="projeto" value={f.projeto} />}
          <label className="text-xs font-semibold text-[var(--txt-2)]">Busca<input name="q" defaultValue={f.q} className="input mt-1" placeholder="título, projeto ou cliente" /></label>
          <button className="btn btn-secondary">Filtrar</button>
          {(f.projeto || f.q || f.tipo || f.status !== "abertos") && <Link className="btn btn-ghost" href="/entregaveis">limpar</Link>}
        </form>
        {lista.length ? (
          <div className="mt-3 overflow-x-auto"><table className="tbl"><thead><tr><th>Entregável</th><th>Projeto · cliente</th><th>Tipo</th><th>Versão</th><th>Situação</th><th>Responsável</th><th>Atualizado</th></tr></thead><tbody>
            {lista.map((e) => (
              <tr key={e.id}>
                <td className="font-semibold"><Link className="underline" href={`/entregaveis/${e.id}`}>{e.titulo}</Link></td>
                <td><Link className="underline" href={`/projetos/${e.projetoCodigo}`}>{e.projetoNome ?? e.projetoCodigo}</Link>{e.clienteNome && <span className="text-[var(--muted)]"> · {e.clienteNome}</span>}</td>
                <td className="text-[var(--txt-2)]">{TIPOS[e.tipo]}</td>
                <td className="text-center">{e.versaoAtual ? `v${e.versaoAtual}` : <span className="text-[var(--muted)]">—</span>}</td>
                <td><Badge tone={STATUS[e.status]?.tom}>{STATUS[e.status]?.rotulo}</Badge></td>
                <td className="text-[var(--txt-2)]">{e.responsavelNome ?? "—"}</td>
                <td className="whitespace-nowrap text-[var(--muted)]">{fmt(e.atualizadoEm)}</td>
              </tr>
            ))}
          </tbody></table></div>
        ) : <div className="mt-3"><Empty action={<LinkButton href="/entregaveis/novo" variant="primary">Registrar o primeiro</LinkButton>}>Nenhum entregável {f.status === "abertos" ? "em aberto" : "com esses filtros"}.</Empty></div>}
      </Card>
    </div>
  );
}
