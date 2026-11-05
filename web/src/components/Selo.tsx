import type { Selo as SeloT } from "@/lib/consultas";

/** Selo de cobertura (seção 2.2 da especificação): o indicador nunca aparece sem dizer quantas tarefas ficaram de fora. */
export function Selo({ s, rotulo = "tarefas elegíveis" }: { s: SeloT; rotulo?: string }) {
  const pct = s.total ? Math.round((s.base / s.total) * 100) : 0;
  const baixo = pct < 60;
  return (
    <div className={`mt-2 text-[0.72rem] leading-snug ${baixo ? "text-[var(--warn)]" : "text-[var(--muted)]"}`}>
      <span className="tag mr-1.5 text-[var(--muted)]">calculado</span>
      Base: {s.base} de {s.total} {rotulo} ({pct}%) · carga {s.cargaId} de {s.dataCarga}{baixo && " · cobertura baixa"}
    </div>
  );
}
