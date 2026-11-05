"use client";
import { useActionState } from "react";
import { enviarAction, type EstadoUpload } from "./actions";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

export function UploadForm({ hoje }: { hoje: string }) {
  const [state, action, pending] = useActionState<EstadoUpload, FormData>(enviarAction, undefined);
  return (
    <Card title="Nova carga" subtitle={<>No Vobi: <b>Projetos › Ações › Exportar CSV</b> (sem filtro) e <b>Gestão de Tarefas › Tarefas › Todas as tarefas › Ações › Exportar CSV</b>. Nada é gravado antes da confirmação; o Vobi nunca é alterado.</>}>
      <form action={action} className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Projetos.csv"><Input name="projetos" type="file" accept=".csv,text/csv" required /></Field>
          <Field label="Tarefas.csv"><Input name="tarefas" type="file" accept=".csv,text/csv" required /></Field>
          <Field label="Data da exportação"><Input name="dataCarga" type="date" defaultValue={hoje} required /></Field>
        </div>
        {state?.erro && <Alert><span className="whitespace-pre-wrap">{state.erro}</span></Alert>}
        <div><Button disabled={pending}>{pending ? "Analisando…" : "Gerar prévia"}</Button></div>
      </form>
    </Card>
  );
}
