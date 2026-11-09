import { STATUS_PRAZO, rotuloCurto, statusPrazo, type PrazoInfo, type StatusPrazo as S } from "@/lib/prazo";

/** Pílula de status de prazo: ponto + texto (a cor nunca é o único sinal). Usa a regra única de src/lib/prazo.ts. */
export function StatusPrazo({ info, longo = false }: { info: PrazoInfo; longo?: boolean }) {
  const meta = STATUS_PRAZO[info.status];
  return <span className={`st st-${meta.tom}`} title={meta.rotulo}><i aria-hidden /> {longo ? meta.rotulo : rotuloCurto(info)}</span>;
}

/** Atalho: calcula e renderiza a partir das colunas da tarefa. */
export function PrazoTarefa({ status, dataFim, hoje, longo }: { status: string | null | undefined; dataFim: string | null | undefined; hoje: string; longo?: boolean }) {
  return <StatusPrazo info={statusPrazo(status, dataFim, hoje)} longo={longo} />;
}

export function tomDoStatus(s: S) { return STATUS_PRAZO[s].tom; }
