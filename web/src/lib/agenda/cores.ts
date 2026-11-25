// T-310 (25/11/2026): a agenda do A360 usa a mesma paleta de cores de evento do Google Agenda.
// Compromisso do Google: a cor dele (colorId) ou, sem cor própria, a cor da agenda. Cor trocada no A360 vai para o Google.
// Atividade do A360 (não existe no Google): cor escolhida ou, por padrão, a cor da etapa.
export const CORES_GOOGLE: Record<string, { nome: string; hex: string }> = {
  "1": { nome: "Lavanda", hex: "#7986cb" }, "2": { nome: "Sálvia", hex: "#33b679" }, "3": { nome: "Uva", hex: "#8e24aa" },
  "4": { nome: "Flamingo", hex: "#e67c73" }, "5": { nome: "Banana", hex: "#f6bf26" }, "6": { nome: "Tangerina", hex: "#f4511e" },
  "7": { nome: "Pavão", hex: "#039be5" }, "8": { nome: "Grafite", hex: "#616161" }, "9": { nome: "Mirtilo", hex: "#3f51b5" },
  "10": { nome: "Manjericão", hex: "#0b8043" }, "11": { nome: "Tomate", hex: "#d50000" },
};
export const corValida = (v: unknown): string | null => (typeof v === "string" && v in CORES_GOOGLE ? v : null);

/** Cor padrão de cada etapa de produção, na paleta do Google. */
const POR_ETAPA: Record<string, string> = { LEV: "8", PN: "1", LAY: "7", "3D": "3", V3D: "4", REF: "11", RLAY: "11", R3D: "11", REXE: "11", RINT: "11", INT: "2", EXE: "9", LEG: "8", CF: "6" };

export function hexAtividade(a: { cor?: string | null; etapaRucelle?: string | null; vinculo?: string | null }): string {
  const id = corValida(a.cor) ?? (a.etapaRucelle ? POR_ETAPA[a.etapaRucelle] : null) ?? (a.vinculo === "independente" ? "10" : "7");
  return CORES_GOOGLE[id].hex;
}
export function hexEvento(e: { corGoogle?: string | null; calendarioId?: string | null }, calendarios?: { id: string; cor?: string | null }[]): string | null {
  const c = corValida(e.corGoogle); if (c) return CORES_GOOGLE[c].hex;
  const cal = calendarios?.find((k) => k.id === e.calendarioId) ?? calendarios?.find((k) => (k as { primario?: boolean }).primario);
  return cal?.cor || null;
}
/** Texto branco ou grafite, conforme o fundo (Banana e outras claras pedem texto escuro). */
export function textoSobre(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return "#fff";
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.66 ? "#1f1f1f" : "#fff";
}
