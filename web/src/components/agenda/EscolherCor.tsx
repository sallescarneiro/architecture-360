// T-310 — escolha de cor com a paleta do Google Agenda (bolinhas clicáveis, sem JavaScript: radio nativo).
import { CORES_GOOGLE } from "@/lib/agenda/cores";

export function EscolherCor({ nome, valor, padrao, dica }: { nome: string; valor: string | null; padrao: string; dica?: string }) {
  return (
    <fieldset className="cores">
      <legend className="text-xs font-semibold text-[var(--txt-2)]">Cor na agenda</legend>
      <div className="cores-lista">
        <label className="cor cor-padrao" title={padrao}><input type="radio" name={nome} value="" defaultChecked={!valor} /><span aria-hidden>↺</span><em>{padrao}</em></label>
        {Object.entries(CORES_GOOGLE).map(([id, c]) => (
          <label key={id} className="cor" title={c.nome}><input type="radio" name={nome} value={id} defaultChecked={valor === id} /><span aria-hidden style={{ background: c.hex }} /><em className="sr-only">{c.nome}</em></label>
        ))}
      </div>
      {dica && <p className="mt-1 text-[0.72rem] text-[var(--muted)]">{dica}</p>}
    </fieldset>
  );
}
