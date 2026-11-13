import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import { buscarClientes, historicoDoCliente } from "@/lib/reunioes";
import { ORIGENS } from "@/lib/reunioes-motivos";
import { Badge, Button, Card, Empty, PageHeader } from "@/components/ui";

const dia = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

/**
 * T-227 — Histórico por cliente: todas as reuniões dos projetos do cliente, separadas por projeto (decisões de um projeto
 * nunca se misturam com as de outro). Busca por nome do cliente ou número/nome do projeto. Mesma visibilidade da lista.
 */
export default async function HistoricoClientePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const codigo = /^\d+$/.test(sp.c ?? "") ? Number(sp.c) : null;
  const resultados = q ? await buscarClientes(q) : [];
  const cliente = codigo ? (await db.select({ codigo: schema.clientesVobi.codigo, nome: schema.clientesVobi.nome }).from(schema.clientesVobi).where(eq(schema.clientesVobi.codigo, codigo)).limit(1))[0] ?? null : null;
  const grupos = cliente ? await historicoDoCliente(u, cliente.codigo) : [];
  const total = grupos.reduce((a, g) => a + g.reunioes.length, 0);
  const volta = `/reunioes/clientes?c=${codigo ?? ""}`;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Inteligência de Reuniões · Histórico por cliente" title={cliente ? cliente.nome : "Histórico por cliente"}
        subtitle={cliente ? <>Todas as reuniões dos projetos deste cliente, separadas por projeto. Decisões de um projeto nunca aparecem misturadas com as de outro. {grupos.length} projeto(s) com reuniões · {total} reunião(ões) no total.</> : "Busque o cliente pelo nome ou pelo número do projeto."} />

      <section className="card flex flex-col gap-2 p-4" aria-label="Buscar cliente">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="block min-w-[16rem] flex-1 text-xs font-semibold text-[var(--txt-2)]">{cliente ? "Outro cliente" : "Cliente"}<input name="q" defaultValue={q} className="input mt-1" placeholder="nome do cliente ou nº do projeto" autoFocus={!cliente} /></label>
          <Button variant="secondary" className="btn-sm">Buscar</Button>
        </form>
        {q && (resultados.length ? (
          <ul className="flex flex-col divide-y divide-[var(--line)] rounded-[10px] border border-[var(--line)]" aria-label="Resultados">
            {resultados.map((x) => <li key={x.codigo}><Link className="block px-3 py-2.5 no-underline hover:bg-[var(--surface-2)]" href={`/reunioes/clientes?c=${x.codigo}`}><b className="text-[var(--vinho)]">{x.nome}</b><span className="block text-xs text-[var(--muted)]">{x.proj_codigo && !x.nome.toLowerCase().includes(q.toLowerCase()) ? `projeto nº ${x.proj_codigo} · ${x.proj_nome}` : `${x.projetos} projeto(s)`}</span></Link></li>)}
          </ul>
        ) : <p className="text-sm text-[var(--muted)]">Nenhum cliente ou projeto com “{q}”.</p>)}
      </section>

      {cliente && (grupos.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {grupos.map((g) => {
            const nc = g.reunioes.filter((m) => !m.motivo).length;
            return (
              <Card key={g.codigo} title={g.nome} subtitle={<>nº {g.codigo} · <b>{g.reunioes.length} {g.reunioes.length === 1 ? "reunião" : "reuniões"}</b>{nc ? ` (inclui ${nc} não classificada${nc > 1 ? "s" : ""})` : ""} · <Link className="underline" href={`/projetos/${g.codigo}`}>abrir projeto</Link></>}>
                <ul className="flex flex-col divide-y divide-[var(--line)]">
                  {g.reunioes.map((m) => (
                    <li key={m.id} className="grid grid-cols-[6rem_1fr_auto] items-center gap-x-3 py-2 text-sm max-sm:grid-cols-1">
                      <span className="text-xs font-semibold text-[var(--txt-2)]">{dia(m.inicio)}</span>
                      <span className="min-w-0"><Link className="ent font-semibold" href={`/reunioes/${m.id}?volta=${encodeURIComponent(volta)}`}>{m.titulo}</Link><span className="block text-xs text-[var(--muted)]">origem: {m.origem ? ORIGENS[m.origem] : "não informada"}{m.gravacao ? " · link" : ""}{m.transcricao ? " · transcrição" : ""}</span></span>
                      {m.motivo ? <Badge tone="info">{m.motivo.replace(/^Reunião de /, "")}</Badge> : <Badge>Não classificada</Badge>}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      ) : <Empty>Nenhuma reunião registrada nos projetos deste cliente{u.perfil === "arquiteta" ? " que você possa ver" : ""}.</Empty>)}
      <p className="text-[0.74rem] text-[var(--muted)]">O cliente vem sempre do projeto, pelo cadastro que chega do Vobi. A contagem soma todos os registros, inclusive os antigos “Não classificada”. A arquiteta vê só as reuniões que registrou, de que participa ou dos projetos dela.</p>
    </div>
  );
}
