import type { ProjetoRef } from "@/lib/agenda/classificacao";
import { Button, LinkButton } from "@/components/ui";

export type ValoresReuniao = { titulo: string; projetoCodigo: number | null; data: string; horaInicio: string; horaFim: string; local: string; participantes: string; pauta: string };

/** Formulário de reunião (criar/editar). Server component; validação no servidor. */
export function FormularioReuniao({ action, valores, projetos, pessoas, volta, id, edicao, eventoId, podeAgenda, erro }: {
  action: (fd: FormData) => Promise<void>; valores: ValoresReuniao; projetos: ProjetoRef[]; pessoas: { email: string; nome: string | null }[];
  volta: string; id?: number; edicao?: boolean; eventoId?: number | null; podeAgenda?: boolean; erro?: string;
}) {
  const v = valores;
  return (
    <form action={action} className="card flex flex-col gap-4 p-4">
      {erro && <div className="leitura leitura-bad"><b>Erro</b>{erro}</div>}
      <input type="hidden" name="volta" value={volta} />
      {id && <input type="hidden" name="id" value={id} />}
      {eventoId && <input type="hidden" name="evento" value={eventoId} />}
      <label className="block text-xs font-semibold text-[var(--txt-2)]">Título<input name="titulo" required maxLength={200} defaultValue={v.titulo} className="input mt-1" placeholder="ex.: Reunião de aprovação do anteprojeto" autoFocus /></label>
      <label className="block text-xs font-semibold text-[var(--txt-2)]">Projeto / cliente (Vobi, só leitura)
        <select name="projeto" className="input mt-1" defaultValue={v.projetoCodigo ?? ""}>
          <option value="">— sem projeto (reunião interna/geral) —</option>
          {projetos.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome}{p.cliente ? ` · ${p.cliente}` : ""} ({p.codigo})</option>)}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Data<input type="date" name="data" required defaultValue={v.data} className="input mt-1" /></label>
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Início<input type="time" name="hora_inicio" required step={300} defaultValue={v.horaInicio} className="input mt-1" /></label>
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Término<input type="time" name="hora_fim" required step={300} defaultValue={v.horaFim} className="input mt-1" /></label>
      </div>
      <label className="block text-xs font-semibold text-[var(--txt-2)]">Local<input name="local" maxLength={300} defaultValue={v.local} className="input mt-1" placeholder="escritório, obra, online" /></label>
      <label className="block text-xs font-semibold text-[var(--txt-2)]">Participantes <span className="font-normal text-[var(--muted)]">(um por linha ou separados por vírgula; e-mail ou &ldquo;Nome &lt;email&gt;&rdquo;; nomes sem e-mail valem para externos)</span>
        <textarea name="participantes" rows={3} defaultValue={v.participantes} className="input mt-1" placeholder={"thais.valle@rucelle.com.br\nJoão Silva <joao@academia.com>\nMaria (sócia)"} />
        {pessoas.length > 0 && <span className="sub">E-mails conhecidos: {pessoas.slice(0, 12).map((p) => p.email).join(", ")}{pessoas.length > 12 ? " …" : ""}</span>}
      </label>
      <label className="block text-xs font-semibold text-[var(--txt-2)]">Pauta<textarea name="pauta" rows={5} maxLength={8000} defaultValue={v.pauta} className="input mt-1" placeholder={"1. Apresentar o anteprojeto\n2. Validar fluxo da área de musculação\n3. Próximos passos"} /></label>
      {!edicao && !eventoId && podeAgenda && (
        <fieldset className="rounded-[10px] border border-[var(--line)] p-3 text-sm">
          <legend className="px-1 text-xs font-semibold text-[var(--txt-2)]">Google Agenda</legend>
          <label className="flex items-center gap-2"><input type="checkbox" name="agenda" value="1" defaultChecked /> criar também o compromisso na minha Google Agenda (com os participantes que têm e-mail)</label>
          <div className="mt-1 flex flex-wrap gap-5 pl-6 text-[var(--txt-2)]">
            <label className="flex items-center gap-2"><input type="checkbox" name="meet" value="1" /> com link do Google Meet</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="convites" value="1" defaultChecked /> enviar convites por e-mail</label>
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] pt-3">
        <LinkButton href={volta}>Cancelar</LinkButton>
        <Button variant="primary">{edicao ? "Salvar alterações" : "Registrar reunião"}</Button>
      </div>
    </form>
  );
}
