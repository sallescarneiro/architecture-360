import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { atrasadasSemJustificativa, contagens, podeJustificar, podeValidarAtraso, porSituacao } from "@/lib/atrasos";
import { Card, Empty, PageHeader } from "@/components/ui";
import { FormJustificar, SeloJustificativa } from "@/components/atrasos/Justificativa";
import { decidirAtrasoAction } from "./actions";

const ABAS: [string, string][] = [["sem", "Sem justificativa"], ["aguardando", "Aguardando validação"], ["validada", "Justificados"], ["medida", "Outra medida"]];
const EXPLICA: Record<string, string> = {
  sem: "Tarefas abertas que passaram do prazo na última leitura do Vobi e ainda não têm motivo registrado. A coordenação registra o motivo aqui ou na página do projeto.",
  aguardando: "Motivos registrados pela coordenação. A Thaís valida (atraso justificado) ou define outra medida.",
  validada: "Atrasos aceitos como justificados (por exemplo, aguardando o cliente).",
  medida: "Atrasos em que a gestão definiu outra medida (redistribuir, cobrar o cliente, rever o prazo…).",
};
const br = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

/** T-287 — Atrasos: justificativa da coordenação e validação da gestão. Arquitetas não acessam. */
export default async function AtrasosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  if (!podeJustificar(u)) redirect("/sem-permissao");
  const valida = await podeValidarAtraso(u);
  const sp = await searchParams;
  const aba = ABAS.some(([k]) => k === sp.aba) ? sp.aba! : valida ? "aguardando" : "sem";
  const [n, sem] = await Promise.all([contagens(), atrasadasSemJustificativa()]);
  const lista = aba === "sem" ? [] : await porSituacao(aba);
  const volta = `/atrasos?aba=${aba}`;
  const qtd = (k: string) => (k === "sem" ? sem.length : n[k] ?? 0);

  return (
    <div>
      <PageHeader eyebrow="Central de trabalho" title="Atrasos" subtitle="Por que a tarefa atrasou e o que fazer. A coordenação registra o motivo; a Thaís valida ou define outra medida. A data continua sendo trocada no Vobi." />
      {sp.ok && <p className="mb-4 rounded-[10px] bg-[var(--ok-bg)] px-4 py-2 text-sm text-[var(--ok)]">{sp.ok}</p>}
      {sp.erro && <p className="mb-4 rounded-[10px] bg-[var(--bad-bg)] px-4 py-2 text-sm text-[var(--bad)]">{sp.erro}</p>}
      <nav className="mb-3 flex flex-wrap gap-2">
        {ABAS.map(([k, r]) => <Link key={k} href={`/atrasos?aba=${k}`} className={`pill ${k === aba ? "pill-ativa" : ""}`} style={k === aba ? { background: "var(--vinho)", color: "#fff" } : undefined}>{r} ({qtd(k)})</Link>)}
      </nav>
      <p className="mb-4 max-w-3xl text-sm text-[var(--txt-2)]">{EXPLICA[aba]}</p>

      {aba === "sem" ? (
        <Card>
          {sem.length ? <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Projeto</th><th>Etapa</th><th>Tarefa</th><th>Responsável</th><th>Prazo no Vobi</th><th>Atraso</th><th>Motivo</th></tr></thead>
            <tbody>{sem.map((t) => (
              <tr key={t.chave}>
                <td><Link className="underline" href={`/projetos/${t.projetoCodigo}`}>{t.projetoNome}</Link></td>
                <td>{t.etapa ?? "—"}</td><td>{t.nome}</td><td>{t.responsavel ?? "—"}</td><td>{br(t.dataFim)}</td>
                <td><span className="st st-relevante"><i aria-hidden /> {t.dias} d</span></td>
                <td><FormJustificar chave={t.chave} volta={volta} /></td>
              </tr>))}</tbody>
          </table></div> : <Empty>Nenhuma tarefa atrasada sem justificativa.</Empty>}
        </Card>
      ) : (
        <Card>
          {lista.length ? <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Projeto</th><th>Tarefa</th><th>Prazo no Vobi</th><th>Atraso</th><th>Justificativa</th>{aba === "aguardando" && valida && <th>Decisão</th>}</tr></thead>
            <tbody>{lista.map((j) => (
              <tr key={j.id}>
                <td>{j.projetoCodigo ? <Link className="underline" href={`/projetos/${j.projetoCodigo}`}>{j.projetoNome ?? j.projetoCodigo}</Link> : "—"}</td>
                <td>{j.tarefaNome}<div className="text-xs text-[var(--muted)]">{j.etapa}</div></td>
                <td>{br(j.prazoVobi)}</td><td>{j.diasAtraso ?? "—"} d</td>
                <td><SeloJustificativa j={j} /></td>
                {aba === "aguardando" && valida && <td>
                  <div className="grid gap-2" style={{ minWidth: 220 }}>
                    <form action={decidirAtrasoAction}><input type="hidden" name="id" value={j.id} /><input type="hidden" name="volta" value={volta} /><input type="hidden" name="situacao" value="validada" />
                      <button className="btn btn-primary">Validar: atraso justificado</button></form>
                    <details className="justif"><summary>outra medida</summary>
                      <form action={decidirAtrasoAction} className="justif-form"><input type="hidden" name="id" value={j.id} /><input type="hidden" name="volta" value={volta} /><input type="hidden" name="situacao" value="medida" />
                        <label>Medida<textarea name="decisao" rows={2} required minLength={5} className="input" placeholder="Ex.: redistribuir para outra arquiteta; cobrar o cliente; rever o prazo com a coordenação." /></label>
                        <button className="btn btn-secondary">Registrar medida</button></form>
                    </details>
                  </div>
                </td>}
              </tr>))}</tbody>
          </table></div> : <Empty>Nada nesta aba.</Empty>}
        </Card>
      )}
    </div>
  );
}
