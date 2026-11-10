// Regra central de status de prazo (T-196, seção 5). Uma função pura usada em cartões, tabelas, listas e filtros.
// Entrada: status da tarefa no Vobi (normalizado), data de fim (AAAA-MM-DD ou null) e a data de hoje.
// Saída: um e só um status. Faixas por dias inteiros, sem sobreposição:
//   d = fim − hoje:  …−31 crítico · −30…−8 relevante · −7…−1 recente · 0 hoje · 1…7 em breve · 8… no prazo · sem fim = sem prazo

export type StatusPrazo =
  | "concluida" | "cancelada"
  | "atrasada_30" | "atrasada_8_30" | "atrasada_1_7"
  | "vence_hoje" | "vence_7" | "no_prazo" | "sem_prazo";

export type PrazoInfo = { status: StatusPrazo; dias: number | null; atrasada: boolean; aberta: boolean };

export const STATUS_PRAZO: Record<StatusPrazo, { rotulo: string; tom: "critico" | "relevante" | "recente" | "hoje" | "breve" | "ok" | "neutro"; grupo: "fechada" | "atrasada" | "proxima" | "no_prazo" | "sem_prazo" }> = {
  concluida:     { rotulo: "concluída",            tom: "ok",        grupo: "fechada" },
  cancelada:     { rotulo: "cancelada",            tom: "neutro",    grupo: "fechada" },
  atrasada_30:   { rotulo: "atrasada há mais de 30 dias", tom: "critico", grupo: "atrasada" },
  atrasada_8_30: { rotulo: "atrasada há 8 a 30 dias",     tom: "relevante", grupo: "atrasada" },
  atrasada_1_7:  { rotulo: "atrasada há 1 a 7 dias",      tom: "recente",   grupo: "atrasada" },
  vence_hoje:    { rotulo: "vence hoje",           tom: "hoje",      grupo: "proxima" },
  vence_7:       { rotulo: "vence em até 7 dias",  tom: "breve",     grupo: "proxima" },
  no_prazo:      { rotulo: "no prazo",             tom: "ok",        grupo: "no_prazo" },
  sem_prazo:     { rotulo: "sem prazo",            tom: "neutro",    grupo: "sem_prazo" },
};

/** Filtros de prazo aceitos na URL (?prazo=…) e o conjunto de status que cada um cobre. */
export const FILTROS_PRAZO: Record<string, { rotulo: string; status: StatusPrazo[] }> = {
  atrasadas:   { rotulo: "Atrasadas",             status: ["atrasada_30", "atrasada_8_30", "atrasada_1_7"] },
  atrasada_30: { rotulo: "Atrasadas há mais de 30 dias", status: ["atrasada_30"] },
  atrasada_8_30: { rotulo: "Atrasadas há 8 a 30 dias", status: ["atrasada_8_30"] },
  atrasada_1_7: { rotulo: "Atrasadas há 1 a 7 dias", status: ["atrasada_1_7"] },
  hoje:        { rotulo: "Vencem hoje",           status: ["vence_hoje"] },
  "7d":        { rotulo: "Vencem em até 7 dias",  status: ["vence_7"] },
  proximas:    { rotulo: "Hoje e próximos 7 dias", status: ["vence_hoje", "vence_7"] },
  atencao:     { rotulo: "Atrasadas e próximos 7 dias", status: ["atrasada_30", "atrasada_8_30", "atrasada_1_7", "vence_hoje", "vence_7"] },
  no_prazo:    { rotulo: "No prazo",              status: ["no_prazo"] },
  sem_prazo:   { rotulo: "Sem prazo",             status: ["sem_prazo"] },
  abertas:     { rotulo: "Abertas",               status: ["atrasada_30", "atrasada_8_30", "atrasada_1_7", "vence_hoje", "vence_7", "no_prazo", "sem_prazo"] },
  concluidas:  { rotulo: "Concluídas",            status: ["concluida"] },
  canceladas:  { rotulo: "Canceladas",            status: ["cancelada"] },
};

