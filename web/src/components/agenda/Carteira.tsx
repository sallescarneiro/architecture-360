// Etapa C da Agenda de Produção: selos de situação do projeto e de comunicação da semana.
import { COMUNICACAO, SITUACOES } from "@/lib/agenda/carteira";

const COR_SIT: Record<string, string> = { andamento: "bg-[#e2f1e6] text-[#21613a]", cliente: "bg-[#fff1d6] text-[#7a4b00]", pausado: "bg-[#efebe8] text-[#5f5752]", concluido: "bg-[#e6edf6] text-[#24456b]" };
const COR_COM: Record<string, string> = { feita: "bg-[#e2f1e6] text-[#21613a]", pendente: "bg-[#fbe2dd] text-[#962b19]", na: "bg-[#efebe8] text-[#5f5752]" };
export function SelSituacao({ s }: { s: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-px text-[0.68rem] font-bold ${COR_SIT[s] ?? ""}`}>{SITUACOES[s]?.rotulo ?? s}</span>;
}
export function SelComunicacao({ s }: { s: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-px text-[0.68rem] font-bold ${COR_COM[s] ?? ""}`}>{COMUNICACAO[s]?.rotulo ?? s}</span>;
}
const COR_CARGA: Record<string, [string, string, string]> = { normal: ["Normal", "bg-[#e2f1e6] text-[#21613a]", "#3f8b5c"], alta: ["Carga alta", "bg-[#fff1d6] text-[#7a4b00]", "#d39b2a"], sobrecarga: ["Sobrecarga", "bg-[#fbe2dd] text-[#962b19]", "#c0503a"] };
export function SelCarga({ c }: { c: string }) {
  const x = COR_CARGA[c] ?? COR_CARGA.normal;
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-px text-[0.68rem] font-bold ${x[1]}`}>{x[0]}</span>;
}
export const corCarga = (c: string) => (COR_CARGA[c] ?? COR_CARGA.normal)[2];
