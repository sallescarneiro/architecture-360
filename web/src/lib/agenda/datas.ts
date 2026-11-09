// Datas da Agenda no fuso da Rucelle (America/Sao_Paulo), sem biblioteca. Dias são "AAAA-MM-DD" locais; instantes são Date.
export const FUSO = "America/Sao_Paulo";
const OFFSET = "-03:00"; // Goiânia/Brasília não têm horário de verão desde 2019

export function hojeLocal(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}
export const diaValido = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T12:00:00Z"));
export function somaDias(dia: string, n: number): string { const d = new Date(dia + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function somaMeses(dia: string, n: number): string { const d = new Date(dia + "T12:00:00Z"); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); }
/** Segunda-feira da semana do dia. */
export function inicioSemana(dia: string): string { const d = new Date(dia + "T12:00:00Z"); const dow = (d.getUTCDay() + 6) % 7; return somaDias(dia, -dow); }
export const inicioMes = (dia: string) => dia.slice(0, 8) + "01";
export const inicioDoDia = (dia: string) => new Date(`${dia}T00:00:00${OFFSET}`);
export const fimDoDia = (dia: string) => new Date(`${dia}T23:59:59.999${OFFSET}`);
/** Dia local (AAAA-MM-DD) de um instante. */
export const diaDe = (t: Date) => hojeLocal(t);
/** Minutos desde a meia-noite local. */
export function minutosDoDia(t: Date): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(t);
  const h = Number(p.find((x) => x.type === "hour")!.value) % 24, m = Number(p.find((x) => x.type === "minute")!.value);
  return h * 60 + m;
}
export const hora = (t: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }).format(t);
export const dataCurta = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
export const dataLonga = (dia: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(dia + "T12:00:00Z"));
export const diaSemanaCurto = (dia: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short" }).format(new Date(dia + "T12:00:00Z")).replace(".", "");
export const mesAno = (dia: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, month: "long", year: "numeric" }).format(new Date(dia + "T12:00:00Z"));
export const dataHora = (t: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" }).format(t);
export function duracao(a: Date, b: Date): string { const m = Math.round((b.getTime() - a.getTime()) / 60000); if (m < 60) return `${m} min`; const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${r} min` : `${h} h`; }
/** "HH:MM" local de um instante, para preencher formulários. */
export const horaInput = (t: Date) => { const m = minutosDoDia(t); return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
