import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario, veIndicadoresIndividuais } from "@/lib/auth";
import { contagem, linkVobiProjeto, ultimaCargaAceita } from "@/lib/consultas";
import { restricaoDe, sqlParticipa } from "@/lib/participacao";
import { ROTULO_VINCULO, TOM_VINCULO } from "@/lib/clientes";
import { minutosParaHoras } from "@/lib/importador/normalizacao";
import { hojeIso, statusPrazo } from "@/lib/prazo";
import { StatusPrazo } from "@/components/StatusPrazo";
import { urlCom } from "@/lib/listas";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";

/** Detalhe do projeto (somente leitura): dados do Vobi, cliente vinculado e tarefas da última carga. */
export default async function ProjetoPage({ params }: { params: Promise<{ codigo: string }> }) {
  const u = await exigirUsuario();
  const gestao = veIndicadoresIndividuais(u.perfil);
  const { codigo } = await params;
  const p = (await db.select().from(schema.projetos).where(eq(schema.projetos.codigo, Number(codigo))).limit(1))[0];
  if (!p) notFound();
  const carga = await ultimaCargaAceita();
  if (!gestao) {
    // D-A (08/11/2026): arquiteta só abre projetos em que participa (colaboradora no Vobi ou responsável por tarefa). Verificado no servidor.
    const r = await restricaoDe(u.email);
    const ok = carga ? (await contagem(`select 1 from projeto p where p.codigo=${p.codigo} and ${sqlParticipa(r.email, r.nomes, carga.id, "p")}`)).length > 0 : false;
    if (!ok) redirect("/sem-permissao");
  }
  const cliente = p.clienteCodigo ? (await db.select().from(schema.clientesVobi).where(eq(schema.clientesVobi.codigo, p.clienteCodigo)).limit(1))[0] : null;
  const tarefas = await db.select().from(schema.tarefas)
    .where(and(eq(schema.tarefas.projetoCodigo, p.codigo), isNull(schema.tarefas.naoEncontradoDesde)))
    .orderBy(asc(schema.tarefas.etapaCanonica), asc(schema.tarefas.dataFim), asc(schema.tarefas.nome));
  const hoje = hojeIso();
  const prazos = new Map(tarefas.map((t) => [t.chave, statusPrazo(t.status, t.dataFim, hoje)]));
  const abertas = tarefas.filter((t) => prazos.get(t.chave)!.aberta);
  const vencidas = abertas.filter((t) => prazos.get(t.chave)!.atrasada).length;
  const horas = tarefas.reduce((a, t) => a + (t.horasRealizadasMin ?? 0), 0);

  const clienteBloco = p.vinculoClienteStatus === "ambiguo"
    ? <><Badge tone="warn">cliente ambíguo</Badge> &ldquo;{p.cliente}&rdquo; corresponde a mais de um cadastro{gestao && <> · <Link className="underline" href="/clientes#fila">decidir em Clientes</Link></>}</>
    : cliente
      ? <><Link className="font-semibold text-[var(--vinho)] underline" href={`/clientes/${cliente.codigo}`}>{cliente.nome}</Link> <span className="text-xs text-[var(--muted)]">cód. {cliente.codigo} · {cliente.cidade ? `${cliente.cidade}/${cliente.estado ?? ""}` : ""}</span> <Badge tone={TOM_VINCULO[p.vinculoClienteStatus]}>{ROTULO_VINCULO[p.vinculoClienteStatus]}</Badge></>
      : <><span className="text-[var(--muted)]">sem cliente associado</span>{p.cliente ? <> · no Vobi: &ldquo;{p.cliente}&rdquo; (sem cadastro correspondente{gestao && <> · <Link className="underline" href="/clientes#fila">associar</Link></>})</> : " · sem nome de cliente no Vobi"}</>;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Operação · Projeto" title={p.nome}
        subtitle={<>Cód. Vobi {p.codigo} · <Badge tone={p.statusClasse === "encerrado" ? "neutral" : p.statusClasse === "pausado" ? "warn" : "ok"}>{p.status}</Badge> · criado em {p.criadoEm ?? "—"}{p.metragem ? ` · ${p.metragem} m²` : ""}{p.etiquetas.length ? ` · ${p.etiquetas.join(", ")}` : ""}
          <span className="mt-1 block text-xs">Origem: Vobi{carga ? ` · exportação de ${carga.dataCarga.split("-").reverse().join("/")} (carga ${carga.id})` : ""} · prazos comparados com hoje{p.naoEncontradoDesde ? " · não encontrado na última exportação" : ""} <Badge tone="neutral">somente leitura</Badge></span></>}
        actions={<div className="flex gap-2"><a className="btn btn-secondary btn-sm" href={linkVobiProjeto(p.codigo)} target="_blank" rel="noreferrer">Abrir no Vobi ↗</a><Link href="/projetos" className="btn btn-secondary btn-sm">← Projetos</Link></div>} />

      <Card title="Cliente"><div className="text-sm">{clienteBloco}</div></Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Tarefas abertas" value={abertas.length} note={`de ${tarefas.length} na carga`} href={urlCom("/tarefas", {}, { projeto: p.codigo })} />
        <Stat label="Atrasadas" value={vencidas} tone={vencidas ? "bad" : "ok"} source="calc" href={urlCom("/tarefas", {}, { projeto: p.codigo, prazo: "atrasadas" })} />
        <Stat label="Horas realizadas" value={minutosParaHoras(horas)} note="acumuladas nas tarefas" />
        <Stat label="Colaboradores (Vobi)" value={p.colaboradores.length} note={p.colaboradores.join(", ") || "—"} />
      </div>

      <Card title="Tarefas (última carga)" subtitle="Fato importado do Vobi; não é medida de desempenho.">
        {tarefas.length ? (
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Etapa</th><th>Tarefa</th><th>Situação</th><th>Status Vobi</th>{gestao && <th>Responsável</th>}<th>Início</th><th>Fim</th><th>Horas</th></tr></thead>
            <tbody>{tarefas.map((t) => (
              <tr key={t.chave}>
                <td>{t.etapaCanonica}</td><td>{t.nome}</td>
                <td><StatusPrazo info={prazos.get(t.chave)!} /></td>
                <td className="text-[var(--txt-2)]">{t.status}</td>
                {gestao && <td>{t.responsavelNome ?? "—"}</td>}
                <td>{t.dataInicio ?? "—"}</td><td>{t.dataFim ?? "—"}</td><td>{t.horasRealizadasMin ? minutosParaHoras(t.horasRealizadasMin) : "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>Nenhuma tarefa deste projeto na última carga.</Empty>}
      </Card>
    </div>
  );
}
