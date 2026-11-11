import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario, podeImportar } from "@/lib/auth";
import type { Relatorio } from "@/lib/importador/importador";
import { confirmarAction, descartarAction } from "../actions";
import { Alert, Badge, Button, Card, PageHeader } from "@/components/ui";

const rotuloQualidade: Record<string, string> = {
  completa: "Completas", incompleta_sem_responsavel: "Sem responsável", incompleta_sem_prazo: "Sem prazo",
  incompleta_sem_inicio: "Sem data de início", orfa: "Órfãs (projeto não resolvido)", encerrada: "Encerradas (canceladas)",
};

function Tabela({ titulo, dados, rotulos }: { titulo: string; dados: Record<string, number>; rotulos?: Record<string, string> }) {
  const linhas = Object.entries(dados).sort((a, b) => b[1] - a[1]);
  return (
    <Card title={titulo}>
      <table className="tbl"><tbody>
        {linhas.map(([k, v]) => <tr key={k}><td>{rotulos?.[k] ?? k}</td><td className="text-right">{v}</td></tr>)}
        {!linhas.length && <tr><td className="text-[var(--muted)]">nenhum</td></tr>}
      </tbody></table>
    </Card>
  );
}

export default async function CargaPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirUsuario();
  const { id } = await params;
  const carga = (await db.select().from(schema.cargas).where(eq(schema.cargas.id, Number(id))).limit(1))[0];
  if (!carga) notFound();
  const rel = carga.relatorio as Relatorio | null;
  const ehPrevia = carga.status === "previa";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Dados · Importação Vobi" title={`Carga ${carga.id}`}
        subtitle={<><Badge tone={ehPrevia ? "info" : carga.status === "aceita" ? "ok" : carga.status === "retida" ? "warn" : "neutral"}>{ehPrevia ? "prévia" : carga.status}</Badge> Exportação de {carga.dataCarga}{carga.arqProjetos && <> · {carga.arqProjetos} ({carga.linhasProjetos} linhas) · {carga.arqTarefas} ({carga.linhasTarefas} linhas)</>}{carga.arqClientes && <> · {carga.arqClientes} ({carga.linhasClientes} clientes)</>}
          {carga.motivo && <span className="mt-1 block whitespace-pre-wrap"><b>Motivo:</b> {carga.motivo}</span>}</>}
        actions={<Link href="/importacao" className="btn btn-secondary btn-sm">← Importação</Link>} />

      {ehPrevia && (
        <Alert kind="info"><div>
          <div className="font-semibold">Nada foi gravado ainda.</div>
          <p className="text-sm">Confira o resumo e as anomalias abaixo. Ao confirmar, a carga é gravada em transação única (tudo ou nada); nada é apagado — registros ausentes ficam marcados como &ldquo;não encontrados&rdquo;.</p>
          {podeImportar(u.perfil) && (
            <div className="flex gap-3 mt-3">
              <form action={confirmarAction}><input type="hidden" name="id" value={carga.id} /><Button>Confirmar importação</Button></form>
              <form action={descartarAction}><input type="hidden" name="id" value={carga.id} /><Button variant="secondary">Descartar</Button></form>
            </div>
          )}
        </div></Alert>
      )}
      {carga.status === "retida" && <Alert kind="warn">Carga retida como anômala e <b>não gravada</b>. {carga.origem === "api" ? "A leitura pela API trouxe muito menos registros que a carga anterior; confira no Vobi e use “Sincronizar agora” quando estiver normal." : "Confira no Vobi se a exportação saiu sem filtros e envie novamente."}</Alert>}
      {carga.status === "aceita" && <Alert kind="success"><span>Carga aceita e gravada{carga.confirmadoEm ? ` em ${carga.confirmadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}. Veja a <Link className="underline" href="/qualidade">qualidade dos dados</Link> e o <Link className="underline" href="/painel">Painel de Gestão</Link>.</span></Alert>}

      {rel?.api && (
        <Card title={<>Leitura pela API do Vobi <Badge tone="info">somente leitura</Badge></>}
          subtitle={<>{rel.api.projetos} projetos · {rel.api.tarefas} tarefas · {rel.api.etapas} etapas de projeto · {rel.api.clientes} clientes. Horas estimadas lidas em {rel.api.unidadeHoras.estimadas}; realizadas em {rel.api.unidadeHoras.realizadas}.</>}>
          <div className="flex flex-col gap-2 text-sm">
            <div>Responsáveis: {rel.api.responsaveis.ids} números distintos no Vobi · {rel.api.responsaveis.comNome} identificados
              {rel.api.responsaveis.novosPorCorrespondencia.length > 0 && <> ({rel.api.responsaveis.novosPorCorrespondencia.length} reconhecidos agora pela última exportação CSV)</>}
              {rel.api.responsaveis.semNome.length > 0 && <> · <b>{rel.api.responsaveis.semNome.length} sem nome</b> — indique em <Link className="underline" href="/pessoas">Pessoas</Link></>}</div>
            {rel.api.limitacoes.map((l) => <div key={l} className="text-[var(--txt-2)]">• {l}</div>)}
          </div>
        </Card>
      )}
      {rel?.alertasPorTipo && (
        <>
          {rel.projetos && rel.tarefas && (<>
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Projetos">
                <div className="text-sm">{rel.projetos.linhas} linhas · <b>{rel.projetos.novos}</b> novos · <b>{rel.projetos.alterados}</b> alterados · <b>{rel.projetos.naoEncontrados}</b> não encontrados</div>
                {rel.recorte && <div className="mt-1 text-xs text-[var(--txt-2)]">Recorte 2026: {rel.recorte.projetosFora} projetos encerrados antes de 2026 fora da base ({rel.recorte.tarefasFora} tarefas) não entram — ficam no arquivo do A360, nada é apagado</div>}
              </Card>
              <Card title="Tarefas">
                <div className="text-sm">{rel.tarefas.linhas} linhas · <b>{rel.tarefas.novas}</b> novas · <b>{rel.tarefas.alteradas}</b> alteradas · <b>{rel.tarefas.naoEncontradas}</b> não encontradas · <b>{rel.tarefas.orfas}</b> órfãs · <b>{rel.tarefas.colisoes}</b> colisões de chave</div>
              </Card>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Tabela titulo="Projetos por status" dados={rel.projetos.porStatus} />
              <Tabela titulo="Tarefas por status" dados={rel.tarefas.porStatus} />
              <Tabela titulo="Qualidade das tarefas" dados={rel.tarefas.qualidade} rotulos={rotuloQualidade} />
            </div>
          </>)}
          {rel.clientes && (
            <div className="grid gap-4 md:grid-cols-3">
              <Card title="Clientes (Vobi, somente leitura)">
                <div className="text-sm">{rel.clientes.linhas} linhas · <b>{rel.clientes.novos}</b> novos · <b>{rel.clientes.alterados}</b> alterados · <b>{rel.clientes.naoEncontrados}</b> não encontrados (mantidos){rel.clientes.semCodigo ? <> · <b>{rel.clientes.semCodigo}</b> sem código (ignorados)</> : null}</div>
                <p className="mt-2 text-xs text-[var(--muted)]">Só os campos autorizados foram lidos. Nenhum cliente é apagado quando falta na exportação.</p>
              </Card>
              <Tabela titulo="Clientes por tipo" dados={rel.clientes.porTipo} rotulos={{ pf: "Pessoa física", pj: "Pessoa jurídica" }} />
              <Tabela titulo="Clientes por status" dados={rel.clientes.porStatus} />
            </div>
          )}
          {rel.vinculos && (
            <Card title="Vínculo projeto × cliente (pelo nome normalizado)"
              subtitle={<>Recalculado nesta carga. <b>{rel.vinculos.resolvidos}</b> resolvidos · <b>{rel.vinculos.manuais}</b> por decisão manual · <b>{rel.vinculos.ambiguos}</b> ambíguos (fila da coordenação) · <b>{rel.vinculos.semCliente}</b> sem cliente associado ({rel.vinculos.semNome} sem nome no Vobi) · <b>{rel.vinculos.alterados}</b> vínculos alterados nesta carga.</>}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-sm font-semibold">Nomes ambíguos (mais de um cliente com o mesmo nome)</div>
                  <table className="tbl"><tbody>
                    {rel.vinculos.nomesAmbiguos.map((a) => <tr key={a.nome}><td>{a.nome}</td><td className="text-right">{a.projetos} proj. · códigos {a.candidatos.join(", ")}</td></tr>)}
                    {!rel.vinculos.nomesAmbiguos.length && <tr><td className="text-[var(--muted)]">nenhum</td></tr>}
                  </tbody></table>
                  {rel.vinculos.nomesAmbiguos.length > 0 && <Link href="/clientes#fila" className="text-xs underline">resolver em Clientes</Link>}
                </div>
                <div>
                  <div className="mb-1 text-sm font-semibold">Nomes sem cadastro correspondente</div>
                  <table className="tbl"><tbody>
                    {rel.vinculos.nomesSemCorrespondencia.slice(0, 30).map((a) => <tr key={a.nome}><td>{a.nome}</td><td className="text-right">{a.projetos} proj.</td></tr>)}
                    {rel.vinculos.nomesSemCorrespondencia.length > 30 && <tr><td className="text-[var(--muted)]">… e mais {rel.vinculos.nomesSemCorrespondencia.length - 30}</td></tr>}
                    {!rel.vinculos.nomesSemCorrespondencia.length && <tr><td className="text-[var(--muted)]">nenhum</td></tr>}
                  </tbody></table>
                </div>
              </div>
              {rel.vinculos.manuaisInvalidados.length > 0 && <Alert kind="warn"><b>Decisões manuais não aplicadas:</b> {rel.vinculos.manuaisInvalidados.map((m) => `projeto ${m.projeto} (${m.motivo})`).join("; ")}</Alert>}
            </Card>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <Tabela titulo="Anomalias (alertas por tipo)" dados={rel.alertasPorTipo} />
            <Tabela titulo="Etapas não mapeadas" dados={rel.etapasNaoMapeadas} />
            <Card title="Pessoas sem e-mail">
              <ul className="text-sm">{rel.pessoasNaoMapeadas.map((p) => <li key={p}>{p}</li>)}{!rel.pessoasNaoMapeadas.length && <li className="text-[var(--muted)]">nenhuma</li>}</ul>
              {rel.pessoasNaoMapeadas.length > 0 && <Link href="/pessoas" className="text-xs underline">mapear em Pessoas</Link>}
            </Card>
          </div>
          {rel.possiveisRenomeacoes.length > 0 && (
            <Card title="Possíveis renomeações (sugestão, não aplicada)">
              <table className="tbl"><thead><tr><th>Não encontrada</th><th>Nova</th><th>Similaridade</th></tr></thead>
                <tbody>{rel.possiveisRenomeacoes.map((s) => <tr key={s.naoEncontrada}><td>{s.naoEncontrada}</td><td>{s.nova}</td><td>{s.similaridadeNome}</td></tr>)}</tbody></table>
            </Card>
          )}
          {rel.avisosLayout.length > 0 && <Alert kind="warn"><b>Avisos de layout:</b> {rel.avisosLayout.join(", ")}</Alert>}
        </>
      )}
    </div>
  );
}
