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
        subtitle={<><Badge tone={ehPrevia ? "info" : carga.status === "aceita" ? "ok" : carga.status === "retida" ? "warn" : "neutral"}>{ehPrevia ? "prévia" : carga.status}</Badge> Exportação de {carga.dataCarga} · {carga.arqProjetos} ({carga.linhasProjetos} linhas) · {carga.arqTarefas} ({carga.linhasTarefas} linhas)
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
      {carga.status === "retida" && <Alert kind="warn">Carga retida como anômala e <b>não gravada</b>. Confira no Vobi se a exportação saiu sem filtros e envie novamente.</Alert>}
      {carga.status === "aceita" && <Alert kind="success"><span>Carga aceita e gravada{carga.confirmadoEm ? ` em ${carga.confirmadoEm.toLocaleString("pt-BR")}` : ""}. Veja a <Link className="underline" href="/qualidade">qualidade dos dados</Link> e a <Link className="underline" href="/">operação</Link>.</span></Alert>}

      {rel && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Projetos">
              <div className="text-sm">{rel.projetos.linhas} linhas · <b>{rel.projetos.novos}</b> novos · <b>{rel.projetos.alterados}</b> alterados · <b>{rel.projetos.naoEncontrados}</b> não encontrados</div>
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
