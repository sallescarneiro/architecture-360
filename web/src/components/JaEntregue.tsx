import Link from "next/link";
import type { jaEntregue } from "@/lib/entregues";
import { Badge, Card } from "@/components/ui";

const br = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const quando = (t: { registradaEm: string | null; primeiraLeitura: boolean }) =>
  t.primeiraLeitura ? `já concluída na 1ª leitura (${br(t.registradaEm)})` : `concluída até ${br(t.registradaEm)}`;

/** Bloco "Já entregue" do projeto: etapas, entregas ao cliente, entregáveis aprovados e todas as tarefas concluídas no Vobi. */
export function JaEntregue({ d }: { d: Awaited<ReturnType<typeof jaEntregue>> }) {
  const total = d.tarefas.length;
  return (
    <Card title={`Já entregue (${total} tarefa${total === 1 ? "" : "s"} concluída${total === 1 ? "" : "s"})`}
      subtitle="O que o Vobi marca como concluído, por etapa. A data é a da leitura do Vobi em que a conclusão apareceu (o Vobi não informa o dia exato). Só leitura.">
      {d.etapas.length === 0 ? <p className="text-sm text-[var(--muted)]">Nenhuma tarefa deste projeto no Vobi.</p> : (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-wrap gap-2" aria-label="Etapas">
            {d.etapas.map((e) => (
              <li key={e.etapa} className={`rounded-lg border px-2.5 py-1.5 text-[0.78rem] ${e.situacao === "concluida" ? "border-[#cfe5d7] bg-[#eef7f1] text-[#1f5a3b]" : e.situacao === "andamento" ? "border-[var(--line)] bg-[var(--rose-2)]" : "border-dashed border-[#d8cdc7] text-[var(--muted)]"}`}>
                <b>{e.etapa}</b> · {e.situacao === "concluida" ? "concluída" : e.situacao === "andamento" ? `${e.concluidas} de ${e.total}` : "não iniciada"}
              </li>
            ))}
          </ul>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="min-w-0">
              <h3 className="mb-1.5 text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[var(--terracota)]">Entregas e apresentações ao cliente</h3>
              {d.entregas.length ? <ul className="flex flex-col gap-1.5 text-[0.84rem]">{d.entregas.map((t, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-2 border-b border-[#f0e8e2] pb-1.5"><span><b>{t.nome}</b> <span className="text-[var(--muted)]">· {t.etapa}</span></span><span className="text-xs text-[var(--muted)]">{quando(t)}</span></li>
              ))}</ul> : <p className="text-sm text-[var(--muted)]">Nenhuma apresentação ou entrega concluída ainda.</p>}
            </div>
            <div className="min-w-0">
              <h3 className="mb-1.5 text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[var(--terracota)]">Aprovado pelo cliente (Entregáveis)</h3>
              {d.aprovados.length ? <ul className="flex flex-col gap-1.5 text-[0.84rem]">{d.aprovados.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-2 border-b border-[#f0e8e2] pb-1.5"><Link href={`/entregaveis/${e.id}`} className="font-bold underline">{e.titulo}</Link><span className="text-xs text-[var(--muted)]">v{e.versao_atual} · {br(String(e.atualizado_em))}</span></li>
              ))}</ul> : <p className="text-sm text-[var(--muted)]">Nenhum entregável com aprovação do cliente registrada.</p>}
            </div>
          </div>
          {total > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-[var(--vinho)]">Ver todas as tarefas concluídas ({total})</summary>
              <div className="mt-2 overflow-x-auto"><table className="tbl"><thead><tr><th>Tarefa</th><th>Etapa</th><th>Prazo previsto</th><th>Conclusão</th><th>Responsável</th></tr></thead><tbody>
                {d.tarefas.map((t, i) => <tr key={i}><td>{t.nome}{t.entrega && <> <Badge tone="info">entrega</Badge></>}</td><td>{t.etapa}</td><td>{br(t.previsto)}</td><td className="text-[var(--muted)]">{quando(t)}</td><td>{t.responsavel ?? "—"}</td></tr>)}
              </tbody></table></div>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