/** Data de hoje no fuso da Rucelle (America/Sao_Paulo), em AAAA-MM-DD. */
export function hojeIso(agora: Date = new Date()): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(agora); // en-CA produz AAAA-MM-DD
}

/** Diferença em dias inteiros entre duas datas AAAA-MM-DD (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400_000);
}

export function statusPrazo(statusVobi: string | null | undefined, dataFim: string | null | undefined, hoje: string): PrazoInfo {
  const s = (statusVobi ?? "").trim().toLowerCase();
  if (s === "concluido" || s === "concluído" || s === "concluida" || s === "concluída") return { status: "concluida", dias: null, atrasada: false, aberta: false };
  if (s === "cancelado" || s === "cancelada") return { status: "cancelada", dias: null, atrasada: false, aberta: false };
  if (!dataFim) return { status: "sem_prazo", dias: null, atrasada: false, aberta: true };
  const d = diasEntre(hoje, dataFim); // negativo = já passou
  if (d <= -31) return { status: "atrasada_30", dias: d, atrasada: true, aberta: true };
  if (d <= -8) return { status: "atrasada_8_30", dias: d, atrasada: true, aberta: true };
  if (d <= -1) return { status: "atrasada_1_7", dias: d, atrasada: true, aberta: true };
  if (d === 0) return { status: "vence_hoje", dias: 0, atrasada: false, aberta: true };
  if (d <= 7) return { status: "vence_7", dias: d, atrasada: false, aberta: true };
  return { status: "no_prazo", dias: d, atrasada: false, aberta: true };
}

/** Texto curto para a pílula: "atrasada 12 d", "vence hoje", "em 4 dias", "no prazo", "sem prazo". */
export function rotuloCurto(p: PrazoInfo): string {
  switch (p.status) {
    case "atrasada_30": case "atrasada_8_30": case "atrasada_1_7": return `atrasada ${Math.abs(p.dias ?? 0)} d`;
    case "vence_hoje": return "vence hoje";
    case "vence_7": return p.dias === 1 ? "amanhã" : `em ${p.dias} dias`;
    case "no_prazo": return "no prazo";
    case "sem_prazo": return "sem prazo";
    case "concluida": return "concluída";
    case "cancelada": return "cancelada";
  }
}

/**
 * Mesma regra em SQL (para contagens e filtros no banco), sobre as colunas de `tarefa`.
 * `hoje` deve ser AAAA-MM-DD já validado (vem de hojeIso, nunca do usuário).
 */
export function sqlStatusPrazo(hoje: string, alias = "t"): string {
  const fim = `${alias}.data_fim::date`, h = `date '${hoje}'`;
  return `case
    when ${alias}.status in ('concluido','concluído','concluida','concluída') then 'concluida'
    when ${alias}.status in ('cancelado','cancelada') then 'cancelada'
    when ${alias}.data_fim is null or ${alias}.data_fim = '' then 'sem_prazo'
    when ${fim} - ${h} <= -31 then 'atrasada_30'
    when ${fim} - ${h} <= -8 then 'atrasada_8_30'
    when ${fim} - ${h} <= -1 then 'atrasada_1_7'
    when ${fim} - ${h} = 0 then 'vence_hoje'
    when ${fim} - ${h} <= 7 then 'vence_7'
    else 'no_prazo' end`;
}

/** Projeto pausado não gera cobrança de prazo (decisão de 10/11/2026, T-211): as tarefas dele saem das listas,
 *  do Meu Dia e das contagens de abertas/atrasadas. `col` = coluna projeto_codigo da tarefa (ex.: "t.projeto_codigo"). */
export const sqlForaDePausado = (col: string) => `not exists (select 1 from projeto pz where pz.codigo=${col} and pz.status_classe='pausado')`;
