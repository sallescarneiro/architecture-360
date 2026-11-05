"use client";
import { useActionState } from "react";
import { enviarAction, type EstadoUpload } from "./actions";

export function UploadForm({ hoje }: { hoje: string }) {
  const [state, action, pending] = useActionState<EstadoUpload, FormData>(enviarAction, undefined);
  return (
    <form action={action} className="card flex flex-col gap-3">
      <div className="font-semibold">Nova carga</div>
      <p className="text-sm text-[var(--muted)]">
        No Vobi: <b>Projetos › Ações › Exportar CSV</b> (sem filtro) e <b>Gestão de Tarefas › Tarefas › Todas as tarefas › Ações › Exportar CSV</b>.
        Nada é gravado antes da confirmação; o Vobi nunca é alterado.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <label>Projetos.csv<input name="projetos" type="file" accept=".csv,text/csv" required className="mt-1 block w-full text-sm" /></label>
        <label>Tarefas.csv<input name="tarefas" type="file" accept=".csv,text/csv" required className="mt-1 block w-full text-sm" /></label>
        <label>Data da exportação<input name="dataCarga" type="date" defaultValue={hoje} required className="mt-1 block w-full rounded-md border border-[var(--line)] px-2 py-1" /></label>
      </div>
      {state?.erro && <div className="text-sm text-red-700 whitespace-pre-wrap">{state.erro}</div>}
      <div><button className="btn btn-primary" disabled={pending}>{pending ? "Analisando…" : "Gerar prévia"}</button></div>
    </form>
  );
}
