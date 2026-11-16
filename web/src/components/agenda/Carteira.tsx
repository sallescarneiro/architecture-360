// Etapa C da Agenda de Produção: selos de situação do projeto e de comunicação da semana.
import { COMUNICACAO, SITUACOES } from "@/lib/agenda/carteira";

// T-237: status por ponto + texto (sem pílula colorida); só "pendente" ganha cor no texto
const PONTO: Record<string, string> = { andamento: "#2f6b3a", cliente: "#9a5a00", pausado: "#8a7f79", concluido: "#24456b" };
export function SelSituacao({ s }: { s: string }) {
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[0.8rem]"><i aria-hidden="true" className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: PONTO[s] ?? "#8a7f79" }} />{SITUACOES[s]?.rotulo ?? s}</span>;
}
export function SelComunicacao({ s }: { s: string }) {
  return <span className={`whitespace-nowrap text-[0.8rem] ${s === "pendente" ? "font-semibold text-[var(--bad)]" : s === "na" ? "text-[var(--muted)]" : ""}`}>{COMUNICACAO[s]?.rotulo ?? s}</span>;
}
const COR_CARGA: Record<string, [string, string, string]> = { normal: ["Normal", "bg-[#e2f1e6] text-[#21613a]", "#3f8b5c"], alta: ["Carga alta", "bg-[#fff1d6] text-[#7a4b00]", "#d39b2a"], sobrecarga: ["Sobrecarga", "bg-[#fbe2dd] text-[#962b19]", "#c0503a"] };
export function SelCarga({ c }: { c: string }) {
  const x = COR_CARGA[c] ?? COR_CARGA.normal;
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-px text-[0.68rem] font-bold ${x[1]}`}>{x[0]}</span>;
}
export const corCarga = (c: string) => (COR_CARGA[c] ?? COR_CARGA.normal)[2];
