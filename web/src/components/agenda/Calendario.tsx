import Link from "next/link";
import type { Evento } from "@/lib/agenda/sync";

/**
 * Item do calendário: compromisso do Google, atividade do A360 (T-219) ou prazo de tarefa do Vobi.
 * `quem` = iniciais da pessoa na visão consolidada; `tom` = cor do marcador.
 */
export type ItemCal = {
  chave: string; inicio: Date; fim: Date; diaInteiro: boolean; privado: boolean; titulo: string | null; local: string | null;
  tipo: string; href: string; tom?: string; quem?: string; classe?: string; dica?: string;
};
export const deEvento = (e: Evento, volta: string, quem?: string): ItemCal => ({
  chave: `g${e.id}`, inicio: e.inicio, fim: e.fim, diaInteiro: e.diaInteiro, privado: e.privado, titulo: e.titulo, local: e.local, tipo: e.tipo,
  href: `/agenda/e/${e.id}?volta=${encodeURIComponent(volta)}`, quem,
});
type NovoHref = (dia: string, h?: string) => string;
const novoPadrao = (volta: string): NovoHref => (dia, h) => `/agenda/novo?d=${dia}${h ? `&h=${h}` : ""}&volta=${encodeURIComponent(volta)}`;
import { TIPOS, type TipoEvento } from "@/lib/agenda/classificacao";
import { dataCurta, diaDe, diaSemanaCurto, hora, minutosDoDia, somaDias } from "@/lib/agenda/datas";

/** Régua das visões semana/dia: 7h–20h em linhas de 30 min; o que fica fora aparece nas faixas "antes"/"depois". */
export const HORA_INI = 7, HORA_FIM = 20;
const MIN_INI = HORA_INI * 60, MIN_FIM = HORA_FIM * 60, TOTAL = MIN_FIM - MIN_INI;

type Posicionado = { e: ItemCal; top: number; altura: number; col: number; cols: number };

/** Posiciona eventos de um dia: top/altura em % da régua; eventos sobrepostos dividem a largura. */
function posicionar(dia: string, eventos: ItemCal[]): { dentro: Posicionado[]; antes: ItemCal[]; depois: ItemCal[] } {
  const ini = new Date(`${dia}T00:00:00-03:00`).getTime(), fim = ini + 86400_000;
  const antes: ItemCal[] = [], depois: ItemCal[] = [], itens: { e: ItemCal; a: number; b: number }[] = [];
  for (const e of eventos) {
    if (e.diaInteiro) continue;
    const a0 = Math.max(e.inicio.getTime(), ini), b0 = Math.min(e.fim.getTime(), fim);
    if (b0 <= a0) continue;
    const a = a0 === ini ? 0 : minutosDoDia(new Date(a0)), bRaw = b0 === fim ? 1440 : minutosDoDia(new Date(b0)), b = Math.max(bRaw, a + 15);
    if (b <= MIN_INI) { antes.push(e); continue; }
    if (a >= MIN_FIM) { depois.push(e); continue; }
    itens.push({ e, a: Math.max(a, MIN_INI), b: Math.min(b, MIN_FIM) });
  }
  itens.sort((x, y) => x.a - y.a || y.b - x.b);
  // agrupamento de sobreposição → colunas
  const dentro: Posicionado[] = [];
  let grupo: { e: ItemCal; a: number; b: number; col: number }[] = [], fimGrupo = -1;
  const fecha = () => { const cols = Math.max(1, ...grupo.map((g) => g.col + 1)); for (const g of grupo) dentro.push({ e: g.e, top: ((g.a - MIN_INI) / TOTAL) * 100, altura: ((g.b - g.a) / TOTAL) * 100, col: g.col, cols }); grupo = []; };
  for (const it of itens) {
    if (grupo.length && it.a >= fimGrupo) fecha();
    const ocupadas = new Set(grupo.filter((g) => g.b > it.a).map((g) => g.col));
    let col = 0; while (ocupadas.has(col)) col++;
    grupo.push({ ...it, col }); fimGrupo = Math.max(fimGrupo, it.b);
  }
  if (grupo.length) fecha();
  return { dentro, antes, depois };
}

