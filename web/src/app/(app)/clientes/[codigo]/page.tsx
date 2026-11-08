import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirUsuario, veIndicadoresIndividuais } from "@/lib/auth";
import { ROTULO_VINCULO, TOM_VINCULO, URL_CLIENTES_VOBI, clientePorCodigo, ultimaCargaClientes } from "@/lib/clientes";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";

/** Projetos por cliente (Etapa 2). Dados do cliente são do Vobi, somente leitura. */
export default async function ClientePage({ params }: { params: Promise<{ codigo: string }> }) {
  const u = await exigirUsuario();
  const coordena = veIndicadoresIndividuais(u.perfil);
  const { codigo } = await params;
  const r = await clientePorCodigo(Number(codigo));
  if (!r) notFound();
  const { cliente: c, projetos, tarefas } = r;
  const carga = await ultimaCargaClientes();
  const ativos = projetos.filter((p) => p.statusClasse !== "encerrado").length;
  const abertas = [...tarefas.values()].reduce((a, t) => a + t.abertas, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Dados · Clientes" title={c.nome}
        subtitle={<>Cód. Vobi {c.codigo}{c.razaoSocial && c.razaoSocial !== c.nome ? ` · ${c.razaoSocial}` : ""} · {c.tipo === "pj" ? "Pessoa jurídica" : c.tipo === "pf" ? "Pessoa física" : "tipo não informado"} · {c.cidade ? `${c.cidade}/${c.estado ?? ""}` : "cidade não informada"}
          {coordena && (c.email || c.telefone) && <> · {c.email ?? ""}{c.email && c.telefone ? " · " : ""}{c.telefone ?? ""}</>}
          <span className="mt-1 block text-xs">Origem: Vobi{carga ? ` · exportação de ${carga.dataCarga} (carga ${carga.id})` : ""} · atualizado no A360 em {c.atualizadoEm.toLocaleString("pt-BR")}{c.criadoEmVobi ? ` · cliente desde ${c.criadoEmVobi} no Vobi` : ""} {c.naoEncontradoDesde ? <Badge tone="warn">não encontrado na última exportação</Badge> : <Badge tone={c.status === "Ativo" ? "ok" : "neutral"}>{c.status ?? "—"}</Badge>} <Badge tone="neutral">somente leitura</Badge></span></>}
        actions={<div className="flex gap-2"><a className="btn btn-secondary btn-sm" href={URL_CLIENTES_VOBI} target="_blank" rel="noreferrer">Editar no Vobi ↗</a><Link href="/clientes" className="btn btn-secondary btn-sm">← Clientes</Link></div>} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Projetos" value={projetos.length} note={`${ativos} ativos · ${projetos.length - ativos} encerrados`} />
        <Stat label="Tarefas abertas (projetos ativos e encerrados)" value={abertas} source="calc" />
        <Stat label="Vínculo" value={projetos.filter((p) => p.vinculoClienteStatus === "manual").length} note="projetos associados por decisão manual" tone="info" />
      </div>

      <Card title="Projetos do cliente" subtitle="Associação pelo nome do cliente informado no projeto (Vobi) ou por decisão da coordenação.">
        {projetos.length ? (
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Projeto</th><th>Status</th><th>Criado em</th><th>Metragem</th><th>Tarefas abertas / total</th><th>Vínculo</th></tr></thead>
            <tbody>{projetos.map((p) => {
              const t = tarefas.get(p.codigo);
              return (
                <tr key={p.codigo}>
                  <td><Link className="font-semibold text-[var(--vinho)] underline" href={`/projetos/${p.codigo}`}>{p.nome}</Link><div className="text-xs text-[var(--muted)]">cód. {p.codigo}</div></td>
                  <td><Badge tone={p.statusClasse === "encerrado" ? "neutral" : p.statusClasse === "pausado" ? "warn" : "ok"}>{p.status}</Badge></td>
                  <td>{p.criadoEm ?? "—"}</td>
                  <td>{p.metragem ?? "—"}</td>
                  <td>{t ? `${t.abertas} / ${t.total}` : "—"}</td>
                  <td><Badge tone={TOM_VINCULO[p.vinculoClienteStatus]}>{ROTULO_VINCULO[p.vinculoClienteStatus]}</Badge></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <Empty>Nenhum projeto associado a este cliente.</Empty>}
      </Card>
    </div>
  );
}
