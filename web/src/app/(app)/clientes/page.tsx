import Link from "next/link";
import { exigirUsuario, veIndicadoresIndividuais } from "@/lib/auth";
import { ROTULO_VINCULO, TOM_VINCULO, URL_CLIENTES_VOBI, filaVinculos, listarClientes, resumoVinculos, ultimaCargaClientes } from "@/lib/clientes";
import { chaveTexto } from "@/lib/importador/normalizacao";
import { desfazerManualAction, vincularManualAction } from "./actions";
import { Alert, Badge, Button, Card, Empty, Input, LinkButton, PageHeader, Select, Stat } from "@/components/ui";

/**
 * Clientes — espelho somente leitura do cadastro do Vobi (Etapa 1) e fila de vínculo projeto × cliente (Etapa 2).
 * Nenhum campo é editável aqui: alterações de cadastro são feitas no Vobi e chegam pela próxima exportação.
 */
export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await exigirUsuario();
  const coordena = veIndicadoresIndividuais(u.perfil);
  const { q = "" } = await searchParams;
  const qn = chaveTexto(q);
  const [carga, clientes, resumo, fila] = await Promise.all([ultimaCargaClientes(), listarClientes(qn), resumoVinculos(), coordena ? filaVinculos() : null]);

  const origem = carga
    ? <>Origem: Vobi · exportação de {carga.dataCarga} (carga {carga.id}{carga.confirmadoEm ? `, importada em ${carga.confirmadoEm.toLocaleString("pt-BR")}` : ""})</>
    : <>Nenhuma exportação de clientes importada ainda.</>;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Dados" title="Clientes"
        subtitle={<>{origem} <Badge tone="neutral">Vobi · somente leitura</Badge></>}
        actions={<a className="btn btn-secondary btn-sm" href={URL_CLIENTES_VOBI} target="_blank" rel="noreferrer">Editar no Vobi ↗</a>} />

      {!carga && <Empty action={<LinkButton href="/importacao" variant="primary">Importar Clientes.csv</LinkButton>}>Para começar, exporte <b>Cadastros › Contatos › Clientes</b> no Vobi e envie o CSV na Importação.</Empty>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Clientes no cadastro" value={resumo.clientes} note="ativos no Vobi e presentes na última exportação" />
        <Stat label="Projetos com cliente resolvido" value={resumo.resolvido} tone="ok" source="calc" note="nome único no cadastro" />
        <Stat label="Por decisão manual" value={resumo.manual} tone="info" note="decididos pela coordenação" />
        <Stat label="Ambíguos" value={resumo.ambiguo} tone={resumo.ambiguo ? "warn" : "ok"} source="calc" note="mais de um cliente com o mesmo nome" href={coordena ? "#fila" : undefined} />
        <Stat label="Sem cliente associado" value={resumo.sem_cliente} tone="neutral" source="calc" note="sem nome no Vobi ou sem cadastro correspondente" />
      </div>

      {coordena && fila && (
        <Card id="fila" title="Fila de vínculo (decisão da coordenação)"
          subtitle="Projetos cujo nome de cliente corresponde a mais de um cadastro (ambíguos) ou a nenhum. A decisão vale enquanto o nome do cliente no projeto não mudar no Vobi e não altera nada na fonte. Para corrigir o cadastro em si (nomes duplicados), use o Vobi.">
          {fila.projetos.length ? (
            <div className="overflow-x-auto"><table className="tbl">
              <thead><tr><th>Projeto</th><th>Cliente no Vobi (texto)</th><th>Situação</th><th>Decisão</th></tr></thead>
              <tbody>
                {fila.projetos.map((p) => {
                  const chave = chaveTexto(p.cliente);
                  const cand = fila.clientes.filter((c) => c.chaveNome === chave);
                  const outros = fila.clientes.filter((c) => c.chaveNome !== chave);
                  const m = fila.manuais.get(p.codigo);
                  const rot = (c: typeof fila.clientes[number]) => `${c.nome} · cód. ${c.codigo}${c.cidade ? ` · ${c.cidade}/${c.estado ?? ""}` : ""}${c.tipo ? ` · ${c.tipo}` : ""}${c.criadoEmVobi ? ` · desde ${c.criadoEmVobi}` : ""}${c.status && c.status !== "Ativo" ? ` · ${c.status}` : ""}`;
                  return (
                    <tr key={p.codigo}>
                      <td><Link className="font-semibold text-[var(--vinho)] underline" href={`/projetos/${p.codigo}`}>{p.nome}</Link><div className="text-xs text-[var(--muted)]">cód. {p.codigo} · {p.status}</div></td>
                      <td>{p.cliente || <span className="text-[var(--muted)]">(vazio)</span>}</td>
                      <td><Badge tone={TOM_VINCULO[p.vinculoClienteStatus] ?? "neutral"}>{ROTULO_VINCULO[p.vinculoClienteStatus] ?? p.vinculoClienteStatus}</Badge>
                        {m && <div className="mt-1 text-xs text-[var(--muted)]">cliente {m.c} · {m.por ?? "—"} em {m.em.toLocaleDateString("pt-BR")}{m.obs ? ` · ${m.obs}` : ""}</div>}</td>
                      <td>
                        {p.vinculoClienteStatus === "manual" ? (
                          <form action={desfazerManualAction} className="flex items-center gap-2"><input type="hidden" name="projeto" value={p.codigo} /><Button variant="secondary" className="btn-sm">Desfazer decisão</Button></form>
                        ) : (
                          <form action={vincularManualAction} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="projeto" value={p.codigo} />
                            <Select name="cliente" required defaultValue="" className="max-w-[26rem]">
                              <option value="" disabled>Escolher cliente…</option>
                              {cand.length > 0 && <optgroup label="Candidatos com o mesmo nome">{cand.map((c) => <option key={c.codigo} value={c.codigo}>{rot(c)}</option>)}</optgroup>}
                              <optgroup label="Todos os clientes">{outros.map((c) => <option key={c.codigo} value={c.codigo}>{rot(c)}</option>)}</optgroup>
                            </Select>
                            <Input name="observacao" placeholder="observação (opcional)" className="max-w-[14rem]" />
                            <Button className="btn-sm">Vincular</Button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          ) : <Empty>Nenhum projeto aguardando decisão.</Empty>}
        </Card>
      )}

      <Card title="Cadastro de clientes (Vobi)" subtitle={<>Campos autorizados apenas; CPF/CNPJ, documentos, nascimento, endereço e observações não são importados. Clientes ausentes numa exportação ficam marcados, nunca apagados.</>}
        actions={<form className="flex gap-2"><Input name="q" defaultValue={q} placeholder="buscar por nome, razão social, código ou cidade" className="w-72" /><Button variant="secondary" className="btn-sm">Buscar</Button></form>}>
        <div className="overflow-x-auto"><table className="tbl">
          <thead><tr><th>Cliente</th><th>Tipo</th><th>Status</th><th>Cidade/UF</th>{coordena && <th>Contato</th>}<th>Desde (Vobi)</th><th>Projetos</th></tr></thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.codigo}>
                <td><Link className="font-semibold text-[var(--vinho)] underline" href={`/clientes/${c.codigo}`}>{c.nome}</Link>
                  <div className="text-xs text-[var(--muted)]">cód. {c.codigo}{c.razao_social && c.razao_social !== c.nome ? ` · ${c.razao_social}` : ""}</div></td>
                <td>{c.tipo === "pj" ? "PJ" : c.tipo === "pf" ? "PF" : "—"}</td>
                <td>{c.nao_encontrado_desde ? <Badge tone="warn">não encontrado na última exportação</Badge> : <Badge tone={c.status === "Ativo" ? "ok" : "neutral"}>{c.status ?? "—"}</Badge>}</td>
                <td>{c.cidade ? `${c.cidade}/${c.estado ?? ""}` : "—"}</td>
                {coordena && <td className="text-xs">{c.email ?? ""}{c.email && c.telefone ? " · " : ""}{c.telefone ?? ""}</td>}
                <td>{c.criado_em_vobi ?? "—"}</td>
                <td>{c.projetos ? <>{c.projetos} <span className="text-xs text-[var(--muted)]">({c.ativos} ativos)</span></> : <span className="text-[var(--muted)]">0</span>}</td>
              </tr>
            ))}
            {!clientes.length && <tr><td colSpan={coordena ? 7 : 6} className="text-[var(--muted)]">{carga ? "Nenhum cliente encontrado." : "Nenhum cliente importado."}</td></tr>}
          </tbody>
        </table></div>
      </Card>
      {carga && <Alert kind="info">Este espelho não substitui o Vobi: é uma leitura gerencial para associar projetos a clientes. Correções de cadastro são feitas no Vobi e chegam na próxima exportação.</Alert>}
    </div>
  );
}