export function Tipo({ tipo, pequeno }: { tipo: string; pequeno?: boolean }) {
  const t = TIPOS[(tipo as TipoEvento) in TIPOS ? (tipo as TipoEvento) : "outro"];
  return <span className={`tipo-ev ${pequeno ? "tipo-ev-sm" : ""}`} style={{ ["--tipo" as string]: t.tom }} title={t.descricao}><i aria-hidden />{t.rotulo}</span>;
}

const rotulo = (e: ItemCal) => `${e.quem ? `${e.quem} · ` : ""}${e.privado ? "ocupado" : e.titulo ?? "(sem título)"}`;
const tomDe = (e: ItemCal) => e.tom ?? TIPOS[e.tipo as TipoEvento]?.tom ?? "var(--muted)";

function Chip({ e, comHora = true }: { e: ItemCal; volta?: string; comHora?: boolean }) {
  return (
    <Link href={e.href} className={`ev-chip ${e.privado ? "ev-priv" : ""} ${e.classe ?? ""}`} style={{ ["--tipo" as string]: tomDe(e) }} title={e.dica ?? (e.privado ? "ocupado (privado)" : `${e.diaInteiro ? "" : `${hora(e.inicio)}–${hora(e.fim)} · `}${rotulo(e)}`)}>
      {comHora && !e.diaInteiro && <b>{hora(e.inicio)}</b>} <span>{rotulo(e)}</span>
    </Link>
  );
}

