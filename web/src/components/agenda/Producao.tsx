// Etapa A da Agenda de Produção: peças visuais compartilhadas (bloco de produção, selos).
import Link from "next/link";
import { etapa, rotuloPeriodo, VALIDACAO, type Atividade } from "@/lib/agenda/producao";

/** Nome curto do projeto: o que vem depois do primeiro " - " ("FR_PROJETO DE PERSONALIZAÇÃO - BODY FIT" → "BODY FIT"). */
export function curto(nome: string | null | undefined): string {
  if (!nome) return "Sem projeto";
  const i = nome.indexOf(" - ");
  return (i > 0 ? nome.slice(i + 3) : nome).trim();
}

const COR_VAL: Record<string, string> = { aguardando: "bg-[#fff1d6] text-[#7a4b00]", aprovada: "bg-[#e2f1e6] text-[#21613a]", devolvida: "bg-[#fbe2dd] text-[#962b19]", rascunho: "bg-[#efebe8] text-[#5f5752]", confirmada: "bg-[#efe9f6] text-[#4b3470]" };
export function SeloValidacao({ v, sempre = false }: { v: string; sempre?: boolean }) {
  if (v === "confirmada" && !sempre) return null;
  return <span className={`inline-flex items-center rounded-full px-2 py-px text-[0.68rem] font-bold ${COR_VAL[v] ?? ""}`}>{VALIDACAO[v]?.rotulo ?? v}</span>;
}
export function ChipEtapa({ k }: { k: string | null }) {
  const e = etapa(k);
  if (!e) return null;
  return <span className="rounded-[5px] px-1.5 py-px text-[0.66rem] font-bold" style={{ background: e.bg, color: e.fg }} title={e.n}>{e.k}</span>;
}
export function Entrega() {
  return <span className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--vinho)] px-1.5 py-px text-[0.62rem] font-bold tracking-wider text-white"><svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l10 10-10 10L2 12z" /></svg>ENTREGA</span>;
}
const STATUS: Record<number, string> = { 1: "Planejada", 2: "Em andamento", 4: "Concluída", 5: "Cancelada" };

/** Bloco de produção no quadro: etapa, período, projeto, entrega, validação e andamento. */
export function Bloco({ a, projeto, href, selecionado, apagado }: { a: Atividade; projeto: string | null; href: string; selecionado?: boolean; apagado?: boolean }) {
  const titulo = a.etapaRucelle ? curto(projeto) : a.titulo;
  const borda = a.entrega ? "border-2 border-[var(--vinho)]" : a.validacao === "rascunho" ? "border border-dashed border-[#b9aea7] bg-[#fcfaf8]" : "border border-[var(--line)]";
  return (
    <Link href={href} scroll={false} className={`flex flex-col gap-0.5 rounded-[9px] bg-white px-2 py-1.5 text-[0.75rem] no-underline text-[var(--txt)] shadow-[0_1px_1px_rgba(91,13,13,.04)] hover:border-[#c9b4a8] ${borda} ${selecionado ? "ring-2 ring-[rgba(91,13,13,.25)]" : ""} ${apagado ? "opacity-30" : ""}`}
      aria-label={`${titulo}, ${etapa(a.etapaRucelle)?.n ?? "atividade"}, ${rotuloPeriodo(a)}${a.entrega ? ", entrega" : ""}${a.validacao !== "confirmada" ? `, ${VALIDACAO[a.validacao]?.rotulo}` : ""}`}>
      <span className="flex flex-wrap items-center gap-1"><ChipEtapa k={a.etapaRucelle} /><span className="text-[0.66rem] font-semibold text-[var(--muted)]">{rotuloPeriodo(a)}</span>{a.vinculo !== "independente" && <span className="text-[0.62rem] font-bold text-[#2c4373]">VOBI</span>}</span>
      <span className="font-semibold leading-tight">{titulo}</span>
      <span className="flex flex-wrap items-center gap-1">
        {a.entrega && <Entrega />}
        <SeloValidacao v={a.validacao} />
        {a.impedimento ? <span className="text-[0.66rem] font-bold text-[var(--bad)]">Impedimento</span> : a.status !== 1 && <span className="text-[0.66rem] text-[var(--muted)]">{STATUS[a.status]}</span>}
      </span>
    </Link>
  );
}
