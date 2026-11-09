import Link from "next/link";
import type { ReactNode } from "react";
import { TAMANHOS, urlCom } from "@/lib/listas";

type Atual = Record<string, string | number | null | undefined | boolean>;

/** Cabeçalho de coluna ordenável: link que alterna asc/desc e mostra a seta na coluna ativa. */
export function Th({ base, atual, chave, children, ordAtual, dirAtual }: { base: string; atual: Atual; chave: string; children: ReactNode; ordAtual: string; dirAtual: "asc" | "desc" }) {
  const on = ordAtual === chave;
  const prox = on && dirAtual === "asc" ? "desc" : "asc";
  return (
    <th aria-sort={on ? (dirAtual === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={urlCom(base, atual, { ord: chave, dir: prox, pag: null })} aria-sort={on ? (dirAtual === "asc" ? "ascending" : "descending") : undefined} title={`Ordenar por ${String(children)}`}>
        {children}{on ? <span aria-hidden>{dirAtual === "asc" ? "▲" : "▼"}</span> : <span aria-hidden className="opacity-30">↕</span>}
      </Link>
    </th>
  );
}

/** Chips de filtros ativos, cada um com "×" para remover só aquele, mais "limpar tudo". */
export function Chips({ base, atual, itens, limparPara }: { base: string; atual: Atual; itens: { chave: string; rotulo: string; valor: ReactNode }[]; limparPara: string }) {
  if (!itens.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[0.8rem]">
      <span className="text-[var(--muted)]">Filtros:</span>
      {itens.map((i) => <span key={i.chave} className="chip">{i.rotulo}: <b>{i.valor}</b><Link href={urlCom(base, atual, { [i.chave]: null, pag: null })} aria-label={`Remover filtro ${i.rotulo}`} title="Remover filtro">×</Link></span>)}
      <Link href={limparPara} className="text-[var(--vinho)] underline">limpar filtros</Link>
    </div>
  );
}

/** Paginação por links (funciona sem JavaScript) + tamanho da página. */
export function Paginacao({ base, atual, total, pag, n }: { base: string; atual: Atual; total: number; pag: number; n: number }) {
  const paginas = Math.max(1, Math.ceil(total / n));
  const ini = total ? (pag - 1) * n + 1 : 0, fim = Math.min(total, pag * n);
  const vis = [...new Set([1, pag - 1, pag, pag + 1, paginas].filter((p) => p >= 1 && p <= paginas))].sort((a, b) => a - b);
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[0.78rem] text-[var(--muted)]">
      <span>Mostrando <b className="text-[var(--txt)]">{ini}–{fim}</b> de <b className="text-[var(--txt)]">{total}</b> · por página:{" "}
        {TAMANHOS.map((t, i) => <span key={t}>{i > 0 && <span className="mx-1">·</span>}<Link href={urlCom(base, atual, { n: t, pag: null })} className={t === n ? "font-semibold text-[var(--vinho)]" : "underline"}>{t}</Link></span>)}</span>
      {paginas > 1 && (
        <nav aria-label="Paginação" className="flex items-center gap-1">
          <Link aria-disabled={pag <= 1} className={`btn btn-secondary btn-sm ${pag <= 1 ? "pointer-events-none opacity-40" : ""}`} href={urlCom(base, atual, { pag: pag - 1 })}>‹</Link>
          {vis.map((p, i) => (
            <span key={p} className="flex items-center gap-1">
              {i > 0 && vis[i - 1] < p - 1 && <span className="px-1">…</span>}
              <Link href={urlCom(base, atual, { pag: p })} aria-current={p === pag ? "page" : undefined} className={`btn btn-sm ${p === pag ? "btn-primary" : "btn-secondary"}`}>{p}</Link>
            </span>
          ))}
          <Link aria-disabled={pag >= paginas} className={`btn btn-secondary btn-sm ${pag >= paginas ? "pointer-events-none opacity-40" : ""}`} href={urlCom(base, atual, { pag: pag + 1 })}>›</Link>
        </nav>
      )}
    </div>
  );
}

/** Estado vazio de lista filtrada: diz o que está filtrado e como limpar. */
export function VazioFiltrado({ temFiltro, limparPara, children }: { temFiltro: boolean; limparPara: string; children: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-[var(--line)] bg-[var(--surface-2)] px-4 py-8 text-center text-sm text-[var(--muted)]">
      {children}
      {temFiltro && <div className="mt-2"><Link href={limparPara} className="underline">Limpar filtros</Link></div>}
    </div>
  );
}