/** Visão mensal: 6 semanas × 7 dias; até 3 compromissos por dia e "+N" para o dia. */
export function Mes({ dias, eventos, hoje, mesRef, volta, novo }: { dias: string[]; eventos: ItemCal[]; hoje: string; mesRef: string; volta: string; novo?: NovoHref }) {
  const porDia = agrupar(dias, eventos);
  const nv = novo ?? novoPadrao(volta);
  return (
    <div className="cal-mes" role="grid">
      {["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((d) => <div key={d} className="cal-cab" role="columnheader">{d}</div>)}
      {dias.map((dia) => {
        const lista = porDia.get(dia) ?? [], extra = lista.length - 3, foraDoMes = dia.slice(0, 7) !== mesRef.slice(0, 7);
        return (
          <div key={dia} role="gridcell" className={`cal-cel ${foraDoMes ? "cal-fora" : ""} ${dia === hoje ? "cal-hoje" : ""}`}>
            <Link href={`/agenda?v=dia&d=${dia}`} className="cal-num" aria-label={`Dia ${dia}`}>{Number(dia.slice(8, 10))}</Link>
            <div className="cal-chips">{lista.slice(0, 3).map((e) => <Chip key={e.chave} e={e} />)}</div>
            {extra > 0 && <Link href={`/agenda?v=dia&d=${dia}`} className="cal-mais">+{extra}</Link>}
            {lista.length === 0 && <Link href={nv(dia)} className="cal-novo" aria-label={`Novo compromisso em ${dataCurta(dia)}`}>+</Link>}
          </div>
        );
      })}
    </div>
  );
}

function agrupar(dias: string[], eventos: ItemCal[]) {
  const m = new Map<string, ItemCal[]>(dias.map((d) => [d, []]));
  for (const e of eventos) {
    // evento de vários dias aparece em cada dia que cobre dentro da grade
    let d = diaDe(e.inicio); const ultimo = diaDe(new Date(e.fim.getTime() - 1));
    let n = 0;
    while (d <= ultimo && n < 60) { m.get(d)?.push(e); d = somaDias(d, 1); n++; }
  }
  return m;
}

/** Visão semana (7 colunas) ou dia (1 coluna): régua de horas, eventos posicionados pela hora e duração. */
export function Semana({ dias, eventos, hoje, volta, agora, novo }: { dias: string[]; eventos: ItemCal[]; hoje: string; volta: string; agora: Date; novo?: NovoHref }) {
  const porDia = agrupar(dias, eventos);
  const nv = novo ?? novoPadrao(volta);
  const horas = Array.from({ length: HORA_FIM - HORA_INI }, (_, i) => HORA_INI + i);
  const minAgora = minutosDoDia(agora), linhaAgora = minAgora > MIN_INI && minAgora < MIN_FIM ? ((minAgora - MIN_INI) / TOTAL) * 100 : null;
  const umDia = dias.length === 1;
  return (
    <div className={`cal-sem ${umDia ? "cal-sem-dia" : ""}`} style={{ ["--cols" as string]: dias.length }}>
      <div className="cal-sem-cab">
        <div className="cal-sem-canto" />
        {dias.map((dia) => (
          <div key={dia} className={`cal-sem-dia-cab ${dia === hoje ? "cal-hoje" : ""}`}>
            <Link href={`/agenda?v=dia&d=${dia}`}><span>{diaSemanaCurto(dia)}</span> <b>{Number(dia.slice(8, 10))}</b></Link>
            <div className="cal-inteiro">{(porDia.get(dia) ?? []).filter((e) => e.diaInteiro).map((e) => <Chip key={e.chave} e={e} comHora={false} />)}</div>
            {(() => { const p = posicionar(dia, porDia.get(dia) ?? []); return p.antes.length ? <div className="cal-fora-hora">antes das {HORA_INI}h: {p.antes.map((e) => <Chip key={e.chave} e={e} />)}</div> : null; })()}
          </div>
        ))}
      </div>
      <div className="cal-sem-corpo">
        <div className="cal-regua">{horas.map((h) => <div key={h}><span>{String(h).padStart(2, "0")}:00</span></div>)}</div>
        {dias.map((dia) => {
          const p = posicionar(dia, porDia.get(dia) ?? []);
          return (
            <div key={dia} className={`cal-col ${dia === hoje ? "cal-hoje" : ""}`}>
              {horas.map((h) => <Link key={h} href={nv(dia, `${String(h).padStart(2, "0")}:00`)} className="cal-slot" aria-label={`Novo compromisso ${dataCurta(dia)} às ${h}h`} />)}
              {dia === hoje && linhaAgora !== null && <div className="cal-agora" style={{ top: `${linhaAgora}%` }} />}
              {p.dentro.map(({ e, top, altura, col, cols }) => (
                <Link key={e.chave} href={e.href} className={`ev-bloco ${e.privado ? "ev-priv" : ""} ${altura < 5 ? "ev-curto" : ""} ${e.classe ?? ""}`}
                  style={{ top: `${top}%`, height: `${altura}%`, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)`, ["--tipo" as string]: tomDe(e) }}
                  title={e.dica ?? (e.privado ? "ocupado (privado)" : `${hora(e.inicio)}–${hora(e.fim)} · ${rotulo(e)}${e.local ? ` · ${e.local}` : ""}`)}>
                  <b>{rotulo(e)}</b>
                  <span>{hora(e.inicio)}–{hora(e.fim)}{umDia && e.local && !e.privado ? ` · ${e.local}` : ""}</span>
                  {umDia && !e.privado && altura > 8 && e.tipo in TIPOS && <Tipo tipo={e.tipo} pequeno />}
                </Link>
              ))}
              {p.depois.length > 0 && <div className="cal-fora-hora cal-fora-baixo">depois das {HORA_FIM}h: {p.depois.map((e) => <Chip key={e.chave} e={e} />)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Legenda() {
  return <div className="flex flex-wrap items-center gap-2 text-[0.72rem] text-[var(--muted)]"><span>Tipo:</span>{(Object.keys(TIPOS) as TipoEvento[]).map((t) => <Tipo key={t} tipo={t} pequeno />)}<span>· clique num horário vazio para marcar</span></div>;
}
