// T-219 — Regras de sincronização A360 ↔ Vobi (plano aprovado por Rodrigo em 12/11/2026). Funções puras, sem banco e sem rede.
// Programação (nome, etapa, responsável, início, término, prioridade): vale a última alteração; mudanças em campos
// diferentes se combinam; o MESMO campo alterado dos dois lados desde a última versão combinada vai para Conflitos.
// Execução (status): é do Vobi — o A360 só pede Cancelado.
import type { CamposVobi } from "@/db/schema";

export type Campo = keyof CamposVobi;
export const CAMPOS_PROGRAMACAO: Campo[] = ["nome", "idEtapa", "idResponsavel", "inicio", "fim", "prioridade"];
export const CAMPOS_SINC: Campo[] = [...CAMPOS_PROGRAMACAO, "status"];
export const NOME_CAMPO: Record<Campo, string> = {
  nome: "Nome da tarefa", idEtapa: "Etapa", idResponsavel: "Responsável", inicio: "Data de início", fim: "Data de término",
  prioridade: "Prioridade", status: "Status", duracaoDias: "Duração (dias)",
};

const norm = (v: unknown): string | number | null => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v);
  // datas comparadas pelo instante (o Vobi pode devolver o mesmo horário com outra grafia)
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const t = Date.parse(s); return Number.isNaN(t) ? s : t; }
  return s.trim();
};
export const igual = (a: unknown, b: unknown) => norm(a) === norm(b);

/** Campos de programação em que `novo` difere de `base` (o que precisa ir ao Vobi). */
export function diferencas(base: CamposVobi | null | undefined, novo: CamposVobi, campos: Campo[] = CAMPOS_PROGRAMACAO): CamposVobi {
  const out: CamposVobi = {};
  for (const c of campos) if (c in novo && !igual(novo[c], base?.[c])) (out as Record<string, unknown>)[c] = novo[c];
  return out;
}

export type Reconciliacao = {
  adotar: CamposVobi; // mudou no Vobi e o A360 não tinha mudança pendente nesse campo → o A360 adota
  conflitos: Record<string, { a360: unknown; vobi: unknown }>; // mesmo campo mudou nos dois lados
  pendentes: CamposVobi; // o que continua aguardando envio ao Vobi (sem os campos em conflito)
  novaBase: CamposVobi; // a versão do Vobi passa a ser a referência
};

/**
 * Compara a tarefa como está no Vobi agora com a última versão combinada (base) e com o que o A360 mudou (pendentes).
 * Serve para a leitura diária e, nas fases com escrita, para conferir a tarefa imediatamente antes de enviar.
 */
export function reconciliar(base: CamposVobi | null | undefined, pendentes: CamposVobi, vobi: CamposVobi): Reconciliacao {
  const adotar: CamposVobi = {}, conflitos: Reconciliacao["conflitos"] = {}, pend: CamposVobi = { ...pendentes };
  const set = (o: CamposVobi, c: Campo, v: unknown) => { (o as Record<string, unknown>)[c] = v; };
  for (const c of CAMPOS_SINC) {
    if (!(c in vobi)) continue;
    const v = vobi[c];
    const mudouNoVobi = !base || !igual(v, base[c]);
    const temPendente = c in pend;
    if (temPendente && igual(pend[c], v)) { delete pend[c]; continue; } // os dois lados chegaram ao mesmo valor
    if (!mudouNoVobi) continue; // Vobi igual à base: a mudança do A360 (se houver) segue pendente
    if (temPendente) { conflitos[c] = { a360: pend[c], vobi: v }; delete pend[c]; continue; }
    set(adotar, c, v);
  }
  const novaBase: CamposVobi = { ...(base ?? {}) };
  for (const c of CAMPOS_SINC) if (c in vobi) set(novaBase, c, vobi[c]);
  return { adotar, conflitos, pendentes: pend, novaBase };
}

/** Estado exibido da atividade vinculada. */
export function estadoDe(a: { vinculo: string; tarefaVobiId: number | null; pendentes: CamposVobi; conflitos: Record<string, unknown>; ausente?: boolean }): string {
  if (a.vinculo === "independente") return "local";
  if (a.ausente) return "divergencia";
  if (Object.keys(a.conflitos ?? {}).length) return "conflito";
  if (!a.tarefaVobiId || Object.keys(a.pendentes ?? {}).length) return "aguardando_envio";
  return "sincronizada";
}

/** Tarefa do Vobi (espelho ou resposta da API) → campos comparáveis. */
export function camposDaTarefa(t: { nome: string; idEtapa: number | null; idResponsavel: number | null; inicio: Date | string | null; fim: Date | string | null; prioridade: number | null; status: number | null }): CamposVobi {
  const iso = (d: Date | string | null) => (d == null ? null : d instanceof Date ? d.toISOString() : new Date(d).toISOString());
  return { nome: t.nome, idEtapa: t.idEtapa, idResponsavel: t.idResponsavel, inicio: iso(t.inicio), fim: iso(t.fim), prioridade: t.prioridade, status: t.status };
}
