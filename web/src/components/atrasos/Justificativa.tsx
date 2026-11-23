// T-287 — formulário "justificar atraso" e marcador da justificativa (usados na página do projeto e em /atrasos).
import { CATEGORIAS, CATEGORIA_CURTA, SITUACAO, type Justificativa } from "@/lib/atrasos";
import { justificarAtrasoAction } from "@/app/(app)/atrasos/actions";
import { Badge } from "@/components/ui";

const dt = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const br = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

export function FormJustificar({ chave, volta }: { chave: string; volta: string }) {
  return (
    <details className="justif">
      <summary>justificar atraso</summary>
      <form action={justificarAtrasoAction} className="justif-form">
        <input type="hidden" name="chave" value={chave} /><input type="hidden" name="volta" value={volta} />
        <label>Categoria<select name="categoria" required className="input" defaultValue="">
          <option value="" disabled>escolha…</option>
          {Object.entries(CATEGORIAS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select></label>
        <label>Motivo<textarea name="motivo" rows={2} required minLength={5} className="input" placeholder="Ex.: cliente enviou o levantamento com medidas erradas; medidas corretas recebidas em 16/11." /></label>
        <label>Nova data combinada (opcional)<input type="date" name="nova_data" className="input" /></label>
        <p className="justif-nota">O A360 não altera o Vobi: troque a data lá também.</p>
        <button className="btn btn-primary">Registrar justificativa</button>
      </form>
    </details>
  );
}

export function SeloJustificativa({ j }: { j: Justificativa }) {
  const s = SITUACAO[j.situacao] ?? SITUACAO.aguardando;
  return (
    <div className="justif-selo">
      <Badge tone={s.tom}>{s.rotulo}</Badge>
      <span className="justif-texto"><b>{CATEGORIA_CURTA[j.categoria] ?? j.categoria}:</b> {j.motivo}{j.novaData ? ` · nova data ${br(j.novaData)}` : ""} <span className="justif-meta">({j.registradoPor}, {dt(j.registradoEm)})</span></span>
      {j.decisao && <span className="justif-texto"><b>Decisão:</b> {j.decisao} <span className="justif-meta">({j.decididoPor})</span></span>}
    </div>
  );
}
