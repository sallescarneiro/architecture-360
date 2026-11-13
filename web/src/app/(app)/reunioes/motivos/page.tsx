import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { ORIGENS, historicoDosMotivos, listarMotivos, podeAdministrarMotivos } from "@/lib/reunioes-motivos";
import { dataHora } from "@/lib/agenda/datas";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { alternarMotivoAction, incluirMotivoAction } from "./actions";

const ACAO: Record<string, { rotulo: string; tom: "ok" | "warn" | "neutral" }> = {
  lista_inicial: { rotulo: "Lista inicial", tom: "neutral" }, incluido: { rotulo: "Incluído", tom: "ok" }, desativado: { rotulo: "Desativado", tom: "warn" }, reativado: { rotulo: "Reativado", tom: "ok" },
};

/** T-227 — Motivos da reunião (só gestão): incluir sem duplicidade, desativar e reativar; nada é apagado; histórico de alterações. */
export default async function MotivosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  if (!podeAdministrarMotivos(u)) redirect("/sem-permissao");
  const sp = await searchParams;
  const [motivos, historico] = await Promise.all([listarMotivos(), historicoDosMotivos()]);
  const desat = motivos.filter((m) => !m.ativo);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Inteligência de Reuniões · só a gestão" title="Motivos da reunião"
        subtitle="O motivo diz o assunto tratado. A gestão inclui novos motivos e desativa os que não servem mais. Nada é apagado: motivo desativado sai do formulário de novas reuniões, mas continua nas reuniões antigas que o usam. Cada inclusão, desativação e reativação fica no histórico." />
      {sp.ok && <div className="leitura" role="status"><b>OK</b>{sp.ok}</div>}
      {sp.erro && <div className="leitura leitura-bad" role="alert"><b>Atenção</b>{sp.erro}</div>}
      <div className="flex flex-wrap items-start gap-4">
        <Card className="min-w-0 flex-[999_1_560px]" title={`Motivos (${motivos.length} · ${motivos.length - desat.length} ativos)`} subtitle="a contagem vem das reuniões registradas no A360">
          <form action={incluirMotivoAction} className="mb-3 flex flex-wrap items-end gap-2">
            <label className="block min-w-[16rem] flex-1 text-xs font-semibold text-[var(--txt-2)]">Novo motivo<input name="nome" required maxLength={120} defaultValue={sp.nome ?? ""} className="input mt-1" placeholder="ex.: Reunião de Aprovação de Orçamento de Obra" /></label>
            <Button variant="primary">Incluir motivo</Button>
          </form>
          <p className="mb-2 text-xs text-[var(--muted)]">Duplicidade: maiúsculas, minúsculas e espaços extras não contam — “reunião de revisão” e “Reunião  de Revisão” são o mesmo motivo.</p>
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>#</th><th>Motivo</th><th>Reuniões associadas</th><th>Situação</th><th>Novas reuniões</th><th></th></tr></thead>
            <tbody>{motivos.map((m, i) => (
              <tr key={m.id} className={m.ativo ? "" : "text-[var(--muted)]"}>
                <td>{i + 1}</td><td>{m.nome}</td><td>{m.uso === 0 ? "nenhuma" : m.uso === 1 ? "1 reunião" : `${m.uso} reuniões`}</td>
                <td><Badge tone={m.ativo ? "ok" : "neutral"}>{m.ativo ? "Ativo" : "Desativado"}</Badge></td>
                <td>{m.ativo ? "aparece" : "não aparece (antigas mantêm)"}</td>
                <td><form action={alternarMotivoAction}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="ativo" value={m.ativo ? "0" : "1"} /><Button variant="secondary" className="btn-sm" aria-label={`${m.ativo ? "Desativar" : "Reativar"} ${m.nome}`}>{m.ativo ? "Desativar" : "Reativar"}</Button></form></td>
              </tr>))}</tbody>
          </table></div>
        </Card>
        <div className="flex min-w-0 max-w-md flex-[1_1_300px] flex-col gap-4">
          <Card title="Histórico de alterações" subtitle="ação · motivo afetado · responsável · data e hora">
            <ul className="flex flex-col divide-y divide-[var(--line)] text-sm">
              {historico.map((h) => (
                <li key={h.id} className="grid grid-cols-[7.5rem_1fr] gap-x-3 py-2">
                  <span className="text-xs font-semibold text-[var(--txt-2)]">{dataHora(h.quando)}</span>
                  <span className="min-w-0"><Badge tone={ACAO[h.acao]?.tom ?? "neutral"}>{ACAO[h.acao]?.rotulo ?? h.acao}</Badge> {h.motivo}<span className="block text-xs text-[var(--muted)]">por {h.quem ?? "carga inicial do sistema"}</span></span>
                </li>))}
            </ul>
          </Card>
          <Card title="Origem da reunião" subtitle="campo separado do motivo: quem solicitou a reunião · lista fixa nesta etapa">
            <ul className="flex flex-col gap-1.5 text-sm">{Object.values(ORIGENS).map((o) => <li key={o} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1.5">{o}</li>)}</ul>
            <p className="mt-2 text-xs text-[var(--muted)]">“Solicitada pelo cliente” não é motivo: registre Origem = Cliente e escolha o motivo pelo assunto.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
