// Etapa A da Agenda de Produção: peças visuais compartilhadas (bloco de produção, selos).
import Link from "next/link";
import { etapa, rotuloPeriodo, VALIDACAO, type Atividade } from "@/lib/agenda/producao";

/** Nome curto do projeto: o que vem depois do primeiro " - " ("FR_PROJETO DE PERSONALIZAÇÃO - BODY FIT" → "BODY FIT"). */
export function curto(nome: string | null | undefined): string {
  if (!nome) return "Sem projeto";
  const i = nome.indexOf(" - ");
  return (i > 0 ? nome.slice(i + 3) : nome).trim();
}

// T-237 (2ª rodada): selo só como texto; cor apenas no que pede ação (aguardando, devolvida)
const COR_VAL: Record<string, string> = { aguardando: "text-[#8a5200]", aprovada: "text-[var(--muted)]", devolvida: "text-[var(--bad)]", rascunho: "text-[var(--muted)]", confirmada: "text-[var(--muted)]" };
export function SeloValidacao({ v, sempre = false }: { v: string; sempre?: boolean }) {
  if (v === "confirmada" && !sempre) return null;
  return <span className={`inline-flex items-center text-[0.68rem] font-semibold ${COR_VAL[v] ?? ""}`}>{VALIDACAO[v]?.rotulo ?? v}</span>;
}
export function ChipEtapa({ k }: { k: string | null }) {
  const e = etapa(k);
  if (!e) return null;
  // T-237: sigla em vinho sobre rosé claro, em vez de uma cor por etapa (visual limpo, Caderno de Marca)
  return <span className="rounded-[5px] bg-[var(--rose-2)] px-1.5 py-px text-[0.66rem] font-bold tracking-wide text-[var(--vinho)]" title={e.n}>{e.k}</span>;
}
export function Entrega() {
  return <span className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--vinho)] px-1.5 py-px text-[0.62rem] font-bold tracking-wider text-white"><svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l10 10-10 10L2 12z" /></svg>ENTREGA</span>;
}
const STATUS: Record<number, string> = { 1: "Planejada", 2: "Em andamento", 4: "Concluída", 5: "Cancelada" };

/** Bloco de produção no quadro: etapa, período, projeto, entrega, validação e andamento. */
export function Bloco({ a, projeto, href, selecionado, apagado }: { a: Atividade; projeto: string | null; href: string; selecionado?: boolean; apagado?: boolean }) {
  const titulo = a.etapaRucelle ? curto(projeto) : a.titulo;
  const borda = a.entrega ? "border-2 border-[var(--vinho)] bg-white" : a.validacao === "rascunho" ? "border border-dashed border-[#b9aea7] bg-white" : a.validacao === "aguardando" || a.validacao === "devolvida" ? "border border-[var(--line)] bg-white" : "border border-transparent bg-[var(--rose-2)]";
  return (
    <Link href={href} scroll={false} className={`flex flex-col gap-0.5 rounded-[9px] px-2 py-1.5 text-[0.75rem] no-underline text-[var(--txt)] hover:border-[#e8c8bd] ${borda} ${selecionado ? "ring-2 ring-[rgba(91,13,13,.25)]" : ""} ${apagado ? "opacity-30" : ""}`}
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
