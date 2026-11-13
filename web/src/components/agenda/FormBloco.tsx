// Formulário do bloco de produção (incluir, editar, propor). Sem JavaScript: período "Horário específico" usa os campos de hora.
import { ETAPAS } from "@/lib/agenda/producao";
import { Button } from "@/components/ui";
import { curto } from "./Producao";

export type ValoresBloco = { pessoaId: number; dia: string; projetoCodigo: number | null; etapa: string; periodo: string; hi: string; hf: string; entrega: boolean; obs: string };

export function FormBloco({ action, id, valores, projetos, pessoas, volta, rotulo, jornada, travarDia }: {
  action: (fd: FormData) => Promise<void>; id?: number; valores: ValoresBloco; projetos: { codigo: number; nome: string }[];
  pessoas?: { id: number; nome: string }[]; volta: string; rotulo: string; jornada: number; travarDia?: boolean;
}) {
  return (
    <form action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="volta" value={volta} />
      {id && <input type="hidden" name="id" value={id} />}
      {pessoas ? (
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Arquiteta executora
          <select name="pessoa" defaultValue={valores.pessoaId} className="input mt-1">{pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
        </label>
      ) : <input type="hidden" name="pessoa" value={valores.pessoaId} />}
      {travarDia ? <input type="hidden" name="dia" value={valores.dia} /> : (
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Dia<input type="date" name="dia" defaultValue={valores.dia} required className="input mt-1" /></label>
      )}
      <label className="block text-xs font-semibold text-[var(--txt-2)]">Projeto
        <select name="projeto" defaultValue={valores.projetoCodigo ?? ""} required className="input mt-1">
          <option value="">Escolha o projeto</option>
          {projetos.map((p) => <option key={p.codigo} value={p.codigo}>{curto(p.nome)} · nº {p.codigo}</option>)}
        </select>
      </label>
      <label className="block text-xs font-semibold text-[var(--txt-2)]">Etapa de produção
        <select name="etapa" defaultValue={valores.etapa} required className="input mt-1">
          <option value="">Escolha a etapa</option>
          {ETAPAS.map((e) => <option key={e.k} value={e.k}>{e.n}</option>)}
        </select>
      </label>
      <label className="block text-xs font-semibold text-[var(--txt-2)]">Período
        <select name="periodo" defaultValue={valores.periodo} className="input mt-1">
          <option value="dia">Dia inteiro</option><option value="manha">Manhã</option><option value="tarde">Tarde</option><option value="hora">Horário específico</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Início (se horário)<input type="time" name="hora_inicio" defaultValue={valores.hi} className="input mt-1" /></label>
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Fim (se horário)<input type="time" name="hora_fim" defaultValue={valores.hf} className="input mt-1" /></label>
      </div>
      <p className="text-[0.72rem] text-[var(--muted)]">Horário específico conta como a duração ÷ jornada diária da pessoa ({String(jornada).replace(".", ",")} h).</p>
      <label className="flex min-h-10 items-center gap-2 text-sm font-semibold"><input type="checkbox" name="entrega" value="1" defaultChecked={valores.entrega} className="h-[18px] w-[18px] accent-[var(--vinho)]" />Entrega ao cliente neste dia</label>
      <label className="block text-xs font-semibold text-[var(--txt-2)]">Observação (opcional)<input name="obs" defaultValue={valores.obs} maxLength={500} className="input mt-1" placeholder="não exige nova validação" /></label>
      <Button variant="primary">{rotulo}</Button>
    </form>
  );
}
