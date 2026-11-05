import type { Selo as SeloT } from "@/lib/consultas";

/** Selo de cobertura (seção 2.2): o indicador nunca aparece sem dizer quantas tarefas ficaram de fora. */
export function Selo({ s, rotulo = "tarefas elegíveis" }: { s: SeloT; rotulo?: string }) {
  const pct = s.total ? Math.round((s.base / s.total) * 100) : 0;
  const baixo = pct < 60;
  return (
    <div className={`selo ${baixo ? "text-orange-700" : ""}`}>
      Base: {s.base} de {s.total} {rotulo} ({pct}%) · carga {s.cargaId} de {s.dataCarga}{baixo && " · cobertura baixa"}
    </div>
  );
}
