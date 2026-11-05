import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario, podeImportar } from "@/lib/auth";
import type { Relatorio } from "@/lib/importador/importador";
import { confirmarAction, descartarAction } from "../actions";

const rotuloQualidade: Record<string, string> = {
  completa: "Completas", incompleta_sem_responsavel: "Sem responsável", incompleta_sem_prazo: "Sem prazo",
  incompleta_sem_inicio: "Sem data de início", orfa: "Órfãs (projeto não resolvido)", encerrada: "Encerradas (canceladas)",
};

function Tabela({ titulo, dados, rotulos }: { titulo: string; dados: Record<string, number>; rotulos?: Record<string, string> }) {
  const linhas = Object.entries(dados).sort((a, b) => b[1] - a[1]);
  return (
    <div className="card">
      <div className="font-semibold mb-2">{titulo}</div>
      <table className="w-full text-sm"><tbody>
        {linhas.map(([k, v]) => <tr key={k}><td>{rotulos?.[k] ?? k}</td><td className="text-right">{v}</td></tr>)}
        {!linhas.length && <tr><td className="text-[var(--muted)]">nenhum</td></tr>}
      </tbody></table>
    </div>
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
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/importacao" className="text-sm underline">← Importação</Link>
        <h1 className="text-2xl font-bold">Carga {carga.id} — {ehPrevia ? "prévia" : carga.status}</h1>
        <p className="text-sm text-[var(--muted)]">Exportação de {carga.dataCarga} · {carga.arqProjetos} ({carga.linhasProjetos} linhas) · {carga.arqTarefas} ({carga.linhasTarefas} linhas)</p>
        {carga.motivo && <p className="text-sm mt-1 whitespace-pre-wrap"><b>Motivo:</b> {carga.motivo}</p>}
      </div>

      {ehPrevia && (
        <div className="card border-blue-200 bg-blue-50">
          <div className="font-semibold">Nada foi gravado ainda.</div>
          <p className="text-sm">Confira o resumo e as anomalias abaixo. Ao confirmar, a carga é gravada em transação única (tudo ou nada); nada é apagado — registros ausentes ficam marcados como &ldquo;não encontrados&rdquo;.</p>
          {podeImportar(u.perfil) && (
            <div className="flex gap-3 mt-3">
              <form action={confirmarAction}><input type="hidden" name="id" value={carga.id} /><button className="btn btn-primary">Confirmar importação</button></form>
              <form action={descartarAction}><input type="hidden" name="id" value={carga.id} /><button className="btn btn-secondary">Descartar</button></form>
            </div>
          )}
        </div>
      )}
      {carga.status === "retida" && <div className="card border-orange-200 bg-orange-50 text-sm">Carga retida como anômala e <b>não gravada</b>. Confira no Vobi se a exportação saiu sem filtros e envie novamente.</div>}
      {carga.status === "aceita" && <div className="card border-green-200 bg-green-50 text-sm">Carga aceita e gravada{carga.confirmadoEm ? ` em ${carga.confirmadoEm.toLocaleString("pt-BR")}` : ""}. Veja a <Link className="underline" href="/qualidade">qualidade dos dados</Link> e a <Link className="underline" href="/">operação</Link>.</div>}

      {rel && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card">
              <div className="font-semibold mb-2">Projetos</div>
              <div className="text-sm">{rel.projetos.linhas} linhas · <b>{rel.projetos.novos}</b> novos · <b>{rel.projetos.alterados}</b> alterados · <b>{rel.projetos.naoEncontrados}</b> não encontrados</div>
            </div>
            <div className="card">
              <div className="font-semibold mb-2">Tarefas</div>
              <div className="text-sm">{rel.tarefas.linhas} linhas · <b>{rel.tarefas.novas}</b> novas · <b>{rel.tarefas.alteradas}</b> alteradas · <b>{rel.tarefas.naoEncontradas}</b> não encontradas · <b>{rel.tarefas.orfas}</b> órfãs · <b>{rel.tarefas.colisoes}</b> colisões de chave</div>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <Tabela titulo="Projetos por status" dados={rel.projetos.porStatus} />
            <Tabela titulo="Tarefas por status" dados={rel.tarefas.porStatus} />
            <Tabela titulo="Qualidade das tarefas" dados={rel.tarefas.qualidade} rotulos={rotuloQualidade} />
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <Tabela titulo="Anomalias (alertas por tipo)" dados={rel.alertasPorTipo} />
            <Tabela titulo="Etapas não mapeadas" dados={rel.etapasNaoMapeadas} />
            <div className="card">
              <div className="font-semibold mb-2">Pessoas sem e-mail</div>
              <ul className="text-sm">{rel.pessoasNaoMapeadas.map((p) => <li key={p}>{p}</li>)}{!rel.pessoasNaoMapeadas.length && <li className="text-[var(--muted)]">nenhuma</li>}</ul>
              {rel.pessoasNaoMapeadas.length > 0 && <Link href="/pessoas" className="text-xs underline">mapear em Pessoas</Link>}
            </div>
          </div>
          {rel.possiveisRenomeacoes.length > 0 && (
            <div className="card">
              <div className="font-semibold mb-2">Possíveis renomeações (sugestão, não aplicada)</div>
              <table className="w-full text-xs"><thead><tr><th>Não encontrada</th><th>Nova</th><th>Similaridade</th></tr></thead>
                <tbody>{rel.possiveisRenomeacoes.map((s) => <tr key={s.naoEncontrada}><td>{s.naoEncontrada}</td><td>{s.nova}</td><td>{s.similaridadeNome}</td></tr>)}</tbody></table>
            </div>
          )}
          {rel.avisosLayout.length > 0 && <div className="card text-sm"><b>Avisos de layout:</b> {rel.avisosLayout.join(", ")}</div>}
        </>
      )}
    </div>
  );
}
