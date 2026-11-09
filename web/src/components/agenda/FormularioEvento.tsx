import type { CalendarioGoogle } from "@/db/schema";
import type { ProjetoRef } from "@/lib/agenda/classificacao";
import { Button, LinkButton } from "@/components/ui";

export type ValoresForm = {
  titulo: string; descricao: string; local: string; data: string; diaInteiro: boolean; horaInicio: string; horaFim: string;
  participantes: string; projetoCodigo: number | null; criarMeet: boolean; calendarioId: string; enviarConvites: boolean;
};

/** Formulário de compromisso (criar e editar). Server component: campos nativos, validação no servidor. */
export function FormularioEvento({ action, valores, projetos, calendarios, pessoas, volta, id, edicao, temMeet, erro }: {
  action: (fd: FormData) => Promise<void>; valores: ValoresForm; projetos: ProjetoRef[]; calendarios: CalendarioGoogle[]; pessoas: { email: string; nome: string | null }[];
  volta: string; id?: number; edicao?: boolean; temMeet?: boolean; erro?: string;
}) {
  const v = valores;
  return (
    <form action={action} className="card flex flex-col gap-4 p-4">
      {erro && <div className="leitura leitura-bad"><b>Erro</b>{erro}</div>}
      <input type="hidden" name="volta" value={volta} />
      {id && <input type="hidden" name="id" value={id} />}
      <label className="block text-xs font-semibold text-[var(--txt-2)]">Título
        <input name="titulo" required maxLength={200} defaultValue={v.titulo} className="input mt-1" placeholder="ex.: Reunião de aprovação do layout" autoFocus />
      </label>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Data<input type="date" name="data" required defaultValue={v.data} className="input mt-1" /></label>
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Início<input type="time" name="hora_inicio" step={300} defaultValue={v.horaInicio} className="input mt-1" /></label>
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Término<input type="time" name="hora_fim" step={300} defaultValue={v.horaFim} className="input mt-1" /></label>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="dia_inteiro" value="1" defaultChecked={v.diaInteiro} /> dia inteiro</label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Local<input name="local" maxLength={300} defaultValue={v.local} className="input mt-1" placeholder="endereço, sala ou 'online'" /></label>
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Calendário de destino
          <select name="calendario" className="input mt-1" defaultValue={v.calendarioId} disabled={edicao}>
            {calendarios.length ? calendarios.map((k) => <option key={k.id} value={k.id}>{k.nome}{k.primario ? " (principal)" : ""}</option>) : <option value="primary">Agenda principal</option>}
          </select>
          {edicao && <span className="sub">para mover de calendário, use o Google Calendar</span>}
        </label>
      </div>
      <label className="block text-xs font-semibold text-[var(--txt-2)]">Participantes <span className="font-normal text-[var(--muted)]">(e-mails separados por vírgula ou espaço)</span>
        <input name="participantes" list="pessoas-a360" defaultValue={v.participantes} className="input mt-1" placeholder="nome@rucelle.com.br, cliente@empresa.com" />
        <datalist id="pessoas-a360">{pessoas.map((p) => <option key={p.email} value={p.email}>{p.nome ?? p.email}</option>)}</datalist>
      </label>
      <label className="block text-xs font-semibold text-[var(--txt-2)]">Projeto / cliente relacionado <span className="font-normal text-[var(--muted)]">(Vobi, só leitura)</span>
        <select name="projeto" className="input mt-1" defaultValue={v.projetoCodigo ?? ""}>
          <option value="">— nenhum —</option>
          {projetos.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome}{p.cliente ? ` · ${p.cliente}` : ""} ({p.codigo})</option>)}
        </select>
      </label>
      <label className="block text-xs font-semibold text-[var(--txt-2)]">Descrição<textarea name="descricao" rows={4} maxLength={4000} defaultValue={v.descricao} className="input mt-1" placeholder="pauta, links, observações" /></label>
      <div className="flex flex-wrap gap-5 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="meet" value="1" defaultChecked={v.criarMeet} disabled={temMeet} /> {temMeet ? "já tem link do Google Meet" : "criar link do Google Meet"}</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="convites" value="1" defaultChecked={v.enviarConvites} /> enviar convite por e-mail aos participantes</label>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] pt-3">
        <LinkButton href={volta}>Cancelar</LinkButton>
        <Button variant="primary">{edicao ? "Salvar alterações no Google" : "Criar no Google Agenda"}</Button>
      </div>
    </form>
  );
}
